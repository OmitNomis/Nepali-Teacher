import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Config } from "./config";
import type { Db } from "./db";
import { audio, items, jobs } from "./db/schema";
import { newId } from "./ids";
import { enqueue } from "./jobs";

export const TTS_JOB = "audio.tts";

/** Synthesized MP3, plus the voice that actually spoke it (a fallback may differ). */
export type TtsResult = { audio: Buffer; voice: string };
export type TtsProvider = (text: string, voice: string) => Promise<TtsResult>;

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** Official Azure Speech REST API (free tier covers this app easily). */
export function azureProvider(key: string, region: string): TtsProvider {
  return async (text, voice) => {
    const lang = voice.split("-").slice(0, 2).join("-");
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "User-Agent": "nepali-teacher",
      },
      body: `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}">${escapeXml(text)}</voice></speak>`,
    });
    if (!res.ok) throw new Error(`Azure TTS ${res.status}: ${await res.text().catch(() => "")}`);
    return { audio: Buffer.from(await res.arrayBuffer()), voice };
  };
}

/** Unofficial Edge read-aloud endpoint: no key, but may break without notice. */
export function edgeProvider(): TtsProvider {
  return async (text, voice) => {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) chunks.push(chunk as Buffer);
      const buf = Buffer.concat(chunks);
      if (buf.length === 0) throw new Error("Edge TTS returned no audio");
      return { audio: buf, voice };
    } finally {
      tts.close();
    }
  };
}

const GOOGLE_MAX_CHARS = 200;

/** Splits text into chunks under the limit, breaking at spaces where possible. */
export function chunkText(text: string, max = GOOGLE_MAX_CHARS) {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const cut = rest.lastIndexOf(" ", max);
    const at = cut > 0 ? cut : max;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Google Translate's read-aloud voice. Unofficial and no key; the "voice" is
 * just a language code (e.g. "ne"). Requests cap at ~200 characters, so long
 * text is synthesized in pieces and the MP3 frames concatenated.
 */
export function googleProvider(): TtsProvider {
  return async (text, voice) => {
    const parts: Buffer[] = [];
    for (const chunk of chunkText(text)) {
      const url = new URL("https://translate.google.com/translate_tts");
      url.search = new URLSearchParams({ ie: "UTF-8", client: "tw-ob", tl: voice, q: chunk }).toString();
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`Google TTS ${res.status}`);
      parts.push(Buffer.from(await res.arrayBuffer()));
    }
    const buf = Buffer.concat(parts);
    if (buf.length === 0) throw new Error("Google TTS returned no audio");
    return { audio: buf, voice };
  };
}

/**
 * Tries the primary provider and falls back to Google on failure, so an
 * outage of an unofficial endpoint degrades audio quality instead of failing.
 */
export function withGoogleFallback(primary: TtsProvider, name: string, google = googleProvider()): TtsProvider {
  return async (text, voice) => {
    try {
      return await primary(text, voice);
    } catch (err) {
      console.warn(`TTS: ${name} failed, falling back to google:`, (err as Error).message);
      return google(text, "ne");
    }
  };
}

export function providerFromConfig(config: Config): TtsProvider | null {
  switch (config.tts.provider) {
    case "azure":
      if (!config.tts.azureKey) throw new Error("TTS_PROVIDER=azure needs AZURE_SPEECH_KEY");
      return azureProvider(config.tts.azureKey, config.tts.azureRegion);
    case "edge":
      return withGoogleFallback(edgeProvider(), "edge");
    case "google":
      return googleProvider();
    default:
      return null;
  }
}

/**
 * Queues TTS for the given items that have no audio yet. Skips items that
 * already have a pending TTS job so repeated edits don't pile up work.
 */
export function queueTts(db: Db, itemIds: string[]) {
  if (itemIds.length === 0) return 0;
  const needing = db
    .select({ id: items.id })
    .from(items)
    .where(and(inArray(items.id, itemIds), isNull(items.audioId), eq(items.archived, false)))
    .all();
  let queued = 0;
  for (const { id } of needing) {
    const pending = db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.type, TTS_JOB),
          inArray(jobs.status, ["pending", "running"]),
          sql`json_extract(${jobs.payload}, '$.itemId') = ${id}`,
        ),
      )
      .get();
    if (!pending) {
      enqueue(db, TTS_JOB, { itemId: id });
      queued++;
    }
  }
  return queued;
}

/** Job: synthesize the item's current text, unless it got audio meanwhile. */
export function ttsJob(db: Db, config: Config, provider: TtsProvider) {
  return async (payload: unknown) => {
    const { itemId } = payload as { itemId: string };
    const item = db.select().from(items).where(eq(items.id, itemId)).get();
    if (!item || item.audioId || item.archived) return;

    const text = item.ne;
    const { audio: buf, voice } = await provider(text, config.tts.voice);

    const id = newId();
    const name = `${id}.mp3`;
    fs.mkdirSync(config.audioDir, { recursive: true });
    await fs.promises.writeFile(path.join(config.audioDir, name), buf);

    const outcome = db.transaction((tx) => {
      // a recording may have landed, or the text changed, while we waited
      const fresh = tx.select().from(items).where(eq(items.id, itemId)).get();
      if (!fresh || fresh.audioId || fresh.archived) return "discard";
      if (fresh.ne !== text) return "retry";
      tx.insert(audio)
        .values({ id, file: name, mime: "audio/mpeg", bytes: buf.length, trimmed: true, source: "tts", voice })
        .run();
      tx.update(items).set({ audioId: id }).where(eq(items.id, itemId)).run();
      return "saved";
    });
    if (outcome !== "saved") fs.rm(path.join(config.audioDir, name), { force: true }, () => {});
    // text changed mid-flight: go again with the new text (bypasses the
    // pending-job dedupe, which would see this very job as still running)
    if (outcome === "retry") enqueue(db, TTS_JOB, { itemId });
  };
}

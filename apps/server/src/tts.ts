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

/** Synthesizes text to an MP3 buffer. */
export type TtsProvider = (text: string, voice: string) => Promise<Buffer>;

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
    return Buffer.from(await res.arrayBuffer());
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
      return buf;
    } finally {
      tts.close();
    }
  };
}

export function providerFromConfig(config: Config): TtsProvider | null {
  switch (config.tts.provider) {
    case "azure":
      if (!config.tts.azureKey) throw new Error("TTS_PROVIDER=azure needs AZURE_SPEECH_KEY");
      return azureProvider(config.tts.azureKey, config.tts.azureRegion);
    case "edge":
      return edgeProvider();
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
    const voice = config.tts.voice;
    const buf = await provider(text, voice);

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

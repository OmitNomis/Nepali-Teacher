import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig, type Config } from "../src/config";
import { createChapter, createItem, getItem, listMissingAudio } from "../src/content";
import { openDb, type Db } from "../src/db";
import { trimJob, TRIM_JOB } from "../src/audio";
import { audio, items, jobs, users } from "../src/db/schema";
import {
  queueTts,
  rateLimited,
  requeueOtherVoices,
  ttsJob,
  TTS_JOB,
  withGoogleFallback,
  type TtsProvider,
} from "../src/tts";

let db: Db;
let config: Config;
let chapterId: string;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nt-tts-"));
  config = loadConfig({ DATA_DIR: dir, TTS_PROVIDER: "edge" });
  db = openDb(config.dbFile, path.join(__dirname, "../drizzle"));
  db.insert(users).values({ username: "admin", displayName: "Admin", passwordHash: "x", role: "admin" }).run();
  chapterId = createChapter(db, { track: "phrases", titleJa: "食事", titleNe: "", descriptionJa: "" });
});

const add = (ne: string) => createItem(db, chapterId, { kind: "phrase", ne, ja: "", roman: "", note: "" });
const fakeProvider: TtsProvider = async (text, voice) => ({ audio: Buffer.from(`mp3:${text}`), voice });
const pendingJobs = () => db.select().from(jobs).where(eq(jobs.type, TTS_JOB)).all();

describe("queueTts", () => {
  it("queues once per item even when called repeatedly", () => {
    const a = add("खाना खानुभयो?");
    expect(queueTts(db, [a.id])).toBe(1);
    expect(queueTts(db, [a.id])).toBe(0);
    expect(pendingJobs()).toHaveLength(1);
  });
});

describe("ttsJob", () => {
  it("saves TTS audio and keeps the item in the recording queue", async () => {
    const a = add("खाना खायौ?");
    await ttsJob(db, config, fakeProvider)({ itemId: a.id });
    const item = getItem(db, a.id);
    expect(item.audioSource).toBe("tts");
    expect(item.audioUrl).not.toBeNull();
    expect(listMissingAudio(db).map((i) => i.id)).toContain(a.id);
    // Edge pads clips with silence: they get trimmed like recordings
    const trims = db.select().from(jobs).where(eq(jobs.type, TRIM_JOB)).all();
    expect(trims.map((j) => j.payload)).toEqual([{ audioId: item.audioId }]);
  });

  it("stays a placeholder in the same voice once trimmed", async () => {
    // stand-in for ffmpeg: copies the input (-i <file>) to the output (last argument)
    const fakeFfmpeg = path.join(config.dataDir, "ffmpeg");
    fs.writeFileSync(fakeFfmpeg, '#!/bin/sh\nfor out; do :; done\ncp "$4" "$out"\n', { mode: 0o755 });
    const a = add("नमस्ते");
    await ttsJob(db, config, async (text) => ({ audio: Buffer.from(text), voice: "ne-NP-HemkalaNeural" }))({ itemId: a.id });
    const untrimmed = getItem(db, a.id).audioId!;
    await trimJob(db, { ...config, ffmpeg: fakeFfmpeg })({ audioId: untrimmed });

    const item = getItem(db, a.id);
    expect(item.audioId).not.toBe(untrimmed);
    const row = db.select().from(audio).where(eq(audio.id, item.audioId!)).get()!;
    expect(row).toMatchObject({ source: "tts", voice: "ne-NP-HemkalaNeural", trimmed: true, mime: "audio/mp4" });
    expect(listMissingAudio(db).map((i) => i.id)).toContain(a.id);
  });

  it("never overwrites a human recording that landed first", async () => {
    const a = add("खाना खाइस्?");
    const slowProvider: TtsProvider = async (text) => {
      // simulate a recording being saved while TTS is in flight
      const { saveItemAudio } = await import("../src/audio");
      await saveItemAudio(db, config, a.id, new File([new Uint8Array(10)], "r.m4a", { type: "audio/mp4" }), 1);
      return { audio: Buffer.from(text), voice: "v" };
    };
    await ttsJob(db, config, slowProvider)({ itemId: a.id });
    expect(getItem(db, a.id).audioSource).toBe("recording");
  });

  it("re-queues when the text changes mid-flight", async () => {
    const a = add("खाना");
    const editingProvider: TtsProvider = async (text) => {
      db.update(items).set({ ne: "खाना खानुभयो?" }).where(eq(items.id, a.id)).run();
      return { audio: Buffer.from(text), voice: "v" };
    };
    await ttsJob(db, config, editingProvider)({ itemId: a.id });
    expect(getItem(db, a.id).audioUrl).toBeNull();
    expect(pendingJobs()).toHaveLength(1);
  });
});

describe("chunkText", () => {
  it("leaves short text alone and splits long text at spaces", async () => {
    const { chunkText } = await import("../src/tts");
    expect(chunkText("नमस्ते")).toEqual(["नमस्ते"]);
    const long = Array.from({ length: 60 }, () => "खाना").join(" ");
    const chunks = chunkText(long, 50);
    expect(chunks.every((c) => c.length <= 50)).toBe(true);
    expect(chunks.join(" ")).toBe(long);
  });
});

describe("withGoogleFallback", () => {
  const google: TtsProvider = async (text, voice) => ({ audio: Buffer.from(`google:${text}`), voice });

  it("uses the primary provider when it works", async () => {
    const tts = withGoogleFallback(fakeProvider, "edge", google);
    const result = await tts("नमस्ते", "ne-NP-HemkalaNeural");
    expect(result.audio.toString()).toBe("mp3:नमस्ते");
    expect(result.voice).toBe("ne-NP-HemkalaNeural");
  });

  it("falls back to google with a language code when the primary fails", async () => {
    const broken: TtsProvider = async () => {
      throw new Error("403");
    };
    const tts = withGoogleFallback(broken, "edge", google);
    const result = await tts("नमस्ते", "ne-NP-HemkalaNeural");
    expect(result.audio.toString()).toBe("google:नमस्ते");
    // recorded as google's voice, so it can be regenerated later
    expect(result.voice).toBe("ne");
  });
});

describe("rateLimited", () => {
  // fake clock: waiting just moves time forward
  const clock = () => {
    let t = 0;
    const waits: number[] = [];
    return { now: () => t, wait: async (ms: number) => void (waits.push(ms), (t += ms)), waits };
  };

  it("retries a 429 after waiting, then succeeds", async () => {
    const c = clock();
    let calls = 0;
    const flaky: TtsProvider = async (text, voice) => {
      if (++calls < 3) throw new Error("Unexpected server response: 429");
      return { audio: Buffer.from(text), voice };
    };
    const tts = rateLimited(flaky, { minGapMs: 0, waitsMs: [100, 200, 300], ...c });
    expect((await tts("क", "v")).audio.toString()).toBe("क");
    expect(c.waits).toEqual([100, 200]);
  });

  it("gives up after the last wait, and doesn't retry other errors", async () => {
    const c = clock();
    const limited: TtsProvider = async () => {
      throw new Error("429");
    };
    await expect(rateLimited(limited, { minGapMs: 0, waitsMs: [100], ...c })("क", "v")).rejects.toThrow("429");
    expect(c.waits).toEqual([100]);

    const forbidden: TtsProvider = async () => {
      throw new Error("403");
    };
    await expect(rateLimited(forbidden, { minGapMs: 0, waitsMs: [100], ...c })("क", "v")).rejects.toThrow("403");
    expect(c.waits).toEqual([100]);
  });

  it("spaces consecutive requests apart", async () => {
    const c = clock();
    const tts = rateLimited(fakeProvider, { minGapMs: 1500, waitsMs: [], ...c });
    await tts("क", "v");
    await tts("ख", "v");
    expect(c.waits).toEqual([1500]);
  });
});

describe("requeueOtherVoices", () => {
  const voiced = (voice: string): TtsProvider => async (text) => ({ audio: Buffer.from(text), voice });

  it("regenerates only TTS clips in another voice, never recordings", async () => {
    const google = add("क");
    const edge = add("ख");
    const recorded = add("ग");
    await ttsJob(db, config, voiced("ne"))({ itemId: google.id });
    await ttsJob(db, config, voiced("ne-NP-HemkalaNeural"))({ itemId: edge.id });
    const { saveItemAudio } = await import("../src/audio");
    await saveItemAudio(db, config, recorded.id, new File([new Uint8Array(10)], "r.m4a", { type: "audio/mp4" }), 1);
    db.delete(jobs).run();

    const dry = requeueOtherVoices(db, config, "ne-NP-HemkalaNeural", { dryRun: true });
    expect(dry.stale.map((s) => s.ne)).toEqual(["क"]);
    expect(getItem(db, google.id).audioUrl).not.toBeNull();

    const { queued } = requeueOtherVoices(db, config, "ne-NP-HemkalaNeural");
    expect(queued).toBe(1);
    expect(getItem(db, google.id).audioUrl).toBeNull();
    expect(getItem(db, edge.id).audioSource).toBe("tts");
    expect(getItem(db, recorded.id).audioSource).toBe("recording");

    // --all redoes every placeholder, still never a recording
    expect(requeueOtherVoices(db, config, "ne-NP-HemkalaNeural", { all: true, dryRun: true }).stale.map((s) => s.ne)).toEqual(["ख"]);
  });
});

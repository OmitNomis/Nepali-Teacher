import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig, type Config } from "../src/config";
import { createChapter, createItem, updateItem } from "../src/content";
import { openDb, type Db } from "../src/db";
import { REMOVE_JOB, saveSyllableAudio, TRIM_JOB } from "../src/audio";
import { audio, items, jobs, syllables, users } from "../src/db/schema";
import {
  listLetterSounds,
  listSyllablesToRecord,
  missingSyllables,
  queueSyllableTts,
  SYLLABLE_TTS_JOB,
  syllableTtsJob,
} from "../src/syllables";
import type { TtsProvider } from "../src/tts";

let db: Db;
let config: Config;
let script: string;
let phrases: string;
let userId: number;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nt-syl-"));
  config = loadConfig({ DATA_DIR: dir, TTS_PROVIDER: "edge" });
  db = openDb(config.dbFile, path.join(__dirname, "../drizzle"));
  userId = db.insert(users).values({ username: "admin", displayName: "Admin", passwordHash: "x", role: "admin" }).returning().get().id;
  script = createChapter(db, { track: "script", titleJa: "文字", titleNe: "", descriptionJa: "" });
  phrases = createChapter(db, { track: "phrases", titleJa: "あいさつ", titleNe: "", descriptionJa: "" });
});

const letter = (ne: string, audioId: string | null = null) => {
  const item = createItem(db, script, { kind: "letter", ne, ja: "", roman: "", note: "" });
  if (audioId) {
    db.insert(audio).values({ id: audioId, file: `${audioId}.mp3`, mime: "audio/mpeg", bytes: 1 }).run();
    db.update(items).set({ audioId }).where(eq(items.id, item.id)).run();
  }
  return item;
};
const phrase = (ne: string) => createItem(db, phrases, { kind: "phrase", ne, ja: "", roman: "", note: "" });
const fakeProvider: TtsProvider = async (text, voice) => ({ audio: Buffer.from(`mp3:${text}`), voice });

describe("missingSyllables", () => {
  it("lists the letters of phrases no script letter spells exactly", () => {
    letter("न");
    letter("म");
    letter("दी");
    phrase("नमस्ते");
    phrase("दिदी, नमस्ते।");
    expect(missingSyllables(db)).toEqual(["स्ते", "दि"]);
  });

  it("never lets a look-alike stand in: ण is not न, श is not स", () => {
    letter("ण");
    letter("श");
    phrase("नमस्ते सर");
    expect(missingSyllables(db)).toEqual(["न", "म", "स्ते", "स", "र"]);
  });

  it("ignores archived phrases", () => {
    const p = phrase("स्ते");
    updateItem(db, p.id, { archived: true });
    expect(missingSyllables(db)).toEqual([]);
  });
});

describe("listLetterSounds", () => {
  it("keeps letters the quiz treats as one sound apart", () => {
    letter("ण", "rec-nna");
    letter("न", "rec-na");
    letter("श", "rec-sha");
    letter("स", "rec-sa");
    const url = new Map(listLetterSounds(db).map((s) => [s.ne, s.audioUrl]));
    expect(url.get("न")).toBe("/api/audio/rec-na");
    expect(url.get("स")).toBe("/api/audio/rec-sa");
  });

  it("plays a human recording of a letter over a TTS one of the same letter", () => {
    letter("क", "tts-ka");
    db.update(audio).set({ source: "tts" }).where(eq(audio.id, "tts-ka")).run();
    letter("क", "rec-ka");
    expect(listLetterSounds(db)).toEqual([{ ne: "क", audioUrl: "/api/audio/rec-ka" }]);
  });
});

describe("syllable TTS", () => {
  it("queues each missing syllable once", () => {
    phrase("नमस्ते");
    expect(queueSyllableTts(db)).toBe(3);
    expect(queueSyllableTts(db)).toBe(0);
  });

  it("saves a trimmed-to-be placeholder that the letter sounds list", async () => {
    letter("न", "rec-na");
    phrase("नमस्ते");
    await syllableTtsJob(db, config, fakeProvider)({ ne: "स्ते" });

    const row = db.select().from(syllables).where(eq(syllables.ne, "स्ते")).get()!;
    expect(db.select().from(audio).where(eq(audio.id, row.audioId!)).get()!.source).toBe("tts");
    expect(db.select().from(jobs).where(eq(jobs.type, TRIM_JOB)).all().map((j) => j.payload)).toEqual([
      { audioId: row.audioId },
    ]);
    expect(missingSyllables(db)).toEqual(["म"]);
    expect(listLetterSounds(db)).toEqual([
      { ne: "न", audioUrl: "/api/audio/rec-na" },
      { ne: "स्ते", audioUrl: `/api/audio/${row.audioId}` },
    ]);
  });

  it("skips a syllable a script letter now covers", async () => {
    phrase("नमस्ते");
    queueSyllableTts(db);
    letter("स्ते");
    await syllableTtsJob(db, config, fakeProvider)({ ne: "स्ते" });
    expect(db.select().from(syllables).all()).toEqual([]);
    expect(db.select().from(jobs).where(eq(jobs.type, SYLLABLE_TTS_JOB)).all()).toHaveLength(3);
  });
});

describe("recording syllables", () => {
  const recording = () => new File([Buffer.from("m4a")], "take.m4a", { type: "audio/mp4" });

  it("lists phrase-only letters with the word they come from, until recorded", async () => {
    letter("न");
    letter("म");
    phrase("नमस्ते।");
    phrase("बोल्नुहोस् न");
    await syllableTtsJob(db, config, fakeProvider)({ ne: "स्ते" });

    const list = listSyllablesToRecord(db);
    expect(list.map(({ ne, word }) => [ne, word])).toEqual([
      ["स्ते", "नमस्ते"],
      ["बो", "बोल्नुहोस्"],
      ["ल्नु", "बोल्नुहोस्"],
      ["होस्", "बोल्नुहोस्"],
    ]);
    expect(list[0]!.ttsUrl).toMatch(/^\/api\/audio\//);

    await saveSyllableAudio(db, config, "स्ते", recording(), userId);
    expect(listSyllablesToRecord(db).map((s) => s.ne)).toEqual(["बो", "ल्नु", "होस्"]);
  });

  it("replaces the TTS clip, so tapping the letter plays the recording", async () => {
    phrase("नमस्ते");
    await syllableTtsJob(db, config, fakeProvider)({ ne: "स्ते" });
    const tts = db.select().from(syllables).get()!.audioId;
    const id = await saveSyllableAudio(db, config, "स्ते", recording(), userId);

    expect(listLetterSounds(db)).toContainEqual({ ne: "स्ते", audioUrl: `/api/audio/${id}` });
    expect(db.select().from(audio).where(eq(audio.id, id)).get()!.source).toBe("recording");
    // the TTS clip is retired later, not straight away
    expect(db.select().from(jobs).where(eq(jobs.type, REMOVE_JOB)).all().map((j) => j.payload)).toEqual([
      { audioId: tts },
    ]);
    // and no new TTS gets made for it
    expect(missingSyllables(db)).not.toContain("स्ते");
  });
});

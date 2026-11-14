import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { letterKey } from "@nt/shared";
import { loadConfig } from "../src/config";
import { createChapter, createItem, updateChapter, updateItem } from "../src/content";
import { openDb, type Db } from "../src/db";
import { audio, cards, items, reviewLogs, users } from "../src/db/schema";
import { answerCard, buildSession, dayStart, NEW_CARDS_PER_DAY, reviewSummary } from "../src/srs";

let db: Db;
let userId: number;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nt-srs-"));
  const config = loadConfig({ DATA_DIR: dir, TTS_PROVIDER: "none" });
  db = openDb(config.dbFile, path.join(__dirname, "../drizzle"));
  userId = db
    .insert(users)
    .values({ username: "yui", displayName: "ゆい", passwordHash: "x", role: "learner" })
    .returning({ id: users.id })
    .get().id;
});

/** A script chapter whose letters all have (fake) audio. */
function scriptChapter(letters: string[], { withAudio = true } = {}) {
  const chapterId = createChapter(db, { track: "script", titleJa: "文字", titleNe: "", descriptionJa: "" });
  const ids = letters.map((ne) => {
    const item = createItem(db, chapterId, { kind: "letter", ne, ja: "", roman: "", note: "" });
    if (withAudio) {
      db.insert(audio).values({ id: `a-${item.id}`, file: "x.mp3", mime: "audio/mpeg", bytes: 1, source: "tts" }).run();
      db.update(items).set({ audioId: `a-${item.id}` }).where(eq(items.id, item.id)).run();
    }
    return item.id;
  });
  return { chapterId, ids };
}

const VOWELS = ["अ", "आ", "इ", "ई", "उ", "ऊ", "ए", "ऐ", "ओ", "औ"];

describe("buildSession", () => {
  it("introduces new cards in chapter order, up to the daily cap", () => {
    scriptChapter(VOWELS);
    const session = buildSession(db, userId);
    expect(session.mode).toBe("review");
    expect(session.cards).toHaveLength(NEW_CARDS_PER_DAY);
    expect(session.cards.every((c) => c.isNew)).toBe(true);
    // 10 new cards = the first 5 letters, both directions
    expect(new Set(session.cards.map((c) => c.prompt.ne))).toEqual(new Set(VOWELS.slice(0, 5)));
  });

  it("offers four options including the answer, never the same letter twice", () => {
    scriptChapter(VOWELS);
    for (let round = 0; round < 20; round++) {
      for (const card of buildSession(db, userId).cards) {
        expect(card.options).toHaveLength(4);
        expect(card.options.map((o) => o.id)).toContain(card.itemId);
        const keys = card.options.map((o) => letterKey(o.ne));
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it("skips items without audio and archived items", () => {
    const { ids } = scriptChapter(["क", "ख", "ग"]);
    scriptChapter(["घ"], { withAudio: false });
    updateItem(db, ids[0]!, { archived: true });
    const letters = new Set(buildSession(db, userId).cards.map((c) => c.prompt.ne));
    expect(letters).toEqual(new Set(["ख", "ग"]));
  });

  it("skips archived chapters and phrase chapters", () => {
    const { chapterId } = scriptChapter(["क"]);
    updateChapter(db, chapterId, { archived: true });
    const phrases = createChapter(db, { track: "phrases", titleJa: "会話", titleNe: "", descriptionJa: "" });
    createItem(db, phrases, { kind: "phrase", ne: "नमस्ते", ja: "", roman: "", note: "" });
    expect(buildSession(db, userId).cards).toHaveLength(0);
  });

  it("stops introducing new cards in the daily review once the cap is used, but a chapter quiz still can", () => {
    const { chapterId } = scriptChapter(VOWELS);
    for (const card of buildSession(db, userId).cards) {
      answerCard(db, userId, { itemId: card.itemId, type: card.type, chosenItemId: card.itemId });
    }
    // everything answered right is scheduled for later, and the cap is used up
    const later = new Date(Date.now() + 60_000);
    expect(buildSession(db, userId, { now: later }).cards.filter((c) => c.isNew)).toHaveLength(0);
    expect(buildSession(db, userId, { chapterId, now: later }).cards.some((c) => c.isNew)).toBe(true);
  });

  it("brings cards back once they're due", () => {
    const { ids } = scriptChapter(["क", "ख", "ग", "घ"]);
    answerCard(db, userId, { itemId: ids[0]!, type: "listen", chosenItemId: ids[0]! });
    const card = db.select().from(cards).get()!;
    const session = buildSession(db, userId, { now: new Date(card.due.getTime() + 1000) });
    expect(session.cards.find((c) => c.itemId === ids[0] && c.type === "listen")?.isNew).toBe(false);
  });

  it("falls back to practice in a chapter with nothing due or new", () => {
    const { chapterId, ids } = scriptChapter(["क", "ख"]);
    for (const id of ids) {
      for (const type of ["listen", "read"] as const) answerCard(db, userId, { itemId: id, type, chosenItemId: id });
    }
    const session = buildSession(db, userId, { chapterId, now: new Date(Date.now() + 60_000) });
    expect(session.mode).toBe("practice");
    expect(session.cards).toHaveLength(4);
  });
});

describe("answerCard", () => {
  it("schedules a right answer later and logs what was picked", () => {
    const { ids } = scriptChapter(["क", "ख"]);
    const now = new Date();
    const result = answerCard(db, userId, { itemId: ids[0]!, type: "read", chosenItemId: ids[0]!, durationMs: 1200 }, now);
    expect(result.correct).toBe(true);
    expect(result.due.getTime()).toBeGreaterThan(now.getTime());
    const log = db.select().from(reviewLogs).get()!;
    expect(log).toMatchObject({ rating: 3, correct: true, chosenItemId: ids[0], durationMs: 1200 });
  });

  it("rates a wrong answer Again and remembers the confusion", () => {
    const { ids } = scriptChapter(["क", "ख"]);
    const result = answerCard(db, userId, { itemId: ids[0]!, type: "listen", chosenItemId: ids[1]! });
    expect(result.correct).toBe(false);
    expect(db.select().from(reviewLogs).get()).toMatchObject({ rating: 1, correct: false, chosenItemId: ids[1] });
  });

  it("tells apart letters that sound alike: इ/ई, न/ण, स/श/ष", () => {
    const { ids } = scriptChapter(["इ", "ई", "न", "ण", "स", "श", "ष"]);
    const answer = (i: number, picked: number) =>
      answerCard(db, userId, { itemId: ids[i]!, type: "listen", chosenItemId: ids[picked]! }).correct;
    expect(answer(0, 1)).toBe(false);
    expect(answer(2, 3)).toBe(false);
    expect(answer(4, 5)).toBe(false);
    expect(answer(4, 6)).toBe(false);
  });

  it("counts the same letter from another chapter as right", () => {
    const { ids: consonants } = scriptChapter(["क"]);
    const { ids: barakhari } = scriptChapter(["क", "का"]);
    expect(answerCard(db, userId, { itemId: barakhari[0]!, type: "listen", chosenItemId: consonants[0]! }).correct).toBe(true);
  });

  it("keeps one card per item and type across answers", () => {
    const { ids } = scriptChapter(["क", "ख"]);
    answerCard(db, userId, { itemId: ids[0]!, type: "listen", chosenItemId: ids[1]! });
    answerCard(db, userId, { itemId: ids[0]!, type: "listen", chosenItemId: ids[0]! });
    expect(db.select().from(cards).all()).toHaveLength(1);
    expect(db.select().from(reviewLogs).all()).toHaveLength(2);
    expect(db.select().from(cards).get()!.reps).toBe(2);
  });
});

describe("reviewSummary", () => {
  it("reports due, new and learned counts", () => {
    const { ids } = scriptChapter(["क", "ख", "ग"]);
    expect(reviewSummary(db, userId)).toMatchObject({ due: 0, new: 6, learned: 0, total: 6, nextDue: null });
    answerCard(db, userId, { itemId: ids[0]!, type: "listen", chosenItemId: ids[0]! });
    const s = reviewSummary(db, userId);
    expect(s).toMatchObject({ due: 0, new: 5, learned: 1 });
    expect(s.nextDue).not.toBeNull();
  });

  it("lists the letters coming up, due ones first, then new in course order", () => {
    const { ids } = scriptChapter(["क", "ख", "ग"]);
    expect(reviewSummary(db, userId).letters).toEqual(["क", "ख", "ग"]);
    // ग answered wrong a while ago: due again, so it leads
    answerCard(db, userId, { itemId: ids[2]!, type: "listen", chosenItemId: ids[0]! }, new Date(Date.now() - 3_600_000));
    expect(reviewSummary(db, userId).letters).toEqual(["ग", "क", "ख"]);
  });
});

describe("dayStart", () => {
  it("starts the day at 4am, so 2am still belongs to yesterday", () => {
    const twoAm = new Date(2026, 9, 22, 2, 0);
    expect(dayStart(twoAm)).toEqual(new Date(2026, 9, 21, 4, 0));
    const noon = new Date(2026, 9, 22, 12, 0);
    expect(dayStart(noon)).toEqual(new Date(2026, 9, 22, 4, 0));
  });
});

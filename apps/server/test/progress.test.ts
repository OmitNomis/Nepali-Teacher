import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { createChapter, createItem } from "../src/content";
import { openDb, type Db } from "../src/db";
import { audio, items, users } from "../src/db/schema";
import { learnerProgress, PROGRESS_DAYS } from "../src/progress";
import { answerCard } from "../src/srs";

let db: Db;
let userId: number;
let ids: string[];

const at = (day: number, hour = 12) => new Date(2026, 9, day, hour);

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nt-progress-"));
  const config = loadConfig({ DATA_DIR: dir, TTS_PROVIDER: "none" });
  db = openDb(config.dbFile, path.join(__dirname, "../drizzle"));
  db.insert(users).values({ username: "boss", displayName: "Boss", passwordHash: "x", role: "admin" }).run();
  userId = db
    .insert(users)
    .values({ username: "yui", displayName: "ゆい", passwordHash: "x", role: "learner" })
    .returning({ id: users.id })
    .get().id;
  const chapterId = createChapter(db, { track: "script", titleJa: "子音", titleNe: "", descriptionJa: "" });
  ids = ["क", "ख", "ग"].map((ne) => {
    const item = createItem(db, chapterId, { kind: "letter", ne, ja: "", roman: "", note: "" });
    db.insert(audio).values({ id: `a-${item.id}`, file: "x.mp3", mime: "audio/mpeg", bytes: 1, source: "tts" }).run();
    db.update(items).set({ audioId: `a-${item.id}` }).where(eq(items.id, item.id)).run();
    return item.id;
  });
});

const answer = (itemId: string, chosenItemId: string, when: Date) =>
  answerCard(db, userId, { itemId, type: "listen", chosenItemId, durationMs: 3000 }, when);

describe("learnerProgress", () => {
  it("lists only learners, with nothing done yet", () => {
    const [p, ...rest] = learnerProgress(db, at(28));
    expect(rest).toHaveLength(0);
    expect(p).toMatchObject({ username: "yui", lastActive: null, streak: 0, answers: 0, learned: 0, total: 6 });
    expect(p!.days).toHaveLength(PROGRESS_DAYS);
    expect(p!.days.every((d) => d.answers === 0)).toBe(true);
    expect(p!.chapters).toEqual([expect.objectContaining({ titleJa: "子音", total: 6, seen: 0 })]);
  });

  it("counts answers per day, the 4am day boundary included", () => {
    answer(ids[0]!, ids[0]!, at(27, 22));
    answer(ids[1]!, ids[2]!, at(28, 2)); // 2am still counts as the 27th
    answer(ids[2]!, ids[2]!, at(28, 9));
    const p = learnerProgress(db, at(28, 12))[0]!;
    expect(p.days.at(-1)).toEqual({ date: "2026-10-28", answers: 1, correct: 1, ms: 3000 });
    expect(p.days.at(-2)).toEqual({ date: "2026-10-27", answers: 2, correct: 1, ms: 6000 });
    expect(p).toMatchObject({ answers: 3, correct: 2, learned: 3 });
    expect(p.lastActive).toEqual(at(28, 9));
  });

  it("counts a streak up to yesterday until today's first answer", () => {
    for (const day of [22, 24, 25, 26]) answer(ids[0]!, ids[0]!, at(day));
    expect(learnerProgress(db, at(27))[0]!.streak).toBe(3);
    answer(ids[0]!, ids[0]!, at(27));
    expect(learnerProgress(db, at(27, 20))[0]!.streak).toBe(4);
    expect(learnerProgress(db, at(29))[0]!.streak).toBe(0);
  });

  it("ranks the letters she mixes up by how often", () => {
    answer(ids[0]!, ids[1]!, at(26));
    answer(ids[2]!, ids[1]!, at(27));
    answer(ids[0]!, ids[1]!, at(27));
    const p = learnerProgress(db, at(28))[0]!;
    expect(p.mixUps.map((m) => [m.ne, m.picked, m.count])).toEqual([
      ["क", "ख", 2],
      ["ग", "ख", 1],
    ]);
  });
});

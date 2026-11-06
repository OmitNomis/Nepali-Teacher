import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getAudio, removeJob, REMOVE_JOB, saveItemAudio } from "../src/audio";
import { loadConfig, type Config } from "../src/config";
import { createChapter, createItem, getItem } from "../src/content";
import { openDb, type Db } from "../src/db";
import { jobs, users } from "../src/db/schema";

let db: Db;
let config: Config;
let itemId: string;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nt-audio-"));
  config = loadConfig({ DATA_DIR: dir, TTS_PROVIDER: "none" });
  db = openDb(config.dbFile, path.join(__dirname, "../drizzle"));
  db.insert(users).values({ username: "admin", displayName: "Admin", passwordHash: "x", role: "admin" }).run();
  const chapterId = createChapter(db, { track: "script", titleJa: "文字", titleNe: "", descriptionJa: "" });
  itemId = createItem(db, chapterId, { kind: "letter", ne: "क", ja: "", roman: "ka", note: "", register: null, group: "" }).id;
});

const take = () => new File([new Uint8Array(16)], "r.m4a", { type: "audio/mp4" });

describe("replaced audio", () => {
  it("keeps playing for a while, so a screen holding the old URL still works", async () => {
    const first = await saveItemAudio(db, config, itemId, take(), 1);
    const second = await saveItemAudio(db, config, itemId, take(), 1);
    expect(getItem(db, itemId).audioId).toBe(second);

    const old = getAudio(db, config, first);
    expect(old && fs.existsSync(old.path)).toBe(true);
    const [retire] = db.select().from(jobs).where(eq(jobs.type, REMOVE_JOB)).all();
    expect(retire!.payload).toEqual({ audioId: first });
    expect(retire!.runAt.getTime()).toBeGreaterThan(Date.now() + 30 * 60 * 1000);

    await removeJob(db, config)(retire!.payload);
    expect(getAudio(db, config, first)).toBeNull();
    expect(getAudio(db, config, second)).not.toBeNull();
  });
});

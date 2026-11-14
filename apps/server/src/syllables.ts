import fs from "node:fs";
import path from "node:path";
import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { letterKey, letters } from "@nt/shared";
import type { Config } from "./config";
import type { Db } from "./db";
import { audio, chapters, items, jobs, syllables } from "./db/schema";
import { newId } from "./ids";
import { TRIM_JOB } from "./audio";
import { enqueue } from "./jobs";
import type { TtsProvider } from "./tts";

export const SYLLABLE_TTS_JOB = "audio.syllable-tts";

const audioUrl = (id: string) => `/api/audio/${id}`;

/** Script letters the learner can see, with their audio if they have any. */
function scriptLetters(db: Pick<Db, "select">) {
  return db
    .select({ ne: items.ne, audioId: items.audioId, source: audio.source })
    .from(items)
    .innerJoin(chapters, eq(items.chapterId, chapters.id))
    .leftJoin(audio, eq(items.audioId, audio.id))
    .where(and(eq(chapters.track, "script"), eq(items.archived, false), eq(chapters.archived, false)))
    .orderBy(asc(chapters.position), asc(items.position))
    .all();
}

/**
 * Letters in phrases with no script letter of the exact same spelling and no
 * clip of their own yet, e.g. conjuncts like स्ते.
 */
export function missingSyllables(db: Pick<Db, "select">) {
  const covered = new Set(scriptLetters(db).map((l) => letterKey(l.ne)));
  for (const s of db.select({ ne: syllables.ne }).from(syllables).where(isNotNull(syllables.audioId)).all()) {
    covered.add(letterKey(s.ne));
  }
  const phrases = db
    .select({ ne: items.ne })
    .from(items)
    .where(and(ne(items.kind, "letter"), eq(items.archived, false)))
    .all();
  const missing = new Map<string, string>();
  for (const p of phrases) {
    for (const l of letters(p.ne)) {
      const key = letterKey(l);
      if (!covered.has(key) && !missing.has(key)) missing.set(key, l);
    }
  }
  return [...missing.values()];
}

/** Queues TTS for every missing syllable that isn't already queued. */
export function queueSyllableTts(db: Db) {
  let queued = 0;
  for (const ne of missingSyllables(db)) {
    const pending = db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.type, SYLLABLE_TTS_JOB),
          inArray(jobs.status, ["pending", "running"]),
          sql`json_extract(${jobs.payload}, '$.ne') = ${ne}`,
        ),
      )
      .get();
    if (!pending) {
      enqueue(db, SYLLABLE_TTS_JOB, { ne });
      queued++;
    }
  }
  return queued;
}

/** Job: a placeholder clip for one syllable, unless something covers it by now. */
export function syllableTtsJob(db: Db, config: Config, provider: TtsProvider) {
  return async (payload: unknown) => {
    const { ne: text } = payload as { ne: string };
    if (!missingSyllables(db).includes(text)) return;

    const { audio: buf, voice } = await provider(text, config.tts.voice);
    const id = newId();
    const name = `${id}.mp3`;
    fs.mkdirSync(config.audioDir, { recursive: true });
    await fs.promises.writeFile(path.join(config.audioDir, name), buf);

    const saved = db.transaction((tx) => {
      if (!missingSyllables(tx).includes(text)) return false;
      tx.insert(audio).values({ id, file: name, mime: "audio/mpeg", bytes: buf.length, source: "tts", voice }).run();
      tx.insert(syllables)
        .values({ ne: text, audioId: id })
        .onConflictDoUpdate({ target: syllables.ne, set: { audioId: id } })
        .run();
      enqueue(tx, TRIM_JOB, { audioId: id });
      return true;
    });
    if (!saved) fs.rm(path.join(config.audioDir, name), { force: true }, () => {});
  };
}

/**
 * Every letter with a sound, for tapping letters in a phrase. A letter in
 * several script chapters (क in consonants and barakhari) plays a human
 * recording over TTS; syllable clips only fill in letters no script item has.
 */
export function listLetterSounds(db: Db) {
  const sounds = new Map<string, { ne: string; audioUrl: string; recorded: boolean }>();
  const add = (ne: string, audioId: string | null, recorded: boolean) => {
    const key = letterKey(ne);
    const have = sounds.get(key);
    if (audioId && (!have || (recorded && !have.recorded))) sounds.set(key, { ne: key, audioUrl: audioUrl(audioId), recorded });
  };
  for (const l of scriptLetters(db)) add(l.ne, l.audioId, l.source === "recording");
  for (const s of db.select().from(syllables).all()) add(s.ne, s.audioId, false);
  return [...sounds.values()].map(({ ne, audioUrl }) => ({ ne, audioUrl }));
}

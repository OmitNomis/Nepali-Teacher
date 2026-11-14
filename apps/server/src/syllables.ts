import fs from "node:fs";
import path from "node:path";
import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { letterKey, letters, splitLetters } from "@nt/shared";
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
 * Letters that only phrases have, with no script letter of the exact same
 * spelling (e.g. conjuncts like स्ते), in the order they first come up, each
 * with the word it first came up in.
 */
export function phraseOnlyLetters(db: Pick<Db, "select">) {
  const script = new Set(scriptLetters(db).map((l) => letterKey(l.ne)));
  const phrases = db
    .select({ ne: items.ne })
    .from(items)
    .innerJoin(chapters, eq(items.chapterId, chapters.id))
    .where(and(ne(items.kind, "letter"), eq(items.archived, false)))
    .orderBy(asc(chapters.track), asc(chapters.position), asc(items.position))
    .all();
  const found = new Map<string, { ne: string; word: string }>();
  for (const p of phrases) {
    for (const word of p.ne.split(/\s+/)) {
      for (const l of letters(word)) {
        const key = letterKey(l);
        if (!script.has(key) && !found.has(key)) found.set(key, { ne: key, word: wordOnly(word) });
      }
    }
  }
  return found;
}

// the word without punctuation stuck to it, e.g. "नमस्ते।" → "नमस्ते"
const wordOnly = (word: string) => splitLetters(word).reduce((w, p) => (p.letter ? w + p.text : w), "");

/** Phrase-only letters with no clip of their own yet. */
export function missingSyllables(db: Pick<Db, "select">) {
  const voiced = new Set(
    db
      .select({ ne: syllables.ne })
      .from(syllables)
      .where(isNotNull(syllables.audioId))
      .all()
      .map((s) => letterKey(s.ne)),
  );
  return [...phraseOnlyLetters(db).keys()].filter((key) => !voiced.has(key));
}

/** Phrase-only letters still waiting for a human recording, for the Record tab. */
export function listSyllablesToRecord(db: Db) {
  const clips = new Map(
    db
      .select({ ne: syllables.ne, audioId: syllables.audioId, source: audio.source })
      .from(syllables)
      .leftJoin(audio, eq(syllables.audioId, audio.id))
      .all()
      .map((s) => [letterKey(s.ne), s]),
  );
  return [...phraseOnlyLetters(db).values()].flatMap(({ ne, word }) => {
    const clip = clips.get(ne);
    if (clip?.source === "recording") return [];
    return [{ ne, word, ttsUrl: clip?.audioId ? audioUrl(clip.audioId) : null }];
  });
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

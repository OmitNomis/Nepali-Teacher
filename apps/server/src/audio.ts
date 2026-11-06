import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Config } from "./config";
import { NotFoundError } from "./content";
import type { Db } from "./db";
import { audio, items } from "./db/schema";
import { newId } from "./ids";
import { enqueue, PermanentJobError } from "./jobs";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const TRIM_JOB = "audio.trim";
export const REMOVE_JOB = "audio.remove";
// how long replaced audio stays playable for screens still holding its URL
const KEEP_REPLACED_MS = 60 * 60 * 1000;

const EXT_BY_MIME: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

const baseMime = (mime: string) => mime.split(";")[0]!.trim().toLowerCase();

export function isSupportedAudio(mime: string) {
  return baseMime(mime) in EXT_BY_MIME;
}

function removeAudio(db: Db, config: Config, audioId: string) {
  const row = db.select().from(audio).where(eq(audio.id, audioId)).get();
  if (!row) return;
  db.delete(audio).where(eq(audio.id, audioId)).run();
  fs.rm(path.join(config.audioDir, row.file), { force: true }, () => {});
}

/**
 * Deletes replaced audio later instead of now. A screen that loaded the item
 * just before a re-record or a trim swap still holds the old URL; deleting at
 * once made that tap fail silently (e.g. listening back to a fresh take).
 */
function retireAudio(db: Pick<Db, "insert">, audioId: string) {
  enqueue(db, REMOVE_JOB, { audioId }, new Date(Date.now() + KEEP_REPLACED_MS));
}

/** Job: delete retired audio, unless an item uses it again. */
export function removeJob(db: Db, config: Config) {
  return async (payload: unknown) => {
    const { audioId } = payload as { audioId: string };
    if (db.select({ id: items.id }).from(items).where(eq(items.audioId, audioId)).get()) return;
    removeAudio(db, config, audioId);
  };
}

/** Stores a new recording for an item, replacing any previous one. */
export async function saveItemAudio(
  db: Db,
  config: Config,
  itemId: string,
  file: File,
  userId: number,
) {
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item) throw new NotFoundError("Item not found");

  const mime = baseMime(file.type);
  const id = newId();
  const name = `${id}.${EXT_BY_MIME[mime]}`;
  fs.mkdirSync(config.audioDir, { recursive: true });
  await fs.promises.writeFile(path.join(config.audioDir, name), Buffer.from(await file.arrayBuffer()));

  db.transaction((tx) => {
    tx.insert(audio).values({ id, file: name, mime, bytes: file.size, createdBy: userId }).run();
    tx.update(items).set({ audioId: id }).where(eq(items.id, itemId)).run();
    enqueue(tx, TRIM_JOB, { audioId: id });
    if (item.audioId) retireAudio(tx, item.audioId);
  });
  return id;
}

export function deleteItemAudio(db: Db, config: Config, itemId: string) {
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item) throw new NotFoundError("Item not found");
  if (!item.audioId) return;
  db.update(items).set({ audioId: null }).where(eq(items.id, itemId)).run();
  removeAudio(db, config, item.audioId);
}

export function getAudio(db: Db, config: Config, audioId: string) {
  const row = db.select().from(audio).where(eq(audio.id, audioId)).get();
  if (!row) return null;
  return { ...row, path: path.join(config.audioDir, row.file) };
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
    child.on("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "ENOENT" ? new PermanentJobError(`${cmd} not found`) : err),
    );
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr}`)),
    );
  });
}

// trim silence at both ends (keeping a short lead-in), then even out loudness
const SILENCE = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15";
const FILTER = `${SILENCE},areverse,${SILENCE},areverse,loudnorm=I=-16:TP=-1.5:LRA=11`;

/**
 * Job: produce a trimmed AAC copy as a new immutable audio row and point the
 * item at it. Audio URLs never change content, so clients can cache forever.
 * Runs for recordings and TTS alike (Edge pads its clips with a second or
 * more of silence, which would throw off the karaoke wipe and play-all).
 */
export function trimJob(db: Db, config: Config) {
  return async (payload: unknown) => {
    const { audioId } = payload as { audioId: string };
    const source = getAudio(db, config, audioId);
    if (!source || source.trimmed) return; // re-recorded meanwhile, or already done

    const id = newId();
    const name = `${id}.m4a`;
    const out = path.join(config.audioDir, name);
    await run(config.ffmpeg, [
      "-hide_banner", "-y", "-i", source.path,
      "-af", FILTER, "-ar", "44100", "-ac", "1",
      "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out,
    ]);
    const bytes = (await fs.promises.stat(out)).size;

    const swapped = db.transaction((tx) => {
      const stillUsed = tx.select().from(items).where(eq(items.audioId, audioId)).all();
      if (stillUsed.length === 0) return false;
      // a trimmed TTS placeholder is still a placeholder, in the same voice
      tx.insert(audio)
        .values({
          id,
          file: name,
          mime: "audio/mp4",
          bytes,
          trimmed: true,
          source: source.source,
          voice: source.voice,
          createdBy: source.createdBy,
        })
        .run();
      tx.update(items).set({ audioId: id }).where(eq(items.audioId, audioId)).run();
      retireAudio(tx, audioId);
      return true;
    });
    if (!swapped) fs.rm(out, { force: true }, () => {});
  };
}

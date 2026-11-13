// Usage: import-chapter <file.json>...
// Imports chapter JSON files (same format as the admin "Import JSON" sheet) and
// queues TTS for items without audio; the running server picks the jobs up.
import fs from "node:fs";
import { chapterFile } from "@nt/shared";
import { loadConfig } from "../config";
import { getChapter, importChapter } from "../content";
import { openDb } from "../db";
import { queueSyllableTts } from "../syllables";
import { queueTts } from "../tts";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: import-chapter <file.json>...");
  process.exit(1);
}

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });
const db = openDb(config.dbFile, config.migrationsDir);

let failed = false;
for (const file of files) {
  const parsed = chapterFile.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    console.error(`${file}: ${issue?.path.join(".") || "file"}: ${issue?.message}`);
    failed = true;
    continue;
  }
  const result = importChapter(db, parsed.data);
  const chapter = getChapter(db, result.chapterId, { includeArchived: false });
  const tts = config.tts.provider === "none" ? 0 : queueTts(db, chapter.items.map((i) => i.id));
  console.log(
    `${file}: "${chapter.titleJa}" (${result.chapterId}) ` +
      `created ${result.created}, updated ${result.updated}, untouched ${result.untouched}, TTS queued ${tts}`,
  );
}
if (config.tts.provider !== "none") {
  const queued = queueSyllableTts(db);
  if (queued) console.log(`TTS queued for ${queued} letters with no sound to tap yet`);
}
process.exit(failed ? 1 : 0);

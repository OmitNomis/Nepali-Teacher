// Usage: regenerate-tts [--all] [--dry-run]
// Re-synthesizes TTS placeholders that weren't spoken in the configured voice
// (e.g. Google fallbacks), or with --all every placeholder. The running server
// picks the queued jobs up.
import { loadConfig } from "../config";
import { openDb } from "../db";
import { requeueOtherVoices } from "../tts";

const dryRun = process.argv.includes("--dry-run");
const all = process.argv.includes("--all");
const config = loadConfig();
if (config.tts.provider === "none") {
  console.error("TTS is off (TTS_PROVIDER=none)");
  process.exit(1);
}
const db = openDb(config.dbFile, config.migrationsDir);
const { stale, queued } = requeueOtherVoices(db, config, config.tts.voice, { dryRun, all });
for (const s of stale) console.log(`${s.ne}  (${s.voice ?? "unknown voice"})`);
console.log(
  dryRun
    ? `${stale.length} clips ${all ? "in total" : `not in ${config.tts.voice}`} (dry run, nothing changed)`
    : `${stale.length} clips dropped, ${queued} queued for ${config.tts.voice}`,
);

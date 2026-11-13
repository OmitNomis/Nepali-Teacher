import fs from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { REMOVE_JOB, removeJob, TRIM_JOB, trimJob } from "./audio";
import { pruneSessions } from "./auth";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { startJobRunner } from "./jobs";
import { queueSyllableTts, SYLLABLE_TTS_JOB, syllableTtsJob } from "./syllables";
import { providerFromConfig, TTS_JOB, ttsJob } from "./tts";

const config = loadConfig();
fs.mkdirSync(config.audioDir, { recursive: true });
const db = openDb(config.dbFile, config.migrationsDir);

const tts = providerFromConfig(config);
startJobRunner(db, {
  [TRIM_JOB]: trimJob(db, config),
  [REMOVE_JOB]: removeJob(db, config),
  ...(tts && { [TTS_JOB]: ttsJob(db, config, tts), [SYLLABLE_TTS_JOB]: syllableTtsJob(db, config, tts) }),
});
// letters of phrases written before syllable clips existed, or while TTS was off
if (tts) queueSyllableTts(db);
console.log(tts ? `TTS: ${config.tts.provider} (${config.tts.voice})` : "TTS: off");
pruneSessions(db);
setInterval(() => pruneSessions(db), 6 * 60 * 60 * 1000).unref();

serve({ fetch: createApp(db, config).fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`NepaliTeacher server on http://${config.host ?? "localhost"}:${info.port}`);
});

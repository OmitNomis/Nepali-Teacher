import fs from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { TRIM_JOB, trimJob } from "./audio";
import { pruneSessions } from "./auth";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { startJobRunner } from "./jobs";
import { providerFromConfig, TTS_JOB, ttsJob } from "./tts";

const config = loadConfig();
fs.mkdirSync(config.audioDir, { recursive: true });
const db = openDb(config.dbFile, config.migrationsDir);

const tts = providerFromConfig(config);
startJobRunner(db, {
  [TRIM_JOB]: trimJob(db, config),
  ...(tts && { [TTS_JOB]: ttsJob(db, config, tts) }),
});
console.log(tts ? `TTS: ${config.tts.provider} (${config.tts.voice})` : "TTS: off");
pruneSessions(db);
setInterval(() => pruneSessions(db), 6 * 60 * 60 * 1000).unref();

serve({ fetch: createApp(db, config).fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`NepaliTeacher server on http://${config.host ?? "localhost"}:${info.port}`);
});

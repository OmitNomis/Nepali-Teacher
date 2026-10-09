import fs from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { TRIM_JOB, trimJob } from "./audio";
import { pruneSessions } from "./auth";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { startJobRunner } from "./jobs";

const config = loadConfig();
fs.mkdirSync(config.audioDir, { recursive: true });
const db = openDb(config.dbFile, config.migrationsDir);

startJobRunner(db, { [TRIM_JOB]: trimJob(db, config) });
pruneSessions(db);
setInterval(() => pruneSessions(db), 6 * 60 * 60 * 1000).unref();

serve({ fetch: createApp(db, config).fetch, port: config.port }, (info) => {
  console.log(`NepaliTeacher server on http://localhost:${info.port}`);
});

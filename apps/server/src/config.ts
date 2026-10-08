import path from "node:path";

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR ?? "./data");
  return {
    port: Number(env.PORT ?? 8787),
    dataDir,
    dbFile: path.join(dataDir, "app.db"),
    audioDir: path.join(dataDir, "audio"),
    migrationsDir: path.resolve(env.MIGRATIONS_DIR ?? "./drizzle"),
    // built PWA to serve in production; unset in dev (Vite serves it)
    webDist: env.WEB_DIST ? path.resolve(env.WEB_DIST) : undefined,
    secureCookies: env.NODE_ENV === "production",
    ffmpeg: env.FFMPEG_PATH ?? "ffmpeg",
  };
}

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
    tts: {
      // azure (official, needs a key) | edge (unofficial, no key) | none
      provider: (env.TTS_PROVIDER ?? (env.AZURE_SPEECH_KEY ? "azure" : "edge")) as "azure" | "edge" | "none",
      voice: env.TTS_VOICE ?? "ne-NP-HemkalaNeural",
      azureKey: env.AZURE_SPEECH_KEY,
      azureRegion: env.AZURE_SPEECH_REGION ?? "eastus",
    },
  };
}

import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { chapterFile, chapterInput, chapterPatch, itemInput, itemPatch, loginInput, reorderInput } from "@nt/shared";
import { deleteItemAudio, getAudio, isSupportedAudio, MAX_AUDIO_BYTES, saveItemAudio } from "./audio";
import {
  type AppEnv,
  createSession,
  destroySession,
  findUserByLogin,
  LoginThrottle,
  requireRole,
  sessionUser,
} from "./auth";
import type { Config } from "./config";
import {
  ConflictError,
  createChapter,
  createItem,
  exportChapter,
  getChapter,
  getItem,
  importChapter,
  listChapters,
  listMissingAudio,
  NotFoundError,
  reorderChapters,
  reorderItems,
  updateChapter,
  updateItem,
} from "./content";
import type { Db } from "./db";
import { queueTts } from "./tts";

export function createApp(db: Db, config: Config) {
  const anyUser = requireRole(db);
  const admin = requireRole(db, "admin");
  const throttle = new LoginThrottle();
  const ttsOn = config.tts.provider !== "none";
  const autoTts = (ids: string[]) => (ttsOn ? queueTts(db, ids) : 0);

  const auth = new Hono<AppEnv>()
    .get("/me", (c) => c.json({ user: sessionUser(c, db) }))
    .post("/login", zValidator("json", loginInput), async (c) => {
      const key = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
      if (throttle.blocked(key)) {
        throw new HTTPException(429, { message: "Too many attempts, try again later" });
      }
      const { username, password } = c.req.valid("json");
      const user = await findUserByLogin(db, username, password);
      if (!user) {
        throttle.fail(key);
        throw new HTTPException(401, { message: "Wrong username or password" });
      }
      throttle.clear(key);
      createSession(c, db, user.id, config.secureCookies);
      return c.json({ user });
    })
    .post("/logout", (c) => {
      destroySession(c, db);
      return c.json({ ok: true });
    });

  const content = new Hono<AppEnv>()
    .get("/chapters", anyUser, (c) => {
      const includeArchived = c.get("user").role === "admin" && c.req.query("archived") === "1";
      return c.json(listChapters(db, { includeArchived }));
    })
    .get("/chapters/:id", anyUser, (c) => {
      const includeArchived = c.get("user").role === "admin";
      return c.json(getChapter(db, c.req.param("id"), { includeArchived }));
    })
    .post("/chapters", admin, zValidator("json", chapterInput), (c) =>
      c.json({ id: createChapter(db, c.req.valid("json")) }, 201),
    )
    .patch("/chapters/:id", admin, zValidator("json", chapterPatch), (c) => {
      updateChapter(db, c.req.param("id"), c.req.valid("json"));
      return c.json({ ok: true });
    })
    .post("/chapters/reorder", admin, zValidator("json", reorderInput), (c) => {
      reorderChapters(db, c.req.valid("json").ids);
      return c.json({ ok: true });
    })
    .get("/chapters/:id/export", admin, (c) => c.json(exportChapter(db, c.req.param("id"))))
    .post("/chapters/import", admin, zValidator("json", chapterFile), (c) => {
      const result = importChapter(db, c.req.valid("json"));
      const chapter = getChapter(db, result.chapterId, { includeArchived: false });
      return c.json({ ...result, ttsQueued: autoTts(chapter.items.map((i) => i.id)) });
    })
    .post("/chapters/:id/items", admin, zValidator("json", itemInput), (c) => {
      const item = createItem(db, c.req.param("id"), c.req.valid("json"));
      autoTts([item.id]);
      return c.json(item, 201);
    })
    .post("/chapters/:id/tts", admin, (c) => {
      if (!ttsOn) throw new HTTPException(400, { message: "TTS is turned off on the server" });
      const chapter = getChapter(db, c.req.param("id"), { includeArchived: false });
      return c.json({ queued: queueTts(db, chapter.items.map((i) => i.id)) });
    })
    .get("/tts", admin, (c) =>
      c.json({ provider: ttsOn ? config.tts.provider : null, voice: config.tts.voice }),
    )
    .post("/chapters/:id/items/reorder", admin, zValidator("json", reorderInput), (c) => {
      reorderItems(db, c.req.param("id"), c.req.valid("json").ids);
      return c.json({ ok: true });
    })
    .patch("/items/:id", admin, zValidator("json", itemPatch), (c) => {
      const id = c.req.param("id");
      const before = getItem(db, id);
      const patch = c.req.valid("json");
      // TTS of the old text is now wrong: drop it so a fresh one gets made
      if (patch.ne !== undefined && patch.ne !== before.ne && before.audioSource === "tts") {
        deleteItemAudio(db, config, id);
      }
      const item = updateItem(db, id, patch);
      autoTts([id]);
      return c.json(item);
    })
    .get("/items/missing-audio", admin, (c) => c.json(listMissingAudio(db)))
    .post("/items/:id/audio", admin, async (c) => {
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) throw new HTTPException(400, { message: "Missing file" });
      if (file.size === 0 || file.size > MAX_AUDIO_BYTES) {
        throw new HTTPException(413, { message: "Recording is empty or too large" });
      }
      if (!isSupportedAudio(file.type)) {
        throw new HTTPException(415, { message: `Unsupported audio type ${file.type}` });
      }
      const id = await saveItemAudio(db, config, c.req.param("id"), file, c.get("user").id);
      return c.json({ audioId: id, audioUrl: `/api/audio/${id}` }, 201);
    })
    .delete("/items/:id/audio", admin, (c) => {
      deleteItemAudio(db, config, c.req.param("id"));
      return c.json({ ok: true });
    })
    .get("/audio/:id", anyUser, (c) => {
      const file = getAudio(db, config, c.req.param("id"));
      if (!file || !fs.existsSync(file.path)) throw new NotFoundError("Audio not found");
      const size = fs.statSync(file.path).size;
      const headers: Record<string, string> = {
        "Content-Type": file.mime,
        "Accept-Ranges": "bytes",
        // audio rows are immutable: a new recording gets a new id
        "Cache-Control": "private, max-age=31536000, immutable",
      };

      // Safari won't play media without byte-range support
      const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") ?? "");
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (start >= size || start > end) {
          return c.body(null, 416, { "Content-Range": `bytes */${size}` });
        }
        const stream = Readable.toWeb(fs.createReadStream(file.path, { start, end }));
        return c.body(stream as ReadableStream, 206, {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        });
      }
      const stream = Readable.toWeb(fs.createReadStream(file.path));
      return c.body(stream as ReadableStream, 200, { ...headers, "Content-Length": String(size) });
    });

  const api = new Hono<AppEnv>().route("/auth", auth).route("/", content);

  const app = new Hono()
    .route("/api", api)
    .onError((err, c) => {
      if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
      if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
      if (err instanceof ConflictError) return c.json({ error: err.message }, 409);
      console.error(err);
      return c.json({ error: "Internal error" }, 500);
    });

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  if (config.webDist) {
    const root = path.relative(process.cwd(), config.webDist);
    app.use("/*", serveStatic({ root }));
    // SPA fallback for client-side routes
    const index = fs.readFileSync(path.join(config.webDist, "index.html"), "utf8");
    app.get("*", (c) => c.html(index));
  }

  return app;
}

export type AppType = ReturnType<typeof createApp>;

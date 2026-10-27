import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { clientIp, hashPassword } from "../src/auth";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db";
import { users } from "../src/db/schema";

describe("clientIp", () => {
  it("trusts only the hop our proxy appended", () => {
    expect(clientIp("6.6.6.6, 203.0.113.9")).toBe("203.0.113.9");
    expect(clientIp("203.0.113.9")).toBe("203.0.113.9");
    expect(clientIp(undefined)).toBe("local");
  });
});

describe("login throttle", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nt-auth-"));
    const config = loadConfig({ DATA_DIR: dir, TTS_PROVIDER: "none" });
    const db = openDb(config.dbFile, path.join(__dirname, "../drizzle"));
    const passwordHash = await hashPassword("correct horse");
    db.insert(users).values({ username: "yui", displayName: "ゆい", passwordHash, role: "learner" }).run();
    app = createApp(db, config);
  });

  const login = (password: string, xff: string) =>
    app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": xff },
      body: JSON.stringify({ username: "yui", password }),
    });

  it("can't be dodged by forging X-Forwarded-For", async () => {
    for (let i = 0; i < 8; i++) {
      expect((await login("guess", `10.0.0.${i}, 203.0.113.9`)).status).toBe(401);
    }
    // a fresh forged prefix still maps to the same real client
    expect((await login("correct horse", "10.9.9.9, 203.0.113.9")).status).toBe(429);
    // someone else isn't affected
    expect((await login("correct horse", "198.51.100.7")).status).toBe(200);
  });

  it("sends security headers", async () => {
    const res = await login("correct horse", "198.51.100.7");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("rejects bad input with a readable error string", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "", password: "x" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: unknown };
    expect(body.error).toEqual(expect.stringMatching(/^username: /));
  });
});

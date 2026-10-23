import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq, lt } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { Role } from "@nt/shared";
import type { Db } from "./db";
import { sessions, users, type User } from "./db/schema";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "nt_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90;

export type PublicUser = Pick<User, "id" | "username" | "displayName" | "role">;
export type AppEnv = { Variables: { user: PublicUser } };

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(key, expected);
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const toPublic = (u: User): PublicUser => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
});

export function createSession(c: Context, db: Db, userId: number, secure: boolean) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.insert(sessions).values({ id: hashToken(token), userId, expiresAt }).run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export function destroySession(c: Context, db: Db) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function sessionUser(c: Context, db: Db): PublicUser | null {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const row = db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, hashToken(token)))
    .get();
  if (!row || row.sessions.expiresAt.getTime() < Date.now()) return null;
  return toPublic(row.users);
}

export function pruneSessions(db: Db) {
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
}

export function requireRole(db: Db, ...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = sessionUser(c, db);
    if (!user) throw new HTTPException(401, { message: "Not signed in" });
    if (roles.length && !roles.includes(user.role)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    c.set("user", user);
    await next();
  };
}

export async function findUserByLogin(db: Db, username: string, password: string) {
  const user = db.select().from(users).where(eq(users.username, username)).get();
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  return toPublic(user);
}

/**
 * Client IP for rate limiting. Only the last X-Forwarded-For hop is trusted:
 * it's the one our own proxy (tailscale serve/funnel, Caddy) appended, while
 * anything before it was sent by the client and can be forged.
 */
export function clientIp(forwardedFor: string | undefined) {
  return forwardedFor?.split(",").at(-1)?.trim() || "local";
}

/** Tiny in-memory brute-force guard: N failures per key per window. */
export class LoginThrottle {
  private failures = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private max = 8,
    private windowMs = 15 * 60 * 1000,
  ) {}

  blocked(key: string) {
    const f = this.failures.get(key);
    if (!f) return false;
    if (f.resetAt < Date.now()) {
      this.failures.delete(key);
      return false;
    }
    return f.count >= this.max;
  }

  fail(key: string) {
    const f = this.failures.get(key);
    if (!f || f.resetAt < Date.now()) {
      this.failures.set(key, { count: 1, resetAt: Date.now() + this.windowMs });
    } else {
      f.count++;
    }
  }

  clear(key: string) {
    this.failures.delete(key);
  }
}

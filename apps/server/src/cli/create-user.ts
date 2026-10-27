// Usage: pnpm user:create <username> <admin|learner> [display name]
// Prompts for the password. Running it for an existing username resets the
// password and signs that user out on every device.
import { createInterface } from "node:readline/promises";
import { eq } from "drizzle-orm";
import { ROLES, type Role } from "@nt/shared";
import { hashPassword } from "../auth";
import { loadConfig } from "../config";
import { openDb } from "../db";
import { sessions, users } from "../db/schema";
import fs from "node:fs";

const [username, role, ...nameParts] = process.argv.slice(2);
if (!username || !ROLES.includes(role as Role)) {
  console.error("Usage: pnpm user:create <username> <admin|learner> [display name]");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = process.env.NT_PASSWORD ?? (await rl.question("Password: "));
rl.close();
if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });
const db = openDb(config.dbFile, config.migrationsDir);
const passwordHash = await hashPassword(password);
const displayName = nameParts.join(" ") || username;
const { id } = db
  .insert(users)
  .values({ username, role: role as Role, displayName, passwordHash })
  .onConflictDoUpdate({ target: users.username, set: { passwordHash, role: role as Role, displayName } })
  .returning({ id: users.id })
  .get();
// a reset (e.g. after a leak) shouldn't leave old 90-day sessions logged in
const { changes } = db.delete(sessions).where(eq(sessions.userId, id)).run();
console.log(`Saved ${role} "${username}"${changes ? `, signed out of ${changes} session(s)` : ""}`);

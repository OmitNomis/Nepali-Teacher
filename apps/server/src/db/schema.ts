import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { CARD_TYPES, ITEM_KINDS, REGISTERS, ROLES, TRACKS } from "@nt/shared";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
    .$onUpdate(() => new Date());

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ROLES }).notNull(),
  createdAt: createdAt(),
});

export const sessions = sqliteTable("sessions", {
  // sha256 of the cookie token, so a leaked db doesn't leak live sessions
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
});

export const chapters = sqliteTable("chapters", {
  id: text("id").primaryKey(),
  track: text("track", { enum: TRACKS }).notNull(),
  titleJa: text("title_ja").notNull(),
  titleNe: text("title_ne").notNull().default(""),
  descriptionJa: text("description_ja").notNull().default(""),
  position: integer("position").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const AUDIO_SOURCES = ["recording", "tts"] as const;

export const audio = sqliteTable("audio", {
  id: text("id").primaryKey(),
  // path relative to DATA_DIR/audio
  file: text("file").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  trimmed: integer("trimmed", { mode: "boolean" }).notNull().default(false),
  // "tts" clips are placeholders until a human recording replaces them
  source: text("source", { enum: AUDIO_SOURCES }).notNull().default("recording"),
  voice: text("voice"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ITEM_KINDS }).notNull(),
    ne: text("ne").notNull(),
    ja: text("ja").notNull().default(""),
    roman: text("roman").notNull().default(""),
    note: text("note").notNull().default(""),
    register: text("register", { enum: REGISTERS }),
    group: text("group_key").notNull().default(""),
    audioId: text("audio_id").references(() => audio.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("items_chapter_idx").on(t.chapterId, t.position)],
);

export const JOB_STATUSES = ["pending", "running", "done", "failed"] as const;

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    runAt: integer("run_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("jobs_pending_idx").on(t.status, t.runAt)],
);

// FSRS memory state shared by cards and review logs (field names follow ts-fsrs)
const fsrsState = () => ({
  due: integer("due", { mode: "timestamp_ms" }).notNull(),
  stability: real("stability").notNull(),
  difficulty: real("difficulty").notNull(),
  elapsedDays: integer("elapsed_days").notNull(),
  scheduledDays: integer("scheduled_days").notNull(),
  learningSteps: integer("learning_steps").notNull(),
  // ts-fsrs State: 0 new, 1 learning, 2 review, 3 relearning
  state: integer("state").notNull(),
});

/**
 * One review card per user, item and card type. Created on the first answer,
 * so an item without a card is "new" for that user. Hangs off the item id,
 * which is why item ids must never change.
 */
export const cards = sqliteTable(
  "cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    type: text("type", { enum: CARD_TYPES }).notNull(),
    ...fsrsState(),
    reps: integer("reps").notNull(),
    lapses: integer("lapses").notNull(),
    lastReview: integer("last_review", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("cards_user_item_type_idx").on(t.userId, t.itemId, t.type),
    index("cards_user_due_idx").on(t.userId, t.due),
  ],
);

export const reviewLogs = sqliteTable(
  "review_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    // ts-fsrs Rating: 1 again, 2 hard, 3 good, 4 easy
    rating: integer("rating").notNull(),
    ...fsrsState(),
    lastElapsedDays: integer("last_elapsed_days").notNull(),
    review: integer("review", { mode: "timestamp_ms" }).notNull(),
    // what the learner actually picked, to spot letters she confuses
    chosenItemId: text("chosen_item_id"),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("review_logs_card_idx").on(t.cardId, t.review)],
);

export type User = typeof users.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Audio = typeof audio.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type CardRow = typeof cards.$inferSelect;

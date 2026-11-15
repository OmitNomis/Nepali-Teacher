import { asc, eq } from "drizzle-orm";
import { CARD_TYPES } from "@nt/shared";
import type { Db } from "./db";
import { cards, chapters, items, reviewLogs, users } from "./db/schema";
import { dayStart, quizzableItems, reviewSummary } from "./srs";

/** Days the activity chart covers, today included. */
export const PROGRESS_DAYS = 14;
const MIX_UPS = 8;
// ts-fsrs State.Review: past the learning steps
const REVIEW_STATE = 2;

/** The learner's day (starting at 4am, like the review) as YYYY-MM-DD. */
function dayKey(when: Date) {
  const d = dayStart(when);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Each learner's quiz activity, for the admin's progress page. */
export function learnerProgress(db: Db, now = new Date()) {
  const learners = db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.role, "learner"))
    .orderBy(asc(users.id))
    .all();
  return learners.map((u) => ({ ...u, ...progressOf(db, u.id, now) }));
}

function progressOf(db: Db, userId: number, now: Date) {
  const ne = new Map(db.select({ id: items.id, ne: items.ne }).from(items).all().map((i) => [i.id, i.ne]));
  const logs = db
    .select({
      review: reviewLogs.review,
      correct: reviewLogs.correct,
      durationMs: reviewLogs.durationMs,
      itemId: cards.itemId,
      chosenItemId: reviewLogs.chosenItemId,
    })
    .from(reviewLogs)
    .innerJoin(cards, eq(reviewLogs.cardId, cards.id))
    .where(eq(cards.userId, userId))
    .orderBy(asc(reviewLogs.review))
    .all();

  // the last PROGRESS_DAYS days, oldest first, filled with zeros
  const days = Array.from({ length: PROGRESS_DAYS }, (_, i) => {
    const d = dayStart(now);
    d.setDate(d.getDate() - (PROGRESS_DAYS - 1 - i));
    return { date: dayKey(d), answers: 0, correct: 0, ms: 0 };
  });
  const byDay = new Map(days.map((d) => [d.date, d]));
  const active = new Set<string>();
  for (const log of logs) {
    const key = dayKey(log.review);
    active.add(key);
    const day = byDay.get(key);
    if (!day) continue;
    day.answers++;
    if (log.correct) day.correct++;
    day.ms += log.durationMs ?? 0;
  }

  // days in a row with answers, up to today (or yesterday, if today hasn't started yet)
  let streak = 0;
  const cursor = dayStart(now);
  if (!active.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (active.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const mixUps = new Map<string, { ne: string; picked: string; count: number; last: Date }>();
  for (const log of logs) {
    if (log.correct || !log.chosenItemId) continue;
    const key = `${log.itemId}>${log.chosenItemId}`;
    const m = mixUps.get(key) ?? {
      ne: ne.get(log.itemId) ?? "?",
      picked: ne.get(log.chosenItemId) ?? "?",
      count: 0,
      last: log.review,
    };
    m.count++;
    m.last = log.review;
    mixUps.set(key, m);
  }

  const summary = reviewSummary(db, userId, now);
  return {
    lastActive: logs.at(-1)?.review ?? null,
    streak,
    answers: logs.length,
    correct: logs.filter((l) => l.correct).length,
    due: summary.due,
    learned: summary.learned,
    total: summary.total,
    days,
    chapters: chapterProgress(db, userId, now),
    mixUps: [...mixUps.values()]
      .sort((a, b) => b.count - a.count || b.last.getTime() - a.last.getTime())
      .slice(0, MIX_UPS),
  };
}

/** Per script chapter: cards started, settled into review, and due now. */
function chapterProgress(db: Db, userId: number, now: Date) {
  const quizzable = quizzableItems(db);
  const chapterOf = new Map(quizzable.map((i) => [i.id, i.chapterId]));
  const rows = db
    .select({ id: chapters.id, titleJa: chapters.titleJa })
    .from(chapters)
    .where(eq(chapters.track, "script"))
    .orderBy(asc(chapters.position))
    .all()
    .map((c) => ({
      ...c,
      total: quizzable.filter((i) => i.chapterId === c.id).length * CARD_TYPES.length,
      seen: 0,
      settled: 0,
      due: 0,
    }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const card of db.select().from(cards).where(eq(cards.userId, userId)).all()) {
    const row = byId.get(chapterOf.get(card.itemId) ?? "");
    if (!row) continue;
    row.seen++;
    if (card.state === REVIEW_STATE) row.settled++;
    if (card.due <= now) row.due++;
  }
  return rows.filter((r) => r.total > 0);
}

import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";
import { CARD_TYPES, soundKey, type CardType, type ReviewAnswer } from "@nt/shared";
import { NotFoundError } from "./content";
import type { Db } from "./db";
import { cards, chapters, items, reviewLogs, type CardRow } from "./db/schema";

/** New cards the daily review introduces; a chapter quiz may go past this. */
export const NEW_CARDS_PER_DAY = 10;
const NEW_CARDS_PER_SESSION = 10;
const DUE_CARDS_PER_SESSION = 40;
const PRACTICE_CARDS = 10;
const OPTIONS = 4;
// like Anki: a late-night session still counts as "today"
const DAY_STARTS_AT_HOUR = 4;

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

export type QuizItem = { id: string; chapterId: string; ne: string; roman: string; audioUrl: string };

export type SessionCard = {
  itemId: string;
  type: CardType;
  isNew: boolean;
  prompt: QuizItem;
  /** Shuffled, includes the prompt itself. */
  options: QuizItem[];
};

export type Session = {
  /** "practice" = nothing due or new in this chapter, so extra rounds on known cards. */
  mode: "review" | "practice";
  cards: SessionCard[];
};

export function dayStart(now: Date) {
  const d = new Date(now);
  d.setHours(DAY_STARTS_AT_HOUR, 0, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d;
}

/** Script items that can be quizzed: they need audio, and nothing archived. */
function quizzableItems(db: Db): QuizItem[] {
  return db
    .select({ id: items.id, chapterId: items.chapterId, ne: items.ne, roman: items.roman, audioId: items.audioId })
    .from(items)
    .innerJoin(chapters, eq(items.chapterId, chapters.id))
    .where(
      and(
        eq(chapters.track, "script"),
        eq(chapters.archived, false),
        eq(items.archived, false),
        isNotNull(items.audioId),
      ),
    )
    .orderBy(asc(chapters.position), asc(items.position))
    .all()
    .map(({ audioId, ...i }) => ({ ...i, audioUrl: `/api/audio/${audioId}` }));
}

const cardKey = (itemId: string, type: CardType) => `${itemId}:${type}`;

function shuffle<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Wrong answers that don't sound like the answer or each other, same chapter first. */
function pickOptions(answer: QuizItem, all: QuizItem[]) {
  const used = new Set([soundKey(answer.ne)]);
  const picks: QuizItem[] = [];
  const pool = [
    ...shuffle(all.filter((i) => i.chapterId === answer.chapterId)),
    ...shuffle(all.filter((i) => i.chapterId !== answer.chapterId)),
  ];
  for (const item of pool) {
    if (picks.length >= OPTIONS - 1) break;
    const key = soundKey(item.ne);
    if (used.has(key)) continue;
    used.add(key);
    picks.push(item);
  }
  return shuffle([answer, ...picks]);
}

/** Avoids the same letter coming up twice in a row (as its listen and read cards). */
function spreadOut<T extends { itemId: string }>(list: T[]) {
  const out = [...list];
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.itemId !== out[i - 1]!.itemId) continue;
    const j = out.findIndex((c, k) => k > i && c.itemId !== out[i - 1]!.itemId);
    if (j > 0) [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function introducedSince(db: Db, userId: number, since: Date) {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(cards)
      .where(and(eq(cards.userId, userId), gte(cards.createdAt, since)))
      .get()?.n ?? 0
  );
}

/**
 * Builds a quiz: due cards first, then new ones in chapter order. Without a
 * chapter it's the daily review (new cards capped per day); with one it's that
 * chapter's quiz, falling back to practice when there's nothing due or new.
 */
export function buildSession(db: Db, userId: number, opts: { chapterId?: string; now?: Date } = {}): Session {
  const now = opts.now ?? new Date();
  const all = quizzableItems(db);
  const byId = new Map(all.map((i) => [i.id, i]));
  const scope = opts.chapterId ? all.filter((i) => i.chapterId === opts.chapterId) : all;
  const inScope = new Set(scope.map((i) => i.id));

  const userCards = db
    .select()
    .from(cards)
    .where(eq(cards.userId, userId))
    .all()
    .filter((c) => inScope.has(c.itemId));
  const seen = new Set(userCards.map((c) => cardKey(c.itemId, c.type)));

  const due = userCards
    .filter((c) => c.due <= now)
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, DUE_CARDS_PER_SESSION)
    .map((c) => ({ itemId: c.itemId, type: c.type, isNew: false }));

  const newLimit = opts.chapterId
    ? NEW_CARDS_PER_SESSION
    : Math.max(0, NEW_CARDS_PER_DAY - introducedSince(db, userId, dayStart(now)));
  const fresh: { itemId: string; type: CardType; isNew: boolean }[] = [];
  for (const item of scope) {
    for (const type of CARD_TYPES) {
      if (fresh.length < newLimit && !seen.has(cardKey(item.id, type))) {
        fresh.push({ itemId: item.id, type, isNew: true });
      }
    }
  }

  let mode: Session["mode"] = "review";
  let picked = [...due, ...fresh];
  if (picked.length === 0 && opts.chapterId) {
    mode = "practice";
    picked = shuffle(userCards)
      .slice(0, PRACTICE_CARDS)
      .map((c) => ({ itemId: c.itemId, type: c.type, isNew: false }));
  }

  return {
    mode,
    cards: spreadOut(shuffle(picked)).map((c) => {
      const prompt = byId.get(c.itemId)!;
      return { ...c, prompt, options: pickOptions(prompt, all) };
    }),
  };
}

const toFsrs = (row: CardRow): Card => ({
  due: row.due,
  stability: row.stability,
  difficulty: row.difficulty,
  elapsed_days: row.elapsedDays,
  scheduled_days: row.scheduledDays,
  learning_steps: row.learningSteps,
  reps: row.reps,
  lapses: row.lapses,
  state: row.state,
  last_review: row.lastReview ?? undefined,
});

const fromFsrs = (card: Card) => ({
  due: card.due,
  stability: card.stability,
  difficulty: card.difficulty,
  elapsedDays: card.elapsed_days,
  scheduledDays: card.scheduled_days,
  learningSteps: card.learning_steps,
  state: card.state,
  reps: card.reps,
  lapses: card.lapses,
  lastReview: card.last_review ?? null,
});

/**
 * Grades an answer and reschedules the card (creating it on first answer).
 * Picking a letter that sounds the same counts as right.
 */
export function answerCard(db: Db, userId: number, input: ReviewAnswer, now = new Date()) {
  const item = db.select().from(items).where(eq(items.id, input.itemId)).get();
  const chosen = db.select().from(items).where(eq(items.id, input.chosenItemId)).get();
  if (!item || !chosen) throw new NotFoundError("Item not found");
  const correct = chosen.id === item.id || soundKey(chosen.ne) === soundKey(item.ne);
  const grade: Grade = correct ? Rating.Good : Rating.Again;

  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(cards)
      .where(and(eq(cards.userId, userId), eq(cards.itemId, item.id), eq(cards.type, input.type)))
      .get();
    const { card, log } = scheduler.next(row ? toFsrs(row) : createEmptyCard(now), now, grade);

    let cardId: number;
    if (row) {
      tx.update(cards).set(fromFsrs(card)).where(eq(cards.id, row.id)).run();
      cardId = row.id;
    } else {
      cardId = tx
        .insert(cards)
        .values({ userId, itemId: item.id, type: input.type, ...fromFsrs(card), createdAt: now })
        .returning({ id: cards.id })
        .get().id;
    }
    tx.insert(reviewLogs)
      .values({
        cardId,
        rating: log.rating,
        due: log.due,
        stability: log.stability,
        difficulty: log.difficulty,
        elapsedDays: log.elapsed_days,
        lastElapsedDays: log.last_elapsed_days,
        scheduledDays: log.scheduled_days,
        learningSteps: log.learning_steps,
        state: log.state,
        review: log.review,
        chosenItemId: chosen.id,
        correct,
        durationMs: input.durationMs ?? null,
      })
      .run();
    return { correct, due: card.due };
  });
}

/** Counts for the home screen's daily review card. */
export function reviewSummary(db: Db, userId: number, now = new Date()) {
  const all = quizzableItems(db);
  const ids = new Set(all.map((i) => i.id));
  const userCards = db
    .select()
    .from(cards)
    .where(eq(cards.userId, userId))
    .all()
    .filter((c) => ids.has(c.itemId));
  const unseen = all.length * CARD_TYPES.length - userCards.length;
  const newLeft = Math.max(0, NEW_CARDS_PER_DAY - introducedSince(db, userId, dayStart(now)));
  const upcoming = userCards.filter((c) => c.due > now).map((c) => c.due.getTime());
  return {
    due: userCards.filter((c) => c.due <= now).length,
    new: Math.min(newLeft, unseen),
    learned: userCards.length,
    total: all.length * CARD_TYPES.length,
    nextDue: upcoming.length ? new Date(Math.min(...upcoming)) : null,
  };
}

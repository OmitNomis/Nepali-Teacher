import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type {
  ChapterFile,
  ChapterInput,
  ChapterPatch,
  ItemInput,
  ItemPatch,
} from "@nt/shared";
import type { Db } from "./db";
import { chapters, items, type Item } from "./db/schema";
import { newId } from "./ids";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export type ItemView = Omit<Item, "createdAt" | "updatedAt"> & { audioUrl: string | null };

const audioUrl = (audioId: string | null) => (audioId ? `/api/audio/${audioId}` : null);

const toItemView = ({ createdAt: _c, updatedAt: _u, ...item }: Item): ItemView => ({
  ...item,
  audioUrl: audioUrl(item.audioId),
});

export function listChapters(db: Db, opts: { includeArchived: boolean }) {
  return db
    .select({
      id: chapters.id,
      track: chapters.track,
      titleJa: chapters.titleJa,
      titleNe: chapters.titleNe,
      descriptionJa: chapters.descriptionJa,
      position: chapters.position,
      archived: chapters.archived,
      itemCount: sql<number>`count(${items.id})`,
      missingAudio: sql<number>`count(${items.id}) - count(${items.audioId})`,
    })
    .from(chapters)
    .leftJoin(items, and(eq(items.chapterId, chapters.id), eq(items.archived, false)))
    .where(opts.includeArchived ? undefined : eq(chapters.archived, false))
    .groupBy(chapters.id)
    .orderBy(asc(chapters.track), asc(chapters.position))
    .all();
}

export function getChapter(db: Db, id: string, opts: { includeArchived: boolean }) {
  const chapter = db.select().from(chapters).where(eq(chapters.id, id)).get();
  if (!chapter || (chapter.archived && !opts.includeArchived)) {
    throw new NotFoundError("Chapter not found");
  }
  const rows = db
    .select()
    .from(items)
    .where(
      and(
        eq(items.chapterId, id),
        opts.includeArchived ? undefined : eq(items.archived, false),
      ),
    )
    .orderBy(asc(items.position))
    .all();
  return { ...chapter, items: rows.map(toItemView) };
}

const nextPosition = (db: Pick<Db, "select">, table: typeof chapters | typeof items, where?: ReturnType<typeof eq>) =>
  (db
    .select({ max: sql<number | null>`max(${table.position})` })
    .from(table)
    .where(where)
    .get()?.max ?? -1) + 1;

export function createChapter(db: Db, input: ChapterInput, id = newId()) {
  db.insert(chapters)
    .values({ id, ...input, position: nextPosition(db, chapters, eq(chapters.track, input.track)) })
    .run();
  return id;
}

export function updateChapter(db: Db, id: string, patch: ChapterPatch) {
  const res = db.update(chapters).set(patch).where(eq(chapters.id, id)).run();
  if (res.changes === 0) throw new NotFoundError("Chapter not found");
}

export function reorderChapters(db: Db, ids: string[]) {
  db.transaction((tx) => {
    ids.forEach((id, position) => {
      tx.update(chapters).set({ position }).where(eq(chapters.id, id)).run();
    });
  });
}

export function createItem(db: Db, chapterId: string, input: ItemInput, id = newId()) {
  if (!db.select({ id: chapters.id }).from(chapters).where(eq(chapters.id, chapterId)).get()) {
    throw new NotFoundError("Chapter not found");
  }
  db.insert(items)
    .values({ id, chapterId, ...input, position: nextPosition(db, items, eq(items.chapterId, chapterId)) })
    .run();
  return toItemView(db.select().from(items).where(eq(items.id, id)).get()!);
}

export function updateItem(db: Db, id: string, patch: ItemPatch) {
  const res = db.update(items).set(patch).where(eq(items.id, id)).run();
  if (res.changes === 0) throw new NotFoundError("Item not found");
  return toItemView(db.select().from(items).where(eq(items.id, id)).get()!);
}

export function reorderItems(db: Db, chapterId: string, ids: string[]) {
  db.transaction((tx) => {
    ids.forEach((id, position) => {
      tx.update(items)
        .set({ position })
        .where(and(eq(items.id, id), eq(items.chapterId, chapterId)))
        .run();
    });
  });
}

export function listMissingAudio(db: Db) {
  return db
    .select({
      item: items,
      chapterTitle: chapters.titleJa,
    })
    .from(items)
    .innerJoin(chapters, eq(items.chapterId, chapters.id))
    .where(and(isNull(items.audioId), eq(items.archived, false), eq(chapters.archived, false)))
    .orderBy(asc(chapters.track), asc(chapters.position), asc(items.position))
    .all()
    .map((r) => ({ ...toItemView(r.item), chapterTitle: r.chapterTitle }));
}

export function exportChapter(db: Db, id: string): ChapterFile {
  const chapter = getChapter(db, id, { includeArchived: true });
  return {
    version: 1,
    chapter: {
      id: chapter.id,
      track: chapter.track,
      titleJa: chapter.titleJa,
      titleNe: chapter.titleNe,
      descriptionJa: chapter.descriptionJa,
      items: chapter.items
        .filter((i) => !i.archived)
        .map((i) => ({ id: i.id, kind: i.kind, ne: i.ne, ja: i.ja, roman: i.roman, note: i.note })),
    },
  };
}

/**
 * Upserts a chapter and its items. Existing items keep their audio and history;
 * items not in the file are kept and moved after the imported ones.
 */
export function importChapter(db: Db, file: ChapterFile) {
  const { id: requestedId, items: fileItems, ...chapterFields } = file.chapter;

  return db.transaction((tx) => {
    const existing = requestedId
      ? tx.select().from(chapters).where(eq(chapters.id, requestedId)).get()
      : undefined;
    let chapterId: string;
    if (existing) {
      chapterId = existing.id;
      tx.update(chapters).set(chapterFields).where(eq(chapters.id, chapterId)).run();
    } else {
      chapterId = requestedId ?? newId();
      tx.insert(chapters)
        .values({
          id: chapterId,
          ...chapterFields,
          position: nextPosition(tx, chapters, eq(chapters.track, chapterFields.track)),
        })
        .run();
    }

    const seen = new Set<string>();
    let created = 0;
    let updated = 0;
    fileItems.forEach(({ id, ...fields }, position) => {
      if (id && seen.has(id)) throw new ConflictError(`Duplicate item id "${id}" in file`);
      const current = id ? tx.select().from(items).where(eq(items.id, id)).get() : undefined;
      if (current) {
        if (current.chapterId !== chapterId) {
          throw new ConflictError(`Item "${id}" belongs to another chapter`);
        }
        tx.update(items).set({ ...fields, position, archived: false }).where(eq(items.id, current.id)).run();
        seen.add(current.id);
        updated++;
      } else {
        const newItemId = id ?? newId();
        tx.insert(items).values({ id: newItemId, chapterId, ...fields, position }).run();
        seen.add(newItemId);
        created++;
      }
    });

    const leftovers = tx
      .select({ id: items.id })
      .from(items)
      .where(eq(items.chapterId, chapterId))
      .orderBy(asc(items.position))
      .all()
      .filter((r) => !seen.has(r.id));
    leftovers.forEach((r, i) => {
      tx.update(items).set({ position: fileItems.length + i }).where(eq(items.id, r.id)).run();
    });

    return { chapterId, created, updated, untouched: leftovers.length };
  });
}

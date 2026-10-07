import { z } from "zod";

export const TRACKS = ["script", "phrases"] as const;
export type Track = (typeof TRACKS)[number];

export const ITEM_KINDS = ["letter", "word", "phrase"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ROLES = ["admin", "learner"] as const;
export type Role = (typeof ROLES)[number];

const text = z.string().trim();
const optionalText = text.max(2000).default("");

export const chapterInput = z.object({
  titleJa: text.min(1).max(200),
  titleNe: optionalText,
  descriptionJa: optionalText,
  track: z.enum(TRACKS),
});
export type ChapterInput = z.infer<typeof chapterInput>;

export const chapterPatch = chapterInput.partial().extend({
  archived: z.boolean().optional(),
});
export type ChapterPatch = z.infer<typeof chapterPatch>;

export const itemInput = z.object({
  kind: z.enum(ITEM_KINDS),
  ne: text.min(1).max(500),
  ja: optionalText,
  roman: optionalText,
  note: optionalText,
});
export type ItemInput = z.infer<typeof itemInput>;

export const itemPatch = itemInput.partial().extend({
  archived: z.boolean().optional(),
});
export type ItemPatch = z.infer<typeof itemPatch>;

export const reorderInput = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

/**
 * Bulk import/export format. Items with an `id` update the existing item in
 * place (keeping its audio and review history); items without one are created.
 * Items missing from the file are left untouched, never deleted.
 */
export const chapterFile = z.object({
  version: z.literal(1),
  chapter: chapterInput.extend({
    id: z.string().min(1).optional(),
    items: z.array(itemInput.extend({ id: z.string().min(1).optional() })),
  }),
});
export type ChapterFile = z.infer<typeof chapterFile>;

export const loginInput = z.object({
  username: text.min(1).max(100),
  password: z.string().min(1).max(200),
});

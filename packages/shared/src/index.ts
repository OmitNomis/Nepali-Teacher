import { z } from "zod";

export const TRACKS = ["script", "phrases"] as const;
export type Track = (typeof TRACKS)[number];

export const ITEM_KINDS = ["letter", "word", "phrase"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * Politeness tier of a word/phrase, mirroring the pronoun it goes with:
 * polite = तपाईं (丁寧), casual = तिमी (タメ口), intimate = तँ (ぞんざい).
 */
export const REGISTERS = ["polite", "casual", "intimate"] as const;
export type Register = (typeof REGISTERS)[number];

export const ROLES = ["admin", "learner"] as const;
export type Role = (typeof ROLES)[number];

const text = z.string().trim();
const longText = text.max(2000);

// Base shapes carry no defaults: patch schemas are built from these, because a
// .default() survives .partial() in zod 4 and would wipe fields on every PATCH.
const chapterFields = {
  titleJa: text.min(1).max(200),
  titleNe: longText,
  descriptionJa: longText,
  track: z.enum(TRACKS),
};

export const chapterInput = z.object({
  ...chapterFields,
  titleNe: longText.default(""),
  descriptionJa: longText.default(""),
});
export type ChapterInput = z.infer<typeof chapterInput>;

export const chapterPatch = z
  .object(chapterFields)
  .partial()
  .extend({ archived: z.boolean().optional() });
export type ChapterPatch = z.infer<typeof chapterPatch>;

const itemFields = {
  kind: z.enum(ITEM_KINDS),
  ne: text.min(1).max(500),
  ja: longText,
  roman: longText,
  note: longText,
  register: z.enum(REGISTERS).nullable(),
  // items sharing a group are variants of one expression (e.g. the same
  // question at each politeness tier) and are shown together
  group: text.max(100),
};

export const itemInput = z.object({
  ...itemFields,
  ja: longText.default(""),
  roman: longText.default(""),
  note: longText.default(""),
  register: itemFields.register.default(null),
  group: itemFields.group.default(""),
});
export type ItemInput = z.infer<typeof itemInput>;

export const itemPatch = z
  .object(itemFields)
  .partial()
  .extend({ archived: z.boolean().optional() });
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

/**
 * Review card types for script items:
 * listen = hear the sound, pick the letter; read = see the letter, pick the sound.
 */
export const CARD_TYPES = ["listen", "read"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const reviewAnswer = z.object({
  itemId: z.string().min(1),
  type: z.enum(CARD_TYPES),
  chosenItemId: z.string().min(1),
  durationMs: z.number().int().nonnegative().max(3_600_000).optional(),
});
export type ReviewAnswer = z.infer<typeof reviewAnswer>;

// Spoken Nepali doesn't distinguish vowel length or the three sibilants, and
// ण is usually said like न. Letters that only differ in these sound the same,
// so they're never offered as each other's wrong answers, and picking one for
// the other counts as right.
const SAME_SOUND: [RegExp, string][] = [
  [/ई/g, "इ"],
  [/ऊ/g, "उ"],
  [/ी/g, "ि"],
  [/ू/g, "ु"],
  [/[शष]/g, "स"],
  [/ण/g, "न"],
];

/** Key that's equal for letters (or syllables) that sound the same. */
export function soundKey(ne: string) {
  return SAME_SOUND.reduce((s, [re, to]) => s.replace(re, to), ne.trim());
}

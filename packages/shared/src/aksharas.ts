// Splitting Nepali text into aksharas: the units a reader sees as one letter,
// a consonant (or conjunct) with its vowel sign, e.g. धन्यवाद = ध न्य वा द.

const C = "[\\u0915-\\u0939\\u0958-\\u095F\\u0978-\\u097F]"; // consonants
const V = "[\\u0904-\\u0914\\u0960\\u0961\\u0972-\\u0977]"; // vowel letters
const NUKTA = "\\u093C";
const HALANT = "\\u094D";
const JOINER = "[\\u200C\\u200D]?";
// vowel signs, ँ ं ः and the like, which belong to the letter before them
const MARK = "[\\u0900-\\u0903\\u093A\\u093B\\u093E-\\u094C\\u094E\\u094F\\u0951-\\u0957\\u0962\\u0963]";

const AKSHARA = new RegExp(
  `(?:${C}${NUKTA}?${HALANT}${JOINER}(?=${C}))*${C}${NUKTA}?(?:${HALANT}${JOINER})?${MARK}*|${V}${MARK}*`,
  "gu",
);

export type TextPart = { text: string; letter: boolean };

/**
 * Splits text into letters and what's between them (spaces, punctuation).
 * A dead consonant closing a syllable joins the letter before it, as it's
 * said: होस् is one letter, not हो + स्.
 */
export function splitLetters(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(AKSHARA)) {
    const prev = parts.at(-1);
    if (m.index > at) parts.push({ text: text.slice(at, m.index), letter: false });
    else if (prev?.letter && m[0].endsWith("्")) {
      prev.text += m[0];
      at = m.index + m[0].length;
      continue;
    }
    parts.push({ text: m[0], letter: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), letter: false });
  return parts;
}

/**
 * Key that's equal only for the same letter, spelled the same: ण and न, श and
 * स, इ and ई are all different letters with different recordings.
 */
export const letterKey = (letter: string) => letter.trim().normalize("NFC");

/** Just the letters, e.g. for working out which ones need a sound. */
export const letters = (text: string) => splitLetters(text).flatMap((p) => (p.letter ? [p.text] : []));

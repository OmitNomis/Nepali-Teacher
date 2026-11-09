/**
 * How each Devanagari letter is pronounced, for the mouth diagrams and the
 * Japanese tips. Written for a Japanese speaker: Japanese has no aspiration
 * contrast (क/ख), no breathy voice (घ), and no retroflex row (ट), so those
 * get the most explanation. Values follow Nepali, not Hindi: अ is a back
 * [ʌ], च is [ts], retroflexes are only lightly curled (tip just behind the
 * ridge), and conjuncts are drawn the way they're said (क्ष = क्छ, ज्ञ = ग्य).
 */

/** Where the tongue or lips make (or come closest to) contact. */
export type Place = "lips" | "teeth" | "ridge" | "retroflex" | "palate" | "velum" | "glottis";
export type Manner = "stop" | "nasal" | "affricate" | "fricative" | "tap" | "lateral" | "approximant";

export type VowelShape = {
  /** mid = close-mid (ए, ओ); open-mid is lower, for अ [ʌ] */
  height: "high" | "mid" | "open-mid" | "low";
  back: "front" | "central" | "back";
  round: boolean;
};

export type ConsonantSound = {
  kind: "consonant";
  place: Place;
  manner: Manner;
  voiced: boolean;
  /** extra puff of breath: ख, घ (with voice: breathy) */
  aspirated: boolean;
  tip: string;
};

export type VowelSound = {
  kind: "vowel";
  shape: VowelShape;
  /** diphthongs glide to a second shape */
  to?: VowelShape;
  nasal?: boolean;
  breath?: boolean;
  tip: string;
};

export type Sound = ConsonantSound | VowelSound;

const c = (
  place: Place,
  manner: Manner,
  voiced: boolean,
  aspirated: boolean,
  tip: string,
): ConsonantSound => ({ kind: "consonant", place, manner, voiced, aspirated, tip });

// Nepali अ is [ʌ]: open-mid, back and unrounded, between Japanese ア and オ
const A: VowelShape = { height: "open-mid", back: "back", round: false };
const AA: VowelShape = { height: "low", back: "central", round: false };
const I: VowelShape = { height: "high", back: "front", round: false };
const U: VowelShape = { height: "high", back: "back", round: true };
const E: VowelShape = { height: "mid", back: "front", round: false };
const O: VowelShape = { height: "mid", back: "back", round: true };

export const VOWELS: Record<string, VowelSound> = {
  अ: { kind: "vowel", shape: A, tip: "日本語の「ア」と「オ」の中間の短い音。口はあまり開けず、唇は丸めない。" },
  आ: { kind: "vowel", shape: AA, tip: "口を大きく開けた、はっきりした「アー」。" },
  इ: { kind: "vowel", shape: I, tip: "日本語の「イ」と同じ。" },
  ई: { kind: "vowel", shape: I, tip: "「イ」。ネパール語の会話では इ と同じ音。" },
  उ: { kind: "vowel", shape: U, tip: "唇を丸く突き出した「ウ」。日本語の「ウ」より唇を前に。" },
  ऊ: { kind: "vowel", shape: U, tip: "唇を丸めた「ウ」。会話では उ と同じ音。" },
  ऋ: { kind: "vowel", shape: I, tip: "「リ」と読む。舌先で歯ぐきを軽くはじいてから「イ」。" },
  ए: { kind: "vowel", shape: E, tip: "日本語の「エ」と同じ。" },
  ऐ: { kind: "vowel", shape: A, to: I, tip: "अ から「イ」へ、なめらかに一つの音で。「アイ」と「オイ」の中間。" },
  ओ: { kind: "vowel", shape: O, tip: "唇を丸めた「オ」。" },
  औ: { kind: "vowel", shape: A, to: U, tip: "अ から「ウ」へ、なめらかに一つの音で。「アウ」と「オウ」の中間。" },
  अं: { kind: "vowel", shape: A, nasal: true, tip: "अ のあとに鼻に響く「ン」。" },
  अः: { kind: "vowel", shape: A, breath: true, tip: "अ のあとに軽く「ハッ」と息を吐く。" },
};

export const CONSONANTS: Record<string, ConsonantSound> = {
  क: c("velum", "stop", false, false, "「ハッカ」の「ッカ」のように、息を出さずに「カ」。"),
  ख: c("velum", "stop", false, true, "「カ」を強い息と一緒に。口の前のティッシュが揺れるくらい。"),
  ग: c("velum", "stop", true, false, "日本語の「ガ」と同じ。"),
  घ: c("velum", "stop", true, true, "「ガ」を言いながら息をもらす。ため息まじりの「ガハ」。"),
  ङ: c("velum", "nasal", true, false, "「リンゴ」の「ン」。舌の奥を上げて、鼻から声を出す。"),

  च: c("ridge", "affricate", false, false, "「ツァ」と「チャ」の間の音。息は出さない。"),
  छ: c("ridge", "affricate", false, true, "च を強い息と一緒に。「ツァ」＋息。"),
  ज: c("ridge", "affricate", true, false, "「ザ」に近い。言い始めに舌先を歯ぐきにつける。"),
  झ: c("ridge", "affricate", true, true, "ज を言いながら息をもらす。"),
  ञ: c("palate", "nasal", true, false, "「ニャ」の「ニ」のように、舌の真ん中を上あごにつけて鼻から。"),

  ट: c("retroflex", "stop", false, false, "舌先を少し反らせ、歯ぐきのすぐ後ろに当てて「タ」。日本語の「タ」より奥。息は出さない。"),
  ठ: c("retroflex", "stop", false, true, "ट を強い息と一緒に。"),
  ड: c("retroflex", "stop", true, false, "舌先を少し反らせて「ダ」。日本語の「ダ」より奥。"),
  ढ: c("retroflex", "stop", true, true, "舌先を反らせた ड を、息をもらしながら。"),
  ण: c("retroflex", "nasal", true, false, "本来は舌先を反らせた「ナ」。会話では न と同じ「ナ」でよい。"),

  त: c("teeth", "stop", false, false, "舌先を上の前歯の裏にしっかりつけて「タ」。日本語の「タ」より前。息は出さない。"),
  थ: c("teeth", "stop", false, true, "त を強い息と一緒に。"),
  द: c("teeth", "stop", true, false, "舌先を上の前歯の裏につけて「ダ」。日本語の「ダ」より前。"),
  ध: c("teeth", "stop", true, true, "前歯の裏の द を、息をもらしながら。"),
  न: c("teeth", "nasal", true, false, "日本語の「ナ」と同じ。"),

  प: c("lips", "stop", false, false, "「カッパ」の「ッパ」のように、息を出さずに「パ」。"),
  फ: c("lips", "stop", false, true, "「パ」を強い息と一緒に。「ファ」に近く聞こえることも。"),
  ब: c("lips", "stop", true, false, "日本語の「バ」と同じ。"),
  भ: c("lips", "stop", true, true, "「バ」を言いながら息をもらす。ため息まじりの「バハ」。"),
  म: c("lips", "nasal", true, false, "日本語の「マ」と同じ。"),

  य: c("palate", "approximant", true, false, "日本語の「ヤ」と同じ。"),
  र: c("ridge", "tap", true, false, "日本語の「ラ」に近い。舌先で歯ぐきを一回はじく。"),
  ल: c("ridge", "lateral", true, false, "舌先を歯ぐきにつけたまま、舌の横から声を出す。はじかない「ラ」。"),
  व: c("lips", "approximant", true, false, "「ワ」に近い。言葉によっては「バ」のようにも。"),

  श: c("ridge", "fricative", false, false, "「サ」。ネパール語では स と同じ音。"),
  ष: c("ridge", "fricative", false, false, "「サ」。ネパール語では स と同じ音。"),
  स: c("ridge", "fricative", false, false, "日本語の「サ」と同じ。"),
  ह: c("glottis", "fricative", true, false, "「ハ」に声をまぜて、のどの奥から。"),
};

/**
 * Conjuncts, as the two consonants actually said (not always the ones
 * written: क्ष is written क+ष but said क्छ, ज्ञ is written ज+ञ but said ग्य).
 */
export const CONJUNCTS: Record<string, { parts: [string, string]; tip: string }> = {
  "क्ष": { parts: ["क", "छ"], tip: "書くと क＋ष だけど、読みは क と छ を一気に「クチャ」。言葉の最初では「チャ」だけになることも（क्षेत्री は「チェトリ」）。" },
  "त्र": { parts: ["त", "र"], tip: "त と र を一気に。「トラ」を母音なしで。" },
  "ज्ञ": { parts: ["ग", "य"], tip: "書くと ज＋ञ だけど、読みは ग と य を一気に「ギャ」。" },
};

/** Vowels said as a consonant plus a vowel: ऋ is "ri". */
const SAID_AS: Record<string, [string, string]> = { ऋ: ["र", "इ"] };

/** The mouth shapes for a vowel letter, in order (ऋ is two: र then इ). */
function vowelSteps(letter: string): Pronunciation["steps"] | null {
  const said = SAID_AS[letter];
  if (said) {
    return [
      { letter: said[0], sound: CONSONANTS[said[0]]! },
      { letter: said[1], sound: VOWELS[said[1]]! },
    ];
  }
  const vowel = VOWELS[letter];
  return vowel ? [{ letter, sound: vowel }] : null;
}

/** Vowel signs (matras) and the vowel each stands for. */
export const MATRAS: Record<string, string> = {
  "ा": "आ",
  "ि": "इ",
  "ी": "ई",
  "ु": "उ",
  "ू": "ऊ",
  "ृ": "ऋ",
  "े": "ए",
  "ै": "ऐ",
  "ो": "ओ",
  "ौ": "औ",
  "ं": "अं",
  "ः": "अः",
};

export type Pronunciation = {
  /** in speaking order: e.g. का = [क, आ], क्ष = [क, ष] */
  steps: { letter: string; sound: Sound }[];
  tip: string;
};

/**
 * Pronunciation of a letter, conjunct or consonant+vowel-sign syllable.
 * A bare consonant carries the inherent "a" (अ), so क = [क, अ].
 */
export function pronunciation(text: string): Pronunciation | null {
  const ne = text.trim();
  const vowel = VOWELS[ne];
  if (vowel) return { steps: vowelSteps(ne)!, tip: vowel.tip };

  for (const [cluster, { parts, tip }] of Object.entries(CONJUNCTS)) {
    if (ne.startsWith(cluster)) {
      const following = vowelAfter([...ne.slice(cluster.length)]);
      if (!following) return null;
      return { steps: [...parts.map((p) => ({ letter: p, sound: CONSONANTS[p]! })), ...following], tip };
    }
  }

  const [first, ...rest] = [...ne];
  const consonant = first && CONSONANTS[first];
  if (!consonant) return null;
  const following = vowelAfter(rest);
  if (!following) return null;
  return { steps: [{ letter: first, sound: consonant }, ...following], tip: consonant.tip };
}

/** The vowel after a consonant: its sign, or the inherent अ when there's none. */
function vowelAfter(signs: string[]) {
  const vowelLetter = signs.length === 0 ? "अ" : signs.length === 1 ? MATRAS[signs[0]!] : undefined;
  return vowelLetter ? vowelSteps(vowelLetter) : null;
}

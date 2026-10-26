/**
 * How each Devanagari letter is pronounced, for the mouth diagrams and the
 * Japanese tips. Written for a Japanese speaker: Japanese has no aspiration
 * contrast (क/ख), no breathy voice (घ), and no retroflex row (ट), so those
 * get the most explanation.
 */

/** Where the tongue or lips make (or come closest to) contact. */
export type Place = "lips" | "teeth" | "ridge" | "retroflex" | "palate" | "velum" | "glottis";
export type Manner = "stop" | "nasal" | "affricate" | "fricative" | "tap" | "lateral" | "approximant";

export type VowelShape = {
  height: "high" | "mid" | "low";
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

const A: VowelShape = { height: "mid", back: "central", round: false };
const AA: VowelShape = { height: "low", back: "central", round: false };
const I: VowelShape = { height: "high", back: "front", round: false };
const U: VowelShape = { height: "high", back: "back", round: true };
const E: VowelShape = { height: "mid", back: "front", round: false };
const O: VowelShape = { height: "mid", back: "back", round: true };

export const VOWELS: Record<string, VowelSound> = {
  अ: { kind: "vowel", shape: A, tip: "力を抜いて、口を軽く開けた短い「ア」。日本語の「ア」より少し口を閉じる。" },
  आ: { kind: "vowel", shape: AA, tip: "口を大きく開けた、はっきりした「アー」。" },
  इ: { kind: "vowel", shape: I, tip: "日本語の「イ」と同じ。" },
  ई: { kind: "vowel", shape: I, tip: "「イ」。ネパール語の会話では इ と同じ音。" },
  उ: { kind: "vowel", shape: U, tip: "唇を丸く突き出した「ウ」。日本語の「ウ」より唇を前に。" },
  ऊ: { kind: "vowel", shape: U, tip: "唇を丸めた「ウ」。会話では उ と同じ音。" },
  ऋ: { kind: "vowel", shape: I, tip: "「リ」と読む。舌先で歯ぐきを軽くはじいてから「イ」。" },
  ए: { kind: "vowel", shape: E, tip: "日本語の「エ」と同じ。" },
  ऐ: { kind: "vowel", shape: A, to: I, tip: "「アイ」を一つの音のように、なめらかに。" },
  ओ: { kind: "vowel", shape: O, tip: "唇を丸めた「オ」。" },
  औ: { kind: "vowel", shape: A, to: U, tip: "「アウ」を一つの音のように、なめらかに。" },
  अं: { kind: "vowel", shape: A, nasal: true, tip: "「アン」。最後の「ン」を鼻に響かせる。" },
  अः: { kind: "vowel", shape: A, breath: true, tip: "「ア」のあとに軽く「ハッ」と息を吐く。" },
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

  ट: c("retroflex", "stop", false, false, "舌先を後ろに巻き、上あごの固いところに当てて「タ」。日本語にない音。"),
  ठ: c("retroflex", "stop", false, true, "ट を強い息と一緒に。"),
  ड: c("retroflex", "stop", true, false, "舌先を後ろに巻いて「ダ」。"),
  ढ: c("retroflex", "stop", true, true, "舌を巻いた「ダ」を、息をもらしながら。"),
  ण: c("retroflex", "nasal", true, false, "舌を巻いた「ナ」。会話では न とほぼ同じに聞こえる。"),

  त: c("teeth", "stop", false, false, "舌先を上の前歯の裏にしっかりつけて「タ」。息は出さない。"),
  थ: c("teeth", "stop", false, true, "त を強い息と一緒に。"),
  द: c("teeth", "stop", true, false, "前歯の裏で「ダ」。"),
  ध: c("teeth", "stop", true, true, "「ダ」を言いながら息をもらす。"),
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

/** Conjuncts read as two consonants in a row. */
export const CONJUNCTS: Record<string, { parts: [string, string]; tip: string }> = {
  "क्ष": { parts: ["क", "ष"], tip: "क と ष を一気に。「クシャ」に近く、「チェ」のように聞こえることも。" },
  "त्र": { parts: ["त", "र"], tip: "त と र を一気に。「トラ」を母音なしで。" },
  "ज्ञ": { parts: ["ज", "ञ"], tip: "ネパール語では「ギャ」に近い音。" },
};

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
  if (vowel) return { steps: [{ letter: ne, sound: vowel }], tip: vowel.tip };

  for (const [cluster, { parts, tip }] of Object.entries(CONJUNCTS)) {
    if (ne === cluster) {
      return {
        steps: [...parts.map((p) => ({ letter: p, sound: CONSONANTS[p]! })), { letter: "अ", sound: VOWELS["अ"]! }],
        tip,
      };
    }
  }

  const [first, ...rest] = [...ne];
  const consonant = first && CONSONANTS[first];
  if (!consonant) return null;
  const vowelLetter = rest.length === 0 ? "अ" : rest.length === 1 ? MATRAS[rest[0]!] : undefined;
  const following = vowelLetter && VOWELS[vowelLetter];
  if (!following) return null;
  return {
    steps: [
      { letter: first, sound: consonant },
      { letter: vowelLetter, sound: following },
    ],
    tip: consonant.tip,
  };
}

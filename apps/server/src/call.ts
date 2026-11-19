import { and, asc, eq } from "drizzle-orm";
import type { Config } from "./config";
import type { Db } from "./db";
import { chapters, items } from "./db/schema";

/**
 * Live tutor calls: the phone talks to Gemini's Live API directly (audio in,
 * audio out). The server only mints a one-use ephemeral token with the whole
 * session setup locked in, so the API key and the tutor's instructions never
 * reach the browser.
 */
export const CALL_MODEL = "gemini-3.1-flash-live-preview";
const VOICE = "Zephyr";
// The phrase list is context, not a curriculum dump: keep the prompt small.
const MAX_PHRASES = 150;

/** What the tutor sends when it puts a word on the learner's screen. */
const showCard = {
  name: "show_card",
  description:
    "Show the learner a card on her screen with a Nepali word or phrase. Call it whenever she asks what something means, how to say something, or to show/write it, and whenever you teach a new word or phrase.",
  parameters: {
    type: "OBJECT",
    properties: {
      devanagari: { type: "STRING", description: "The Nepali, in Devanagari script" },
      romaji: { type: "STRING", description: "Romanized pronunciation, e.g. dhanyabād" },
      japanese: { type: "STRING", description: "The meaning in natural Japanese" },
      note: {
        type: "STRING",
        description: "Optional one-line usage note in Japanese (politeness, when to use it)",
      },
    },
    required: ["devanagari", "romaji", "japanese"],
  },
};

/** The phrases the owner has taught so far, for the tutor to lean on. */
function lessonPhrases(db: Db) {
  return db
    .select({ ne: items.ne, ja: items.ja })
    .from(items)
    .innerJoin(chapters, eq(chapters.id, items.chapterId))
    .where(and(eq(chapters.track, "phrases"), eq(chapters.archived, false), eq(items.archived, false)))
    .orderBy(asc(chapters.position), asc(items.position))
    .limit(MAX_PHRASES)
    .all();
}

export function tutorPrompt(name: string, phrases: { ne: string; ja: string }[]) {
  const list = phrases.map((p) => `- ${p.ne}${p.ja ? ` = ${p.ja}` : ""}`).join("\n");
  return `You are a warm, patient Nepali teacher on a phone call with ${name}, a Japanese beginner learning Nepali by ear.

How to talk:
- Speak mostly simple, natural Japanese. Say the Nepali you teach slowly and clearly, with native Kathmandu pronunciation.
- Keep each turn short (one to three sentences), then let her talk. Invite her to repeat new phrases and give gentle, specific feedback on her pronunciation.
- Use polite तपाईं forms unless she asks for casual speech.
- Never read romanization or katakana aloud; just say the Nepali.

The screen:
- Whenever she asks what something means, how to say something, or asks you to show or write it, and whenever you teach a new word or phrase, call show_card with the Devanagari, the romanization and the Japanese meaning. Then say the Nepali exactly as written on the card.
- Never invent a katakana spelling; the card has no katakana.

Her lessons (prefer these words and phrases; she has studied them):
${list || "(none yet)"}

Start the call by saying नमस्ते, greeting her by name in Japanese, and asking what she wants to practice today.`;
}

/** A one-use token for a single call, valid to start within a minute and good for 30. */
export async function createCallToken(db: Db, config: Config, displayName: string) {
  const key = config.gemini.apiKey;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const now = Date.now();
  const res = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      bidiGenerateContentSetup: {
        model: `models/${CALL_MODEL}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
        systemInstruction: { parts: [{ text: tutorPrompt(displayName, lessonPhrases(db)) }] },
        tools: [{ functionDeclarations: [showCard] }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // audio fills the context fast; slide it instead of ending the call
        contextWindowCompression: { slidingWindow: {} },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini token request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { name?: string };
  if (!body.name) throw new Error("Gemini returned no token");
  return { token: body.name, model: CALL_MODEL };
}

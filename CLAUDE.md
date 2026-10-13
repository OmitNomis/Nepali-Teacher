# NepaliTeacher — notes for Claude

Phone-first PWA teaching Nepali to native **Japanese** speakers who read neither
Nepali nor English. Learn by ear, not word-by-word translation: audio first,
real conversational Nepali. Learner UI is Japanese; admin UI is English. The
owner is a native Nepali speaker fluent in Japanese and writes and records the
content. See README.md for setup, deploy, and the chapter JSON format.

## Working agreements
- **Commit small and often**. Each
  coherent step gets its own commit.
- Commit as `OmitNomis <simon98190@gmail.com>`. On a fresh clone, set that with
  repo-local `git config user.name/user.email` before the first commit.
- **No `Co-Authored-By` or any Claude attribution** in commits or PRs.
- Work on `master`. Ask before pushing, unless asked to push.
- Tech choices are delegated: pick decisively and explain briefly.
- UI should be pretty and easy to use on an iPhone.

## Decisions so far
- Stack: pnpm workspace; Hono + SQLite/Drizzle server with an in-process job
  runner; Vite/React/Tailwind PWA; shared zod schemas. Server is bundled by tsup
  into `dist/` (only `better-sqlite3` stays external).
- Hosting: a small VPS (RackNerd) with Docker + Caddy. Data lives in `./data`
  (bind mount). Off-server backups are still TODO and matter before real use.
- Item IDs must never change: review history hangs off them. Archive, don't delete.
- Politeness tiers (तपाईं / तिमी / तँ) are separate items with `register` plus a
  shared `group`, shown to the learner as one card with 丁寧 / タメ口 / ぞんざい chips.
- Patch schemas are built from default-free base fields: in zod 4, `.default()`
  survives `.partial()` and would wipe fields on PATCH (bug fixed, test covers it).
- Audio: human recordings always win. TTS only fills gaps as placeholders,
  `audio.source = "tts"`.

## TTS status (as of 2026-10-13)
- `google` (keyless default): works, but sentences sound unnatural.
- `edge`: Microsoft's endpoint returns 403 for every edge-tts version since
  2026-10-10 (rany2/edge-tts#490). May work again later or from US servers.
- `azure` (F0 free tier, hard-capped): same voices as Edge, needs a key.
- Next to try: **Piper** offline Nepali voices (`ne_NP` "chitwan" / "google"
  on huggingface rhasspy/piper-voices). Untested.

## Roadmap
1. Base app ✅
2. Better TTS (Piper or Azure)
3. **Devanagari script SRS**: FSRS via `ts-fsrs`, review log table. Card types:
   letter→sound and sound→letter. Script order: vowels, consonants, then vowel
   marks (barakhari) early so real words are readable; conjuncts later.
4. Phrase chapters (greetings, food, family…), likely LLM-drafted in the import
   JSON and checked by the owner. Listening cards: audio → meaning.
5. Off-server backups (e.g. Litestream / rclone to R2 or B2).
6. Later: Nepali video subtitle pipeline (yt-dlp → Whisper → Japanese) as a
   separate worker.

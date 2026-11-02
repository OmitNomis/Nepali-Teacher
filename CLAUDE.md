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
- Hosting: a small home server (Intel Atom N280, **32-bit** Debian 12,
  1 GB RAM, shared with other services). systemd `nepali-teacher`
  on 127.0.0.1:8797, public over HTTPS behind a reverse proxy.
  Public on purpose: the learner
  shouldn't need a VPN app; the app's own login is the gate, so keep the
  login throttle and auth on every route. HTTPS is required for mic
  recording and PWA install. 32-bit rules out
  Docker and caps Node at 20 (unofficial x86 build in `/opt/node20`), so the
  server is built with `tsup --target node20` and `better-sqlite3@12` is
  compiled on the box. Ship only `dist/`, `drizzle/`, `web/`; keep its
  `node_modules`. Accounts: `nepali-user <name> <admin|learner> [display]`;
  content: `nepali-import <file.json>...`; redo off-voice TTS:
  `nepali-tts-regenerate [--dry-run]`. Before a deploy with migrations, snapshot
  the db into `/var/lib/nepali-teacher/backups/`.
  Data in `/var/lib/nepali-teacher`. The Docker + Caddy VPS setup in the
  README still works as an alternative. Off-server backups are still TODO.
- Item IDs must never change: review history hangs off them. Archive, don't delete.
- Politeness tiers (तपाईं / तिमी / तँ) are separate items with `register` plus a
  shared `group`, shown to the learner as one card with 丁寧 / タメ口 / ぞんざい chips.
- Patch schemas are built from default-free base fields: in zod 4, `.default()`
  survives `.partial()` and would wipe fields on PATCH (bug fixed, test covers it).
- Audio: human recordings always win. TTS only fills gaps as placeholders,
  `audio.source = "tts"`, with `audio.voice` = the voice that actually spoke it.
- Pronunciation: `packages/shared/src/articulation.ts` holds place/manner/
  voicing/aspiration and a Japanese tip per letter; `MouthDiagram` draws a
  cutaway from that data (no image assets). Tips compare to Japanese sounds
  and should be checked by the owner (e.g. च as ts, क्ष, ज्ञ).
  Until they are, the learner doesn't see them: `PRONUNCIATION_FOR_LEARNERS`
  in `apps/web/src/lib/features.ts` (admins still do, to review).
- Design: ink on mist, tokens in `apps/web/src/styles.css`. No Nepal flag /
  Himalaya decoration (owner's call). The raspberry accent only means sound
  (what plays or is playing, and the tongue in diagrams); gold is breath,
  violet is voice; primary buttons are ink. Nepali is set in Tiro Devanagari
  Hindi (romanization in its italic, `roman` utility), Japanese in the system
  Hiragino. Signature: the karaoke wipe (`Karaoke` in `components/audio.tsx`)
  fills Nepali text as its clip plays. The learner has no nav bar (avatar on
  home opens the account); admins get a tab bar, or a sidebar on wide screens.
  The app icon is generated from Tiro's अ outline, not drawn by hand.
- SRS: cards are created on first answer (no card = new) and keyed by
  (user, item, type). `soundKey` in shared defines which letters count as the
  same sound; the owner (native speaker) may want to adjust it.

## TTS status (as of 2026-10-22)
- `edge` (keyless default): works again since msedge-tts 2.1.0 (the 403s from
  2026-10-10, rany2/edge-tts#490, were fixed 2026-10-13). Natural neural voices.
  Failures fall back to `google` automatically.
- `google`: works, but sentences sound unnatural.
- `azure` (F0 free tier, hard-capped): same voices as Edge, needs a key.
- Piper offline Nepali voices remain an untested backup option.

## Roadmap
1. Base app ✅
2. Better TTS ✅ (Edge neural voices; Piper still an option)
3. Devanagari script SRS ✅ (FSRS cards + review logs, listen/read quiz,
   vowels / consonants / क barakhari in `content/script`). Next for script:
   more barakhari series, conjuncts later.
4. Phrase chapters (greetings, food, family…), likely LLM-drafted in the import
   JSON and checked by the owner. Listening cards: audio → meaning.
5. Off-server backups (e.g. Litestream / rclone to R2 or B2).
6. Later: Nepali video subtitle pipeline (yt-dlp → Whisper → Japanese) as a
   separate worker.

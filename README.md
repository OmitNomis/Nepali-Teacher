# ナマステ — Nepali Teacher

A phone-first PWA for learning Nepali by ear, with a Japanese learner UI and an
English admin side for writing lessons and recording audio.

- **Learner** (`/`): chapters by track (文字 script / 会話 phrases), tap-to-hear
  letter tiles, phrase cards with politeness-tier variants, "全部聞く" play-all.
- **Admin** (`/admin`): create and reorder chapters and items, record audio on
  each row, a one-at-a-time recording queue (`/admin/record`), and JSON
  import/export.
- **Audio**: recordings are trimmed and loudness-normalized by ffmpeg in the
  background. Items without a recording get a TTS placeholder that the
  recording queue nudges you to replace.

## Stack

pnpm workspace, all TypeScript:

| Path | What |
|---|---|
| `apps/web` | Vite + React + Tailwind PWA |
| `apps/server` | Hono on Node 22, SQLite via Drizzle, in-process job runner |
| `packages/shared` | zod schemas shared by both |

## Local development

```sh
pnpm install
pnpm user:create simon admin "Simon"     # prompts for a password
pnpm user:create yuki learner "ゆき"
pnpm dev                                  # web on :5173, API on :8787
```

Data lives in `apps/server/data/` (SQLite + audio files). To try the app on your
phone, open `http://<your-PC-ip>:5173`. Microphone recording needs HTTPS on
phones, so test recording on the deployed site or on desktop at `localhost`.

```sh
pnpm test        # server tests
pnpm typecheck
```

After changing `apps/server/src/db/schema.ts`, run `pnpm db:generate` and commit
the new file in `apps/server/drizzle/`. Migrations apply on server start.

## Deploying (RackNerd or any VPS)

1. Point a domain's A record at the VPS.
2. Install Docker, then clone the repo and set up `.env`:
   ```sh
   cp .env.example .env    # set DOMAIN, pick a TTS provider
   docker compose up -d --build
   docker compose exec app node dist/cli/create-user.js simon admin "Simon"
   docker compose exec app node dist/cli/create-user.js yuki learner "ゆき"
   ```
3. Caddy fetches HTTPS certificates automatically. On the iPhone, open the site
   in Safari → Share → **Add to Home Screen**.

Everything persistent is in `./data` on the VPS. Back it up by copying that
folder, for example from a nightly cron:
`sqlite3 data/app.db ".backup data/backup.db"` plus `data/audio/`.

Running `create-user` again with an existing username resets that user's password
and signs them out on every device.

## TTS placeholder audio

Set `TTS_PROVIDER` in `.env`:

- `azure`: the official Microsoft Speech API. Reliable, and the free tier
  (500k characters/month) is far more than this app needs. Create a Speech
  resource in the Azure portal and set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.
- `edge`: Microsoft Edge's read-aloud endpoint. Same natural voices as Azure,
  no key. Default when no Azure key is set. It's unofficial and has broken
  before (403s Oct 10–13, 2026, fixed in msedge-tts 2.1.0), so failed requests
  fall back to Google automatically.
- `google`: Google Translate's read-aloud voice. No key, unofficial, and sounds
  noticeably more robotic.
- `none`: turned off.

Voices (`TTS_VOICE`): `ne-NP-HemkalaNeural` (female, default) or
`ne-NP-SagarNeural` (male) for azure/edge; a language code (`ne`) for google.

New and imported items are queued for TTS automatically. Editing the Nepali text
of an item that only has TTS regenerates it. A human recording always replaces
TTS and is never overwritten by it.

Edge requests are spaced out and rate-limited ones (429) are retried before
falling back to Google. Each clip records the voice that actually spoke it, so
`pnpm --filter @nt/server exec tsx src/cli/regenerate-tts.ts [--dry-run]`
(`nepali-tts-regenerate` on the server) redoes placeholders that aren't in the
configured voice, e.g. after a fallback or a voice change.

## Chapter JSON (for bulk edits or LLM-written chapters)

```json
{
  "version": 1,
  "chapter": {
    "id": "food-basics",
    "track": "phrases",
    "titleJa": "ごはん",
    "titleNe": "खाना",
    "descriptionJa": "",
    "items": [
      {
        "id": "ate-food-polite",
        "kind": "phrase",
        "ne": "खाना खानुभयो?",
        "ja": "ご飯食べましたか？",
        "roman": "khānā khānubhayo?",
        "note": "ネパールでは挨拶のように使う。",
        "register": "polite",
        "group": "ate-food"
      },
      { "id": "ate-food-casual", "kind": "phrase", "ne": "खाना खायौ?", "ja": "ご飯食べた？",
        "roman": "khānā khāyau?", "register": "casual", "group": "ate-food" }
    ]
  }
}
```

| Field | Notes |
|---|---|
| `track` | `script` (letter tiles) or `phrases` (cards) |
| `kind` | `letter`, `word` or `phrase` |
| `register` | `polite` (तपाईं) · `casual` (तिमी) · `intimate` (तँ), or omit |
| `group` | Same key on each politeness tier of one expression. They're shown as one card with 丁寧 / タメ口 / ぞんざい chips. |
| `id` | Optional. Items with an existing id are updated in place, keeping their audio and history. Never change an id once a learner is studying the item. |

Importing never deletes anything. Items missing from the file are kept.

Import from the admin UI (Content → import icon), or from the command line:
`pnpm chapter:import content/script/*.json` (`nepali-import` on the server).
The script chapters (vowels, consonants, ka barakhari) live in `content/`.

## Review (SRS)

Every script letter with audio becomes two cards per learner: **listen** (hear
it, pick the letter) and **read** (see it, pick the sound). Scheduling is FSRS
(`ts-fsrs`); a right answer rates Good, a wrong one Again, and every answer is
logged with what was picked. The daily review on home introduces up to 10 new
cards a day in chapter order; a chapter's クイズ button can go past that.
Letters that sound the same in Nepali (इ/ई, उ/ऊ, श/ष/स, ण/न and their
matras) are never offered as each other's wrong answers and count as right.

### Prompt template for an LLM

> Write a Nepali lesson chapter for a native Japanese speaker learning
> conversational Nepali by ear. Use the JSON format below exactly. Use natural,
> everyday spoken Nepali as families in Kathmandu actually speak it, including
> common English loanwords. For questions and requests a learner would use with
> different people, give the तपाईं / तिमी / तँ forms as separate items sharing a
> `group`, with `register` set. Japanese translations should match the tone
> (丁寧語 for polite, タメ口 for casual). Add a short Japanese `note` only when
> there's a cultural or usage point worth knowing. Give every item a short
> kebab-case `id`. Topic: …
>
> *(paste the JSON example above)*

Have a native speaker check the output before importing.

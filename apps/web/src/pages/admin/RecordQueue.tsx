import clsx from "clsx";
import { PartyPopper, SkipForward } from "lucide-react";
import { useState } from "react";
import { letterKey, splitLetters } from "@nt/shared";
import { PlayButton, StudioRecorder } from "../../components/audio";
import { EmptyState, HeaderButton, LinkButton, PageLoader, Segmented } from "../../components/ui";
import { targetKey, type AudioTarget, type MissingItem, type SyllableToRecord } from "../../lib/api";
import { useMissingAudio, useSyllablesToRecord } from "../../lib/queries";

/** One thing to record: an item, or a letter that only phrases have. */
type Take = {
  key: string;
  target: AudioTarget;
  label: string;
  ne: string;
  big: boolean;
  roman?: string;
  ja?: string;
  /** the word a phrase-only letter comes from */
  word?: string;
  ttsUrl: string | null;
};

const fromItem = (i: MissingItem): Take => ({
  key: targetKey({ itemId: i.id }),
  target: { itemId: i.id },
  label: i.chapterTitle,
  ne: i.ne,
  big: i.kind === "letter",
  roman: i.roman,
  ja: i.ja,
  ttsUrl: i.audioSource === "tts" ? i.audioUrl : null,
});

const fromSyllable = (s: SyllableToRecord): Take => ({
  key: targetKey({ syllable: s.ne }),
  target: { syllable: s.ne },
  label: "Letter in phrases",
  ne: s.ne,
  big: true,
  word: s.word,
  ttsUrl: s.ttsUrl,
});

/** The word with the letter being recorded in ink and the rest faded. */
function InWord({ word, letter }: { word: string; letter: string }) {
  return (
    <p className="mt-3 text-[15px] text-muted">
      from{" "}
      <span lang="ne" className="text-[26px]">
        {splitLetters(word).map((p, i) => (
          <span key={i} className={clsx(p.letter && letterKey(p.text) === letter ? "text-ink" : "text-muted/50")}>
            {p.text}
          </span>
        ))}
      </span>
    </p>
  );
}

type Queue = "items" | "letters";

/** Go through every item without audio, or every letter only phrases have, one at a time. */
export function RecordQueue() {
  const missing = useMissingAudio();
  const syllables = useSyllablesToRecord();
  const [queue, setQueue] = useState<Queue>("items");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pos, setPos] = useState(0);

  if (missing.isPending || syllables.isPending) return <PageLoader />;

  const queues: Record<Queue, Take[]> = {
    items: (missing.data ?? []).map(fromItem).filter((t) => !done.has(t.key)),
    letters: (syllables.data ?? []).map(fromSyllable).filter((t) => !done.has(t.key)),
  };
  const remaining = queues[queue];
  const current = remaining.length ? remaining[pos % remaining.length] : undefined;

  return (
    // fills the screen above the tab bar, so the record button is always in reach
    <div className="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-var(--nav-h)-2.5rem)] w-full max-w-lg flex-col">
      <header className="flex items-center gap-3 pt-7 pb-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] leading-tight font-bold sm:text-[36px]">Record</h1>
          {remaining.length > 0 && (
            <p className="truncate text-[15px] text-muted">
              {remaining.length} left{done.size ? `, ${done.size} recorded this session` : ""}
            </p>
          )}
        </div>
        {remaining.length > 1 && (
          <HeaderButton label="Skip for now" onClick={() => setPos((p) => p + 1)}>
            <SkipForward className="size-[18px]" />
          </HeaderButton>
        )}
      </header>

      {queues.letters.length > 0 && (
        <div className="mb-3">
          <Segmented
            value={queue}
            onChange={(q) => {
              setQueue(q);
              setPos(0);
            }}
            options={[
              { value: "items", label: `Items (${queues.items.length})` },
              { value: "letters", label: `Letters in phrases (${queues.letters.length})` },
            ]}
          />
        </div>
      )}

      {!current ? (
        <EmptyState icon={<PartyPopper className="size-7" />} title="Everything is recorded">
          {done.size > 0 ? `Nice — ${done.size} recordings this session.` : queue === "letters"
            ? "Letters new phrases bring in will show up here."
            : "New items without audio will show up here."}
          <div className="mt-4">
            <LinkButton to="/admin">Back to content</LinkButton>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-ok transition-[width] duration-500"
              style={{ width: `${(done.size / (done.size + remaining.length)) * 100}%` }}
            />
          </div>

          <div
            key={current.key}
            className="animate-pop mt-3 flex flex-1 flex-col items-center justify-center rounded-[28px] border border-line/70 bg-surface px-6 py-5 text-center shadow-card"
          >
            <p className="text-xs font-bold tracking-wide text-muted">{current.label}</p>
            <p lang="ne" className={clsx("mt-2", current.big ? "text-7xl leading-tight" : "text-4xl leading-snug")}>
              {current.ne}
            </p>
            {current.word && <InWord word={current.word} letter={current.ne} />}
            {current.roman && <p className="roman mt-2 text-[20px] text-muted">{current.roman}</p>}
            {current.ja && <p className="mt-1 font-bold">{current.ja}</p>}
            {current.ttsUrl && (
              <div className="mt-4 flex items-center gap-2 rounded-full bg-voice-soft py-1 pr-4 pl-1 text-sm font-bold text-voice">
                <PlayButton url={current.ttsUrl} size="sm" /> TTS reference
              </div>
            )}
          </div>

          <div className="pt-3">
            <StudioRecorder target={current.target} onSaved={() => setDone((d) => new Set(d).add(current.key))} />
          </div>
        </>
      )}
    </div>
  );
}

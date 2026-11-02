import clsx from "clsx";
import { PartyPopper, SkipForward } from "lucide-react";
import { useState } from "react";
import { PlayButton, StudioRecorder } from "../../components/audio";
import { EmptyState, HeaderButton, LinkButton, PageLoader } from "../../components/ui";
import { useMissingAudio } from "../../lib/queries";

/** Go through every item without audio, one at a time. */
export function RecordQueue() {
  const { data, isPending } = useMissingAudio();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pos, setPos] = useState(0);

  if (isPending) return <PageLoader />;

  const remaining = (data ?? []).filter((i) => !done.has(i.id));
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

      {!current ? (
        <EmptyState icon={<PartyPopper className="size-7" />} title="Everything is recorded">
          {done.size > 0 ? `Nice — ${done.size} recordings this session.` : "New items without audio will show up here."}
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
            key={current.id}
            className="animate-pop mt-3 flex flex-1 flex-col items-center justify-center rounded-[28px] border border-line/70 bg-surface px-6 py-5 text-center shadow-card"
          >
            <p className="text-xs font-bold tracking-wide text-muted">{current.chapterTitle}</p>
            <p
              lang="ne"
              className={clsx(
                "mt-2",
                current.kind === "letter" ? "text-7xl leading-tight" : "text-4xl leading-snug",
              )}
            >
              {current.ne}
            </p>
            {current.roman && <p className="roman mt-2 text-[20px] text-muted">{current.roman}</p>}
            {current.ja && <p className="mt-1 font-bold">{current.ja}</p>}
            {current.audioSource === "tts" && current.audioUrl && (
              <div className="mt-4 flex items-center gap-2 rounded-full bg-voice-soft py-1 pr-4 pl-1 text-sm font-bold text-voice">
                <PlayButton url={current.audioUrl} size="sm" /> TTS reference
              </div>
            )}
          </div>

          <div className="pt-3">
            <StudioRecorder itemId={current.id} onSaved={() => setDone((d) => new Set(d).add(current.id))} />
          </div>
        </>
      )}
    </div>
  );
}

import { PartyPopper, SkipForward } from "lucide-react";
import { useState } from "react";
import { PlayButton, StudioRecorder } from "../../components/audio";
import { Button, Card, EmptyState, LinkButton, PageHeader, PageLoader } from "../../components/ui";
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
    <>
      <PageHeader
        title="Record"
        subtitle={
          remaining.length
            ? `${remaining.length} left${done.size ? ` · ${done.size} recorded this session` : ""}`
            : undefined
        }
      />

      {!current ? (
        <EmptyState icon={<PartyPopper className="size-7" />} title="Everything is recorded">
          {done.size > 0 ? `Nice — ${done.size} recordings this session.` : "New items without audio will show up here."}
          <div className="mt-4">
            <LinkButton to="/admin">Back to content</LinkButton>
          </div>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-ok transition-[width] duration-500"
              style={{ width: `${(done.size / (done.size + remaining.length)) * 100}%` }}
            />
          </div>

          <Card key={current.id} className="animate-pop flex flex-col items-center px-6 pt-6 pb-8 text-center">
            <p className="text-xs font-extrabold tracking-wide text-muted uppercase">{current.chapterTitle}</p>
            <p
              lang="ne"
              className={
                current.kind === "letter"
                  ? "mt-6 text-8xl leading-tight font-semibold"
                  : "mt-6 text-4xl leading-snug font-semibold"
              }
            >
              {current.ne}
            </p>
            {current.roman && <p className="mt-3 text-lg font-bold text-muted">{current.roman}</p>}
            {current.ja && <p className="mt-1 font-bold">{current.ja}</p>}
            {current.audioSource === "tts" && current.audioUrl && (
              <div className="mt-5 flex items-center gap-2 rounded-full bg-indigo-soft py-1 pr-4 pl-1 text-sm font-bold text-indigo">
                <PlayButton url={current.audioUrl} size="sm" /> TTS reference
              </div>
            )}
          </Card>

          <StudioRecorder
            itemId={current.id}
            onSaved={() => setDone((d) => new Set(d).add(current.id))}
          />

          {remaining.length > 1 && (
            <Button variant="ghost" className="self-center text-muted" onClick={() => setPos((p) => p + 1)}>
              Skip for now <SkipForward className="size-4" />
            </Button>
          )}
        </div>
      )}
    </>
  );
}

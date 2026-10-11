import clsx from "clsx";
import { Headphones, Square } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router";
import { PlayButton } from "../../components/audio";
import { Button, Card, EmptyState, PageHeader, PageLoader } from "../../components/ui";
import type { Item } from "../../lib/api";
import { play, playAll, stop, useNowPlaying, useQueueActive } from "../../lib/player";
import { useChapter } from "../../lib/queries";

function LetterTile({ item, index }: { item: Item; index: number }) {
  const playing = useNowPlaying() === item.audioUrl && item.audioUrl !== null;
  return (
    <button
      type="button"
      disabled={!item.audioUrl}
      onClick={() => item.audioUrl && play(item.audioUrl)}
      style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
      className={clsx(
        "press animate-pop relative flex aspect-square flex-col items-center justify-center rounded-3xl border bg-surface shadow-card transition-colors",
        playing ? "border-brand bg-brand-soft" : "border-line/60",
        !item.audioUrl && "opacity-60",
      )}
    >
      <span lang="ne" className={clsx("text-5xl leading-none font-semibold", playing && "text-brand")}>
        {item.ne}
      </span>
      {item.roman && <span className="mt-2 text-xs font-bold text-muted">{item.roman}</span>}
    </button>
  );
}

function PhraseRow({ item }: { item: Item }) {
  const playing = useNowPlaying() === item.audioUrl && item.audioUrl !== null;
  return (
    <Card className={clsx("flex items-center gap-3 p-4 transition-colors", playing && "border-brand bg-brand-soft")}>
      <div className="min-w-0 flex-1">
        <p lang="ne" className="text-xl font-semibold">
          {item.ne}
        </p>
        {item.ja && <p className="mt-0.5 font-bold">{item.ja}</p>}
        {item.roman && <p className="text-sm text-muted">{item.roman}</p>}
        {item.note && <p className="mt-2 rounded-xl bg-gold-soft px-3 py-2 text-sm text-gold">{item.note}</p>}
      </div>
      <PlayButton url={item.audioUrl} />
    </Card>
  );
}

export function ChapterView() {
  const { id = "" } = useParams();
  const { data: chapter, isPending, error } = useChapter(id);
  const queueActive = useQueueActive();

  useEffect(() => () => stop(), []);

  if (isPending) return <PageLoader />;
  if (error || !chapter) return <PageHeader back="/" title="見つかりません" />;

  // admins get archived items too; the learner view never shows them
  const items = chapter.items.filter((i) => !i.archived);
  const urls = items.flatMap((i) => (i.audioUrl ? [i.audioUrl] : []));
  const isScript = chapter.track === "script";

  return (
    <>
      <PageHeader
        back="/"
        title={chapter.titleJa}
        subtitle={chapter.titleNe ? <span lang="ne">{chapter.titleNe}</span> : undefined}
      />
      {chapter.descriptionJa && <p className="mb-4 px-1 text-muted">{chapter.descriptionJa}</p>}

      {urls.length > 1 && (
        <Button
          variant={queueActive ? "secondary" : "primary"}
          className="mb-5 w-full"
          onClick={() => (queueActive ? stop() : playAll(urls))}
        >
          {queueActive ? (
            <>
              <Square className="size-4" fill="currentColor" /> 停止
            </>
          ) : (
            <>
              <Headphones className="size-5" /> 全部聞く
            </>
          )}
        </Button>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<Headphones className="size-7" />} title="まだ何もありません" />
      ) : isScript ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {items.map((item, i) => (
            <LetterTile key={item.id} item={item} index={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <PhraseRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}

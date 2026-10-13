import clsx from "clsx";
import { Headphones, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { PlayButton } from "../../components/audio";
import { Button, Card, EmptyState, PageHeader, PageLoader } from "../../components/ui";
import type { Item } from "../../lib/api";
import { play, playAll, stop, useNowPlaying, useQueueActive } from "../../lib/player";
import { useChapter } from "../../lib/queries";
import { REGISTER_INFO, REGISTER_ORDER } from "../../lib/registers";

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
        {item.register && (
          <p className="mt-2 text-xs font-bold text-indigo">
            {REGISTER_INFO[item.register].ja} · {REGISTER_INFO[item.register].hint}
          </p>
        )}
        {item.note && <p className="mt-2 rounded-xl bg-gold-soft px-3 py-2 text-sm text-gold">{item.note}</p>}
      </div>
      <PlayButton url={item.audioUrl} />
    </Card>
  );
}

/** One expression at several politeness tiers, switchable with chips. */
function VariantCard({ variants }: { variants: Item[] }) {
  const [selected, setSelected] = useState(0);
  const nowPlaying = useNowPlaying();
  const item = variants[selected] ?? variants[0]!;
  const playing = variants.some((v) => v.audioUrl !== null && v.audioUrl === nowPlaying);
  const info = item.register ? REGISTER_INFO[item.register] : null;

  return (
    <Card className={clsx("p-4 transition-colors", playing && "border-brand bg-brand-soft")}>
      <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1" role="tablist">
        {variants.map((v, i) => {
          const r = v.register ? REGISTER_INFO[v.register] : null;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={i === selected}
              onClick={() => {
                setSelected(i);
                if (v.audioUrl) play(v.audioUrl);
              }}
              className={clsx(
                "press flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors",
                i === selected ? "bg-ink text-bg" : "bg-surface-2 text-muted",
              )}
            >
              {r ? r.ja : `#${i + 1}`}
              {r && (
                <span lang="ne" className="text-xs font-medium opacity-75">
                  {r.pronoun}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div key={item.id} className="animate-fade flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p lang="ne" className="text-xl font-semibold">
            {item.ne}
          </p>
          {item.ja && <p className="mt-0.5 font-bold">{item.ja}</p>}
          {item.roman && <p className="text-sm text-muted">{item.roman}</p>}
          {info && <p className="mt-2 text-xs font-bold text-indigo">{info.hint}</p>}
          {item.note && <p className="mt-2 rounded-xl bg-gold-soft px-3 py-2 text-sm text-gold">{item.note}</p>}
        </div>
        <PlayButton url={item.audioUrl} />
      </div>
    </Card>
  );
}

const registerRank = (i: Item) => (i.register ? REGISTER_ORDER.indexOf(i.register) : REGISTER_ORDER.length);

/** Collapses items sharing a group into one entry, placed where the first one sits. */
function groupVariants(items: Item[]) {
  const seen = new Set<string>();
  const out: Item[][] = [];
  for (const item of items) {
    if (!item.group) {
      out.push([item]);
    } else if (!seen.has(item.group)) {
      seen.add(item.group);
      out.push(items.filter((i) => i.group === item.group).sort((a, b) => registerRank(a) - registerRank(b)));
    }
  }
  return out;
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
          {groupVariants(items).map((group) =>
            group.length > 1 ? (
              <VariantCard key={group[0]!.id} variants={group} />
            ) : (
              <PhraseRow key={group[0]!.id} item={group[0]!} />
            ),
          )}
        </div>
      )}
    </>
  );
}

import clsx from "clsx";
import { Headphones, Info, Lightbulb, Play, Square, Volume2, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { pronunciation } from "@nt/shared";
import { EqBars } from "../../components/audio";
import { PronunciationSheet } from "../../components/Pronunciation";
import { EmptyState, PageHeader, PageLoader } from "../../components/ui";
import type { Item } from "../../lib/api";
import { rememberChapter } from "../../lib/lastChapter";
import { play, playAll, stop, useNowPlaying, usePlayRun, useQueueActive } from "../../lib/player";
import { useChapter } from "../../lib/queries";
import { REGISTER_INFO, REGISTER_ORDER } from "../../lib/registers";

const usePlaying = (url: string | null) => useNowPlaying() === url && url !== null;

/** Tap to hear, tap again to stop. */
const toggle = (url: string | null, playing: boolean) => {
  if (!url) return;
  if (playing) stop();
  else play(url);
};

function LetterTile({ item, index, onInfo }: { item: Item; index: number; onInfo?: () => void }) {
  const playing = usePlaying(item.audioUrl);
  return (
    <div className="animate-pop relative" style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}>
      <button
        type="button"
        data-audio={item.audioUrl ?? undefined}
        disabled={!item.audioUrl}
        onClick={() => toggle(item.audioUrl, playing)}
        className={clsx(
          "press relative flex aspect-square w-full flex-col items-center justify-center rounded-[22px] border transition-all duration-200",
          playing
            ? "scale-[1.03] border-brand bg-brand text-brand-ink shadow-lift"
            : "border-line/70 bg-surface shadow-card",
          !item.audioUrl && "border-dashed opacity-50 shadow-none",
        )}
      >
        <span lang="ne" className="text-[44px] leading-none font-medium">
          {item.ne}
        </span>
        {item.roman && (
          <span className={clsx("mt-2.5 text-[13px] font-semibold", playing ? "text-brand-ink/85" : "text-muted")}>
            {item.roman}
          </span>
        )}
        {playing && <EqBars className="absolute top-3 left-3 h-3 text-brand-ink/80" />}
      </button>
      {onInfo && (
        // big invisible hit area around a small icon
        <button
          type="button"
          aria-label="発音のしかた"
          onClick={onInfo}
          className="press absolute right-0 bottom-0 grid size-11 place-items-center"
        >
          <Info className={clsx("size-[18px] transition-colors", playing ? "text-brand-ink/80" : "text-muted/70")} />
        </button>
      )}
    </div>
  );
}

function PlayIndicator({ playing, hasAudio }: { playing: boolean; hasAudio: boolean }) {
  return (
    <span
      className={clsx(
        "grid size-10 shrink-0 place-items-center rounded-full transition-colors",
        playing ? "bg-brand text-brand-ink" : "bg-indigo-soft text-indigo",
        !hasAudio && "opacity-30",
      )}
    >
      {playing ? <EqBars /> : <Volume2 className="size-[18px]" />}
    </span>
  );
}

function Note({ children }: { children: string }) {
  return (
    <p className="mt-3 flex gap-2 rounded-2xl bg-gold-soft px-3 py-2.5 text-[13px] leading-relaxed text-gold">
      <Lightbulb className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** The phrase itself: Nepali first and biggest, meaning and romanization under it. */
function PhraseBody({ item, playing }: { item: Item; playing: boolean }) {
  return (
    <button
      type="button"
      data-audio={item.audioUrl ?? undefined}
      onClick={() => toggle(item.audioUrl, playing)}
      className="press flex w-full items-center gap-3 text-left"
    >
      <div className="min-w-0 flex-1">
        <p lang="ne" className={clsx("text-[22px] leading-snug font-medium transition-colors", playing && "text-brand")}>
          {item.ne}
        </p>
        {item.ja && <p className="mt-1 text-[15px] text-ink/85">{item.ja}</p>}
        {item.roman && <p className="mt-0.5 text-[13px] text-muted">{item.roman}</p>}
      </div>
      <PlayIndicator playing={playing} hasAudio={!!item.audioUrl} />
    </button>
  );
}

const cardClass = (playing: boolean) =>
  clsx(
    "rounded-[22px] border bg-surface p-4 shadow-card transition-colors",
    playing ? "border-brand/50" : "border-line/70",
  );

function PhraseCard({ item }: { item: Item }) {
  const playing = usePlaying(item.audioUrl);
  return (
    <div className={cardClass(playing)}>
      <PhraseBody item={item} playing={playing} />
      {item.register && (
        <p className="mt-2 text-xs font-bold text-indigo">
          {REGISTER_INFO[item.register].ja} · {REGISTER_INFO[item.register].hint}
        </p>
      )}
      {item.note && <Note>{item.note}</Note>}
    </div>
  );
}

/** One expression at several politeness tiers, switchable with a segmented control. */
function VariantCard({ variants }: { variants: Item[] }) {
  const [selected, setSelected] = useState(0);
  const nowPlaying = useNowPlaying();
  // follow "play all" through the tiers
  useEffect(() => {
    const i = variants.findIndex((v) => v.audioUrl !== null && v.audioUrl === nowPlaying);
    if (i >= 0) setSelected(i);
  }, [nowPlaying, variants]);
  const item = variants[selected] ?? variants[0]!;
  const playing = item.audioUrl !== null && item.audioUrl === nowPlaying;
  const info = item.register ? REGISTER_INFO[item.register] : null;

  return (
    <div className={cardClass(playing)}>
      <div className="mb-3.5 flex rounded-full bg-surface-2 p-1" role="tablist">
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
                "press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-bold transition-colors",
                i === selected ? "bg-surface text-ink shadow-card" : "text-muted",
              )}
            >
              {r ? r.ja : `#${i + 1}`}
              {r && (
                <span lang="ne" className="text-[11px] font-medium opacity-70">
                  {r.pronoun}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div key={item.id} className="animate-fade">
        <PhraseBody item={item} playing={playing} />
        {info && <p className="mt-2 text-xs font-bold text-indigo">{info.hint}</p>}
        {item.note && <Note>{item.note}</Note>}
      </div>
    </div>
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

/** Floating "now playing" bar while listening to the whole chapter. */
function NowPlayingBar({ items }: { items: Item[] }) {
  const run = usePlayRun();
  const nowPlaying = useNowPlaying();
  // between clips nothing is playing; keep showing the last one
  const [last, setLast] = useState<Item | null>(null);
  const item = items.find((i) => i.audioUrl !== null && i.audioUrl === nowPlaying);
  useEffect(() => {
    if (item) setLast(item);
  }, [item]);
  if (!run) return null;
  const shown = item ?? last;
  return (
    <div className="animate-pop fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+4.75rem)] z-30 px-4">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-5 text-bg shadow-lift">
        <EqBars className="text-brand" />
        <p lang="ne" className="min-w-0 flex-1 truncate text-[17px] font-medium">
          {shown?.ne ?? "…"}
        </p>
        <span className="text-[13px] font-bold tabular-nums opacity-60">
          {run.index + 1} / {run.urls.length}
        </span>
        <button type="button" aria-label="停止" onClick={stop} className="press grid size-10 place-items-center rounded-full bg-bg/15">
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}

export function ChapterView() {
  const { id = "" } = useParams();
  const { data: chapter, isPending, error } = useChapter(id);
  const queueActive = useQueueActive();
  const run = usePlayRun();
  const nowPlaying = useNowPlaying();
  const [guide, setGuide] = useState<Item | null>(null);

  useEffect(() => () => stop(), []);
  useEffect(() => {
    if (chapter && !chapter.archived) rememberChapter(chapter.id);
  }, [chapter]);
  // keep the clip being played during "play all" on screen
  useEffect(() => {
    if (!run || !nowPlaying) return;
    document
      .querySelector(`[data-audio="${CSS.escape(nowPlaying)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [run, nowPlaying]);

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
        action={
          urls.length > 1 && (
            <>
              {isScript && (
                <Link
                  to={`/review?chapter=${encodeURIComponent(chapter.id)}`}
                  className="press flex h-10 items-center gap-1.5 rounded-full border border-line/70 bg-surface px-4 text-[13px] font-bold shadow-card"
                >
                  <Zap className="size-4 text-gold" fill="currentColor" /> クイズ
                </Link>
              )}
              <button
                type="button"
                onClick={() => (queueActive ? stop() : playAll(urls))}
                className={clsx(
                  "press flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold shadow-card",
                  queueActive ? "bg-ink text-bg" : "bg-brand text-brand-ink",
                )}
              >
                {queueActive ? (
                  <>
                    <Square className="size-3.5" fill="currentColor" /> 停止
                  </>
                ) : (
                  <>
                    <Play className="size-4" fill="currentColor" /> 全部聞く
                  </>
                )}
              </button>
            </>
          )
        }
      />
      {chapter.descriptionJa && (
        <p className="-mt-1 mb-5 text-[15px] leading-relaxed text-muted">{chapter.descriptionJa}</p>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<Headphones className="size-7" />} title="まだ何もありません" />
      ) : isScript ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {items.map((item, i) => (
            <LetterTile
              key={item.id}
              item={item}
              index={i}
              onInfo={pronunciation(item.ne) ? () => setGuide(item) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupVariants(items).map((group) =>
            group.length > 1 ? (
              <VariantCard key={group[0]!.id} variants={group} />
            ) : (
              <PhraseCard key={group[0]!.id} item={group[0]!} />
            ),
          )}
        </div>
      )}

      <NowPlayingBar items={items} />
      <PronunciationSheet
        item={guide}
        audioFor={(ne) => items.find((i) => i.ne === ne)?.audioUrl ?? null}
        onClose={() => setGuide(null)}
      />
    </>
  );
}

import clsx from "clsx";
import { Hand, Headphones, Info, Pause, Play, Square, Volume2, X, Zap } from "lucide-react";
import { createContext, Fragment, useContext, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { letterKey, pronunciation, splitLetters } from "@nt/shared";
import { EqBars, Karaoke } from "../../components/audio";
import { PronunciationSheet } from "../../components/Pronunciation";
import { EmptyState, List, PageHeader, PageLoader } from "../../components/ui";
import type { Item } from "../../lib/api";
import { useShowPronunciation } from "../../lib/features";
import { rememberChapter } from "../../lib/lastChapter";
import { play, playAll, stop, useNowPlaying, usePlayRun, useQueueActive } from "../../lib/player";
import { useChapter, useLetterSounds } from "../../lib/queries";
import { REGISTER_INFO, REGISTER_ORDER } from "../../lib/registers";

const usePlaying = (url: string | null) => useNowPlaying() === url && url !== null;

/** Tap to hear, tap again to stop. */
const toggle = (url: string | null, playing: boolean) => {
  if (!url) return;
  if (playing) stop();
  else play(url);
};

function LetterTile({ item, onInfo, compact }: { item: Item; onInfo?: () => void; compact?: boolean }) {
  const playing = usePlaying(item.audioUrl);
  return (
    <div className="relative">
      <button
        type="button"
        data-audio={item.audioUrl ?? undefined}
        disabled={!item.audioUrl}
        aria-label={item.roman || item.ne}
        onClick={() => toggle(item.audioUrl, playing)}
        className={clsx(
          "press flex aspect-square w-full flex-col items-center justify-center border-2 bg-surface transition-colors",
          compact ? "rounded-[16px]" : "rounded-[20px]",
          playing ? "border-accent" : "border-transparent shadow-card",
          !item.audioUrl && "border-dashed !border-line opacity-50 shadow-none",
        )}
      >
        <Karaoke
          url={item.audioUrl}
          className={clsx("leading-none", compact ? "text-[34px] sm:text-[44px]" : "text-[46px] sm:text-[52px]")}
        >
          {item.ne}
        </Karaoke>
        {item.roman && (
          <span
            className={clsx(
              "roman text-muted",
// on small tiles, clear the info icon
              compact ? "mt-1.5 text-[13px]" : "mt-2 text-[15px]",
              compact && onInfo && "pr-3",
            )}
          >
            {item.roman}
          </span>
        )}
      </button>
      {onInfo && (
        // big invisible hit area around a small icon
        <button
          type="button"
          aria-label="発音のしかた"
          onClick={onInfo}
          className={clsx(
            "press absolute right-0 bottom-0 grid place-items-center text-muted/45 hover:text-ink",
            compact ? "size-8" : "size-11",
          )}
        >
          <Info className={compact ? "size-[13px]" : "size-[17px]"} />
        </button>
      )}
    </div>
  );
}

/** One consonant's barakhari: its letter, a button that plays the row, then the syllables. */
function LetterRow({ items, infoFor }: { items: Item[]; infoFor: (item: Item) => (() => void) | undefined }) {
  const run = usePlayRun();
  const urls = items.flatMap((i) => (i.audioUrl ? [i.audioUrl] : []));
  const playing = !!run && run.urls.length === urls.length && run.urls[0] === urls[0];
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 lang="ne" className="text-[28px] leading-none">
          {items[0]!.group}
        </h2>
        <span className="h-px flex-1 bg-line" />
        {urls.length > 1 && (
          <button
            type="button"
            onClick={() => (playing ? stop() : playAll(urls))}
            className={clsx(
              "press flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition-colors",
              playing ? "bg-ink text-bg" : "bg-accent-soft text-accent",
            )}
          >
            {playing ? (
              <>
                <Square className="size-3" fill="currentColor" /> 停止
              </>
            ) : (
              <>
                <Play className="size-3.5" fill="currentColor" /> 通して聞く
              </>
            )}
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3">
        {items.map((item) => (
          <LetterTile key={item.id} item={item} onInfo={infoFor(item)} compact />
        ))}
      </div>
    </section>
  );
}

function SoundIcon({ playing, hasAudio, onClick }: { playing: boolean; hasAudio: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={playing ? "停止" : "聞く"}
      disabled={!hasAudio}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "grid size-10 shrink-0 place-items-center rounded-full transition-colors",
        playing ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent",
        !hasAudio && "opacity-30",
      )}
    >
      {playing ? <Pause className="size-[18px]" fill="currentColor" /> : <Volume2 className="size-[18px]" />}
    </button>
  );
}

// clip URL per letter, keyed by letterKey; empty until loaded
const NO_SOUNDS = new Map<string, string>();
const LetterSounds = createContext(NO_SOUNDS);

/** One letter of a phrase: tap to hear just that letter. */
function LetterSound({ text, url }: { text: string; url: string }) {
  const playing = usePlaying(url);
  const hear = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    toggle(url, playing);
  };
  return (
    // inline, so the word still joins up and wraps as one; the vertical
    // padding makes a taller target without moving the text
    <span
      role="button"
      tabIndex={0}
      onClick={hear}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        hear(e);
      }}
      className="cursor-pointer py-2"
    >
      <Karaoke url={url}>{text}</Karaoke>
    </span>
  );
}

/** A phrase's Nepali, with each letter that has a sound tappable on its own. */
function PhraseText({ item }: { item: Item }) {
  const sounds = useContext(LetterSounds);
  const parts = useMemo(() => splitLetters(item.ne), [item.ne]);
  return (
    <Karaoke url={item.audioUrl} className="text-[23px] leading-snug sm:text-[26px]">
      {parts.map((part, i) => {
        const url = part.letter ? sounds.get(letterKey(part.text)) : undefined;
        return url ? <LetterSound key={i} text={part.text} url={url} /> : <Fragment key={i}>{part.text}</Fragment>;
      })}
    </Karaoke>
  );
}

/**
 * The phrase itself: Nepali first and biggest, meaning and romanization under
 * it. Tapping a letter plays just that letter; anywhere else plays the phrase.
 */
function PhraseBody({ item, hint }: { item: Item; hint?: string }) {
  const playing = usePlaying(item.audioUrl);
  return (
    <div
      data-audio={item.audioUrl ?? undefined}
      onClick={() => toggle(item.audioUrl, playing)}
      className="flex w-full cursor-pointer items-start gap-4 text-left"
    >
      <div className="min-w-0 flex-1">
        <PhraseText item={item} />
        {item.ja && <p className="mt-1.5 text-[16px]">{item.ja}</p>}
        {item.roman && <p className="roman mt-1 text-[15px] text-muted">{item.roman}</p>}
        {hint && <p className="mt-2 text-[13px] font-bold text-voice">{hint}</p>}
      </div>
      <SoundIcon playing={playing} hasAudio={!!item.audioUrl} onClick={() => toggle(item.audioUrl, playing)} />
    </div>
  );
}

function Note({ children }: { children: string }) {
  return (
    <p className="mt-3 border-l-2 border-breath/60 pl-3 text-[14px] leading-relaxed text-muted">{children}</p>
  );
}

function PhraseRow({ item }: { item: Item }) {
  const info = item.register ? REGISTER_INFO[item.register] : null;
  return (
    <div className="px-4 py-5 sm:px-5">
      <PhraseBody item={item} hint={info ? `${info.ja}：${info.hint}` : undefined} />
      {item.note && <Note>{item.note}</Note>}
    </div>
  );
}

/** One expression at several politeness tiers, switchable with a segmented control. */
function VariantRow({ variants }: { variants: Item[] }) {
  const [selected, setSelected] = useState(0);
  const nowPlaying = useNowPlaying();
  // follow "play all" through the tiers
  useEffect(() => {
    const i = variants.findIndex((v) => v.audioUrl !== null && v.audioUrl === nowPlaying);
    if (i >= 0) setSelected(i);
  }, [nowPlaying, variants]);
  const item = variants[selected] ?? variants[0]!;
  const info = item.register ? REGISTER_INFO[item.register] : null;

  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="mb-4 flex rounded-full bg-surface-2 p-1 sm:max-w-md" role="tablist">
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
              {r ? r.ja : `${i + 1}`}
              {r && (
                <span lang="ne" className="text-[13px] font-normal opacity-70">
                  {r.pronoun}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div key={item.id} className="animate-fade">
        <PhraseBody item={item} hint={info?.hint} />
        {item.note && <Note>{item.note}</Note>}
      </div>
    </div>
  );
}

const registerRank = (i: Item) => (i.register ? REGISTER_ORDER.indexOf(i.register) : REGISTER_ORDER.length);

/** Collapses items sharing a group (politeness tiers, a barakhari row) into one entry, placed where the first one sits. */
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
    <div className="animate-pop fixed right-0 bottom-[calc(var(--nav-h)+max(env(safe-area-inset-bottom),0.75rem)+0.5rem)] left-[var(--nav-w)] z-30 px-4">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-full bg-deep py-2 pr-2 pl-5 text-on-deep shadow-lift">
        <EqBars className="shrink-0 text-accent" />
        <p className="min-w-0 flex-1 truncate text-[18px]">
          {shown ? <Karaoke url={shown.audioUrl}>{shown.ne}</Karaoke> : "…"}
        </p>
        <span className="text-[13px] font-bold tabular-nums opacity-60">
          {run.index + 1} / {run.urls.length}
        </span>
        <button
          type="button"
          aria-label="停止"
          onClick={stop}
          className="press grid size-10 place-items-center rounded-full bg-on-deep/15"
        >
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
  const showPronunciation = useShowPronunciation();
  const { data: letterSounds } = useLetterSounds(!!chapter && chapter.track !== "script");

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
  const groups = groupVariants(items);
  const infoFor = (item: Item) => (showPronunciation && pronunciation(item.ne) ? () => setGuide(item) : undefined);

  return (
    // one reading-width column; letters sit five to a row from tablets up,
    // which lines consonants up by where they're said (क ख ग घ ङ, च …)
    <div className="mx-auto w-full max-w-3xl">
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
                  className="press flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[14px] font-bold hover:bg-surface-2"
                >
                  <Zap className="size-4 text-breath" fill="currentColor" /> クイズ
                </Link>
              )}
              <button
                type="button"
                onClick={() => (queueActive ? stop() : playAll(urls))}
                className={clsx(
                  "press flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-bold",
                  queueActive ? "bg-ink text-bg" : "bg-accent text-accent-ink",
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
        <p className="-mt-2 mb-6 max-w-prose text-[15px] leading-relaxed text-muted">{chapter.descriptionJa}</p>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<Headphones className="size-7" />} title="まだ何もありません">
          音声が追加されると、ここで聞けます。
        </EmptyState>
      ) : isScript && groups.some((g) => g.length > 1) ? (
        // a barakhari: one row per consonant
        <div className="space-y-8">
          {groups.map((group) => (
            <LetterRow key={group[0]!.id} items={group} infoFor={infoFor} />
          ))}
        </div>
      ) : isScript ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {items.map((item) => (
            <LetterTile key={item.id} item={item} onInfo={infoFor(item)} />
          ))}
        </div>
      ) : (
        <LetterSounds.Provider value={letterSounds ?? NO_SOUNDS}>
          {!!letterSounds?.size && (
            <p className="mb-3 flex items-center gap-1.5 text-[13px] text-muted">
              <Hand className="size-4 shrink-0" /> 文字をタップすると、その文字だけの音が聞けます
            </p>
          )}
          <List>
            {groups.map((group) =>
              group.length > 1 ? (
                <VariantRow key={group[0]!.id} variants={group} />
              ) : (
                <PhraseRow key={group[0]!.id} item={group[0]!} />
              ),
            )}
          </List>
        </LetterSounds.Provider>
      )}

      <NowPlayingBar items={items} />
      <PronunciationSheet
        item={guide}
        audioFor={(ne) => items.find((i) => i.ne === ne)?.audioUrl ?? null}
        onClose={() => setGuide(null)}
      />
    </div>
  );
}

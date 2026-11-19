import clsx from "clsx";
import { BookOpen, Check, ChevronRight, CloudOff, Phone } from "lucide-react";
import { Link } from "react-router";
import { Avatar, Badge, EmptyState, List, PageLoader, SectionTitle } from "../../components/ui";
import type { ChapterSummary, ReviewSummary } from "../../lib/api";
import { lastChapter } from "../../lib/lastChapter";
import { useCallEnabled, useChapters, useMe, useReviewSummary } from "../../lib/queries";

const countLabel = (c: ChapterSummary) => `${c.itemCount}${c.track === "script" ? "文字" : "フレーズ"}`;

/** "18:30" today, "明日 9:00", or a date further out. */
function whenLabel(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ja-JP", { hour: "numeric", minute: "2-digit" });
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `明日 ${time}`;
  return d.toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
}

function greeting() {
  const h = new Date().getHours();
  return h < 4 || h >= 18 ? "こんばんは" : h < 11 ? "おはよう" : "こんにちは";
}

function reviewSentence({ due, new: fresh }: ReviewSummary) {
  if (due && fresh) return `復習が${due}問、新しい問題が${fresh}問あります`;
  if (due) return `復習が${due}問あります`;
  return `新しい問題が${fresh}問あります`;
}

/** Today's review: the letters it covers are the headline. */
function ReviewPanel({ summary }: { summary: ReviewSummary }) {
  if (summary.total === 0) return null;
  if (summary.due + summary.new === 0) {
    return (
      <div className="flex items-center gap-4 rounded-[24px] border border-line bg-surface p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
          <Check className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="font-bold">今日の復習はおしまい</p>
          {summary.nextDue && <p className="text-[15px] text-muted">次の復習は {whenLabel(summary.nextDue)}</p>}
        </div>
      </div>
    );
  }
  return (
    <Link to="/review" className="press block rounded-[28px] bg-deep p-6 text-on-deep">
      <p className="text-[15px] font-bold opacity-70">今日の復習</p>
      <p lang="ne" className="mt-3 text-[44px] leading-[1.15] tracking-wide break-words">
        {summary.letters.join(" ")}
      </p>
      <p className="mt-3 text-[15px] opacity-80">{reviewSentence(summary)}</p>
      <span className="mt-6 flex h-[52px] items-center justify-center rounded-full bg-on-deep text-[17px] font-bold text-deep sm:w-72 lg:w-auto">
        はじめる
      </span>
      <div className="mt-5 flex items-center gap-3 text-[13px] opacity-70">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-on-deep/20">
          <div className="h-full rounded-full bg-on-deep" style={{ width: `${(summary.learned / summary.total) * 100}%` }} />
        </div>
        <span className="tabular-nums">
          {summary.learned} / {summary.total}
        </span>
      </div>
    </Link>
  );
}

function ScriptTile({ chapter, last, wide }: { chapter: ChapterSummary; last: boolean; wide: boolean }) {
  return (
    <Link
      to={`/chapters/${chapter.id}`}
      className={clsx(
        "press flex min-h-36 flex-col rounded-[22px] border border-line bg-surface p-4 hover:border-muted/40",
        wide && "col-span-2 sm:col-span-1",
      )}
    >
      <p lang="ne" className="flex gap-x-[0.3em] overflow-hidden text-[34px] leading-tight whitespace-nowrap">
        {chapter.preview.length ? (
          chapter.preview.slice(0, wide ? 4 : 3).map((ne, i) => (
            // the 4th letter only fits while the tile spans the row
            <span key={i} className={clsx(i === 3 && "sm:hidden")}>
              {ne}
            </span>
          ))
        ) : (
          <span>—</span>
        )}
      </p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-4">
        <div className="min-w-0">
          <p className="truncate font-bold">{chapter.titleJa}</p>
          <p className="text-[13px] text-muted">{countLabel(chapter)}</p>
        </div>
        {last && <Badge tone="voice">前回</Badge>}
      </div>
    </Link>
  );
}

function PhraseRow({ chapter, last }: { chapter: ChapterSummary; last: boolean }) {
  return (
    <Link
      to={`/chapters/${chapter.id}`}
      className="press flex items-center gap-3 px-4 py-4 hover:bg-surface-2/60 active:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-bold">
          <span className="truncate">{chapter.titleJa}</span>
          {last && <Badge tone="voice">前回</Badge>}
        </p>
        <p lang="ne" className="mt-0.5 truncate text-[17px] text-muted">
          {chapter.preview[0] ?? chapter.titleNe}
        </p>
      </div>
      <span className="shrink-0 text-[13px] text-muted">{countLabel(chapter)}</span>
      <ChevronRight className="size-4 shrink-0 text-muted/70" />
    </Link>
  );
}

/** A call with the AI tutor: talk Nepali out loud, words show up as cards. */
function CallPanel() {
  return (
    <Link
      to="/call"
      className="press group relative flex items-center gap-4 overflow-hidden rounded-[24px] border border-line bg-surface p-5"
    >
      <div className="pointer-events-none absolute -top-12 -right-10 size-36 rounded-full bg-accent/15 blur-2xl transition-transform group-hover:scale-110" />
      <div className="pointer-events-none absolute -bottom-14 left-10 size-32 rounded-full bg-voice/15 blur-2xl" />
      <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-deep text-on-deep">
        <span className="animate-ring absolute inset-0 rounded-full" />
        <Phone className="size-5" />
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="font-bold">AI先生と電話で練習</p>
        <p className="text-[14px] text-muted">声で話して、わからない言葉はカードで</p>
      </div>
      <ChevronRight className="relative size-4 shrink-0 text-muted/70" />
    </Link>
  );
}

const today = () =>
  new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "long" }).format(new Date());

export function Home() {
  const { data: me } = useMe();
  const { data: chapters, isPending, isError } = useChapters();
  const { data: summary } = useReviewSummary();
  const { data: callEnabled } = useCallEnabled();

  const script = chapters?.filter((c) => c.track === "script") ?? [];
  const phrases = chapters?.filter((c) => c.track === "phrases") ?? [];
  const lastId = lastChapter();

  return (
    <div className="flex flex-col gap-8 pt-4 sm:pt-8 lg:grid lg:grid-cols-[minmax(0,380px)_1fr] lg:items-start lg:gap-12">
      <div className="flex flex-col gap-6 lg:sticky lg:top-8">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[15px] text-muted">{today()}</p>
            <h1 className="mt-1 text-[30px] leading-tight font-bold">
              {greeting()}、{me?.displayName}さん
            </h1>
          </div>
          {me && (
            <Link to="/account" aria-label="アカウント" className="press mt-1 rounded-full">
              <Avatar name={me.displayName} className="size-10 text-[15px]" />
            </Link>
          )}
        </header>
        {summary && <ReviewPanel summary={summary} />}
        {callEnabled && <CallPanel />}
      </div>

      {isPending ? (
        <PageLoader />
      ) : isError ? (
        <EmptyState icon={<CloudOff className="size-7" />} title="レッスンを読み込めませんでした">
          通信状況を確認して、アプリを開き直してください。
        </EmptyState>
      ) : !chapters.length ? (
        <EmptyState icon={<BookOpen className="size-7" />} title="レッスンはまだありません">
          追加されると、ここに表示されます。
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {script.length > 0 && (
            <section>
              <SectionTitle>文字</SectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {script.map((c, i) => (
                  // an odd last tile takes the full row on phones instead of leaving a hole
                  <ScriptTile
                    key={c.id}
                    chapter={c}
                    last={c.id === lastId}
                    wide={i === script.length - 1 && i % 2 === 0}
                  />
                ))}
              </div>
            </section>
          )}

          {phrases.length > 0 && (
            <section>
              <SectionTitle>会話</SectionTitle>
              <List>
                {phrases.map((c) => (
                  <PhraseRow key={c.id} chapter={c} last={c.id === lastId} />
                ))}
              </List>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

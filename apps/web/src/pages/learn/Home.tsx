import clsx from "clsx";
import { BookOpen, Check, ChevronRight, MessagesSquare, Play } from "lucide-react";
import { Link } from "react-router";
import { EmptyState, List, PageLoader, SectionTitle } from "../../components/ui";
import type { ChapterSummary, ReviewSummary } from "../../lib/api";
import { lastChapter } from "../../lib/lastChapter";
import { useChapters, useMe, useReviewSummary } from "../../lib/queries";

const countLabel = (c: ChapterSummary) => `${c.itemCount}${c.track === "script" ? "文字" : "フレーズ"}`;

/** Lungta prayer flags strung across the top: blue, white, red, green, yellow. */
function PrayerFlags() {
  const colors = ["#2f62c9", "#ffffff", "#d4213d", "#2e9d5b", "#f2b630"];
  const flags = Array.from({ length: 15 }, (_, i) => i);
  return (
    <svg viewBox="0 0 300 34" className="pointer-events-none -mx-4 block h-8 w-[calc(100%+2rem)]" aria-hidden>
      <path d="M-5 4 Q150 26 305 4" fill="none" stroke="var(--line)" strokeWidth="1" />
      {flags.map((i) => {
        const x = 8 + i * 20;
        // follow the string's curve
        const t = (x + 5) / 310;
        const y = 4 + 2 * (1 - t) * t * 22;
        return (
          <path
            key={i}
            d={`M${x} ${y} h11 l-5.5 11 z`}
            fill={colors[i % colors.length]}
            stroke="var(--line)"
            strokeWidth="0.5"
            opacity="0.9"
            transform={`rotate(${(t - 0.5) * -14} ${x + 5.5} ${y})`}
          />
        );
      })}
    </svg>
  );
}

const Mountains = () => (
  <svg
    className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full"
    viewBox="0 0 400 96"
    preserveAspectRatio="none"
    aria-hidden
  >
    <path d="M0 96 V58 L50 30 L88 50 L150 8 L215 56 L262 34 L320 62 L400 26 V96 Z" fill="white" opacity="0.08" />
    <path d="M0 96 V76 L70 52 L130 72 L200 44 L270 74 L340 56 L400 70 V96 Z" fill="white" opacity="0.1" />
  </svg>
);

/** "18:30" today, "明日 9:00", or a date further out. */
function whenLabel(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ja-JP", { hour: "numeric", minute: "2-digit" });
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `明日 ${time}`;
  return d.toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="font-display text-[40px] leading-none font-extrabold tabular-nums">{n}</p>
      <p className="mt-1 text-[13px] font-bold opacity-80">{label}</p>
    </div>
  );
}

function ReviewCard({ summary }: { summary: ReviewSummary }) {
  if (summary.total === 0) return null;
  if (summary.due + summary.new === 0) {
    return (
      <div className="animate-pop flex items-center gap-4 rounded-[22px] border border-line/70 bg-surface p-4 shadow-card">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
          <Check className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="font-bold">今日の復習はおしまい！</p>
          {summary.nextDue && <p className="text-[13px] text-muted">次の復習は {whenLabel(summary.nextDue)}</p>}
        </div>
      </div>
    );
  }
  return (
    <Link
      to="/review"
      className="press animate-pop relative block overflow-hidden rounded-[28px] bg-gradient-to-br from-brand to-brand-deep p-5 text-white shadow-lift"
    >
      <Mountains />
      <div className="relative">
        <p className="text-[13px] font-bold opacity-75">今日の復習</p>
        <div className="mt-3 flex items-end gap-7">
          {summary.due > 0 && <Stat n={summary.due} label="復習" />}
          {summary.new > 0 && <Stat n={summary.new} label="新しい" />}
          <span className="ml-auto grid size-14 shrink-0 place-items-center rounded-full bg-white text-brand shadow-lift">
            <Play className="ml-0.5 size-6" fill="currentColor" />
          </span>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white/85" style={{ width: `${(summary.learned / summary.total) * 100}%` }} />
        </div>
        <p className="mt-1.5 text-xs font-bold opacity-75">
          {summary.learned} / {summary.total} カード
        </p>
      </div>
    </Link>
  );
}

function ContinueCard({ chapter, resumed }: { chapter: ChapterSummary; resumed: boolean }) {
  const preview = chapter.track === "script" ? chapter.preview.slice(0, 3).join(" ") : chapter.preview[0];
  return (
    <Link
      to={`/chapters/${chapter.id}`}
      className="press animate-pop flex items-center gap-4 rounded-[22px] border border-line/70 bg-surface p-4 shadow-card"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-muted">{resumed ? "前回の続き" : "はじめよう"}</p>
        <p className="mt-0.5 truncate text-[17px] font-bold">{chapter.titleJa}</p>
        {preview && (
          <p lang="ne" className="mt-1 truncate text-[22px] leading-tight font-medium text-indigo">
            {preview}
          </p>
        )}
      </div>
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
        <Play className="ml-0.5 size-5" fill="currentColor" />
      </span>
    </Link>
  );
}

function ScriptTile({ chapter, index, wide }: { chapter: ChapterSummary; index: number; wide: boolean }) {
  return (
    <Link
      to={`/chapters/${chapter.id}`}
      className={clsx(
        "press animate-pop flex flex-col rounded-[22px] border border-line/70 bg-surface p-4 shadow-card",
        wide && "col-span-2",
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <p lang="ne" className="truncate text-[30px] leading-tight font-medium text-indigo">
        {chapter.preview.slice(0, wide ? 4 : 3).join(" ") || "—"}
      </p>
      <p className="mt-3 truncate text-[15px] font-bold">{chapter.titleJa}</p>
      <p className="text-[13px] text-muted">{countLabel(chapter)}</p>
    </Link>
  );
}

function PhraseRow({ chapter }: { chapter: ChapterSummary }) {
  return (
    <Link to={`/chapters/${chapter.id}`} className="press flex items-center gap-3.5 px-4 py-3.5 active:bg-surface-2">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-soft text-indigo">
        <MessagesSquare className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-bold">{chapter.titleJa}</p>
        <p lang="ne" className="truncate text-[14px] text-muted">
          {chapter.preview[0] ?? chapter.titleNe}
        </p>
      </div>
      <span className="text-[13px] text-muted">{countLabel(chapter)}</span>
      <ChevronRight className="size-4 text-muted/70" />
    </Link>
  );
}

const today = () =>
  new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "long" }).format(new Date());

export function Home() {
  const { data: me } = useMe();
  const { data: chapters, isPending } = useChapters();
  const { data: summary } = useReviewSummary();

  const script = chapters?.filter((c) => c.track === "script") ?? [];
  const phrases = chapters?.filter((c) => c.track === "phrases") ?? [];
  const lastId = lastChapter();
  const resumed = chapters?.find((c) => c.id === lastId);
  const next = resumed ?? script[0] ?? phrases[0];

  return (
    <div className="flex flex-col gap-7">
      <header>
        <PrayerFlags />
        <p className="mt-3 text-[13px] font-bold text-muted">{today()}</p>
        <h1 className="font-display mt-1 text-[28px] leading-tight font-extrabold">
          <span lang="ne" className="font-ne mr-2 font-semibold text-brand">
            नमस्ते
          </span>
          {me?.displayName}さん
        </h1>
      </header>

      {isPending ? (
        <PageLoader />
      ) : !chapters?.length ? (
        <EmptyState icon={<BookOpen className="size-7" />} title="レッスンはまだありません">
          もうすぐ追加されます。お楽しみに！
        </EmptyState>
      ) : (
        <>
          {summary && <ReviewCard summary={summary} />}
          {next && <ContinueCard chapter={next} resumed={!!resumed} />}

          {script.length > 0 && (
            <section>
              <SectionTitle>
                文字{" "}
                <span lang="ne" className="font-medium">
                  अक्षर
                </span>
              </SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                {script.map((c, i) => (
                  // an odd last tile takes the full row instead of leaving a hole
                  <ScriptTile key={c.id} chapter={c} index={i} wide={i === script.length - 1 && i % 2 === 0} />
                ))}
              </div>
            </section>
          )}

          {phrases.length > 0 && (
            <section>
              <SectionTitle>
                会話{" "}
                <span lang="ne" className="font-medium">
                  कुराकानी
                </span>
              </SectionTitle>
              <List className="animate-pop">
                {phrases.map((c) => (
                  <PhraseRow key={c.id} chapter={c} />
                ))}
              </List>
            </section>
          )}
        </>
      )}
    </div>
  );
}

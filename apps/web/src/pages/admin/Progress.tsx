import clsx from "clsx";
import { ChartColumn } from "lucide-react";
import { useState } from "react";
import { Card, EmptyState, List, PageHeader, PageLoader, SectionTitle, Segmented } from "../../components/ui";
import type { LearnerProgress } from "../../lib/api";
import { useProgress } from "../../lib/queries";

type Day = LearnerProgress["days"][number];

/** "2026-10-28" as a local date (not UTC midnight). */
const parseDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");

function ago(iso: string | null) {
  if (!iso) return "Never";
  const then = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(then);
  day.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days <= 0) return `Today, ${then.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}`;
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[13px] font-bold text-muted">{label}</p>
      <p className="mt-1 text-[26px] leading-tight font-bold tabular-nums">{value}</p>
      {note && <p className="text-[13px] text-muted">{note}</p>}
    </Card>
  );
}

/** Answers per day; tap a bar for that day's numbers. */
function Activity({ days }: { days: Day[] }) {
  const [picked, setPicked] = useState(days.length - 1);
  const day = days[picked]!;
  const top = Math.max(10, ...days.map((d) => d.answers));
  const minutes = Math.round(day.ms / 60_000);
  return (
    <Card className="px-4 pt-3.5 pb-3">
      <p className="text-[15px]" aria-live="polite">
        <span className="font-bold">
          {parseDay(day.date).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
        </span>
        <span className="text-muted">
          {" · "}
          {day.answers
            ? `${day.answers} answers, ${percent(day.correct, day.answers)} right${minutes ? `, ${minutes} min` : ""}`
            : "no practice"}
        </span>
      </p>
      <div className="mt-4 flex h-32 items-end gap-1">
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            onClick={() => setPicked(i)}
            aria-label={`${d.date}: ${d.answers} answers`}
            aria-pressed={i === picked}
            // the whole column is the hit target, not just the bar
            className="flex h-full flex-1 items-end"
          >
            <span
              className={clsx(
                "w-full rounded-t-[4px] transition-colors",
                d.answers === 0 ? "h-0.5 bg-line" : i === picked ? "bg-ink" : "bg-ink/45",
              )}
              style={d.answers ? { height: `${Math.max(4, (d.answers / top) * 100)}%` } : undefined}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 border-t border-line pt-1.5">
        {days.map((d, i) => (
          <span
            key={d.date}
            className={clsx(
              "flex-1 text-center text-[10px] tabular-nums",
              i === picked ? "font-bold text-ink" : "text-muted",
            )}
          >
            {parseDay(d.date).getDate()}
          </span>
        ))}
      </div>
    </Card>
  );
}

function LearnerView({ p }: { p: LearnerProgress }) {
  const recent = p.days.reduce((s, d) => ({ answers: s.answers + d.answers, correct: s.correct + d.correct }), {
    answers: 0,
    correct: 0,
  });
  const activeDays = p.days.filter((d) => d.answers > 0).length;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Last practiced" value={ago(p.lastActive)} />
        <Stat label="Streak" value={p.streak} note={p.streak === 1 ? "day" : "days"} />
        <Stat label="Due now" value={p.due} note="cards waiting" />
        <Stat label="Started" value={`${p.learned}/${p.total}`} note="cards" />
      </div>

      <section>
        <SectionTitle>
          Last {p.days.length} days
          <span className="text-[15px] font-normal text-muted">
            {activeDays} active · {percent(recent.correct, recent.answers)} right
          </span>
        </SectionTitle>
        <Activity days={p.days} />
      </section>

      <section>
        <SectionTitle>Chapters</SectionTitle>
        <List>
          {p.chapters.map((c) => (
            <div key={c.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate font-bold">{c.titleJa}</p>
                <p className="shrink-0 text-[13px] text-muted tabular-nums">
                  {c.seen}/{c.total} started{c.due ? ` · ${c.due} due` : ""}
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-ok" style={{ width: `${(c.seen / c.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </List>
      </section>

      {p.mixUps.length > 0 && (
        <section>
          <SectionTitle>
            Mix-ups <span className="text-[15px] font-normal text-muted">the answer, then what she picked</span>
          </SectionTitle>
          <List>
            {p.mixUps.map((m) => (
              <div key={`${m.ne}>${m.picked}`} className="flex items-center gap-3 px-4 py-2.5">
                <span lang="ne" className="w-14 text-[28px] leading-none">
                  {m.ne}
                </span>
                <span className="text-muted">picked</span>
                <span lang="ne" className="flex-1 text-[28px] leading-none text-muted">
                  {m.picked}
                </span>
                <span className="text-[15px] font-bold tabular-nums">×{m.count}</span>
              </div>
            ))}
          </List>
        </section>
      )}

      <p className="px-1 text-[13px] text-muted">
        Counts quiz answers only ({p.answers} so far, {percent(p.correct, p.answers)} right). Listening in chapters isn't
        tracked.
      </p>
    </div>
  );
}

/** How each learner is doing in the quiz, for the admin. */
export function Progress() {
  const { data, isPending } = useProgress();
  const [id, setId] = useState<number>();
  if (isPending) return <PageLoader />;

  const learners = data ?? [];
  const current = learners.find((l) => l.id === id) ?? learners[0];
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Progress" subtitle={current?.displayName} />
      {!current ? (
        <EmptyState icon={<ChartColumn className="size-7" />} title="No learners yet">
          Add one on the server with <code>nepali-user &lt;name&gt; learner</code>.
        </EmptyState>
      ) : (
        <>
          {learners.length > 1 && (
            <div className="mb-6">
              <Segmented
                value={String(current.id)}
                onChange={(v) => setId(Number(v))}
                options={learners.map((l) => ({ value: String(l.id), label: l.displayName }))}
              />
            </div>
          )}
          <LearnerView key={current.id} p={current} />
        </>
      )}
    </div>
  );
}

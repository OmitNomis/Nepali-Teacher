import { BookOpen, ChevronRight, MessagesSquare, Sparkles } from "lucide-react";
import { Link } from "react-router";
import type { Track } from "@nt/shared";
import { Badge, Card, EmptyState, PageLoader } from "../../components/ui";
import type { ChapterSummary } from "../../lib/api";
import { useChapters, useMe } from "../../lib/queries";

const TRACKS: Record<Track, { ja: string; ne: string; icon: typeof BookOpen }> = {
  script: { ja: "文字", ne: "अक्षर", icon: BookOpen },
  phrases: { ja: "会話", ne: "कुराकानी", icon: MessagesSquare },
};

function ChapterCard({ chapter, index }: { chapter: ChapterSummary; index: number }) {
  return (
    <Link
      to={`/chapters/${chapter.id}`}
      className="press animate-pop block"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <Card className="flex items-center gap-4 p-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-indigo-soft text-lg font-extrabold text-indigo">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold">{chapter.titleJa}</p>
          {chapter.titleNe && (
            <p lang="ne" className="truncate text-sm text-muted">
              {chapter.titleNe}
            </p>
          )}
        </div>
        <Badge>{chapter.itemCount}</Badge>
        <ChevronRight className="size-5 text-muted" />
      </Card>
    </Link>
  );
}

export function Home() {
  const { data: me } = useMe();
  const { data: chapters, isPending } = useChapters();

  const byTrack = (track: Track) => chapters?.filter((c) => c.track === track) ?? [];
  const firstScript = byTrack("script")[0];

  return (
    <div className="flex flex-col gap-7">
      <header className="pt-6">
        <p lang="ne" className="text-4xl font-bold text-brand">
          नमस्ते
        </p>
        <p className="mt-1 text-2xl font-extrabold">{me?.displayName}さん、こんにちは！</p>
      </header>

      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#d4213d] to-[#1e3a8a] p-6 text-white shadow-card">
        <svg
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full opacity-25"
          viewBox="0 0 400 80"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M0 80 V50 L60 15 L100 40 L160 0 L230 50 L280 25 L340 55 L400 30 V80 Z" fill="white" />
        </svg>
        <div className="relative">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
            <Sparkles className="size-3.5" /> もうすぐ登場
          </span>
          <p className="mt-3 text-2xl font-extrabold">毎日の復習</p>
          <p className="mt-1 text-sm font-medium opacity-90">
            覚えた文字を、ちょうどいいタイミングで復習できるようになります。
          </p>
          {firstScript && (
            <Link
              to={`/chapters/${firstScript.id}`}
              className="press mt-5 inline-flex h-11 items-center gap-1 rounded-2xl bg-white px-5 font-extrabold text-[#d4213d]"
            >
              まずは文字を聞いてみる <ChevronRight className="size-4" />
            </Link>
          )}
        </div>
      </div>

      {isPending ? (
        <PageLoader />
      ) : !chapters?.length ? (
        <EmptyState icon={<BookOpen className="size-7" />} title="レッスンはまだありません">
          もうすぐ追加されます。お楽しみに！
        </EmptyState>
      ) : (
        (Object.keys(TRACKS) as Track[]).map((track) => {
          const list = byTrack(track);
          if (!list.length) return null;
          const { ja, ne, icon: Icon } = TRACKS[track];
          return (
            <section key={track} className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 px-1 text-lg font-extrabold">
                <Icon className="size-5 text-brand" /> {ja}
                <span lang="ne" className="text-sm font-medium text-muted">
                  {ne}
                </span>
              </h2>
              {list.map((c, i) => (
                <ChapterCard key={c.id} chapter={c} index={i} />
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}

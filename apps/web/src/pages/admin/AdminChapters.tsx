import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronRight, FileUp, Library, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Track } from "@nt/shared";
import { Badge, Button, Card, EmptyState, IconButton, PageHeader, PageLoader } from "../../components/ui";
import { client, unwrap, type ChapterSummary } from "../../lib/api";
import { useChapters } from "../../lib/queries";
import { ChapterSheet, ImportSheet, RecordingBadges, TRACK_OPTIONS } from "./forms";

function ChapterRow({
  chapter,
  reordering,
  onMove,
  canUp,
  canDown,
}: {
  chapter: ChapterSummary;
  reordering: boolean;
  onMove: (dir: -1 | 1) => void;
  canUp: boolean;
  canDown: boolean;
}) {
  const body = (
    <Card className={clsx("flex items-center gap-3 p-4", chapter.archived && "opacity-55")}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-extrabold">{chapter.titleJa}</p>
        {chapter.titleNe && (
          <p lang="ne" className="truncate text-sm text-muted">
            {chapter.titleNe}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>{chapter.itemCount} items</Badge>
          <RecordingBadges itemCount={chapter.itemCount} missing={chapter.missingAudio} tts={chapter.ttsAudio} />
          {chapter.archived && <Badge>Archived</Badge>}
        </div>
      </div>
      {reordering ? (
        <div className="flex flex-col">
          <IconButton label="Move up" disabled={!canUp} onClick={() => onMove(-1)}>
            <ArrowUp className="size-5" />
          </IconButton>
          <IconButton label="Move down" disabled={!canDown} onClick={() => onMove(1)}>
            <ArrowDown className="size-5" />
          </IconButton>
        </div>
      ) : (
        <ChevronRight className="size-5 text-muted" />
      )}
    </Card>
  );
  return reordering ? (
    body
  ) : (
    <Link to={`/admin/chapters/${chapter.id}`} className="press block">
      {body}
    </Link>
  );
}

export function AdminChapters() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const { data: chapters, isPending } = useChapters({ archived: showArchived });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => unwrap(client.chapters.reorder.$post({ json: { ids } })),
    onSettled: () => qc.invalidateQueries({ queryKey: ["chapters"] }),
  });

  const move = (list: ChapterSummary[], index: number, dir: -1 | 1) => {
    const ids = list.map((c) => c.id);
    [ids[index], ids[index + dir]] = [ids[index + dir]!, ids[index]!];
    // optimistic: reflect the new order immediately
    qc.setQueryData<ChapterSummary[]>(["chapters", showArchived], (old) =>
      old?.map((c) => (ids.includes(c.id) ? { ...c, position: ids.indexOf(c.id) } : c)).sort((a, b) =>
        a.track === b.track ? a.position - b.position : a.track.localeCompare(b.track),
      ),
    );
    reorder.mutate(ids);
  };

  return (
    <>
      <PageHeader
        title="Content"
        subtitle="Chapters, items and recordings"
        action={
          <div className="flex gap-1">
            <IconButton label="Import JSON" onClick={() => setImporting(true)}>
              <FileUp className="size-5" />
            </IconButton>
            <IconButton label="New chapter" className="bg-brand text-brand-ink hover:bg-brand" onClick={() => setCreating(true)}>
              <Plus className="size-5" />
            </IconButton>
          </div>
        }
      />

      <div className="mb-5 flex gap-2">
        <Button size="sm" variant={reordering ? "primary" : "secondary"} onClick={() => setReordering(!reordering)}>
          {reordering ? "Done" : "Reorder"}
        </Button>
        <Button size="sm" variant={showArchived ? "primary" : "secondary"} onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
      </div>

      {isPending ? (
        <PageLoader />
      ) : !chapters?.length ? (
        <EmptyState icon={<Library className="size-7" />} title="No chapters yet">
          <Button className="mt-2" onClick={() => setCreating(true)}>
            <Plus className="size-5" /> Create the first one
          </Button>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-7">
          {TRACK_OPTIONS.map(({ value: track, label }) => {
            const list = chapters.filter((c) => c.track === (track as Track));
            if (!list.length) return null;
            return (
              <section key={track} className="flex flex-col gap-3">
                <h2 className="px-1 text-sm font-extrabold tracking-wide text-muted uppercase">{label}</h2>
                {list.map((c, i) => (
                  <ChapterRow
                    key={c.id}
                    chapter={c}
                    reordering={reordering}
                    canUp={i > 0}
                    canDown={i < list.length - 1}
                    onMove={(dir) => move(list, i, dir)}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}

      <ChapterSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => navigate(`/admin/chapters/${id}`)}
      />
      <ImportSheet
        open={importing}
        onClose={() => setImporting(false)}
        onImported={(id) => navigate(`/admin/chapters/${id}`)}
      />
    </>
  );
}

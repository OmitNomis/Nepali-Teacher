import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronRight, FileUp, Library, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Track } from "@nt/shared";
import { Badge, Button, EmptyState, HeaderButton, IconButton, List, PageHeader, PageLoader, SectionTitle } from "../../components/ui";
import { client, unwrap, type ChapterSummary } from "../../lib/api";
import { useChapters } from "../../lib/queries";
import { ChapterSheet, ImportSheet, RecordingMeter, TRACK_OPTIONS } from "./forms";

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
    <div className={clsx("flex items-center gap-3 px-4 py-3.5", chapter.archived && "opacity-55")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-bold">{chapter.titleJa}</p>
          {chapter.titleNe && (
            <p lang="ne" className="truncate text-sm text-muted">
              {chapter.titleNe}
            </p>
          )}
          {chapter.archived && <Badge>Archived</Badge>}
        </div>
        <div className="mt-2">
          <RecordingMeter itemCount={chapter.itemCount} missing={chapter.missingAudio} tts={chapter.ttsAudio} />
        </div>
      </div>
      {reordering ? (
        <div className="-my-1 flex flex-col">
          <IconButton label="Move up" className="size-9" disabled={!canUp} onClick={() => onMove(-1)}>
            <ArrowUp className="size-5" />
          </IconButton>
          <IconButton label="Move down" className="size-9" disabled={!canDown} onClick={() => onMove(1)}>
            <ArrowDown className="size-5" />
          </IconButton>
        </div>
      ) : (
        <ChevronRight className="size-4 text-muted/70" />
      )}
    </div>
  );
  return reordering ? (
    body
  ) : (
    <Link to={`/admin/chapters/${chapter.id}`} className="block active:bg-surface-2">
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
          <>
            <HeaderButton label="Import JSON" onClick={() => setImporting(true)}>
              <FileUp className="size-[18px]" />
            </HeaderButton>
            <HeaderButton label="New chapter" tone="accent" onClick={() => setCreating(true)}>
              <Plus className="size-5" />
            </HeaderButton>
          </>
        }
      />

      <div className="mb-6 flex gap-2">
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
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          {TRACK_OPTIONS.map(({ value: track, label }) => {
            const list = chapters.filter((c) => c.track === (track as Track));
            if (!list.length) return null;
            return (
              <section key={track}>
                <SectionTitle>{label}</SectionTitle>
                <List>
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
                </List>
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

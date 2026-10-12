import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Archive, ArchiveRestore, AudioLines, Download, Eye, ListPlus, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { PlayButton, RecordButton } from "../../components/audio";
import { Badge, Button, Card, EmptyState, IconButton, LinkButton, PageHeader, PageLoader, useToast } from "../../components/ui";
import { client, unwrap, type Item } from "../../lib/api";
import { useChapter, useTtsStatus } from "../../lib/queries";
import { ChapterSheet, ItemSheet, RecordingBadges } from "./forms";

function ItemRow({ item, index, onEdit }: { item: Item; index: number; onEdit: () => void }) {
  return (
    <Card className={clsx("flex items-center gap-3 py-3 pr-3 pl-4", item.archived && "opacity-55")}>
      <button type="button" onClick={onEdit} className="press flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="w-5 shrink-0 text-right text-xs font-bold text-muted tabular-nums">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p lang="ne" className="truncate text-xl font-semibold">
            {item.ne}
          </p>
          <p className="flex items-center gap-1.5 truncate text-sm text-muted">
            {item.audioSource === "tts" && <Badge tone="indigo">TTS</Badge>}
            <span className="truncate">
              {[item.ja, item.roman].filter(Boolean).join(" · ") || <span className="italic">no translation</span>}
            </span>
          </p>
        </div>
      </button>
      {!item.archived && (
        <>
          {item.audioUrl && <PlayButton url={item.audioUrl} />}
          <RecordButton itemId={item.id} hasAudio={item.audioSource === "recording"} />
        </>
      )}
    </Card>
  );
}

export function AdminChapter() {
  const { id = "" } = useParams();
  const { data: chapter, isPending } = useChapter(id);
  const qc = useQueryClient();
  const toast = useToast();
  const [editingChapter, setEditingChapter] = useState(false);
  const [itemSheet, setItemSheet] = useState<{ item?: Item } | null>(null);

  const archive = useMutation({
    mutationFn: (archived: boolean) => unwrap(client.chapters[":id"].$patch({ param: { id }, json: { archived } })),
    onSuccess: (_, archived) => {
      void qc.invalidateQueries({ queryKey: ["chapters"] });
      void qc.invalidateQueries({ queryKey: ["chapter", id] });
      toast(archived ? "Chapter archived" : "Chapter restored");
    },
  });

  const ttsStatus = useTtsStatus();
  const generateTts = useMutation({
    mutationFn: () => unwrap(client.chapters[":id"].tts.$post({ param: { id } })),
    onSuccess: (r) => {
      toast(r.queued ? `Generating ${r.queued} clips…` : "Nothing to generate");
      // TTS runs in the background; refresh a few times to pick up results
      for (const ms of [3000, 8000, 15000, 30000]) {
        setTimeout(() => void qc.invalidateQueries({ queryKey: ["chapter", id] }), ms);
      }
    },
    onError: (e) => toast(e.message, "error"),
  });

  const exportJson = async () => {
    const data = await unwrap(client.chapters[":id"].export.$get({ param: { id } }));
    const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.chapter.titleJa || "chapter"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isPending) return <PageLoader />;
  if (!chapter) return <PageHeader back="/admin" title="Not found" />;

  const active = chapter.items.filter((i) => !i.archived);
  const archived = chapter.items.filter((i) => i.archived);
  const missing = active.filter((i) => !i.audioUrl).length;
  const tts = active.filter((i) => i.audioSource === "tts").length;
  const editing = itemSheet?.item ? chapter.items.find((i) => i.id === itemSheet.item!.id) : undefined;

  return (
    <>
      <PageHeader
        back="/admin"
        title={chapter.titleJa}
        subtitle={chapter.titleNe ? <span lang="ne">{chapter.titleNe}</span> : undefined}
        action={
          <IconButton label="Edit chapter" onClick={() => setEditingChapter(true)}>
            <Pencil className="size-5" />
          </IconButton>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="indigo">{chapter.track === "script" ? "Script" : "Phrases"}</Badge>
        <Badge>{active.length} items</Badge>
        <RecordingBadges itemCount={active.length} missing={missing} tts={tts} />
        {chapter.archived && <Badge tone="brand">Archived</Badge>}
      </div>

      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        <LinkButton to={`/chapters/${chapter.id}`} size="sm">
          <Eye className="size-4" /> Preview
        </LinkButton>
        {ttsStatus.data?.provider && missing > 0 && (
          <Button size="sm" variant="secondary" loading={generateTts.isPending} onClick={() => generateTts.mutate()}>
            <AudioLines className="size-4" /> TTS for {missing}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => void exportJson()}>
          <Download className="size-4" /> Export JSON
        </Button>
        <Button
          size="sm"
          variant={chapter.archived ? "secondary" : "danger"}
          onClick={() => archive.mutate(!chapter.archived)}
        >
          {chapter.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          {chapter.archived ? "Restore" : "Archive"}
        </Button>
      </div>

      {active.length === 0 ? (
        <EmptyState icon={<ListPlus className="size-7" />} title="No items yet">
          Add letters, words or phrases, then record them right here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {active.map((item, i) => (
            <ItemRow key={item.id} item={item} index={i} onEdit={() => setItemSheet({ item })} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer px-1 text-sm font-extrabold text-muted">
            Archived ({archived.length})
          </summary>
          <div className="mt-3 flex flex-col gap-2.5">
            {archived.map((item, i) => (
              <ItemRow key={item.id} item={item} index={i} onEdit={() => setItemSheet({ item })} />
            ))}
          </div>
        </details>
      )}

      <button
        type="button"
        aria-label="Add item"
        onClick={() => setItemSheet({})}
        className="press fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 grid size-16 place-items-center rounded-full bg-brand text-brand-ink shadow-card sm:right-[max(1.25rem,calc(50vw-20rem))]"
      >
        <Plus className="size-8" />
      </button>

      <ChapterSheet open={editingChapter} onClose={() => setEditingChapter(false)} chapter={chapter} />
      <ItemSheet open={itemSheet !== null} onClose={() => setItemSheet(null)} chapter={chapter} item={editing} />
    </>
  );
}

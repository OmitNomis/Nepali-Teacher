import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, FileUp, MicOff } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { chapterFile, type ItemKind, type Register, type Track } from "@nt/shared";
import { REGISTER_INFO, REGISTER_ORDER } from "../../lib/registers";
import { Button, Field, Segmented, Sheet, TextArea, TextInput, useToast } from "../../components/ui";
import { client, unwrap, type ChapterDetail, type Item } from "../../lib/api";

/** Bar + caption showing how much of a set of items has a real recording. */
export function RecordingMeter({ itemCount, missing, tts }: { itemCount: number; missing: number; tts: number }) {
  if (itemCount === 0) return <p className="text-xs text-muted">Empty</p>;
  const recorded = itemCount - missing - tts;
  const pct = (n: number) => `${(n / itemCount) * 100}%`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="bg-ok transition-[width] duration-500" style={{ width: pct(recorded) }} />
        <div className="bg-voice/40 transition-[width] duration-500" style={{ width: pct(tts) }} />
      </div>
      <p className="text-xs text-muted">
        {recorded === itemCount ? (
          <span className="font-bold text-ok">All {itemCount} recorded</span>
        ) : (
          <>
            <span className="font-bold text-ink">{recorded}</span> of {itemCount} recorded
            {tts > 0 && `, ${tts} TTS`}
            {missing > 0 && `, ${missing} silent`}
          </>
        )}
      </p>
    </div>
  );
}

const useInvalidateContent = () => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["chapters"] });
    void qc.invalidateQueries({ queryKey: ["chapter"] });
    void qc.invalidateQueries({ queryKey: ["missing-audio"] });
  };
};

export const TRACK_OPTIONS: { value: Track; label: string }[] = [
  { value: "script", label: "Script 文字" },
  { value: "phrases", label: "Phrases 会話" },
];

export function ChapterSheet({
  open,
  onClose,
  chapter,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  chapter?: ChapterDetail;
  onCreated?: (id: string) => void;
}) {
  const invalidate = useInvalidateContent();
  const toast = useToast();
  const [form, setForm] = useState({ titleJa: "", titleNe: "", descriptionJa: "", track: "phrases" as Track });

  useEffect(() => {
    if (open) {
      setForm(
        chapter
          ? { titleJa: chapter.titleJa, titleNe: chapter.titleNe, descriptionJa: chapter.descriptionJa, track: chapter.track }
          : { titleJa: "", titleNe: "", descriptionJa: "", track: "phrases" },
      );
    }
  }, [open, chapter]);

  const save = useMutation({
    mutationFn: async () => {
      if (chapter) {
        await unwrap(client.chapters[":id"].$patch({ param: { id: chapter.id }, json: form }));
        return chapter.id;
      }
      return (await unwrap(client.chapters.$post({ json: form }))).id;
    },
    onSuccess: (id) => {
      invalidate();
      onClose();
      if (!chapter) onCreated?.(id);
    },
    onError: (e) => toast(e.message, "error"),
  });

  return (
    <Sheet open={open} onClose={onClose} title={chapter ? "Edit chapter" : "New chapter"}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Segmented value={form.track} onChange={(track) => setForm({ ...form, track })} options={TRACK_OPTIONS} />
        <Field label="Title (Japanese)">
          {(id) => (
            <TextInput
              id={id}
              required
              placeholder="あいさつ"
              value={form.titleJa}
              onChange={(e) => setForm({ ...form, titleJa: e.target.value })}
            />
          )}
        </Field>
        <Field label="Title (Nepali)">
          {(id) => (
            <TextInput
              id={id}
              lang="ne"
              placeholder="अभिवादन"
              value={form.titleNe}
              onChange={(e) => setForm({ ...form, titleNe: e.target.value })}
            />
          )}
        </Field>
        <Field label="Description (Japanese, optional)">
          {(id) => (
            <TextArea
              id={id}
              value={form.descriptionJa}
              onChange={(e) => setForm({ ...form, descriptionJa: e.target.value })}
            />
          )}
        </Field>
        <Button type="submit" loading={save.isPending} disabled={!form.titleJa.trim()}>
          {chapter ? "Save" : "Create chapter"}
        </Button>
      </form>
    </Sheet>
  );
}

const KIND_OPTIONS: { value: ItemKind; label: string }[] = [
  { value: "letter", label: "Letter" },
  { value: "word", label: "Word" },
  { value: "phrase", label: "Phrase" },
];

const emptyItem = (kind: ItemKind, keep?: { register: Register | null; group: string }) => ({
  kind,
  ne: "",
  ja: "",
  roman: "",
  note: "",
  register: keep?.register ?? null,
  group: keep?.group ?? "",
});

const REGISTER_OPTIONS: { value: Register | "none"; label: ReactNode }[] = [
  { value: "none", label: "—" },
  ...REGISTER_ORDER.map((r) => ({ value: r, label: <span lang="ne">{REGISTER_INFO[r].pronoun}</span> })),
];

/** Create (with "save & next" for fast entry) or edit an item. */
export function ItemSheet({
  open,
  onClose,
  chapter,
  item,
}: {
  open: boolean;
  onClose: () => void;
  chapter: ChapterDetail;
  item?: Item;
}) {
  const invalidate = useInvalidateContent();
  const toast = useToast();
  const defaultKind: ItemKind = chapter.track === "script" ? "letter" : "phrase";
  const [form, setForm] = useState(emptyItem(defaultKind));
  const neRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(
        item
          ? {
              kind: item.kind,
              ne: item.ne,
              ja: item.ja,
              roman: item.roman,
              note: item.note,
              register: item.register,
              group: item.group,
            }
          : emptyItem(defaultKind),
      );
    }
  }, [open, item, defaultKind]);

  const save = useMutation({
    mutationFn: async (_next: boolean) =>
      item
        ? unwrap(client.items[":id"].$patch({ param: { id: item.id }, json: form }))
        : unwrap(client.chapters[":id"].items.$post({ param: { id: chapter.id }, json: form })),
    onSuccess: (_, next) => {
      invalidate();
      if (next) {
        toast(`Added ${form.ne}`);
        // keep the group: tiers of one phrase usually get entered back to back
        setForm(emptyItem(form.kind, { register: null, group: form.group }));
        neRef.current?.focus();
      } else {
        onClose();
      }
    },
    onError: (e) => toast(e.message, "error"),
  });

  const patch = useMutation({
    mutationFn: (json: { archived?: boolean }) =>
      unwrap(client.items[":id"].$patch({ param: { id: item!.id }, json })),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const removeAudio = useMutation({
    mutationFn: () => unwrap(client.items[":id"].audio.$delete({ param: { id: item!.id } })),
    onSuccess: () => {
      invalidate();
      toast("Recording removed");
    },
  });

  const active = chapter.items.filter((i) => !i.archived);
  const index = item ? active.findIndex((i) => i.id === item.id) : -1;
  const move = useMutation({
    mutationFn: (dir: -1 | 1) => {
      const ids = active.map((i) => i.id);
      [ids[index], ids[index + dir]] = [ids[index + dir]!, ids[index]!];
      return unwrap(client.chapters[":id"].items.reorder.$post({ param: { id: chapter.id }, json: { ids } }));
    },
    onSuccess: invalidate,
  });

  return (
    <Sheet open={open} onClose={onClose} title={item ? "Edit item" : "Add item"}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(false);
        }}
      >
        <Segmented value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={KIND_OPTIONS} />
        <Field label="Nepali">
          {(id) => (
            <TextInput
              id={id}
              ref={neRef}
              lang="ne"
              required
              autoFocus={!item}
              autoComplete="off"
              className="text-2xl"
              value={form.ne}
              onChange={(e) => setForm({ ...form, ne: e.target.value })}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Japanese">
            {(id) => (
              <TextInput id={id} value={form.ja} onChange={(e) => setForm({ ...form, ja: e.target.value })} />
            )}
          </Field>
          <Field label="Romanization">
            {(id) => (
              <TextInput
                id={id}
                autoCapitalize="none"
                autoCorrect="off"
                value={form.roman}
                onChange={(e) => setForm({ ...form, roman: e.target.value })}
              />
            )}
          </Field>
        </div>
        {form.kind !== "letter" && (
          <Field label="Politeness" hint={form.register ? `${REGISTER_INFO[form.register].admin} (${REGISTER_INFO[form.register].ja})` : "Neutral / not pronoun-specific"}>
            {() => (
              <Segmented
                value={form.register ?? "none"}
                onChange={(v) => setForm({ ...form, register: v === "none" ? null : v })}
                options={REGISTER_OPTIONS}
              />
            )}
          </Field>
        )}
        {form.kind === "letter" ? (
          <Field label="Row (optional)" hint="The consonant whose barakhari row this is, e.g. ख">
            {(id) => (
              <TextInput
                id={id}
                lang="ne"
                placeholder="ख"
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
              />
            )}
          </Field>
        ) : (
          <Field label="Variant group (optional)" hint="Same key on each tier of one phrase, e.g. ate-food">
            {(id) => (
              <TextInput
                id={id}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="ate-food"
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
              />
            )}
          </Field>
        )}
        <Field label="Note (Japanese, optional)" hint="Shown to her under the item — usage tips, nuance.">
          {(id) => <TextArea id={id} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}
        </Field>

        <div className="flex gap-3">
          {!item && (
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={!form.ne.trim() || save.isPending}
              onClick={() => save.mutate(true)}
            >
              Save & next
            </Button>
          )}
          <Button type="submit" className="flex-1" loading={save.isPending && !save.variables} disabled={!form.ne.trim()}>
            Save
          </Button>
        </div>

        {item && (
          <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-4">
            {!item.archived && (
              <>
                <Button type="button" size="sm" variant="secondary" disabled={index <= 0} onClick={() => move.mutate(-1)}>
                  <ArrowUp className="size-4" /> Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={index < 0 || index >= active.length - 1}
                  onClick={() => move.mutate(1)}
                >
                  <ArrowDown className="size-4" /> Down
                </Button>
              </>
            )}
            {item.audioUrl && (
              <Button type="button" size="sm" variant="secondary" onClick={() => removeAudio.mutate()}>
                <MicOff className="size-4" /> {item.audioSource === "tts" ? "Remove TTS" : "Remove audio"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant={item.archived ? "secondary" : "danger"}
              className="ml-auto"
              onClick={() => patch.mutate({ archived: !item.archived })}
            >
              {item.archived ? (
                <>
                  <ArchiveRestore className="size-4" /> Restore
                </>
              ) : (
                <>
                  <Archive className="size-4" /> Archive
                </>
              )}
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

const EXAMPLE = `{
  "version": 1,
  "chapter": {
    "track": "phrases",
    "titleJa": "あいさつ",
    "titleNe": "अभिवादन",
    "items": [
      { "kind": "phrase", "ne": "नमस्ते", "ja": "こんにちは", "roman": "namaste" }
    ]
  }
}`;

export function ImportSheet({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (chapterId: string) => void;
}) {
  const invalidate = useInvalidateContent();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error("That isn't valid JSON");
      }
      const parsed = chapterFile.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error(`${issue?.path.join(".") || "file"}: ${issue?.message}`);
      }
      return unwrap(client.chapters.import.$post({ json: parsed.data }));
    },
    onSuccess: (r) => {
      invalidate();
      toast(`Imported: ${r.created} new, ${r.updated} updated`);
      setText("");
      onClose();
      onImported(r.chapterId);
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Sheet open={open} onClose={onClose} title="Import chapter JSON">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Items with an <code>id</code> update in place (audio is kept). Items without one are created. Nothing is
          deleted.
        </p>
        <TextArea
          className="min-h-56 font-mono text-sm"
          placeholder={EXAMPLE}
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        <label className="press flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line font-bold text-muted">
          <FileUp className="size-5" /> Choose a .json file
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
              e.target.value = "";
            }}
          />
        </label>
        {error && <p className="rounded-2xl bg-accent-soft px-4 py-3 text-sm font-bold text-accent">{error}</p>}
        <Button onClick={() => run.mutate()} loading={run.isPending} disabled={!text.trim()}>
          Import
        </Button>
      </div>
    </Sheet>
  );
}

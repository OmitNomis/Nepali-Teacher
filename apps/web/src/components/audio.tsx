import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { LoaderCircle, Mic, Pause, RotateCcw, Square, Volume2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { uploadAudio } from "../lib/api";
import { play, stop, useNowPlaying } from "../lib/player";
import { useRecorder } from "../lib/recorder";
import { useToast } from "./ui";

export function PlayButton({
  url,
  size = "md",
  className,
}: {
  url: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const playing = useNowPlaying() === url && url !== null;
  return (
    <button
      type="button"
      aria-label={playing ? "Stop" : "Play"}
      disabled={!url}
      onClick={(e) => {
        e.stopPropagation();
        if (!url) return;
        if (playing) stop();
        else play(url);
      }}
      className={clsx(
        "press grid shrink-0 place-items-center rounded-full transition-colors disabled:opacity-30",
        playing ? "bg-voice text-surface" : "bg-voice-soft text-voice",
        size === "sm" && "size-9",
        size === "md" && "size-11",
        size === "lg" && "size-16",
        className,
      )}
    >
      {playing ? (
        <Pause className={size === "lg" ? "size-7" : "size-5"} fill="currentColor" />
      ) : (
        <Volume2 className={size === "lg" ? "size-7" : "size-5"} />
      )}
    </button>
  );
}

/** Little animated equalizer, shown on whatever is playing. */
export function EqBars({ className }: { className?: string }) {
  return (
    <span className={clsx("flex h-4 items-end gap-[3px]", className)} aria-hidden>
      {[0, 0.25, 0.5].map((delay) => (
        <span
          key={delay}
          className="animate-eq h-full w-[3px] rounded-full bg-current"
          style={{ animationDelay: `-${delay}s` }}
        />
      ))}
    </span>
  );
}

const fmt = (ms: number) => `${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}s`;

function useSaveAudio(itemId: string, onSaved?: () => void) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (blob: Blob) => uploadAudio(itemId, blob),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chapter"] });
      void qc.invalidateQueries({ queryKey: ["chapters"] });
      void qc.invalidateQueries({ queryKey: ["missing-audio"] });
      onSaved?.();
    },
    onError: (e) => toast(e.message, "error"),
  });
}

/** Compact mic button for list rows: tap to record, tap to stop, saves right away. */
export function RecordButton({ itemId, hasAudio }: { itemId: string; hasAudio: boolean }) {
  const rec = useRecorder();
  const save = useSaveAudio(itemId);
  const toast = useToast();

  useEffect(() => {
    if (rec.state === "recorded" && rec.blob) {
      save.mutate(rec.blob, { onSettled: rec.reset });
    }
    if (rec.state === "error" && rec.error) {
      toast(rec.error, "error");
      rec.reset();
    }
  }, [rec.state]);

  const recording = rec.state === "recording";
  const busy = rec.state === "starting" || save.isPending;
  return (
    <button
      type="button"
      aria-label={recording ? "Stop recording" : hasAudio ? "Re-record" : "Record"}
      onClick={(e) => {
        e.stopPropagation();
        if (recording) rec.stop();
        else if (!busy) {
          stop();
          void rec.start();
        }
      }}
      className={clsx(
        "press relative grid size-11 shrink-0 place-items-center rounded-full transition-colors",
        recording
          ? "animate-ring bg-accent text-accent-ink"
          : hasAudio
            ? "bg-surface-2 text-muted"
            : "bg-accent-soft text-accent",
      )}
    >
      {busy ? (
        <LoaderCircle className="size-5 animate-spin" />
      ) : recording ? (
        <Square className="size-4" fill="currentColor" />
      ) : (
        <Mic className="size-5" />
      )}
    </button>
  );
}

function LevelBars({ level, active }: { level: number; active: boolean }) {
  const shape = [0.45, 0.75, 1, 0.75, 0.45];
  return (
    <div className="flex h-8 items-center justify-center gap-1" aria-hidden>
      {shape.map((s, i) => (
        <span
          key={i}
          className={clsx("w-1 rounded-full transition-[height] duration-75", active ? "bg-accent" : "bg-line")}
          style={{ height: `${Math.max(14, active ? level * s * 100 : 14)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Big studio-style recorder: record → listen back → save or redo.
 * Used by the recording queue where you go through many items in a row.
 */
export function StudioRecorder({ itemId, onSaved }: { itemId: string; onSaved: () => void }) {
  const rec = useRecorder();
  const save = useSaveAudio(itemId, onSaved);
  const previewUrl = useMemo(() => (rec.blob ? URL.createObjectURL(rec.blob) : null), [rec.blob]);
  const { reset } = rec;

  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);
  // new item → fresh recorder state (the mic stream stays open)
  useEffect(() => reset(), [itemId, reset]);
  // auto-play the take so you can judge it hands-free
  useEffect(() => {
    if (previewUrl) play(previewUrl);
  }, [previewUrl]);

  const recording = rec.state === "recording";
  const recorded = rec.state === "recorded";

  return (
    <div className="flex flex-col items-center gap-3">
      {/* level meter and status share one line to keep the recorder compact */}
      <div className="flex h-8 items-center justify-center gap-3 text-sm font-bold text-muted tabular-nums">
        {recording && <LevelBars level={rec.level} active />}
        {recording ? fmt(rec.elapsed) : recorded ? "Listen back, then save" : rec.error ?? "Tap to record"}
        {recording && <LevelBars level={rec.level} active />}
      </div>

      {!recorded ? (
        <button
          type="button"
          aria-label={recording ? "Stop" : "Record"}
          onClick={() => (recording ? rec.stop() : void rec.start())}
          disabled={rec.state === "starting"}
          className={clsx(
            "press grid size-20 place-items-center rounded-full bg-accent text-accent-ink shadow-lift",
            recording && "animate-ring",
          )}
        >
          {recording ? <Square className="size-8" fill="currentColor" /> : <Mic className="size-9" />}
        </button>
      ) : (
        <div className="flex w-full items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              stop();
              rec.reset();
            }}
            className="press flex h-14 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-surface font-bold shadow-card"
          >
            <RotateCcw className="size-5" /> Redo
          </button>
          <PlayButton url={previewUrl} size="lg" />
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              stop();
              if (rec.blob) save.mutate(rec.blob);
            }}
            className="press flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-ok font-bold text-white shadow-card disabled:opacity-60"
          >
            {save.isPending ? <LoaderCircle className="size-5 animate-spin" /> : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

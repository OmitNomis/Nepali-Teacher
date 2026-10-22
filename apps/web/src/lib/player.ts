import { useSyncExternalStore } from "react";

// One shared <audio> element: tapping a new clip stops the previous one.
// Also supports a simple queue for "play all" listening.
let audio: HTMLAudioElement | null = null;
let current: string | null = null;
let queue: string[] = [];
// the whole "play all" run, for progress display
let run: { urls: string[]; index: number } | null = null;
let gapTimer: ReturnType<typeof setTimeout> | undefined;
// pause events are async; ignore the one we cause when switching clips
let switching = false;
const listeners = new Set<() => void>();

const QUEUE_GAP_MS = 900;

let runSnapshot: { urls: string[]; index: number } | null = null;
const emit = () => {
  runSnapshot = run && { ...run };
  listeners.forEach((l) => l());
};

function setCurrent(url: string | null) {
  current = url;
  emit();
}

function element() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("playing", () => (switching = false));
    audio.addEventListener("ended", () => {
      if (queue.length) {
        setCurrent(null);
        gapTimer = setTimeout(() => start(queue.shift()!), QUEUE_GAP_MS);
      } else {
        run = null;
        setCurrent(null);
      }
    });
    audio.addEventListener("pause", () => {
      if (!switching && !audio!.ended) {
        queue = [];
        run = null;
        setCurrent(null);
      }
    });
    audio.addEventListener("error", () => {
      switching = false;
      if (queue.length) start(queue.shift()!);
      else {
        run = null;
        setCurrent(null);
      }
    });
  }
  return audio;
}

function start(url: string) {
  const el = element();
  switching = true;
  el.pause();
  el.src = url;
  if (run) run.index = run.urls.length - queue.length - 1;
  setCurrent(url);
  el.play().catch(() => {
    switching = false;
    queue = [];
    run = null;
    setCurrent(null);
  });
}

export function play(url: string) {
  clearTimeout(gapTimer);
  queue = [];
  run = null;
  const el = element();
  if (current === url && !el.paused) {
    el.currentTime = 0;
    emit();
    return;
  }
  start(url);
}

/** Plays clips one after another with a short gap. */
export function playAll(urls: string[]) {
  clearTimeout(gapTimer);
  const [first, ...rest] = urls;
  if (!first) return;
  queue = rest;
  run = { urls, index: 0 };
  start(first);
}

export function stop() {
  clearTimeout(gapTimer);
  queue = [];
  run = null;
  audio?.pause();
  setCurrent(null);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** URL currently playing, or null. */
export function useNowPlaying() {
  return useSyncExternalStore(subscribe, () => current);
}

/** True while a "play all" run is in progress (including the gaps). */
export function useQueueActive() {
  return useSyncExternalStore(subscribe, () => current !== null || queue.length > 0);
}

/** The current "play all" run (all URLs and the index being played), or null. */
export function usePlayRun() {
  return useSyncExternalStore(subscribe, () => runSnapshot);
}

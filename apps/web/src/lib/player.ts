import { useSyncExternalStore } from "react";

// One shared <audio> element: tapping a new clip stops the previous one.
let audio: HTMLAudioElement | null = null;
let current: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function element() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    const reset = () => {
      current = null;
      emit();
    };
    audio.addEventListener("ended", reset);
    audio.addEventListener("pause", reset);
    audio.addEventListener("error", reset);
  }
  return audio;
}

export function play(url: string) {
  const el = element();
  if (current === url && !el.paused) {
    el.currentTime = 0;
    return;
  }
  el.pause();
  el.src = url;
  current = url;
  emit();
  el.play().catch(() => {
    current = null;
    emit();
  });
}

export function stop() {
  audio?.pause();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** URL currently playing, or null. */
export function useNowPlaying() {
  return useSyncExternalStore(subscribe, () => current);
}

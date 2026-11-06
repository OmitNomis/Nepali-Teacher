import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "starting" | "recording" | "recorded" | "error";

function pickMimeType() {
  // Safari records AAC in mp4; Chrome/Firefox prefer opus in webm
  for (const type of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/*
 * One mic for the whole app. It stays open while any recorder is mounted, so
 * recording many clips in a row doesn't re-prompt for permission on iOS, but
 * every record button (one per row on a chapter page) shares it instead of
 * opening its own stream and AudioContext. Closed when the last one unmounts.
 */
type Mic = { stream: MediaStream; ctx: AudioContext; analyser: AnalyserNode };
let mic: Mic | null = null;
let micUsers = 0;

function closeMic() {
  mic?.stream.getTracks().forEach((t) => t.stop());
  void mic?.ctx.close();
  mic = null;
}

async function openMic() {
  if (mic?.stream.active) return mic;
  closeMic();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  mic = { stream, ctx, analyser };
  return mic;
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef(0);
  const startedAt = useRef(0);

  const stopMeter = () => {
    cancelAnimationFrame(rafRef.current);
    setLevel(0);
  };

  const startMeter = (analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.fftSize);
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      setElapsed(Date.now() - startedAt.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  const start = useCallback(async () => {
    setError(null);
    setBlob(null);
    setState("starting");
    try {
      const { stream, ctx, analyser } = await openMic();
      await ctx.resume();
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stopMeter();
        const type = (rec.mimeType || mimeType || "audio/mp4").split(";")[0]!;
        setBlob(new Blob(chunks, { type }));
        setState("recorded");
      };
      recorderRef.current = rec;
      rec.start();
      startedAt.current = Date.now();
      setElapsed(0);
      setState("recording");
      startMeter(analyser);
    } catch (e) {
      stopMeter();
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission denied"
          : "Couldn't start recording",
      );
      setState("error");
    }
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const reset = useCallback(() => {
    setBlob(null);
    setError(null);
    setState("idle");
  }, []);

  useEffect(() => {
    micUsers++;
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      if (--micUsers === 0) closeMic();
    };
  }, []);

  return { state, blob, error, elapsed, level, start, stop, reset };
}

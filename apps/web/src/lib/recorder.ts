import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "starting" | "recording" | "recorded" | "error";

function pickMimeType() {
  // Safari records AAC in mp4; Chrome/Firefox prefer opus in webm
  for (const type of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/**
 * Mic recorder. The mic stream is kept open while the component is mounted so
 * recording many clips in a row doesn't re-prompt for permission on iOS.
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef(0);
  const startedAt = useRef(0);

  const stopMeter = () => {
    cancelAnimationFrame(rafRef.current);
    setLevel(0);
  };

  const startMeter = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
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

  const ensureStream = async () => {
    if (streamRef.current?.active) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    ctxRef.current = ctx;
    analyserRef.current = analyser;
    return stream;
  };

  const start = useCallback(async () => {
    setError(null);
    setBlob(null);
    setState("starting");
    try {
      const stream = await ensureStream();
      await ctxRef.current?.resume();
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
      startMeter();
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

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close();
    },
    [],
  );

  return { state, blob, error, elapsed, level, start, stop, reset };
}

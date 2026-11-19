import { GoogleGenAI, type LiveServerMessage, type Session } from "@google/genai";
import { useCallback, useEffect, useRef, useState } from "react";
import { client, unwrap } from "./api";

/**
 * A live voice call with the AI tutor (Gemini Live API). The phone streams the
 * mic as 16 kHz PCM straight to Gemini and plays its 24 kHz PCM replies; the
 * server only hands out a one-use token with the tutor's setup locked in.
 */

export type CallStatus = "idle" | "connecting" | "live" | "ended" | "error";

/** A word the tutor put on screen (show_card). */
export type TutorCard = { id: string; devanagari: string; romaji: string; japanese: string; note?: string };

export type Caption = { who: "tutor" | "me"; text: string };

/** Live loudness of each side (0–1), written to refs so the orb can animate without re-rendering. */
export type Levels = { me: number; tutor: number };

// Runs on the audio thread: downsamples the mic to 16 kHz Int16 and posts 100 ms chunks.
const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.step = sampleRate / 16000; this.pos = 0; this.out = new Int16Array(1600); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    while (this.pos < ch.length) {
      const s = Math.max(-1, Math.min(1, ch[Math.floor(this.pos)]));
      this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.out.length) { this.port.postMessage(this.out.buffer, [this.out.buffer]); this.out = new Int16Array(1600); this.n = 0; }
      this.pos += this.step;
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor("capture", Capture);
`;

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function pcm16ToFloat(b64: string) {
  const bin = atob(b64);
  const out = new Float32Array(bin.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    out[i] = (v >= 0x8000 ? v - 0x10000 : v) / 0x8000;
  }
  return out;
}

function rms(a: Float32Array | Uint8Array) {
  let sum = 0;
  if (a instanceof Uint8Array) {
    for (const v of a) sum += ((v - 128) / 128) ** 2;
  } else {
    for (const v of a) sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / a.length) * 3.2);
}

const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function useTutorCall() {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [tutorSpeaking, setTutorSpeaking] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [cards, setCards] = useState<TutorCard[]>([]);
  const [openCard, setOpenCard] = useState<TutorCard | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const levels = useRef<Levels>({ me: 0, tutor: 0 });

  const r = useRef({
    session: null as Session | null,
    ctx: null as AudioContext | null,
    stream: null as MediaStream | null,
    outGain: null as GainNode | null,
    nextAt: 0,
    playing: new Set<AudioBufferSourceNode>(),
    raf: 0,
    muted: false,
    closing: false,
  });

  const stopPlayback = useCallback(() => {
    const s = r.current;
    for (const src of s.playing) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    s.playing.clear();
    s.nextAt = 0;
  }, []);

  const teardown = useCallback(() => {
    const s = r.current;
    s.closing = true;
    cancelAnimationFrame(s.raf);
    stopPlayback();
    try {
      s.session?.close();
    } catch {
      /* socket already gone */
    }
    s.session = null;
    s.stream?.getTracks().forEach((t) => t.stop());
    s.stream = null;
    void s.ctx?.close().catch(() => {});
    s.ctx = null;
    levels.current = { me: 0, tutor: 0 };
    setTutorSpeaking(false);
  }, [stopPlayback]);

  useEffect(() => teardown, [teardown]);

  /** Appends streamed transcript text to the last caption of the same speaker. */
  const addCaption = useCallback((who: Caption["who"], text: string) => {
    setCaptions((prev) => {
      const last = prev[prev.length - 1];
      if (last?.who === who) return [...prev.slice(0, -1), { who, text: last.text + text }];
      return [...prev.slice(-8), { who, text: text.trimStart() }];
    });
  }, []);

  const play = useCallback((b64: string) => {
    const s = r.current;
    if (!s.ctx || !s.outGain) return;
    const samples = pcm16ToFloat(b64);
    const buf = s.ctx.createBuffer(1, samples.length, 24000);
    buf.copyToChannel(samples, 0);
    const src = s.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(s.outGain);
    const at = Math.max(s.ctx.currentTime + 0.02, s.nextAt);
    src.start(at);
    s.nextAt = at + buf.duration;
    s.playing.add(src);
    src.onended = () => s.playing.delete(src);
  }, []);

  const onMessage = useCallback(
    (m: LiveServerMessage) => {
      const s = r.current;
      if (m.toolCall?.functionCalls?.length) {
        const responses = m.toolCall.functionCalls.map((fc) => {
          if (fc.name === "show_card") {
            const a = fc.args ?? {};
            const card: TutorCard = {
              id: fc.id ?? crypto.randomUUID(),
              devanagari: asString(a.devanagari),
              romaji: asString(a.romaji),
              japanese: asString(a.japanese),
              note: asString(a.note) || undefined,
            };
            if (card.devanagari) {
              setCards((prev) => [...prev.filter((c) => c.devanagari !== card.devanagari), card]);
              setOpenCard(card);
            }
          }
          return { id: fc.id, name: fc.name, response: { result: "shown on her screen" } };
        });
        s.session?.sendToolResponse({ functionResponses: responses });
      }
      const sc = m.serverContent;
      if (!sc) return;
      if (sc.interrupted) stopPlayback();
      for (const part of sc.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) play(part.inlineData.data);
      }
      if (sc.inputTranscription?.text) addCaption("me", sc.inputTranscription.text);
      if (sc.outputTranscription?.text) addCaption("tutor", sc.outputTranscription.text);
    },
    [addCaption, play, stopPlayback],
  );

  const start = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setCaptions([]);
    setCards([]);
    setOpenCard(null);
    const s = r.current;
    s.closing = false;
    try {
      // Created inside the tap so iOS lets it make sound.
      const ctx = new AudioContext();
      s.ctx = ctx;
      await ctx.resume();
      const [stream, { token, model }] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        }),
        unwrap(client.call.token.$post()),
      ]);
      s.stream = stream;

      const outGain = ctx.createGain();
      const outMeter = ctx.createAnalyser();
      outMeter.fftSize = 512;
      outGain.connect(outMeter).connect(ctx.destination);
      s.outGain = outGain;

      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "text/javascript" })));
      const mic = ctx.createMediaStreamSource(stream);
      const capture = new AudioWorkletNode(ctx, "capture");
      const micMeter = ctx.createAnalyser();
      micMeter.fftSize = 512;
      mic.connect(capture);
      mic.connect(micMeter);
      capture.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (s.muted || !s.session) return;
        s.session.sendRealtimeInput({ audio: { data: toBase64(e.data), mimeType: "audio/pcm;rate=16000" } });
      };

      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
      s.session = await ai.live.connect({
        model,
        config: {},
        callbacks: {
          onmessage: onMessage,
          onerror: () => {
            if (s.closing) return;
            setError("通話が切れました");
            setStatus("error");
            teardown();
          },
          onclose: () => {
            if (s.closing) return;
            setStatus("ended");
            teardown();
          },
        },
      });
      // let the tutor speak first
      s.session.sendClientContent({
        turns: [{ role: "user", parts: [{ text: "（電話がつながりました）" }] }],
        turnComplete: true,
      });
      setStartedAt(Date.now());
      setStatus("live");

      const timeBuf = new Uint8Array(micMeter.fftSize);
      const outBuf = new Uint8Array(outMeter.fftSize);
      let speaking = false;
      const tick = () => {
        micMeter.getByteTimeDomainData(timeBuf);
        outMeter.getByteTimeDomainData(outBuf);
        const me = s.muted ? 0 : rms(timeBuf);
        const tutor = rms(outBuf);
        // ease so the orb breathes instead of flickering
        levels.current = {
          me: levels.current.me + (me - levels.current.me) * 0.3,
          tutor: levels.current.tutor + (tutor - levels.current.tutor) * 0.3,
        };
        const now = ctx.currentTime < s.nextAt;
        if (now !== speaking) {
          speaking = now;
          setTutorSpeaking(now);
        }
        s.raf = requestAnimationFrame(tick);
      };
      s.raf = requestAnimationFrame(tick);
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      setError(denied ? "マイクの使用を許可してください" : "電話をかけられませんでした");
      setStatus("error");
      teardown();
    }
  }, [onMessage, teardown]);

  const hangUp = useCallback(() => {
    teardown();
    setStatus("ended");
  }, [teardown]);

  const toggleMute = useCallback(() => {
    r.current.muted = !r.current.muted;
    setMuted(r.current.muted);
  }, []);

  /** Asks the tutor to say a card's Nepali again, slowly. */
  const askAgain = useCallback((card: TutorCard) => {
    r.current.session?.sendClientContent({
      turns: [{ role: "user", parts: [{ text: `「${card.devanagari}」をもう一度ゆっくり言ってください。` }] }],
      turnComplete: true,
    });
  }, []);

  return {
    status,
    error,
    muted,
    tutorSpeaking,
    captions,
    cards,
    openCard,
    startedAt,
    levels,
    start,
    hangUp,
    toggleMute,
    askAgain,
    showCard: setOpenCard,
  };
}

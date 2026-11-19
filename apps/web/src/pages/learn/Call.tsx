import clsx from "clsx";
import { ChevronLeft, Headphones, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Link } from "react-router";
import { TutorCardSheet } from "../../components/TutorCardSheet";
import { useTutorCall, type CallStatus, type Levels } from "../../lib/call";

/** m:ss since the pickup; stops at the hang-up. */
function useClock(since: number | null, until: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (since === null || until !== null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since, until]);
  if (since === null) return "0:00";
  const s = Math.max(0, Math.floor(((until ?? now) - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The tutor as a breathing orb: raspberry glow follows the tutor's voice,
 * the violet ring follows the learner's. Levels come from a ref and are
 * written straight to CSS variables, so nothing re-renders per frame.
 */
function Orb({ levels, status }: { levels: RefObject<Levels>; status: CallStatus }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { me, tutor } = levels.current;
      el.current?.style.setProperty("--me", me.toFixed(3));
      el.current?.style.setProperty("--tu", tutor.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levels]);

  const waiting = status === "ringing";
  const live = status === "live";
  const over = status === "ended" || status === "error";
  return (
    <div
      ref={el}
      className={clsx(
        "relative grid size-64 place-items-center transition-[transform,opacity,filter] duration-700",
        over && "scale-90 opacity-50 grayscale",
      )}
      style={{ ["--me" as string]: 0, ["--tu" as string]: 0 }}
    >
      {/* picked up: one flash outwards */}
      {live && <span className="animate-pickup-flash absolute inset-10 rounded-full bg-on-deep" />}
      {/* ringing */}
      {(waiting || status === "idle") && (
        <>
          <span className="animate-ring-out absolute inset-8 rounded-full border border-on-deep/40" />
          <span
            className="animate-ring-out absolute inset-8 rounded-full border border-on-deep/40"
            style={{ animationDelay: "0.9s" }}
          />
        </>
      )}
      {/* the tutor's voice */}
      <span
        className="absolute inset-2 rounded-full bg-accent blur-3xl transition-opacity"
        style={{
          opacity: live || waiting ? "calc(0.12 + var(--tu) * 0.9)" : 0.1,
          transform: "scale(calc(0.9 + var(--tu) * 0.5))",
        }}
      />
      <span
        className="absolute inset-7 rounded-full border-2 border-accent/60"
        style={{ transform: "scale(calc(1 + var(--tu) * 0.35))", opacity: live ? "calc(0.2 + var(--tu))" : 0 }}
      />
      {/* the learner's voice */}
      <span
        className="absolute inset-9 rounded-full border-[3px] border-voice"
        style={{ transform: "scale(calc(1 + var(--me) * 0.45))", opacity: "calc(var(--me) * 1.8)" }}
      />
      {/* core: shakes while ringing, pops on pickup */}
      <div className={clsx(waiting && "animate-phone-ring", live && "animate-pickup-pop")}>
      <div
        className="relative grid size-44 place-items-center overflow-hidden rounded-full shadow-[0_20px_60px_-15px_rgb(0_0_0/0.6)]"
        style={{ transform: "scale(calc(1 + var(--tu) * 0.07))" }}
      >
        <div
          className={clsx(
            "absolute -inset-6 bg-[conic-gradient(from_0deg,var(--accent),var(--voice),var(--deep),var(--accent))]",
            waiting ? "animate-spin [animation-duration:1.6s]" : "animate-spin-slow",
          )}
        />
        <div className="absolute inset-[3px] rounded-full bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/0.22),transparent_55%),var(--deep)]" />
        <span lang="ne" className="relative text-[84px] leading-none text-on-deep" style={{ marginTop: "0.12em" }}>
          अ
        </span>
      </div>
      </div>
    </div>
  );
}

function statusLine(status: CallStatus, clock: string, speaking: boolean, fresh: boolean) {
  if (status === "idle") return "ネパール語で話してみよう";
  if (status === "ringing") return "呼び出し中…";
  if (status === "live" && fresh) return "つながりました";
  if (status === "live") return `${speaking ? "話しています" : "聞いています"} · ${clock}`;
  if (status === "ended") return `通話終了 · ${clock}`;
  return "つながりませんでした";
}

function RoundButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        aria-label={label}
        className={clsx("press grid place-items-center rounded-full", className)}
      >
        {children}
      </button>
      <span className="text-[12px] opacity-70">{label}</span>
    </div>
  );
}

export function Call() {
  const call = useTutorCall();
  const clock = useClock(call.startedAt, call.endedAt);
  const { status } = call;
  const lastTutor = [...call.captions].reverse().find((c) => c.who === "tutor");
  const lastMe = [...call.captions].reverse().find((c) => c.who === "me");
  const inCall = status === "ringing" || status === "live";
  const fresh = call.startedAt !== null && (clock === "0:00" || clock === "0:01");

  return (
    <div className="fixed inset-0 overflow-hidden bg-deep text-on-deep">
      {/* drifting color behind everything */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="animate-drift absolute -top-1/4 -left-1/3 size-[80vmax] rounded-full bg-voice/25 blur-[90px]" />
        <div
          className="animate-drift absolute -right-1/3 -bottom-1/4 size-[70vmax] rounded-full bg-accent/20 blur-[90px]"
          style={{ animationDelay: "-7s" }}
        />
      </div>

      <div className="relative mx-auto flex h-full max-w-md flex-col px-5 pt-safe pb-safe">
        <header className="flex h-14 items-center">
          {!inCall && (
            <Link to="/" aria-label="戻る" className="press -ml-2 grid size-10 place-items-center rounded-full">
              <ChevronLeft className="size-6" />
            </Link>
          )}
        </header>

        <div className="text-center">
          <h1 className="text-[28px] font-bold">AI先生</h1>
          <p key={fresh ? "fresh" : status} className="animate-fade mt-1 text-[15px] tabular-nums opacity-75">
            {statusLine(status, clock, call.tutorSpeaking, fresh)}
          </p>
        </div>

        <div className="grid flex-1 place-items-center">
          <Orb levels={call.levels} status={status} />
        </div>

        {/* captions */}
        <div className="min-h-28 text-center" aria-live="polite">
          {status === "live" && lastTutor && (
            <p key={call.captions.length} className="animate-fade line-clamp-3 text-[17px] leading-relaxed">
              {lastTutor.text}
            </p>
          )}
          {status === "live" && lastMe && (
            <p className="mt-2 line-clamp-2 text-[14px] text-voice">あなた: {lastMe.text}</p>
          )}
          {status === "idle" && (
            <p className="mx-auto max-w-xs text-[14px] leading-relaxed opacity-75">
              <Headphones className="mr-1 inline size-4 -translate-y-px" />
              イヤホンがおすすめです。わからない言葉は「〇〇って何？」と聞くと、カードで見せてくれます。
            </p>
          )}
          {status === "error" && <p className="text-[15px] text-miss">{call.error}</p>}
          {status === "ended" && call.cards.length === 0 && (
            <p className="text-[15px] opacity-75">おつかれさまでした！</p>
          )}
        </div>

        {/* cards from this call */}
        {call.cards.length > 0 && (
          <div className="no-scrollbar -mx-5 mb-4 flex gap-2 overflow-x-auto px-5">
            {call.cards.map((c) => (
              <button
                key={c.id}
                onClick={() => call.showCard(c)}
                className="press animate-pop flex shrink-0 flex-col items-start rounded-2xl bg-on-deep/10 px-3 py-2 text-left backdrop-blur"
              >
                <span lang="ne" className="text-[20px] leading-tight">
                  {c.devanagari}
                </span>
                <span className="text-[11px] opacity-70">{c.japanese}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-start justify-center gap-10 pb-6">
          {inCall ? (
            <>
              <RoundButton
                label={call.muted ? "ミュート中" : "ミュート"}
                onClick={call.toggleMute}
                className={clsx("size-16", call.muted ? "bg-on-deep text-deep" : "bg-on-deep/15 backdrop-blur")}
              >
                {call.muted ? <MicOff className="size-7" /> : <Mic className="size-7" />}
              </RoundButton>
              <RoundButton label="終了" onClick={call.hangUp} className="size-16 bg-[#e5484d] text-white">
                <PhoneOff className="size-7" />
              </RoundButton>
            </>
          ) : (
            <RoundButton
              label={status === "idle" ? "電話をかける" : "もう一度かける"}
              onClick={() => void call.start()}
              className="animate-ring size-20 bg-ok text-white [--accent:var(--ok)]"
            >
              <Phone className="size-8" />
            </RoundButton>
          )}
        </div>
        {status === "idle" && (
          <p className="pb-3 text-center text-[11px] opacity-50">会話の音声はGoogleのAIで処理されます</p>
        )}
      </div>

      <TutorCardSheet card={call.openCard} onClose={() => call.showCard(null)} onAskAgain={(c) => {
        call.askAgain(c);
        call.showCard(null);
      }} />
    </div>
  );
}

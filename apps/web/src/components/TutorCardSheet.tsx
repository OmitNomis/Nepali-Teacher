import { Sparkles, Volume2, X } from "lucide-react";
import { useEffect } from "react";
import type { TutorCard } from "../lib/call";

// sparks that fly out once when a card lands
const SPARKS = Array.from({ length: 10 }, (_, i) => ({
  angle: `${i * 36 + (i % 2 ? 12 : 0)}deg`,
  color: ["var(--accent)", "var(--voice)", "var(--breath)"][i % 3],
  delay: `${(i % 3) * 40}ms`,
}));

/**
 * The card the tutor puts on screen mid-call: big Nepali with the karaoke
 * wipe sung through once, its romanization and the Japanese meaning, inside a
 * slowly turning holographic border. "もう一度聞く" asks the tutor to say it again.
 */
export function TutorCardSheet({
  card,
  onClose,
  onAskAgain,
}: {
  card: TutorCard | null;
  onClose: () => void;
  onAskAgain: (card: TutorCard) => void;
}) {
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);

  if (!card) return null;
  const long = card.devanagari.length > 14;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 pb-safe sm:items-center" role="dialog" aria-modal>
      <button
        aria-label="閉じる"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-[rgb(10_12_30/0.55)] backdrop-blur-md"
      />

      <div key={card.id} className="relative w-full max-w-md [perspective:900px]">
        {/* sparks behind the card */}
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center" aria-hidden>
          {SPARKS.map((s, i) => (
            <span
              key={i}
              className="animate-burst absolute size-2 rounded-full"
              style={{ background: s.color, ["--a" as string]: s.angle, animationDelay: s.delay }}
            />
          ))}
        </div>

        <div className="animate-card-rise holo-border rounded-[32px] p-[2px] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)]">
          <div className="relative overflow-hidden rounded-[30px] bg-surface px-6 pt-5 pb-6">
            {/* soft glow in the corner */}
            <div className="pointer-events-none absolute -top-24 -right-20 size-56 rounded-full bg-accent/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -left-16 size-56 rounded-full bg-voice/15 blur-3xl" />

            <div className="relative flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-voice-soft px-3 py-1 text-[12px] font-bold text-voice">
                <Sparkles className="size-3.5" />
                AI先生のカード
              </span>
              <button
                onClick={onClose}
                aria-label="閉じる"
                className="press grid size-9 place-items-center rounded-full bg-surface-2 text-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            <p
              lang="ne"
              className={`karaoke animate-wipe-once relative mt-6 text-center leading-[1.25] break-words text-ink ${
                long ? "text-[38px]" : "text-[58px]"
              }`}
            >
              <span className="animate-blur-in inline-block">{card.devanagari}</span>
            </p>
            {card.romaji && (
              <p
                className="roman animate-pop relative mt-2 text-center text-[19px] text-muted"
                style={{ animationDelay: "250ms" }}
              >
                {card.romaji}
              </p>
            )}

            <div className="relative my-5 flex items-center gap-3 text-muted/60" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="text-[13px] font-bold">意味</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <p
              className="animate-pop relative text-center text-[24px] leading-snug font-bold"
              style={{ animationDelay: "380ms" }}
            >
              {card.japanese}
            </p>
            {card.note && (
              <p
                className="animate-pop relative mt-4 rounded-2xl bg-breath-soft px-4 py-3 text-[14px] leading-relaxed text-breath"
                style={{ animationDelay: "480ms" }}
              >
                {card.note}
              </p>
            )}

            <div className="relative mt-6 grid grid-cols-[1fr_auto] gap-2">
              <button
                onClick={() => onAskAgain(card)}
                className="press flex h-[52px] items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-bold text-accent-ink"
              >
                <Volume2 className="size-5" />
                もう一度聞く
              </button>
              <button
                onClick={onClose}
                className="press h-[52px] rounded-full border border-line px-6 text-[16px] font-bold"
              >
                OK
              </button>
            </div>
            <p className="relative mt-3 text-center text-[11px] text-muted">
              AIが作ったカードです。レッスンの表記と違うことがあります。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

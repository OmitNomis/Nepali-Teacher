import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, Headphones, Sparkles, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { soundKey } from "@nt/shared";
import { EqBars, Karaoke } from "../../components/audio";
import { PronunciationGuide } from "../../components/Pronunciation";
import { Button, PageLoader, useToast } from "../../components/ui";
import { client, unwrap, type QuizItem, type SessionCard } from "../../lib/api";
import { useShowPronunciation } from "../../lib/features";
import { play, stop, useNowPlaying } from "../../lib/player";
import { useReviewSession } from "../../lib/queries";

// a missed card comes back at the end of the session, up to this many times
const MAX_RETRIES = 2;
const AUTO_NEXT_MS = 1100;

const cardKey = (c: SessionCard) => `${c.itemId}:${c.type}`;
const sameSound = (a: QuizItem, b: QuizItem) => a.id === b.id || soundKey(a.ne) === soundKey(b.ne);

/** Round speaker button; shows an equalizer while its clip plays. */
function SoundButton({ item, size = "md", className }: { item: QuizItem; size?: "md" | "xl"; className?: string }) {
  const playing = useNowPlaying() === item.audioUrl;
  return (
    <button
      type="button"
      aria-label="もう一度聞く"
      onClick={() => play(item.audioUrl)}
      className={clsx(
        "press grid shrink-0 place-items-center rounded-full transition-colors",
        size === "xl" ? "size-32 bg-accent text-accent-ink shadow-lift" : "size-11 bg-accent-soft text-accent",
        className,
      )}
    >
      {playing ? (
        <EqBars className={size === "xl" ? "h-9 [&>span]:w-2" : undefined} />
      ) : size === "xl" ? (
        <Headphones className="size-12" />
      ) : (
        <Volume2 className="size-5" />
      )}
    </button>
  );
}

function Intro({ item, onDone }: { item: QuizItem; onDone: () => void }) {
  const showPronunciation = useShowPronunciation();
  return (
    <div className="animate-pop flex flex-1 flex-col items-center text-center">
      <span className="inline-flex items-center gap-1 rounded-full bg-breath-soft px-3 py-1 text-[13px] font-bold text-breath">
        <Sparkles className="size-3.5" /> 新しい文字
      </span>
      <div className="mt-4 flex items-center gap-6">
        <Karaoke url={item.audioUrl} className="text-[96px] leading-none">
          {item.ne}
        </Karaoke>
        <div className="flex flex-col items-center gap-2">
          {item.roman && <p className="roman text-[26px] text-muted">{item.roman}</p>}
          <SoundButton item={item} />
        </div>
      </div>
      {showPronunciation && (
        <div className="mt-4 w-full text-left">
          <PronunciationGuide letter={item.ne} compact />
        </div>
      )}
      <Button size="lg" className="mt-auto w-full shrink-0" onClick={onDone}>
        覚えた
      </Button>
    </div>
  );
}

function OptionMark({ option, card, result }: { option: QuizItem; card: SessionCard; result: Result | null }) {
  if (!result) return null;
  if (sameSound(option, card.prompt)) return <Check className="absolute top-2.5 right-2.5 size-5 text-ok" />;
  if (option.id === result.chosenId) return <X className="absolute top-2.5 right-2.5 size-5 text-miss" />;
  return null;
}

const optionTone = (option: QuizItem, card: SessionCard, result: Result | null, selected: boolean) =>
  result
    ? sameSound(option, card.prompt)
      ? "border-ok bg-ok-soft"
      : option.id === result.chosenId
        ? "border-miss bg-miss-soft"
        : "border-transparent bg-surface opacity-50"
    : selected
      ? "border-ink bg-surface"
      : "border-transparent bg-surface shadow-card";

/** Hear it, pick the letter. */
function ListenQuestion({ card, result, onAnswer }: QuestionProps) {
  return (
    <div className="flex flex-1 flex-col">
      <p className="text-center text-[17px] font-bold">聞こえた文字はどれ？</p>
      <div className="flex flex-1 items-center justify-center py-6">
        <SoundButton item={card.prompt} size="xl" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {card.options.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={!!result}
            onClick={() => onAnswer(o.id)}
            className={clsx(
              "press relative flex h-32 flex-col items-center justify-center rounded-[22px] border-2 transition-colors",
              optionTone(o, card, result, false),
            )}
          >
            <span lang="ne" className="text-[56px] leading-none">
              {o.ne}
            </span>
            {result && o.roman && <span className="roman mt-2 text-[15px] text-muted">{o.roman}</span>}
            <OptionMark option={o} card={card} result={result} />
          </button>
        ))}
      </div>
      <BottomSlot />
    </div>
  );
}

/** See the letter, pick its sound: tap to listen, then confirm. */
function ReadQuestion({ card, result, onAnswer }: QuestionProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const nowPlaying = useNowPlaying();
  return (
    <div className="flex flex-1 flex-col">
      <p className="text-center text-[17px] font-bold">この文字の音はどれ？</p>
      <div className="flex flex-1 items-center justify-center py-6">
        <p lang="ne" className="text-[112px] leading-none">
          {card.prompt.ne}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {card.options.map((o) => {
          const playing = nowPlaying === o.audioUrl;
          return (
            <button
              key={o.id}
              type="button"
              aria-label={result ? o.roman || o.ne : "聞く"}
              onClick={() => {
                play(o.audioUrl);
                if (!result) setSelected(o.id);
              }}
              className={clsx(
                "press relative flex h-24 flex-col items-center justify-center gap-1.5 rounded-[22px] border-2 transition-colors",
                optionTone(o, card, result, selected === o.id),
              )}
            >
              {playing ? (
                <EqBars className="h-6 text-accent" />
              ) : (
                <Volume2 className={clsx("size-6", selected === o.id && !result ? "text-ink" : "text-accent")} />
              )}
              {result && (
                <span className="flex items-baseline gap-1.5">
                  <span lang="ne" className="text-[20px]">
                    {o.ne}
                  </span>
                  <span className="roman text-[15px] text-muted">{o.roman}</span>
                </span>
              )}
              <OptionMark option={o} card={card} result={result} />
            </button>
          );
        })}
      </div>
      <BottomSlot>
        {!result && (
          <Button size="lg" className="w-full" disabled={!selected} onClick={() => selected && onAnswer(selected)}>
            これにする
          </Button>
        )}
      </BottomSlot>
    </div>
  );
}

/** Room at the bottom that the feedback panel slides over, so it never hides the options. */
function BottomSlot({ children }: { children?: ReactNode }) {
  return <div className="flex h-36 shrink-0 items-end">{children}</div>;
}

type Result = { correct: boolean; chosenId: string };
type QuestionProps = { card: SessionCard; result: Result | null; onAnswer: (chosenId: string) => void };

function Feedback({ card, result, onNext }: { card: SessionCard; result: Result; onNext: () => void }) {
  return (
    <div
      className={clsx(
        "animate-sheet fixed inset-x-0 bottom-0 z-40 rounded-t-[28px] px-5 pt-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]",
        result.correct ? "bg-ok-soft" : "bg-miss-soft",
      )}
    >
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <div className="flex min-h-11 items-center gap-3">
          {result.correct ? (
            <p className="flex-1 text-[22px] font-bold text-ok">正解</p>
          ) : (
            <>
              <p className="text-[17px] font-bold text-miss">答えは</p>
              <Karaoke url={card.prompt.audioUrl} className="text-[34px] leading-none">
                {card.prompt.ne}
              </Karaoke>
              <span className="roman flex-1 text-[17px] text-muted">{card.prompt.roman}</span>
              <SoundButton item={card.prompt} />
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onNext}
          className={clsx(
            "press h-[52px] rounded-full text-[17px] font-bold text-white",
            result.correct ? "bg-ok" : "bg-miss",
          )}
        >
          次へ
        </button>
      </div>
    </div>
  );
}

function Finished({ right, total, back, onAgain }: { right: number; total: number; back: string; onAgain?: () => void }) {
  return (
    <div className="animate-pop flex flex-1 flex-col items-center justify-center text-center">
      <div className="grid size-20 place-items-center rounded-full bg-ok-soft text-ok">
        <Check className="size-10" />
      </div>
      <p className="mt-6 text-[28px] font-bold">おつかれさま</p>
      {total > 0 && (
        <p className="mt-2 text-[17px] text-muted">
          {total}問中 <span className="font-bold text-ink">{right}問</span>を一回で正解
        </p>
      )}
      <div className="mt-auto flex w-full flex-col gap-3">
        {onAgain && (
          <Button size="lg" onClick={onAgain}>
            もう一回
          </Button>
        )}
        <Link
          to={back}
          className="press flex h-[52px] items-center justify-center rounded-full border border-line bg-surface text-[17px] font-bold"
        >
          戻る
        </Link>
      </div>
    </div>
  );
}

/** Start screen: the letters this session covers are the headline. */
function Ready({ cards, title, onStart }: { cards: SessionCard[]; title: string; onStart: () => void }) {
  const letters = [...new Set(cards.map((c) => c.prompt.ne))];
  const fresh = new Set(cards.filter((c) => c.isNew).map((c) => c.itemId)).size;
  return (
    <div className="animate-pop flex flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-[17px] font-bold text-muted">{title}</p>
        <p lang="ne" className="mt-3 text-[52px] leading-[1.2] tracking-wide break-words">
          {letters.slice(0, 8).join(" ")}
          {letters.length > 8 && <span className="text-muted"> …</span>}
        </p>
        <p className="mt-4 text-[17px]">
          {cards.length}問{fresh > 0 && `、そのうち新しい文字が${fresh}個`}
        </p>
        <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted">
          音を聞いて文字を選んだり、文字を見て音を選んだりします。音が出る状態にしておいてください。
        </p>
      </div>
      <Button size="lg" className="w-full" onClick={onStart}>
        はじめる
      </Button>
    </div>
  );
}

export function Review() {
  const [params] = useSearchParams();
  const chapterId = params.get("chapter") ?? undefined;
  const back = chapterId ? `/chapters/${chapterId}` : "/";
  const qc = useQueryClient();
  const toast = useToast();
  const { data: session, isPending, isFetching, refetch } = useReviewSession(chapterId);

  const [queue, setQueue] = useState<SessionCard[] | null>(null);
  const [pos, setPos] = useState(0);
  const [introduced, setIntroduced] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Result | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const answered = useRef(new Set<string>());
  const retries = useRef(new Map<string, number>());
  const shownAt = useRef(Date.now());
  const autoNext = useRef<ReturnType<typeof setTimeout>>(undefined);
  // start() already played the first clip inside the tap
  const skipAutoplay = useRef(false);

  const save = useMutation({
    mutationFn: (body: { itemId: string; type: SessionCard["type"]; chosenItemId: string; durationMs: number }) =>
      unwrap(client.review.answer.$post({ json: body })),
    onError: () => toast("答えを保存できませんでした", "error"),
  });

  const card = queue?.[pos];
  const intro = !!card && card.isNew && !introduced.has(card.itemId);
  const done = !!queue && pos >= queue.length;

  // play the prompt when a listen question (or a new letter's intro) comes up
  useEffect(() => {
    if (!card) return;
    shownAt.current = Date.now();
    if (skipAutoplay.current) {
      skipAutoplay.current = false;
      return;
    }
    if (intro || card.type === "listen") play(card.prompt.audioUrl);
  }, [card, intro]);

  useEffect(() => {
    if (done) void qc.invalidateQueries({ queryKey: ["review-summary"] });
  }, [done, qc]);

  useEffect(() => () => {
    clearTimeout(autoNext.current);
    stop();
  }, []);

  const start = () => {
    if (!session) return;
    // the first play() must happen inside a tap, or iOS keeps the audio locked
    const first = session.cards[0];
    if (first && (first.isNew || first.type === "listen")) {
      play(first.prompt.audioUrl);
      skipAutoplay.current = true;
    }
    answered.current.clear();
    retries.current.clear();
    setIntroduced(new Set());
    setScore({ right: 0, total: 0 });
    setResult(null);
    setPos(0);
    setQueue(session.cards);
  };

  const next = () => {
    clearTimeout(autoNext.current);
    stop();
    setResult(null);
    setPos((p) => p + 1);
  };

  const answer = (chosenId: string) => {
    if (!card || result) return;
    const chosen = card.options.find((o) => o.id === chosenId)!;
    const correct = sameSound(chosen, card.prompt);
    setResult({ correct, chosenId });
    save.mutate({
      itemId: card.itemId,
      type: card.type,
      chosenItemId: chosenId,
      durationMs: Math.min(Date.now() - shownAt.current, 3_600_000),
    });

    const key = cardKey(card);
    if (!answered.current.has(key)) {
      answered.current.add(key);
      setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
    }
    if (correct) {
      autoNext.current = setTimeout(next, AUTO_NEXT_MS);
    } else {
      play(card.prompt.audioUrl);
      const tries = retries.current.get(key) ?? 0;
      if (tries < MAX_RETRIES) {
        retries.current.set(key, tries + 1);
        setQueue((q) => (q ? [...q, { ...card, isNew: false }] : q));
      }
    }
  };

  const progress = queue ? Math.min(pos, queue.length) / Math.max(queue.length, 1) : 0;

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
      <header className="flex items-center gap-3 py-3">
        <Link
          to={back}
          aria-label="やめる"
          className="press grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface"
        >
          <X className="size-5" />
        </Link>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
        </div>
        {queue && !done && (
          <span className="w-12 text-right text-[13px] font-bold text-muted tabular-nums">
            {pos + 1}/{queue.length}
          </span>
        )}
      </header>

      {/* after "もう一回", wait for the new session rather than offering the old one */}
      {isPending || !session || (!queue && isFetching) ? (
        <PageLoader />
      ) : !queue ? (
        session.cards.length === 0 ? (
          <div className="animate-pop flex flex-1 flex-col items-center justify-center text-center">
            <div className="grid size-20 place-items-center rounded-full bg-ok-soft text-ok">
              <Check className="size-10" />
            </div>
            <p className="mt-5 text-[22px] font-bold">今はクイズがありません</p>
            <p className="mt-2 max-w-xs text-[15px] text-muted">
              {chapterId ? "この章の音声がそろうと、クイズができるようになります。" : "今日の復習はおしまいです。次の復習は明日以降に出てきます。"}
            </p>
            <Link to={back} className="press mt-8 font-bold text-voice">
              戻る
            </Link>
          </div>
        ) : (
          <Ready
            cards={session.cards}
            title={session.mode === "practice" ? "練習" : chapterId ? "クイズ" : "今日の復習"}
            onStart={start}
          />
        )
      ) : done ? (
        <Finished
          right={score.right}
          total={score.total}
          back={back}
          onAgain={
            chapterId
              ? () => {
                  setQueue(null);
                  void refetch();
                }
              : undefined
          }
        />
      ) : card && intro ? (
        <Intro key={`intro-${pos}`} item={card.prompt} onDone={() => setIntroduced((s) => new Set(s).add(card.itemId))} />
      ) : card ? (
        <div key={pos} className="animate-pop flex flex-1 flex-col">
          {card.type === "listen" ? (
            <ListenQuestion card={card} result={result} onAnswer={answer} />
          ) : (
            <ReadQuestion card={card} result={result} onAnswer={answer} />
          )}
        </div>
      ) : null}

      {card && result && !done && <Feedback card={card} result={result} onNext={next} />}
    </div>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, Headphones, PartyPopper, Sparkles, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { soundKey } from "@nt/shared";
import { EqBars } from "../../components/audio";
import { PronunciationGuide } from "../../components/Pronunciation";
import { Button, PageLoader, useToast } from "../../components/ui";
import { client, unwrap, type QuizItem, type SessionCard } from "../../lib/api";
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
        size === "xl" ? "size-24 bg-brand text-brand-ink shadow-lift" : "size-11 bg-indigo-soft text-indigo",
        className,
      )}
    >
      {playing ? (
        <EqBars className={size === "xl" ? "h-8 [&>span]:w-1.5" : undefined} />
      ) : size === "xl" ? (
        <Headphones className="size-10" />
      ) : (
        <Volume2 className="size-5" />
      )}
    </button>
  );
}

function Intro({ item, onDone }: { item: QuizItem; onDone: () => void }) {
  return (
    <div className="animate-pop flex flex-1 flex-col items-center text-center">
      <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-gold">
        <Sparkles className="size-3.5" /> 新しい文字
      </span>
      <div className="mt-3 flex items-center gap-5">
        <p lang="ne" className="text-[88px] leading-none font-medium">
          {item.ne}
        </p>
        <div className="flex flex-col items-center gap-2">
          {item.roman && <p className="text-2xl font-bold text-muted">{item.roman}</p>}
          <SoundButton item={item} />
        </div>
      </div>
      <div className="mt-3 w-full text-left">
        <PronunciationGuide letter={item.ne} compact />
      </div>
      <Button size="lg" className="mt-auto w-full shrink-0" onClick={onDone}>
        覚えた！
      </Button>
    </div>
  );
}

function OptionState({ option, card, result }: { option: QuizItem; card: SessionCard; result: Result | null }) {
  if (!result) return null;
  if (sameSound(option, card.prompt)) return <Check className="absolute top-2 right-2 size-5 text-ok" />;
  if (option.id === result.chosenId) return <X className="absolute top-2 right-2 size-5 text-brand" />;
  return null;
}

const optionTone = (option: QuizItem, card: SessionCard, result: Result | null, selected: boolean) =>
  result
    ? sameSound(option, card.prompt)
      ? "border-ok bg-ok-soft"
      : option.id === result.chosenId
        ? "border-brand bg-brand-soft"
        : "border-line/70 bg-surface opacity-60"
    : selected
      ? "border-brand bg-surface ring-4 ring-brand/15"
      : "border-line/70 bg-surface";

/** Hear it, pick the letter. */
function ListenQuestion({ card, result, onAnswer }: QuestionProps) {
  return (
    <div className="flex flex-1 flex-col">
      <p className="text-center text-[15px] font-bold text-muted">聞こえた文字はどれ？</p>
      <div className="flex flex-1 items-center justify-center py-4">
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
              "press relative flex h-28 flex-col items-center justify-center rounded-[22px] border-2 shadow-card transition-colors",
              optionTone(o, card, result, false),
            )}
          >
            <span lang="ne" className="text-[52px] leading-none font-medium">
              {o.ne}
            </span>
            {result && o.roman && <span className="mt-2 text-[13px] font-bold text-muted">{o.roman}</span>}
            <OptionState option={o} card={card} result={result} />
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
      <p className="text-center text-[15px] font-bold text-muted">この文字の音はどれ？</p>
      <div className="flex flex-1 items-center justify-center py-4">
        <p lang="ne" className="text-[96px] leading-none font-medium">
          {card.prompt.ne}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {card.options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              play(o.audioUrl);
              if (!result) setSelected(o.id);
            }}
            className={clsx(
              "press relative flex h-[5.5rem] flex-col items-center justify-center gap-1 rounded-[22px] border-2 shadow-card transition-colors",
              optionTone(o, card, result, selected === o.id),
            )}
          >
            {nowPlaying === o.audioUrl ? (
              <EqBars className="h-6 text-brand" />
            ) : (
              <Volume2 className={clsx("size-6", selected === o.id && !result ? "text-brand" : "text-indigo")} />
            )}
            {result ? (
              <span className="text-[13px] font-bold">
                <span lang="ne" className="mr-1 text-base">
                  {o.ne}
                </span>
                {o.roman}
              </span>
            ) : (
              <span className="text-xs font-bold text-muted">{i + 1}</span>
            )}
            <OptionState option={o} card={card} result={result} />
          </button>
        ))}
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
        "animate-sheet fixed inset-x-0 bottom-0 z-40 rounded-t-[28px] px-5 pt-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-lift",
        result.correct ? "bg-ok-soft" : "bg-brand-soft",
      )}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <p className={clsx("font-display flex-1 text-[22px] font-extrabold", result.correct ? "text-ok" : "text-brand")}>
            {result.correct ? "正解！" : "ざんねん…"}
          </p>
          {!result.correct && (
            <div className="flex items-center gap-2">
              <span lang="ne" className="text-3xl font-medium">
                {card.prompt.ne}
              </span>
              <span className="text-sm font-bold text-muted">{card.prompt.roman}</span>
              <SoundButton item={card.prompt} />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onNext}
          className={clsx(
            "press h-14 rounded-full text-[17px] font-bold text-white shadow-card",
            result.correct ? "bg-ok" : "bg-brand",
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
      <div className="grid size-24 place-items-center rounded-full bg-gold-soft text-gold">
        <PartyPopper className="size-11" />
      </div>
      <p className="font-display mt-6 text-[28px] font-extrabold">おつかれさま！</p>
      {total > 0 && (
        <p className="mt-2 text-[17px] text-muted">
          {total}問中 <span className="font-bold text-ink">{right}問</span> 一回で正解
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
          className="press flex h-14 items-center justify-center rounded-full border border-line bg-surface text-[17px] font-bold shadow-card"
        >
          戻る
        </Link>
      </div>
    </div>
  );
}

export function Review() {
  const [params] = useSearchParams();
  const chapterId = params.get("chapter") ?? undefined;
  const back = chapterId ? `/chapters/${chapterId}` : "/";
  const qc = useQueryClient();
  const toast = useToast();
  const { data: session, isPending, refetch } = useReviewSession(chapterId);

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
    <div className="pt-safe mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
      <header className="flex items-center gap-3 py-3">
        <Link
          to={back}
          aria-label="やめる"
          className="press grid size-10 shrink-0 place-items-center rounded-full border border-line/70 bg-surface shadow-card"
        >
          <X className="size-5" />
        </Link>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
        </div>
        {queue && !done && (
          <span className="w-12 text-right text-[13px] font-bold text-muted tabular-nums">
            {pos + 1}/{queue.length}
          </span>
        )}
      </header>

      {isPending || !session ? (
        <PageLoader />
      ) : !queue ? (
        session.cards.length === 0 ? (
          <div className="animate-pop flex flex-1 flex-col items-center justify-center text-center">
            <div className="grid size-20 place-items-center rounded-full bg-ok-soft text-ok">
              <Check className="size-10" />
            </div>
            <p className="font-display mt-5 text-2xl font-extrabold">今はクイズがありません</p>
            <p className="mt-2 text-muted">
              {chapterId ? "この章の音声がまだ準備中かもしれません。" : "今日の復習はおしまい！また明日。"}
            </p>
            <Link to={back} className="press mt-8 font-bold text-brand">
              戻る
            </Link>
          </div>
        ) : (
          <div className="animate-pop flex flex-1 flex-col items-center justify-center text-center">
            <div className="grid size-24 place-items-center rounded-full bg-brand-soft text-brand">
              <Headphones className="size-11" />
            </div>
            <p className="font-display mt-6 text-[28px] font-extrabold">
              {session.mode === "practice" ? "練習しよう" : chapterId ? "クイズ" : "今日の復習"}
            </p>
            <p className="mt-2 text-[17px] text-muted">
              {session.cards.length}問
              {session.cards.some((c) => c.isNew) && ` · 新しい文字 ${new Set(session.cards.filter((c) => c.isNew).map((c) => c.itemId)).size}個`}
            </p>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted">
              音を聞いて文字を選んだり、文字を見て音を選んだりします。音が出るようにしてね🔈
            </p>
            <Button size="lg" className="mt-auto w-full" onClick={start}>
              はじめる
            </Button>
          </div>
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

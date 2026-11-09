import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import {
  CONSONANTS,
  pronunciation,
  type ConsonantSound,
  type Manner,
  type Place,
  type Sound,
  type VowelSound,
} from "@nt/shared";
import { play, useNowPlaying } from "../lib/player";
import { EqBars, Karaoke, PlayButton } from "./audio";
import { MouthDiagram } from "./MouthDiagram";
import { PRONUNCIATION_FOR_LEARNERS } from "../lib/features";
import { Badge, Sheet } from "./ui";

const PLACE: Record<Place, string> = {
  lips: "上下の唇で",
  teeth: "舌先を上の前歯の裏に",
  ridge: "舌先を歯ぐきに",
  retroflex: "舌先を少し反らせて、歯ぐきの後ろに",
  palate: "舌の真ん中を上あごに",
  velum: "舌の奥を上あごの奥に",
  glottis: "のどの奥から",
};

const MANNER: Record<Manner, string> = {
  stop: "ふさいで、パッと離す",
  nasal: "鼻から声を出す",
  affricate: "つけて、こすりながら離す",
  fricative: "すき間から息をこする",
  tap: "一回だけはじく",
  lateral: "舌の横から声を出す",
  approximant: "近づけるだけ",
};

type Tone = "accent" | "breath" | "voice" | "muted";

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "breath" && "bg-breath-soft text-breath",
        tone === "voice" && "bg-voice-soft text-voice",
        tone === "muted" && "bg-surface-2 text-muted",
      )}
    >
      {children}
    </span>
  );
}

function ConsonantChips({ sound }: { sound: ConsonantSound }) {
  return (
    <>
      <Chip tone="accent">{PLACE[sound.place]}</Chip>
      <Chip tone="muted">{MANNER[sound.manner]}</Chip>
      {/* breath only tells stops apart (क / ख); for स or ह "no breath" would be wrong */}
      {(sound.manner === "stop" || sound.manner === "affricate") &&
        (sound.aspirated ? <Chip tone="breath">息を強く出す</Chip> : <Chip tone="muted">息は出さない</Chip>)}
      {sound.voiced ? <Chip tone="voice">声あり（のどが震える）</Chip> : <Chip tone="muted">声なし</Chip>}
    </>
  );
}

function VowelChips({ sound }: { sound: VowelSound }) {
  const { height, back, round } = sound.shape;
  return (
    <>
      <Chip tone="accent">
        {height === "high"
          ? "口は狭く"
          : height === "mid"
            ? "口は中くらい"
            : height === "open-mid"
              ? "口はやや広め"
              : "口を大きく開ける"}
      </Chip>
      <Chip tone="muted">{back === "front" ? "舌は前" : back === "back" ? "舌は奥" : "舌は真ん中"}</Chip>
      {round && <Chip tone="muted">唇を丸める</Chip>}
      {back === "back" && !round && <Chip tone="muted">唇は丸めない</Chip>}
      {sound.nasal && <Chip tone="breath">鼻に響かせる</Chip>}
      {sound.breath && <Chip tone="breath">最後に息を吐く</Chip>}
    </>
  );
}

const chips = (sound: Sound) =>
  sound.kind === "consonant" ? <ConsonantChips sound={sound} /> : <VowelChips sound={sound} />;

/**
 * The four letters of a row side by side: breath across, voice down.
 * Hearing them next to each other is what makes क / ख / ग / घ click.
 */
function BreathVoiceGrid({
  sound,
  letter,
  audioFor,
}: {
  sound: ConsonantSound;
  letter: string;
  audioFor: (ne: string) => string | null;
}) {
  const nowPlaying = useNowPlaying();
  const row = Object.entries(CONSONANTS).filter(
    ([, s]) => s.place === sound.place && s.manner === sound.manner,
  );
  const cell = (voiced: boolean, aspirated: boolean) =>
    row.find(([, s]) => s.voiced === voiced && s.aspirated === aspirated)?.[0];
  const letters = [cell(false, false), cell(false, true), cell(true, false), cell(true, true)];
  if (letters.some((l) => !l) || letters.filter((l) => audioFor(l!)).length < 2) return null;

  return (
    <div className="rounded-[22px] bg-surface-2 p-3">
      <p className="mb-2 px-1 text-[13px] font-bold text-muted">聞きくらべ</p>
      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 text-center">
        <span />
        <span className="text-xs font-bold text-muted">息なし</span>
        <span className="text-xs font-bold text-breath">息あり</span>
        {[false, true].map((voiced) => (
          <div key={String(voiced)} className="contents">
            <span className={clsx("w-12 text-xs font-bold", voiced ? "text-voice" : "text-muted")}>
              {voiced ? "声あり" : "声なし"}
            </span>
            {[false, true].map((aspirated) => {
              const l = cell(voiced, aspirated)!;
              const url = audioFor(l);
              const playing = url !== null && nowPlaying === url;
              return (
                <button
                  key={l}
                  type="button"
                  disabled={!url}
                  onClick={() => url && play(url)}
                  className={clsx(
                    "press relative flex h-16 items-center justify-center rounded-2xl border-2 bg-surface transition-colors disabled:opacity-40",
                    l === letter ? "border-ink" : "border-transparent",
                  )}
                >
                  <Karaoke url={url} className="text-[34px] leading-none">
                    {l}
                  </Karaoke>
                  {playing && <EqBars className="absolute top-2 right-2 h-3 text-accent" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * How to say a letter: mouth diagram(s), what to do, a tip in Japanese, and
 * for consonant rows a breath × voice comparison.
 */
export function PronunciationGuide({
  letter,
  audioFor,
  compact = false,
}: {
  letter: string;
  audioFor?: (ne: string) => string | null;
  compact?: boolean;
}) {
  const p = pronunciation(letter);
  if (!p) return null;
  // a bare consonant's inherent "a" isn't worth a second picture
  const steps = p.steps.filter((s, i) => !(i > 0 && s.letter === "अ"));
  const main = steps[0]!.sound;

  return (
    <div className="flex flex-col gap-4">
      {steps.length === 1 ? (
        <MouthDiagram sound={main} className={clsx("mx-auto w-full", compact ? "max-w-[200px]" : "max-w-[240px]")} />
      ) : (
        <div className="flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={i} className="contents">
              {i > 0 && <ArrowRight className="size-5 shrink-0 text-muted" />}
              <div className="min-w-0 flex-1 text-center">
                <MouthDiagram sound={s.sound} className="w-full" />
                <span lang="ne" className="text-xl">
                  {s.letter}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {!compact && <div className="flex flex-wrap justify-center gap-1.5">{chips(main)}</div>}
      <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[15px] leading-relaxed">{p.tip}</p>
      {steps.length > 1 && steps[1]!.sound.kind === "vowel" && steps[0]!.sound.kind === "consonant" && (
        <p className="-mt-2 px-1 text-[13px] leading-relaxed text-muted">
          <span lang="ne" className="font-bold text-ink">
            {steps[1]!.letter}
          </span>
          ：{steps[1]!.sound.tip}
        </p>
      )}
      {!compact && main.kind === "consonant" && audioFor && (
        <BreathVoiceGrid sound={main} letter={steps[0]!.letter} audioFor={audioFor} />
      )}
    </div>
  );
}

export function PronunciationSheet({
  item,
  audioFor,
  onClose,
}: {
  item: { ne: string; roman: string; audioUrl: string | null } | null;
  audioFor: (ne: string) => string | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          発音のしかた
          {/* only admins get here while the guides are being checked */}
          {!PRONUNCIATION_FOR_LEARNERS && <Badge tone="breath">Hidden from learner</Badge>}
        </span>
      }
    >
      {item && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-center gap-4">
            <Karaoke url={item.audioUrl} className="text-[64px] leading-none">
              {item.ne}
            </Karaoke>
            {item.roman && <span className="roman text-[24px] text-muted">{item.roman}</span>}
            <PlayButton url={item.audioUrl} />
          </div>
          <PronunciationGuide letter={item.ne} audioFor={audioFor} />
        </div>
      )}
    </Sheet>
  );
}

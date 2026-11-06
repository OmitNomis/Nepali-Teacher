import clsx from "clsx";
import { useId } from "react";
import type { ConsonantSound, Place, Sound, VowelShape } from "@nt/shared";

// A cutaway of the head, facing left (lips on the left). The tongue, lips,
// jaw and soft palate move to fit each sound; gold marks air, violet marks
// voice, and the raspberry dot is where the tongue or lips touch.

type Pt = [number, number];

/** Smooth curve through points (Catmull-Rom as cubic Béziers). */
function smooth(pts: Pt[], { closed = false, move = true } = {}) {
  const n = pts.length;
  const at = (i: number) => (closed ? pts[(i + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  let d = move ? `M${pts[0]![0]} ${pts[0]![1]}` : "";
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return closed ? `${d} Z` : d;
}

/** y of a polyline at x (for routing the airflow between tongue and roof). */
function yAt(pts: Pt[], x: number) {
  const sorted = [...pts].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < sorted.length - 1; i++) {
    const [a, b] = [sorted[i]!, sorted[i + 1]!];
    if (x >= a[0] && x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
  }
  return sorted[x < sorted[0]![0] ? 0 : sorted.length - 1]![1];
}

// ---- anatomy -----------------------------------------------------------

const ROOF: Pt[] = [[48, 58], [53, 56], [58, 53], [72, 46], [100, 42], [130, 45]];
const PALATE_TOP: Pt[] = [[42, 52], [70, 42], [100, 38], [130, 40]];
const NASAL_TOP: Pt[] = [[26, 43], [34, 32], [60, 22], [100, 17], [140, 19], [160, 27], [166, 38]];
const BACK_WALL: Pt[] = [[160, 22], [167, 40], [170, 80], [170, 140], [168, 205]];

const upperFace = (r: number): Pt[] => [
  [36, 6], [27, 20], [14, 31], [16, 39], [26, 43], [27, 49], [20 - r, 60], [21 - r, 70], [25 - r, 73], [37, 73],
];
/** lower lip, chin and neck; `jaw` px moves the lip most and the neck not at all */
const lowerFace = (jaw: number, r: number): Pt[] => {
  const pts: [number, number, number][] = [
    [37, 77, 1], [25 - r, 76, 1], [19 - r, 82, 1], [21 - r, 90, 1], [28, 96, 0.95], [27, 108, 0.9],
    [27, 120, 0.85], [38, 132, 0.7], [62, 138, 0.5], [100, 141, 0.25], [124, 147, 0.1], [132, 162, 0], [134, 205, 0],
  ];
  return pts.map(([x, y, w]) => [x, y + jaw * w]);
};
const UPPER_TOOTH = "M41 57 C38 63 37 69 37 74 L42 75 C44 69 45 63 47 58 Z";
const lowerTooth = (jaw: number) =>
  `M38 ${79 + jaw} L42 ${78 + jaw} C44 ${84 + jaw} 45 ${90 + jaw} 47 ${96 + jaw * 0.9} L43 ${97 + jaw * 0.9} C41 ${91 + jaw} 39 ${85 + jaw} 38 ${79 + jaw} Z`;

// ---- tongue ------------------------------------------------------------

// top surface, tip → root; the underside follows the floor of the mouth
const REST: Pt[] = [[44, 82], [54, 72], [78, 62], [108, 58], [136, 64], [150, 96]];
const TONGUE: Record<Place, Pt[]> = {
  lips: REST,
  glottis: REST,
  teeth: [[41, 73], [49, 68], [76, 63], [106, 59], [136, 64], [150, 96]],
  ridge: [[50, 59], [57, 62], [80, 63], [108, 59], [136, 64], [150, 96]],
  // tip curled up and back to the roof behind the ridge
  retroflex: [[46, 84], [51, 70], [63, 52], [70, 57], [84, 64], [108, 59], [136, 64], [150, 96]],
  palate: [[46, 82], [54, 72], [72, 54], [90, 45], [120, 50], [150, 94]],
  velum: [[46, 82], [56, 74], [80, 66], [110, 55], [134, 47], [150, 88]],
};
const floor = (jaw: number): Pt[] => [
  [152, 130], [120, 128 + jaw * 0.2], [86, 116 + jaw * 0.5], [56, 102 + jaw * 0.8], [45, 92 + jaw],
];

function vowelTongue({ height, back }: VowelShape): Pt[] {
  if (height === "low") return [[47, 89], [58, 84], [82, 78], [110, 73], [136, 74], [150, 98]];
  const high: Pt[] =
    back === "front"
      ? [[45, 82], [54, 70], [76, 53], [102, 50], [132, 60], [150, 94]]
      : back === "back"
        ? [[46, 85], [58, 79], [82, 70], [110, 56], [134, 48], [150, 90]]
        : [[46, 84], [56, 76], [80, 68], [108, 64], [136, 68], [150, 96]];
  const drop = height === "open-mid" ? 13 : height === "mid" && back !== "central" ? 6 : 0;
  return high.map(([x, y], i) => [x, i === high.length - 1 ? y : y + drop]);
}

/** Lowers the tongue a little where it only comes close (fricatives, य). */
const near = (pts: Pt[]): Pt[] => pts.map(([x, y], i) => [x, i === pts.length - 1 ? y : y + 3]);

const CONTACT: Record<Place, Pt> = {
  lips: [23, 75],
  teeth: [41, 72],
  ridge: [51, 58],
  retroflex: [64, 51],
  palate: [90, 44],
  velum: [135, 47],
  glottis: [162, 172],
};

const touches = (s: ConsonantSound) => !["fricative", "approximant"].includes(s.manner);

type Pose = {
  tongue: Pt[];
  ghost?: Pt[];
  jaw: number;
  round: boolean;
  nasal: boolean;
  voiced: boolean;
  puff: boolean;
  contact?: { at: Pt; firm: boolean };
  oralAir: boolean;
  /** र: the tongue tip flicks the ridge once */
  flick: boolean;
};

function poseFor(sound: Sound): Pose {
  if (sound.kind === "vowel") {
    const { height, back, round } = sound.shape;
    return {
      tongue: vowelTongue(sound.shape),
      ghost: sound.to && vowelTongue(sound.to),
      jaw: height === "low" ? 9 : height === "open-mid" ? 6 : height === "mid" ? (back === "central" ? 5 : 4) : 1,
      round,
      nasal: !!sound.nasal,
      voiced: true,
      puff: !!sound.breath,
      oralAir: true,
      flick: false,
    };
  }
  const closesLips = sound.place === "lips" && sound.manner !== "approximant";
  const firm = touches(sound);
  return {
    tongue: firm ? TONGUE[sound.place] : near(TONGUE[sound.place]),
    jaw: closesLips ? -3.5 : 0,
    round: sound.place === "lips" && sound.manner === "approximant",
    nasal: sound.manner === "nasal",
    voiced: sound.voiced,
    puff: sound.aspirated,
    contact: { at: CONTACT[sound.place], firm },
    // ल keeps the tip on the ridge but lets air out past the sides of the tongue
    oralAir: !firm || sound.manner === "lateral",
    flick: sound.manner === "tap",
  };
}

/** Airflow from the throat out of the mouth, threaded between tongue and roof. */
function oralAirPath(tongue: Pt[]) {
  const mid = [126, 100, 76, 56].map((x): Pt => [x, (yAt(ROOF, x) + yAt(tongue.slice(1), x)) / 2]);
  return smooth([[161, 150], [160, 104], [152, 66], ...mid, [30, 74.5], [8, 74.5]]);
}

export function MouthDiagram({ sound, className }: { sound: Sound; className?: string }) {
  const id = useId().replace(/:/g, "");
  const pose = poseFor(sound);
  const r = pose.round ? 4 : 0;
  const under = floor(pose.jaw);
  const tongue = smooth([...pose.tongue, ...under], { closed: true });
  // the tongue grows out of the floor of the mouth: outline only what's visible
  const tongueEdge = smooth([under[under.length - 1]!, ...pose.tongue, under[0]!]);
  const ghost = pose.ghost && smooth(pose.ghost);
  const line = "var(--muted)";
  const label = "fill-muted text-[9px] font-bold";

  return (
    <svg viewBox="-12 6 194 200" className={clsx("block", className)} role="img" aria-hidden>
      <defs>
        <marker id={`air-${id}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 1 L9 5 L0 9 Z" fill="var(--breath)" />
        </marker>
        <marker id={`flick-${id}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 1 L9 5 L0 9 Z" fill="var(--accent)" />
        </marker>
      </defs>

      {/* nasal cavity */}
      <path
        d={`${smooth(NASAL_TOP)} L130 40 ${smooth([...PALATE_TOP].reverse(), { move: false })} Z`}
        fill="var(--surface-2)"
      />
      <path d={smooth(upperFace(r))} fill="none" stroke={line} strokeWidth={1.6} strokeLinecap="round" />
      <path d={smooth(BACK_WALL)} fill="none" stroke={line} strokeWidth={1.4} />
      {/* hard palate (bone) */}
      <path
        d={`${smooth(PALATE_TOP)} L130 45 ${smooth([...ROOF].reverse(), { move: false })} Z`}
        fill="var(--line)"
        stroke={line}
        strokeWidth={1}
      />
      {/* soft palate: raised shuts the nose off, lowered lets air through */}
      <path
        d={pose.nasal ? "M129 43 Q148 47 152 70" : "M129 43 Q149 41 166 36"}
        fill="none"
        stroke="var(--line)"
        strokeWidth={7}
        strokeLinecap="round"
      />
      {/* larynx and epiglottis */}
      <path d="M152 132 C146 126 145 118 149 110" fill="none" stroke={line} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M152 132 L154 166 L154 205" fill="none" stroke={line} strokeWidth={1.4} />

      {ghost && <path d={ghost} fill="none" stroke="var(--accent)" strokeWidth={1.3} strokeDasharray="3 2.5" />}
      <path d={tongue} fill="var(--accent-soft)" />
      <path d={tongueEdge} fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinejoin="round" />

      <path d={lowerTooth(pose.jaw)} fill="var(--surface)" stroke={line} strokeWidth={1} />
      <path d={UPPER_TOOTH} fill="var(--surface)" stroke={line} strokeWidth={1} />
      <path d={smooth(lowerFace(pose.jaw, r))} fill="none" stroke={line} strokeWidth={1.6} strokeLinecap="round" />

      <text x={96} y={32} textAnchor="middle" className={label}>
        鼻
      </text>
      <text x={100} y={100} textAnchor="middle" className="fill-accent text-[9px] font-bold">
        舌
      </text>
      <text x={144} y={190} textAnchor="middle" className={label}>
        のど
      </text>

      {pose.nasal && (
        <path
          d={smooth([[155, 104], [158, 62], [154, 36], [120, 24], [70, 26], [36, 38], [12, 46]])}
          fill="none"
          stroke="var(--breath)"
          strokeWidth={1.8}
          strokeDasharray="4 3"
          markerEnd={`url(#air-${id})`}
        />
      )}
      {pose.oralAir && (
        <path
          d={oralAirPath(pose.tongue)}
          fill="none"
          stroke="var(--breath)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          markerEnd={`url(#air-${id})`}
        />
      )}

      {/* vocal folds; when voiced the throat buzzes */}
      <path d="M154 172 L160 172 M170 172 L164 172" stroke={line} strokeWidth={2.2} strokeLinecap="round" />
      {pose.voiced && (
        <g stroke="var(--voice)" strokeWidth={1.6} fill="none" strokeLinecap="round" className="animate-buzz">
          <path d="M124 160 q-3 4 0 8 q3 4 0 8 q-3 4 0 8" />
          <path d="M117 157 q-4 5.5 0 11 q4 5.5 0 11 q-4 5.5 0 11" opacity={0.55} />
        </g>
      )}

      {pose.flick && (
        <path
          d="M64 70 C62 62 58 58 54 54"
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.6}
          strokeLinecap="round"
          markerEnd={`url(#flick-${id})`}
        />
      )}
      {pose.contact && (
        <g>
          {pose.contact.firm && (
            <circle cx={pose.contact.at[0]} cy={pose.contact.at[1]} r={4.5} fill="var(--accent)" className="animate-contact" />
          )}
          <circle
            cx={pose.contact.at[0]}
            cy={pose.contact.at[1]}
            r={pose.contact.firm ? 3.2 : 4.5}
            fill={pose.contact.firm ? "var(--accent)" : "none"}
            stroke="var(--accent)"
            strokeWidth={1.4}
            strokeDasharray={pose.contact.firm ? undefined : "2 2"}
          />
        </g>
      )}

      {/* a puff of breath out of the mouth */}
      {pose.puff && (
        <g stroke="var(--breath)" strokeWidth={2.6} fill="none" strokeLinecap="round">
          <path d="M14 66 q-6 9 0 18" className="animate-puff" />
          <path d="M6 62 q-7.5 13 0 26" className="animate-puff [animation-delay:150ms]" />
          <path d="M-3 58 q-9 17 0 34" className="animate-puff [animation-delay:300ms]" />
        </g>
      )}
    </svg>
  );
}

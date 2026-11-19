/**
 * Phone sounds for tutor calls, synthesized so there's nothing to download.
 * They follow Japanese phones: the ringback (呼び出し音) is a 400 Hz tone
 * warbled at 16 Hz, one second on and two off; the busy tone after a hang-up
 * is 400 Hz, half a second on and off.
 */

const RING_LEVEL = 0.11;

/** Starts the ringback; returns a function that stops it. */
export function ringback(ctx: AudioContext, out: AudioNode) {
  const env = ctx.createGain();
  env.gain.value = 0;
  env.connect(out);
  const am = ctx.createGain();
  am.gain.value = 0.5;
  am.connect(env);
  const tone = ctx.createOscillator();
  tone.frequency.value = 400;
  tone.connect(am);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 16;
  const depth = ctx.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(am.gain);

  const t0 = ctx.currentTime + 0.05;
  for (let i = 0; i < 12; i++) {
    const t = t0 + i * 3;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(RING_LEVEL, t + 0.02);
    env.gain.setValueAtTime(RING_LEVEL, t + 1);
    env.gain.linearRampToValueAtTime(0, t + 1.03);
  }
  tone.start(t0);
  lfo.start(t0);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    env.gain.cancelScheduledValues(t);
    env.gain.setTargetAtTime(0, t, 0.015);
    tone.stop(t + 0.15);
    lfo.stop(t + 0.15);
  };
}

function beep(ctx: AudioContext, out: AudioNode, freq: number, at: number, length: number, level: number) {
  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + 0.01);
  g.gain.setValueAtTime(level, at + length - 0.02);
  g.gain.linearRampToValueAtTime(0, at + length);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** A soft rising two-note blip: the other side picked up. */
export function pickupBlip(ctx: AudioContext, out: AudioNode, at = ctx.currentTime) {
  beep(ctx, out, 660, at, 0.07, 0.07);
  beep(ctx, out, 990, at + 0.08, 0.1, 0.07);
}

/** プー、プー、プー after a hang-up; returns how long it lasts in seconds. */
export function hangupTone(ctx: AudioContext, out: AudioNode) {
  const at = ctx.currentTime + 0.15;
  for (let i = 0; i < 3; i++) beep(ctx, out, 400, at + i, 0.5, 0.09);
  return 2.8;
}

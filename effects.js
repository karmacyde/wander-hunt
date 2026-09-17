/*
 * effects.js — the two small moments of delight.
 *
 *   • A quiet night sky (twinkling stars and a few drifting fireflies)
 *     for the Torchlight completion screen.
 *   • A soft two-note chime, synthesised with WebAudio so there is no
 *     audio file to cache. Only plays when sound is switched on.
 */

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fill `layer` with stars and fireflies. Safe to call repeatedly. */
export function startNightSky(layer) {
  if (!layer) return;
  layer.replaceChildren();
  const stars = 28;
  const fireflies = reduceMotion() ? 0 : 7;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < stars; i += 1) {
    const s = document.createElement("i");
    s.className = "star";
    const size = 1.5 + Math.random() * 2;
    s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 70}%;width:${size}px;height:${size}px;animation-delay:${-Math.random() * 6}s;animation-duration:${3 + Math.random() * 4}s`;
    frag.appendChild(s);
  }
  for (let i = 0; i < fireflies; i += 1) {
    const f = document.createElement("i");
    f.className = "firefly";
    f.style.cssText = `left:${10 + Math.random() * 80}%;top:${30 + Math.random() * 60}%;animation-delay:${-Math.random() * 12}s;animation-duration:${9 + Math.random() * 8}s`;
    frag.appendChild(f);
  }
  layer.appendChild(frag);
}

export function stopNightSky(layer) {
  if (layer) layer.replaceChildren();
}

/* -------------------------------------------------------------- sound */

let audioCtx = null;

function getContext() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    audioCtx = new Ctx();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

function tone(ctx, freq, start, duration, gainPeak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** A short, soft "found it" tick. */
export function playTick() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const t = ctx.currentTime;
  tone(ctx, 660, t, 0.18, 0.12);
}

/** A gentle two-note completion chime. */
export function playChime() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const t = ctx.currentTime;
  tone(ctx, 523.25, t, 0.9, 0.16); // C5
  tone(ctx, 783.99, t + 0.22, 1.2, 0.14); // G5
  tone(ctx, 1046.5, t + 0.5, 1.6, 0.08); // C6
}

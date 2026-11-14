/* global window, document, requestAnimationFrame -- the page.evaluate callbacks run inside the page */
// Motion lab: run one interaction and measure what actually moved, how long, on which curve, on which properties,
// at what frame rate, and from where. Ported from the October audit kit (~/clubhouse-audit/harness), where every rule
// is calibrated by harness/selftest.mjs, including negative controls that must FAIL. The kit's 02-MOTION-LAB.md §3
// says which pass grades what; R1 and 02 below are the kit's research and motion-lab sections.
//
//   import { measureInteraction, interrupt, spam, springFit, filmstrip, trace, frameStats } from './motion.mjs';
//
//   // Pass A, frames only (grade frames from this pass):
//   const a = await measureInteraction(page, { id: 'MOT-21', act, settleMs: 900, refreshHz: env.hz, pass: 'frames' });
//   // Pass B, geometry only (grade path, overshoot, springs from this pass; its frames are never graded):
//   const b = await measureInteraction(page, { id: 'MOT-21', act, track: '.ch-modal__panel', expectedTravel: 600, pass: 'geometry' });
//
// Run headed, one timing run at a time, in the foreground window (02 §2). Chromium launch flags for timing runs:
//   --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling
// CPU throttle (Chromium only): (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 })

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const isChromium = (page) => page.context().browser()?.browserType().name() === 'chromium';
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const round = (x, n = 2) => (x == null || !Number.isFinite(x) ? x : +x.toFixed(n));

// ---------------------------------------------------------------------------------------------------------------
// Frames

/** Frame stats over a window, from raw rAF timestamps. hz = the measured refresh rate (measureRefresh), never assumed.
 *  Only a frame later than 1.5 budgets counts as a hitch (R1 b1), and the ratio divides by the active window only. */
export function frameStats(times, { hz = 60, from = -Infinity, to = Infinity } = {}) {
  const budget = 1000 / hz;
  const d = [];
  for (let i = 1; i < times.length; i++) if (times[i] >= from && times[i - 1] <= to) d.push(times[i] - times[i - 1]);
  const total = d.reduce((s, x) => s + x, 0);
  const late = d.filter((x) => x > budget * 1.5);
  const hitchMs = late.reduce((s, x) => s + (x - budget), 0);
  const dropped = late.reduce((n, x) => n + Math.round(x / budget) - 1, 0);
  const sorted = [...d].sort((a, b) => a - b);
  return {
    hz, budgetMs: round(budget), frames: d.length, windowMs: round(total, 1),
    p50: round(median(d)), p95: round(sorted[Math.floor(0.95 * (sorted.length - 1))] || 0), max: round(sorted[sorted.length - 1] || 0),
    dropped, droppedPct: total ? round((dropped / (total / budget)) * 100) : 0,
    over50ms: d.filter((x) => x > 50).length, over2xBudget: d.filter((x) => x > 2 * budget).length,
    hitchMs: round(hitchMs, 1), hitchMsPerS: total ? round((hitchMs / total) * 1000) : 0,
  };
}

/** The display's refresh rate as this engine delivers it (median idle rAF delta over `ms`). Run on an idle page. */
export async function measureRefresh(page, ms = 2000) {
  return page.evaluate((m) => window.__chAudit.measureRefresh(m), ms);
}

// ---------------------------------------------------------------------------------------------------------------
// One interaction

/**
 * pass: 'frames' (no geometry tracking; grade frames), 'geometry' (track one element; frames recorded but marked
 * ungraded), or 'both' (quick look only: nothing in it is graded). Default: 'geometry' with `track`, else 'frames'.
 * expectedTravel (px): the travel the tracked element should cover. If it covers < 80 %, the row is INVALID (you are
 * tracking a box that doesn't move, such as the real page under a view transition, or a dialog's static top layer).
 * phone: true makes a mouse-driven act INVALID (phone rows must be driven by touch: locator.tap() or drag.mjs).
 */
export async function measureInteraction(page, { id, label = '', act, track = null, settleMs = 800, refreshHz = 60, pass, expectedTravel = null, phone = false, progress = false, cdp = null } = {}) {
  pass = pass || (track ? 'geometry' : 'frames');
  await page.evaluate(() => { const a = window.__chAudit; a.motionLog(); a.loaf(); a.interactions(); a.inputLog(); });

  // CDP Animation domain (Chromium): every CSS/WAAPI animation the compositor starts, late ones included.
  let cdpAnims = null; let session = cdp;
  if (isChromium(page)) {
    try {
      session = session || await page.context().newCDPSession(page);
      cdpAnims = [];
      session.on('Animation.animationStarted', ({ animation: a }) => cdpAnims.push({ name: a.name, type: a.type, duration: a.source?.duration, delay: a.source?.delay, easing: a.source?.easing, startTime: a.startTime }));
      await session.send('Animation.enable');
    } catch { cdpAnims = null; }
  }

  await page.evaluate(({ track, pass, progress }) => {
    const a = window.__chAudit;
    a.startCensus({ resize: pass !== 'frames' });
    a.startFrames();
    if (track && pass !== 'frames') a.startTrack(track);
    if (progress) a.startProgress({ pseudoOnly: progress === 'pseudo' });
  }, { track, pass, progress });
  const t0 = await page.evaluate(() => performance.now());
  const started = Date.now();
  await act();
  await page.waitForTimeout(Math.max(0, settleMs - (Date.now() - started)));

  const out = await page.evaluate(({ hz }) => {
    const a = window.__chAudit;
    return {
      frames: a.stopFrames(hz), geometry: a.stopTrack(), census: a.stopCensus(), prog: a.stopProgress(),
      motion: a.motionLog(), loaf: a.loaf(), interactions: a.interactions(), inputs: a.inputLog(),
    };
  }, { hz: refreshHz });
  if (cdpAnims && session) { try { await session.send('Animation.disable'); } catch { /* closed */ } }

  const { census, geometry } = out;
  const animations = census.animations;
  const layoutAnimated = [
    ...out.motion.filter((m) => m.layout).map((m) => `${m.target} ${m.property} (transition)`),
    ...animations.filter((a) => a.layoutProps.length).map((a) => `${a.target}${a.pseudo || ''} ${a.layoutProps.join(',')} (${a.type})`),
    ...census.jsAnimated.filter((w) => w.layout).map((w) => `${w.target} ${w.prop} (JS style writes on ${w.frames} frames)`),
    ...census.layoutBoxes.map((b) => `${b.target} box changed on ${b.longestRun} frames in a row`),
  ];

  // Active motion window: first to last moment anything moved (animation seen, style written, geometry changed).
  const marks = [
    ...animations.map((a) => a.firstSeen).filter(Number.isFinite),
    ...animations.filter((a) => a.iterations !== Infinity).map((a) => a.lastRunning).filter(Number.isFinite),
    ...census.styleWrites.flatMap((w) => [w.first, w.last]),
    ...movingSpan(geometry),
  ];
  const from = marks.length ? Math.min(t0, ...marks) : t0; // from the input: a stall before the first frame counts
  const to = marks.length ? Math.max(...marks) : t0 + settleMs;
  const graded = pass === 'frames';
  const frames = { ...frameStats(out.frames.times, { hz: refreshHz, from, to }), activeFrom: round(from - t0, 1), activeTo: round(to - t0, 1), graded, source: 'rAF: an investigate signal, confirmed only by trace() or device video (02 §1)' };

  const invalid = [];
  if (phone && out.inputs.some((i) => i.pointerType === 'mouse')) invalid.push('phone row driven by the mouse: use touch (locator.tap or drag.mjs)');
  const travel = maxTravel(geometry);
  if (expectedTravel && travel < 0.8 * expectedTravel) invalid.push(`tracked travel ${round(travel, 1)} px < 80 % of expected ${expectedTravel} px: wrong element (view transition, copy layer or static box)`);

  return {
    id, label, at: new Date().toISOString(), pass, status: invalid.length ? 'INVALID' : 'MEASURED', invalid,
    frames, // graded only when pass === 'frames'
    motion: out.motion, // CSS transitions and animations started: property, its own duration and easing
    animations, // every Animation object seen on any frame (late ones too), with pseudo-element
    cdpAnimations: cdpAnims, // Chromium compositor view of the same
    jsAnimated: census.jsAnimated, // inline style written on 3+ frames: JS-driven motion the WAAPI list can't see
    layoutAnimated, // must be empty outside the 01 §6 exceptions
    longFrames: out.loaf.filter((l) => l.duration > 50),
    inputDelay: out.interactions,
    inputs: out.inputs,
    geometry,
    progress: out.prog,
    travelPx: round(travel, 1),
    firstVisible: geometry.find((g) => !g.absent && g.opacity > 0.01) || null,
    settledAtMs: settledAt(geometry),
  };
}

function movingSpan(rows) {
  const live = rows.filter((r) => !r.absent);
  let first = null; let last = null;
  for (let i = 1; i < live.length; i++) {
    const a = live[i - 1]; const b = live[i];
    if (Math.abs(a.x - b.x) > 0.25 || Math.abs(a.y - b.y) > 0.25 || Math.abs(a.w - b.w) > 0.25 || Math.abs(a.h - b.h) > 0.25 || Math.abs(a.opacity - b.opacity) > 0.005) { first = first ?? a.t; last = b.t; }
  }
  return first == null ? [] : [first, last];
}
function maxTravel(rows) {
  const live = rows.filter((r) => !r.absent);
  if (live.length < 2) return 0;
  const s = live[0];
  return Math.max(...live.map((r) => Math.max(Math.hypot(r.x - s.x, r.y - s.y), Math.abs(r.w - s.w), Math.abs(r.h - s.h))));
}

// When the tracked element stopped moving, in ms from the first frame.
function settledAt(rows) {
  const live = rows.filter((r) => !r.absent);
  if (live.length < 2) return null;
  const last = live[live.length - 1];
  const same = (a) => Math.abs(a.x - last.x) < 0.5 && Math.abs(a.y - last.y) < 0.5 && Math.abs(a.w - last.w) < 0.5 && Math.abs(a.h - last.h) < 0.5 && Math.abs(a.opacity - last.opacity) < 0.01;
  let i = live.length - 1;
  while (i > 0 && same(live[i - 1])) i--;
  return round(live[i].t - rows[0].t, 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Overshoot

/** How far past its resting value the element went, on one channel: x, y, w, h (px), sx, sy (scale), opacity. */
export function overshoot(rows, axis = 'y') {
  const live = rows.filter((r) => !r.absent && Number.isFinite(r[axis]));
  if (live.length < 3) return 0;
  const end = live[live.length - 1][axis];
  const start = live[0][axis];
  const dir = Math.sign(end - start);
  if (!dir) return 0;
  const past = live.map((r) => (r[axis] - end) * dir).filter((d) => d > 0);
  return past.length ? round(Math.max(...past), 4) : 0;
}
/** Every channel at once. Pass (02 §1): 0 px on tap-opened surfaces; settle ≤ 0.5 px on travel ≤ 300 px; scale ≤ 0.002. */
export function overshootAll(rows) {
  return Object.fromEntries(['x', 'y', 'w', 'h', 'sx', 'sy', 'opacity'].map((k) => [k, overshoot(rows, k)]));
}

// ---------------------------------------------------------------------------------------------------------------
// Springs: grade the trajectory, not a "duration" (a spring has none).

const CH_DUR_BASE = 0.26; const CH_DUR_REVEAL = 0.52;
const SPRINGS = { smooth: { d: CH_DUR_BASE, bounce: 0 }, settle: { d: CH_DUR_BASE, bounce: 0.1 }, reveal: { d: CH_DUR_REVEAL, bounce: 0 } };
/** The app's own closed form (src/clubhouse/lib/motion.ts chSpringAt), ported 1:1. Progress 0 to 1 at t seconds. */
export function chSpringAt(kind, t, v0 = 0) {
  const { d, bounce } = SPRINGS[kind];
  const omega = (2 * Math.PI) / (d * 1.2);
  const zeta = Math.min(1, Math.max(0.05, 1 - bounce));
  if (zeta >= 1) return 1 + (-1 + (v0 - omega) * t) * Math.exp(-omega * t);
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 + Math.exp(-zeta * omega * t) * (-Math.cos(wd * t) + ((v0 - zeta * omega) / wd) * Math.sin(wd * t));
}
/** The app's sampled spring curve (lib/motion.ts chSpringCurve) as a CSS linear() string and its length, for fixtures. */
export function chSpringCurve(kind = 'smooth', { velocity = 0, rest = 0.001 } = {}) {
  const step = 1 / 240; let end = step;
  for (let t = step; t <= 1.5; t += step) if (Math.abs(1 - chSpringAt(kind, t, velocity)) > rest) end = t + step;
  const ms = Math.round(end * 1000);
  const steps = Math.max(8, Math.round(ms / 16));
  const pts = Array.from({ length: steps + 1 }, (_, i) => (i === 0 ? 0 : i === steps ? 1 : +chSpringAt(kind, (i / steps) * end, velocity).toFixed(4)));
  return { ms, linear: `linear(${pts.join(', ')})` };
}

/**
 * Fit tracked motion to the app's spring. axis: x|y|w|h|sx|sy|opacity. v0: start velocity in progress per second
 * (from a release: release px/s ÷ distance left). Start time is searched (the first frame is late by up to a frame).
 * Bands (02 §1): RMS ≤ 2 % of travel A+, ≤ 3 % A, ≤ 4 % B. Also reports t95 (smooth from rest ≈ 236 ms) and t(0.5 px).
 */
export function springFit(rows, { kind = 'smooth', axis = 'x', v0 = 0 } = {}) {
  const live = rows.filter((r) => !r.absent && Number.isFinite(r[axis]));
  if (live.length < 4) return { ok: false, reason: 'too few samples' };
  const start = live[0][axis]; const end = live[live.length - 1][axis];
  const travel = end - start;
  if (Math.abs(travel) < 1e-6) return { ok: false, reason: 'no travel' };
  const p = live.map((r) => ({ t: r.t, p: (r[axis] - start) / travel }));
  const firstMove = p.findIndex((s) => Math.abs(s.p) > 0.002);
  if (firstMove < 1) return { ok: false, reason: 'motion started before tracking' };
  let best = { rms: Infinity, t0: null };
  const lo = p[firstMove - 1].t - 34; const hi = p[firstMove].t;
  for (let t0 = lo; t0 <= hi; t0 += 0.5) {
    let se = 0; let n = 0;
    for (const s of p) { if (s.t < t0) continue; const e = s.p - chSpringAt(kind, (s.t - t0) / 1000, v0); se += e * e; n++; }
    if (n >= 4 && Math.sqrt(se / n) < best.rms) best = { rms: Math.sqrt(se / n), t0 };
  }
  const t95 = p.find((s) => s.t >= best.t0 && Math.abs(s.p) >= 0.95);
  const restPx = 0.5 / Math.abs(travel);
  let tRest = null;
  for (let i = p.length - 1; i >= 0; i--) { if (Math.abs(1 - p[i].p) > restPx) { tRest = p[Math.min(p.length - 1, i + 1)].t - best.t0; break; } }
  const rmsPct = best.rms * 100;
  return {
    ok: true, kind, axis, travel: round(travel, 1), rmsPct: round(rmsPct), band: rmsPct <= 2 ? 'A+' : rmsPct <= 3 ? 'A' : rmsPct <= 4 ? 'B' : 'fail',
    t95Ms: t95 ? round(t95.t - best.t0, 0) : null, tRestMs: round(tRest, 0),
    expectedT95Ms: round(t95Of(kind, v0), 0),
  };
}
function t95Of(kind, v0) { for (let t = 0; t < 2; t += 0.0005) if (chSpringAt(kind, t, v0) >= 0.95) return t * 1000; return null; }

// ---------------------------------------------------------------------------------------------------------------
// Interruption (R1 b5, 02 §3a)

const channelDelta = (a, b) => ({
  px: Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.abs(b.w - a.w), Math.abs(b.h - a.h)),
  scale: Math.max(Math.abs((b.sx ?? 1) - (a.sx ?? 1)), Math.abs((b.sy ?? 1) - (a.sy ?? 1))),
  opacity: Math.abs(b.opacity - a.opacity),
});

/**
 * Start a motion, reverse it part way, and judge the reversal from the samples around it.
 *   at: fraction of `durationMs` (the measured duration from an uninterrupted run) at which `back` runs. 02 §3a runs
 *       0.4 and 0.8. Or give afterMs directly.
 * Pass = all of:
 *   1. continuity: the first sample after the reverse is within 2 px (0.005 scale, 0.05 opacity) of the last sample
 *      before it, beyond what the motion's own speed covers in that gap (it turns around from the live value);
 *   2. no jump: no step after the reverse is faster than 1.5x the fastest step before it (a restart or snap is);
 *   3. springs only (spring: true): no zero-velocity plateau longer than 1 frame before it settles.
 */
export async function interrupt(page, { forward, back, track, at = null, durationMs = null, afterMs = 90, settleMs = 900, spring = false }) {
  const wait = at != null && durationMs ? Math.round(at * durationMs) : afterMs;
  await page.evaluate((s) => window.__chAudit.startTrack(s), track);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await forward();
  await page.waitForTimeout(wait);
  const tBack = await page.evaluate(() => performance.now());
  await back();
  await page.waitForTimeout(settleMs);
  const rows = (await page.evaluate(() => window.__chAudit.stopTrack())).filter((r) => !r.absent);
  return judgeInterrupt(rows, tBack, { spring, waitMs: wait });
}

export function judgeInterrupt(rows, tBack, { spring = false, waitMs = null } = {}) {
  const pre = rows.filter((r) => r.t <= tBack);
  const post = rows.filter((r) => r.t > tBack);
  if (pre.length < 3 || post.length < 2) return { pass: false, reason: 'too few samples around the interrupt', rows };
  const last = pre[pre.length - 1]; const prev = pre[pre.length - 2]; const first = post[0];
  const dtPre = Math.max(1, last.t - prev.t);
  const v = channelDelta(prev, last); // per frame, before the interrupt
  const gapFrames = Math.max(1, (first.t - last.t) / dtPre);
  const d = channelDelta(last, first);
  const continuity = {
    px: round(Math.max(0, d.px - v.px * gapFrames), 2),
    scale: round(Math.max(0, d.scale - v.scale * gapFrames), 4),
    opacity: round(Math.max(0, d.opacity - v.opacity * gapFrames), 3),
    rawPx: round(d.px, 2),
  };
  const continuous = continuity.px <= 2 && continuity.scale <= 0.005 && continuity.opacity <= 0.05;
  const speeds = (list) => list.slice(1).map((r, i) => { const c = channelDelta(list[i], r); return { t: r.t, px: c.px / Math.max(1, r.t - list[i].t), all: c }; });
  const preSpeeds = speeds(pre);
  const fastestPre = Math.max(1e-3, ...preSpeeds.map((s) => s.px));
  const postSpeeds = speeds([last, ...post]);
  const steps = [...preSpeeds, ...postSpeeds].map((s) => s.all.px).filter((x) => x > 0.05);
  const medianStep = median(steps);
  const jumps = postSpeeds.filter((s) => s.px > 1.5 * fastestPre && s.all.px > 2).map((s) => ({ t: s.t, px: round(s.all.px, 1), pxPerMs: round(s.px, 3) }));
  let plateau = 0;
  if (spring) {
    let run = 0;
    const moving = postSpeeds.slice(0, -3); // ignore the settled tail
    for (const s of moving) { run = s.px < 0.01 ? run + 1 : 0; plateau = Math.max(plateau, run); }
  }
  const pass = continuous && jumps.length === 0 && (!spring || plateau <= 1);
  return {
    pass, waitMs, continuity, continuous, jumps, fastestPrePxPerMs: round(fastestPre, 3), medianStepPx: round(medianStep, 2),
    maxStepOverMedian: medianStep ? round(Math.max(...steps) / medianStep, 2) : null, plateauFrames: plateau, rows,
  };
}

/**
 * Spam: n toggles `gapMs` apart. Pass = the final state equals the last command, and at most one overlay is up.
 *   readState: async () => string|boolean (what the UI shows at rest), expected: the state after the last command.
 */
export async function spam(page, { toggle, n = 5, gapMs = 60, readState, expected, overlaySelector = null, settleMs = 900 }) {
  for (let i = 0; i < n; i++) { await toggle(i); if (i < n - 1) await page.waitForTimeout(gapMs); }
  await page.waitForTimeout(settleMs);
  const finalState = await readState();
  const overlays = overlaySelector ? await page.locator(overlaySelector).count() : null;
  const stillRunning = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).length);
  return { pass: finalState === expected && (overlays == null || overlays <= 1) && stillRunning === 0, finalState, expected, overlays, stillRunning };
}

// ---------------------------------------------------------------------------------------------------------------
// Filmstrip: exact frames by pausing every animation (view-transition pseudo-elements included) and seeking.
// Covers CSS, WAAPI (Framer's compositor animations) and view transitions. JS motion (Framer main-thread values,
// useExpandHeight, rAF loops) can't be seeked: use clockFilmstrip() in a clock-faked page. Gestures: drag.mjs frames.

export async function filmstrip(page, { act, at = null, durationMs = 300, count = 12, out, clip = null, settleMs = 0 }) {
  const { PNG } = await import('pngjs');
  const times = at || Array.from({ length: count + 2 }, (_, i) => Math.round((i / (count + 1)) * durationMs));
  await act();
  await page.waitForTimeout(20);
  const n = await page.evaluate(() => window.__chAudit.pauseAll());
  const shots = [];
  for (const t of times) {
    await page.evaluate((ms) => window.__chAudit.seekAll(ms), t);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    shots.push(PNG.sync.read(await page.screenshot({ clip: clip || undefined, animations: 'allow' })));
  }
  await page.evaluate(() => window.__chAudit.finishAll());
  if (settleMs) await page.waitForTimeout(settleMs);
  const w = shots[0].width; const h = shots[0].height; const gap = 4;
  const strip = new PNG({ width: shots.length * (w + gap) - gap, height: h });
  strip.data.fill(255);
  shots.forEach((s, i) => PNG.bitblt(s, strip, 0, 0, w, h, i * (w + gap), 0));
  if (out) { mkdirSync(path.dirname(out), { recursive: true }); writeFileSync(out, PNG.sync.write(strip)); }
  return { animationsPaused: n, times, frames: shots.length, width: strip.width, height: strip.height, out: out || null };
}

/**
 * Filmstrip for JS-driven motion. Needs a page whose clock was installed BEFORE it loaded:
 *   await page.clock.install(); await page.goto(url);   // fakes Date, timers, performance.now and requestAnimationFrame
 * Steps the clock `stepMs` at a time and screenshots each step. Never take timing from a clock-faked page.
 */
export async function clockFilmstrip(page, { act, stepMs = 16, count = 20, out, clip = null }) {
  const { PNG } = await import('pngjs');
  await act();
  const shots = [];
  for (let i = 0; i <= count; i++) {
    shots.push(PNG.sync.read(await page.screenshot({ clip: clip || undefined, animations: 'allow' })));
    await page.clock.runFor(stepMs);
  }
  const w = shots[0].width; const h = shots[0].height; const gap = 4;
  const strip = new PNG({ width: shots.length * (w + gap) - gap, height: h });
  strip.data.fill(255);
  shots.forEach((s, i) => PNG.bitblt(s, strip, 0, 0, w, h, i * (w + gap), 0));
  if (out) { mkdirSync(path.dirname(out), { recursive: true }); writeFileSync(out, PNG.sync.write(strip)); }
  return { frames: shots.length, stepMs, out: out || null };
}

// ---------------------------------------------------------------------------------------------------------------
// Trace (Chromium): the ground truth for presented and dropped frames (R1 b4). rAF can show jank the user never sees;
// a frame is "confirmed" only from here, from a device recording, or (T3) Instruments.

const TRACE_CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'benchmark', 'cc', 'viz', 'gpu', 'blink', 'disabled-by-default-devtools.screenshot'];

export async function trace(page, fn, { out = null, screenshots = true } = {}) {
  if (!isChromium(page)) return { supported: false, reason: 'trace is Chromium only; WebKit frames come from T2 Timelines or video' };
  const session = await page.context().newCDPSession(page);
  const events = [];
  session.on('Tracing.dataCollected', ({ value }) => events.push(...value));
  const done = new Promise((r) => session.once('Tracing.tracingComplete', r));
  await session.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: TRACE_CATS.filter((c) => screenshots || !c.includes('screenshot')), recordMode: 'recordAsMuchAsPossible' } });
  const t0 = await page.evaluate(() => performance.timeOrigin + performance.now());
  await fn();
  const t1 = await page.evaluate(() => performance.timeOrigin + performance.now());
  await session.send('Tracing.end');
  await done;
  await session.detach().catch(() => {});
  if (out) { mkdirSync(path.dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify({ traceEvents: events })); }
  return { supported: true, windowMs: Math.round(t1 - t0), ...presentedFrames(events), out };
}

/**
 * Frames from a trace. Uses PipelineReporter (one per frame; args state: PRESENTED_ALL, PRESENTED_PARTIAL, DROPPED,
 * NO_UPDATE_DESIRED). Percent Dropped Frames counts DROPPED and PRESENTED_PARTIAL over frames that wanted an update,
 * worst 1 s window too. Presented-frame gaps over 50 ms are the "confirmed" long frames for the 01 §3 cap.
 */
export function presentedFrames(events) {
  const rep = events.filter((e) => e.name === 'PipelineReporter' && (e.ph === 'b' || e.ph === 'X'));
  const state = (e) => { const a = e.args || {}; const c = a.frame_reporter || a.chrome_frame_reporter || a.data || {}; return String(c.state || '').replace(/^STATE_/, ''); };
  const rows = rep.map((e) => ({ ts: e.ts / 1000, state: state(e) })).filter((r) => r.state).sort((a, b) => a.ts - b.ts);
  const wanted = rows.filter((r) => r.state !== 'NO_UPDATE_DESIRED');
  const bad = (r) => r.state === 'DROPPED' || r.state === 'PRESENTED_PARTIAL';
  let worst = 0;
  for (const r of wanted) {
    const win = wanted.filter((x) => x.ts >= r.ts && x.ts < r.ts + 1000);
    if (win.length >= 10) worst = Math.max(worst, (win.filter(bad).length / win.length) * 100);
  }
  // A confirmed long frame: the gap between two presented frames with at least one wanted frame dropped between them.
  const gaps = []; let lastShown = null; let missed = 0;
  // A frame that wanted no update ends the run: nothing was waiting to be drawn, so idle time after an animation ends is no gap.
  for (const r of rows) {
    if (r.state === 'NO_UPDATE_DESIRED') { lastShown = null; missed = 0; continue; }
    if (r.state === 'PRESENTED_ALL') { if (lastShown != null && missed) gaps.push(r.ts - lastShown); lastShown = r.ts; missed = 0; } else if (bad(r)) missed++;
  }
  return {
    reporterEvents: rep.length, framesWanted: wanted.length, dropped: wanted.filter(bad).length,
    percentDroppedFrames: wanted.length ? round((wanted.filter(bad).length / wanted.length) * 100) : null,
    worstWindowPct: round(worst), presentedGapsOver50ms: gaps.filter((g) => g > 50).length, maxPresentedGapMs: round(Math.max(0, ...gaps), 1),
    states: [...new Set(rows.map((r) => r.state))],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Run conditions recorded with every motion JSON (02 §2): host, power, thermal, refresh, CPU index.

export async function hostInfo(page) {
  const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', timeout: 5000 }).trim(); } catch { return null; } };
  const mac = process.platform === 'darwin';
  const refresh = page ? await measureRefresh(page, 1500).catch(() => null) : null;
  return {
    platform: process.platform,
    model: mac ? sh('sysctl', ['-n', 'hw.model']) : null,
    pmset: mac ? sh('pmset', ['-g']) : null, // look for AC Power and lowpowermode 0
    therm: mac ? sh('pmset', ['-g', 'therm']) : null,
    refresh,
    cpuIndex: page ? await cpuIndex(page).catch(() => null) : null,
    engine: page ? page.context().browser()?.browserType().name() : null,
  };
}

/** The kit's own CPU index: the same two loops as Lighthouse's computeBenchmarkIndex, but NOT on Lighthouse's scale
 *  (this port reads about 10x higher than Lighthouse). Use it only to compare hosts and runs of this kit. The
 *  R3 b2 throttle table needs Lighthouse's own benchmarkIndex (02 §2 C2). Takes about 1 s. */
export async function cpuIndex(page) {
  return page.evaluate(() => {
    const gc = () => { const s0 = Date.now(); let it = 0; while (Date.now() - s0 < 500) { let s = ''; for (let j = 0; j < 10000; j++) s += 'a'; if (s.length === 1) throw new Error('never'); it++; } return Math.round(it / ((Date.now() - s0) / 1000)); };
    const noGc = () => { const a = []; const b = []; for (let i = 0; i < 100000; i++) a[i] = b[i] = i; const s0 = Date.now(); let it = 0; while (it % 10 !== 0 || Date.now() - s0 < 500) { const src = it % 2 === 0 ? a : b; const tgt = it % 2 === 0 ? b : a; for (let j = 0; j < src.length; j++) tgt[j] = src[j]; it++; } return Math.round(it / ((Date.now() - s0) / 1000)); };
    return Math.round((gc() + noGc()) / 2);
  });
}

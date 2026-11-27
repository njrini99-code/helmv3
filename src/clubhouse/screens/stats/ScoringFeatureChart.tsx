'use client';
import { readTypeK } from '../../lib/type-k';
import { pluralWord } from '../../lib/plural';
import { formatFixed, formatToPar } from '../../lib/format';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { CH_MARKS_MS } from '../../lib/motion';
import { hapticScrub } from '../../lib/haptics';
import { meanSeries, parLine, type TrendRound } from './round-trend';
import { dateShares } from '../../lib/chart';
import { straightPath, teamLineDays, type ShsTone } from './shs-figures';

const H = 160;
const BASE_PAD = { l: 4, r: 30, t: 10, b: 26 };
const HOLD_MS = 120;
const SIDEWAYS_PX = 6;
/** The line's morph on a window change (07 M-STATS-10). */
const MORPH_MS = CH_MARKS_MS;
const morphEase = (t: number) => 1 - Math.pow(1 - t, 3.2);

type Pt = readonly [number, number];

/** The old line's height at a new x, so each point moves from where the old line was. */
function heightAt(pts: readonly Pt[], x: number): number | null {
  if (!pts.length) return null;
  if (x <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i]![0]) {
      const [x0, y0] = pts[i - 1]!;
      const [x1, y1] = pts[i]!;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return pts[pts.length - 1]![1];
}

/**
 * The feature card's chart (08 criteria 12, 13, 68): 160 tall and never stretched, so its width is measured. Every round a dot, the
 * five-round average through them, par dashed. Press and drag reads the nearest round and tells the card; release restores the
 * average; it never opens the detail (`data-ch-no-open`). One round: one dot and the par rule, not focusable (CP-126).
 */
export function ScoringFeatureChart({ rounds, tone, onRead }: { rounds: readonly TrendRound[]; tone: ShsTone; onRead: (i: number | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [read, setRead] = useState<number | null>(null);
  // The axis type follows Text Size, so its gutters do too: fixed ones clip the figures at large sizes (STATS-9).
  const [k, setK] = useState(1);
  useEffect(() => setK(readTypeK(document.documentElement)), []);
  const PAD = { ...BASE_PAD, r: BASE_PAD.r * k, b: BASE_PAD.b * k };
  const pending = useRef<{ x0: number; timer: number } | null>(null);
  const cancelPending = () => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = rounds.filter((r): r is TrendRound & { value: number } => r.value != null);
  const n = shown.length;
  const scores = shown.map((r) => r.value);
  const par = parLine(shown);
  // Par sits inside the range on both sides (CH-16): a player under par in every round shown still sees the line they beat.
  const marks = par == null ? scores : [...scores, par];
  let lo = Math.min(...marks) - 1;
  let hi = Math.max(...marks) + 1;
  const step = hi - lo > 10 ? 4 : hi - lo > 6 ? 2 : 1;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  // Rounds sit by the day they were played (CH-11): three rounds in a week then a month off never draw as one even slope.
  const share = dateShares(shown.map((r) => (r.at == null ? null : new Date(r.at).toISOString())));
  const x = (i: number) => PAD.l + (n <= 1 ? 0.5 : share[i]!) * (width - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const avg = meanSeries(shown)
    .map((v, i) => (v == null ? null : ([x(i), y(v)] as const)))
    .filter((p): p is readonly [number, number] => p != null);
  // Straight segments between the rounds (CH-15): a curve drew averages between rounds that were never measured.
  const line = straightPath(avg);
  const area = line ? `${line}L${avg[avg.length - 1]![0]},${H - PAD.b}L${avg[0]![0]},${H - PAD.b}Z` : '';
  const colour = tone === 'gain' ? 'var(--ch-shs-s-gain-fill)' : tone === 'loss' ? 'var(--ch-shs-s-loss-fill)' : 'var(--ch-shs-s-flat)';

  // The morph, on the drawn elements: React has already written the end state, and this walks to it. A window change mid-morph starts
  // from the shape on screen; Reduce Motion and a first paint draw it at rest.
  const reduced = useChReducedMotion();
  const areaEl = useRef<SVGPathElement>(null);
  const lineEl = useRef<SVGPathElement>(null);
  const dotsEl = useRef<SVGGElement>(null);
  const shape = useRef<{ dots: readonly Pt[]; avg: readonly Pt[] } | null>(null);
  const roundsKey = shown.map((r) => r.id).join();
  const dotPts: Pt[] = shown.map((r, i) => [x(i), y(r.value)]);
  const morphedKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    const was = shape.current;
    const end = { dots: dotPts, avg };
    const bottom = H - PAD.b;
    const circles = Array.from(dotsEl.current?.querySelectorAll('circle') ?? []);
    // The shape as the elements hold it: a morph writes them itself, so whoever stops one must leave them on a whole shape.
    const paint = (a: readonly Pt[], d: readonly Pt[]) => {
      const path = straightPath(a);
      if (lineEl.current) lineEl.current.setAttribute('d', path);
      if (areaEl.current) areaEl.current.setAttribute('d', path ? `${path}L${a[a.length - 1]![0]},${bottom}L${a[0]![0]},${bottom}Z` : '');
      circles.forEach((c, i) => d[i] && c.setAttribute('cy', String(d[i]![1])));
    };
    const sameRounds = morphedKey.current === roundsKey;
    morphedKey.current = roundsKey;
    // Only a new set of rounds morphs. A new width (the card is measured after its first paint, and a desk's card is far wider than
    // the first guess) or a motion setting that lands late redraws at rest: a morph begun at the old width would otherwise keep
    // writing the old width's line over the new one, leaving the average half as long as its rounds.
    if (!was || reduced || was.dots.length === 0 || sameRounds) {
      paint(avg, dotPts);
      shape.current = end;
      return;
    }
    const startDots = dotPts.map((p) => heightAt(was.dots, p[0]) ?? p[1]);
    const startAvg = avg.map((p) => heightAt(was.avg, p[0]) ?? p[1]);
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = morphEase(Math.min(1, (now - t0) / MORPH_MS));
      const a = avg.map((p, i) => [p[0], startAvg[i]! + (p[1] - startAvg[i]!) * t] as const);
      const d = dotPts.map((p, i) => [p[0], startDots[i]! + (p[1] - startDots[i]!) * t] as const);
      shape.current = { dots: d, avg: a };
      paint(a, d);
      if (t < 1) raf = requestAnimationFrame(step);
      else shape.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the geometry is read from this render; the keys say when it changed
  }, [roundsKey, reduced, width]);

  const set = useCallback(
    (i: number | null) => {
      setRead((was) => {
        if (was !== i && i != null) hapticScrub('step');
        return i;
      });
      onRead(i);
    },
    [onRead],
  );
  // Takes the chart and the finger's x, not the event: a hold reads it from a timer, where an event's `currentTarget` is gone
  // (0822e4af: every touch hold threw, so a still finger never read a round).
  const pick = (el: HTMLElement, clientX: number) => {
    const left = el.getBoundingClientRect().left;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - (clientX - left));
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    set(best);
  };

  if (!n) return null;
  const first = shown[0]!;
  const last = shown[n - 1]!;
  const interactive = n > 1;
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- a scrubbed chart has no native element; role and keys are on it
    <div data-ctl="CTL-P004-003"
      ref={box}
      className="ch-shs-chart"
      data-ch="stats-hero-chart"
      data-ch-no-open=""
      role={interactive ? 'slider' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`Scores for ${n} ${pluralWord(n, 'round', 'rounds')}, from ${Math.round(first.value)} on ${first.label} to ${Math.round(last.value)} on ${last.label}. Use the arrow keys to read each round.`}
      aria-valuemin={interactive ? 1 : undefined}
      aria-valuemax={interactive ? n : undefined}
      aria-valuenow={interactive ? (read ?? n - 1) + 1 : undefined}
      aria-valuetext={interactive ? (read == null ? `Latest ${Math.round(last.value)}, ${last.label}` : `${Math.round(shown[read]!.value)}, ${shown[read]!.label}`) : undefined}
      onPointerDown={(e) => {
        if (!interactive) return;
        // A scroll that starts here isn't a read: nothing lights and nothing buzzes until a hold or a sideways move (MOB-STATS-4).
        if (e.pointerType !== 'touch') {
          e.currentTarget.setPointerCapture(e.pointerId);
          hapticScrub('start');
          pick(e.currentTarget, e.clientX);
          return;
        }
        const el = e.currentTarget;
        const id = e.pointerId;
        const x0 = e.clientX;
        pending.current = {
          x0,
          timer: window.setTimeout(() => {
            pending.current = null;
            el.setPointerCapture(id);
            hapticScrub('start');
            pick(el, x0);
          }, HOLD_MS),
        };
      }}
      onPointerMove={(e) => {
        const wait = pending.current;
        if (wait && Math.abs(e.clientX - wait.x0) >= SIDEWAYS_PX) {
          window.clearTimeout(wait.timer);
          pending.current = null;
          e.currentTarget.setPointerCapture(e.pointerId);
          hapticScrub('start');
          pick(e.currentTarget, e.clientX);
          return;
        }
        if (interactive && e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.currentTarget, e.clientX);
      }}
      onPointerUp={() => {
        cancelPending();
        if (read == null) return;
        hapticScrub('end');
        set(null);
      }}
      onPointerCancel={() => {
        cancelPending();
        set(null);
      }}
      onBlur={() => set(null)}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          const cur = read ?? (e.key === 'ArrowLeft' ? n : -1);
          set(Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))));
        } else if (e.key === 'Escape' && read != null) {
          e.preventDefault();
          e.stopPropagation();
          set(null);
        }
      }}
    >
      <svg viewBox={`0 0 ${width} ${H}`} height={H} aria-hidden="true">
        <defs>
          <linearGradient id="ch-shs-hg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={colour} stopOpacity=".28" />
            <stop offset="1" stopColor={colour} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line className="ch-shs-grid" x1={PAD.l} x2={width - PAD.r + 4} y1={y(v)} y2={y(v)} />
            <text className="ch-shs-ax" x={width} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {par != null && <line className="ch-shs-parline" x1={PAD.l} x2={width - PAD.r + 4} y1={y(par)} y2={y(par)} />}
        {area && <path ref={areaEl} d={area} fill="url(#ch-shs-hg)" />}
        {line && <path ref={lineEl} className="ch-shs-avgline" d={line} stroke={colour} />}
        <g ref={dotsEl}>
        {shown.map((r, i) => (
          <circle key={r.id} className={'ch-shs-rdot' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')} cx={x(i)} cy={y(r.value)} r={read === i ? 6 : i === n - 1 ? 5 : 3.6} />
        ))}
        </g>
        {read != null && (
          <>
            <line className="ch-shs-scrub" x1={x(read)} x2={x(read)} y1={PAD.t - 4} y2={H - PAD.b + 2} />
            <circle className="ch-shs-scrub-ring" cx={x(read)} cy={y(shown[read]!.value)} r="10" />
          </>
        )}
        <text className="ch-shs-ax" x={PAD.l} y={H - 6}>
          {first.label}
        </text>
        {n > 1 && (
          <text className="ch-shs-ax" x={width - PAD.r} y={H - 6} textAnchor="end">
            {last.label}
          </text>
        )}
      </svg>
    </div>
  );
}

/** A team round day as the phone draws it: the day's average in strokes, and against par per 18 when the loader has it. */
export type TeamDay = { label: string; score: number | null; n?: number; date?: string; toPar?: number | null };

/** Whether the round days draw against par: only when every day drawn has a figure against par (CH-01). */
export const teamDaysVsPar = (days: ReadonlyArray<TeamDay>): boolean => days.length > 0 && days.every((d) => d.toPar != null);

/**
 * The team's feature chart (08 criterion 50): 160 tall, its line and area always the gain fill, the mean dashed and named. Not
 * interactive: the card is the tap. Straight segments through every day in the window (S2.4), and a day one player posted on is a
 * hollow dot on the line (W26).
 * The dashed mean is named in a key under the drawing, never on the line: the scoring line crossed its words there (F-0009).
 */
export function TeamFeatureChart({ days, mean }: { days: ReadonlyArray<TeamDay>; mean: number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const known = days.filter((d): d is TeamDay & { score: number } => d.score != null);
  const n = known.length;
  if (!n) return null;
  const R = 30;
  const B = 24;
  // An axis figure's baseline sits 4 under its gridline and its 13 type's box rises 13 over that baseline, so the top gridline
  // sits 10 down: at 8 the top figure's box rose 1 past the drawing (the gate's card-escape, desk and phone).
  const T = 10;
  // The first day's dot is drawn whole: centred on the drawing's edge, half of it fell outside (the gate's card-escape).
  const L = 6;
  // Against par when every day has it (stats and charts audit 2026-11-15, CH-01): the same golf on a par-70 and a par-72 course is
  // one level, never two strokes apart, and the dashed line is par. Raw strokes, against the days' own average, otherwise.
  const vsPar = teamDaysVsPar(known);
  const v = known.map((d) => (vsPar ? d.toPar! : d.score));
  const ref = vsPar ? 0 : mean;
  const marks = ref == null ? v : [...v, ref];
  const lo = Math.floor(Math.min(...marks) - 0.5);
  const hi = Math.ceil(Math.max(...marks) + 0.5);
  const fig = (q: number) => (vsPar ? formatToPar(q, 1) : formatFixed(q, 1));
  // Round days sit by their dates when every day has one (CH-11), evenly otherwise.
  const share = dateShares(known.map((d) => d.date));
  const x = (i: number) => L + (n === 1 ? 0.5 : share[i]!) * (width - R - L);
  const y = (q: number) => T + ((q - lo) / (hi - lo || 1)) * (H - T - B);
  const pts = v.map((q, i) => [x(i), y(q)] as const);
  const joined = teamLineDays(known);
  const linePts = joined.line.map((i) => pts[i]!);
  const line = straightPath(linePts);
  const ticks: number[] = [];
  for (let q = lo; q <= hi; q++) if ((q - lo) % (hi - lo > 4 ? 2 : 1) === 0) ticks.push(q);
  return (
    <>
    <div ref={box} className="ch-shs-chart" role="img" aria-label={`${vsPar ? 'Team score against par, per 18 holes, by round day' : 'Team scoring average by round day'}, from ${fig(v[0]!)} to ${fig(v[n - 1]!)}. ${vsPar ? 'Under par sits higher.' : 'Lower scores sit higher.'}${joined.one.size ? ` ${joined.one.size} ${pluralWord(joined.one.size, 'day', 'days')} with one round ${joined.one.size === 1 ? 'is' : 'are'} marked as hollow points.` : ''}`}>
      <svg viewBox={`0 0 ${width} ${H}`} height={H} aria-hidden="true">
        <defs>
          <linearGradient id="ch-shs-tg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--ch-shs-s-gain-fill)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--ch-shs-s-gain-fill)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((q) => (
          <g key={q}>
            <line className="ch-shs-grid" x1="0" x2={width - R + 4} y1={y(q)} y2={y(q)} />
            <text className="ch-shs-ax" x={width} y={y(q) + 4} textAnchor="end">
              {vsPar ? formatToPar(q, 0) : q}
            </text>
          </g>
        ))}
        {ref != null && <line className="ch-shs-parline" x1="0" x2={width - R + 4} y1={y(ref)} y2={y(ref)} />}
        {line && <path d={`${line}L${linePts[linePts.length - 1]![0]},${H - B}L${linePts[0]![0]},${H - B}Z`} fill="url(#ch-shs-tg)" />}
        {line && <path className="ch-shs-avgline" d={line} stroke="var(--ch-shs-s-gain-fill)" />}
        {pts.map((p, i) => (
          <circle key={i} className={'ch-shs-rdot' + (joined.one.has(i) ? ' is-one' : '')} cx={p[0]} cy={p[1]} r={i === n - 1 ? 5 : 3.4} />
        ))}
        <text className="ch-shs-ax" x="0" y={H - 5}>
          {known[0]!.label}
        </text>
        {n > 1 && (
          <text className="ch-shs-ax" x={width - R} y={H - 5} textAnchor="end">
            {known[n - 1]!.label}
          </text>
        )}
      </svg>
    </div>
    {ref != null && (
      // Named for what it is, par or an average of the round days drawn, so it never reads as a second scoring average beside the
      // card's figure (W26, F-0009). Its mark is the line's own dash.
      <p className="ch-shs-mean-key ch-num">
        <svg width="16" height="2" viewBox="0 0 16 2" aria-hidden="true">
          <line className="ch-shs-parline" x1="0" x2="16" y1="1" y2="1" />
        </svg>
        {vsPar ? 'Par' : `Round-day avg ${formatFixed(ref, 1)}`}
      </p>
    )}
    </>
  );
}

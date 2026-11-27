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

/** The least height the team preview's scale spans, in strokes. */
const TEAM_MIN_SPAN = 4;

/**
 * The least depth the team's bars from par span, in strokes. The bars stand on par, so their lengths are already true to one another;
 * the floor only keeps a team within a stroke of par from filling the drawing, where +0.2 and +0.4 would look like a big change.
 */
const TEAM_BAR_MIN_SPAN = 3;

/** A team preview's measured width and Text Size: the drawing is laid out in pixels, so it follows its card and iPhone Text Size. */
function useTeamChartBox() {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      setWidth(Math.max(240, el.clientWidth));
      setK(readTypeK(el));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { box, width, k };
}

/** Rounded at the data end, square where the bar meets par: from par at `y0` to `y1`, `x` to `x + w`. */
export function parBarPath(x: number, w: number, y0: number, y1: number): string {
  const len = Math.abs(y1 - y0);
  const r = Math.min(4, w / 2, len);
  const xr = x + w;
  const f = (q: number) => Number(q.toFixed(2));
  if (y1 >= y0) {
    return `M${f(x)},${f(y0)}H${f(xr)}V${f(y1 - r)}A${f(r)},${f(r)} 0 0 1 ${f(xr - r)},${f(y1)}H${f(x + r)}A${f(r)},${f(r)} 0 0 1 ${f(x)},${f(y1 - r)}Z`;
  }
  return `M${f(x)},${f(y0)}V${f(y1 + r)}A${f(r)},${f(r)} 0 0 1 ${f(x + r)},${f(y1)}H${f(xr - r)}A${f(r)},${f(r)} 0 0 1 ${f(xr)},${f(y1 + r)}V${f(y0)}Z`;
}

/**
 * The team's feature chart (08 criterion 50): a preview, as Health's trend cards are, with the full chart one tap away in Scoring
 * detail. Against par when every round day has it (CH-01), each day is a bar from par; in strokes otherwise, the line. Neither draws
 * axis numbers, gridlines, end values or a second average: the card's figure is the average, and any other number beside it read as a
 * second average that disagreed with it (W26, F-0009, STATS-P-04; owner's screenshot, 27 Nov 2026). Not interactive: the card is the tap.
 */
export function TeamFeatureChart({ days }: { days: ReadonlyArray<TeamDay> }) {
  const known = days.filter((d): d is TeamDay & { score: number } => d.score != null);
  if (!known.length) return null;
  return teamDaysVsPar(known) ? <TeamParBars days={known} /> : <TeamTrendLine days={known} />;
}

/**
 * Round days as bars from par (owner, 27 Nov 2026: "Now I want it completely redesigned"). The length of a bar is the day's strokes
 * against par per 18, so a shorter bar is better golf: a day over par hangs below the line, a day under par rises above it in the
 * gain fill, and the newest day is drawn bright. Bars, not a line, because each day is its own sum and the eye compares lengths from
 * one zero (Apple HIG, Charts); a small change draws small, so the drawing cannot argue with "No clear change". The scale spans at
 * least TEAM_BAR_MIN_SPAN strokes. Days stand in even slots: a bar's width carries no time, and a slot each keeps every day the same mark
 * (CH-11 spaces the line's points by date; the line keeps that). A one-round day is hollow (W26). Par is named at its left end.
 */
function TeamParBars({ days }: { days: ReadonlyArray<TeamDay & { score: number }> }) {
  const { box, width, k } = useTeamChartBox();
  const n = days.length;
  const v = days.map((d) => d.toPar!);
  const fs = 13 * k;
  // Par's word in the footnote role, in a gutter at the line's left end, so no bar ever runs through it.
  const G = Math.ceil(3 * fs * 0.62) + 8;
  const T = Math.ceil(fs * 0.6);
  const B = Math.ceil(fs * 1.4) + 8;
  const plot = H - T - B;
  const up = Math.max(0, -Math.min(...v));
  const down = Math.max(0, Math.max(...v));
  const span = Math.max(up + down, TEAM_BAR_MIN_SPAN);
  // The room the floor adds goes on the side the bars already take, so par sits at the top when every day is over it.
  const above = up === 0 ? 0 : down === 0 ? span : up + ((span - up - down) * up) / (up + down);
  const unit = plot / span;
  // Par to the hundredth, as the bars' paths are written, so every bar meets the line exactly.
  const par = Number((T + above * unit).toFixed(2));
  const slot = (width - G) / n;
  const bw = Math.max(2, Math.min(28, Math.max(6, slot * 0.5), slot - 2));
  const cx = (i: number) => G + slot * (i + 0.5);
  const one = teamLineDays(days).one;
  const half = (label: string) => Math.ceil(label.length * fs * 0.3);
  const first = days[0]!.label;
  const last = days[n - 1]!.label;
  // Each end date centred under its bar, kept inside the drawing; par's word sits on its line, never on the date row.
  const dateX = (i: number, label: string) => Math.min(Math.max(cx(i), half(label)), width - half(label));
  const say = (q: number) => (formatToPar(q, 1) === 'E' ? 'level par' : formatToPar(q, 1));
  const label =
    `Team score against par, per 18 holes, by round day, from ${say(v[0]!)} on ${first} to ${say(v[n - 1]!)} on ${last}. ` +
    'Bars hang below par for days over par and rise above it for days under par.' +
    (one.size ? ` ${one.size} ${pluralWord(one.size, 'day', 'days')} with one round ${one.size === 1 ? 'is' : 'are'} drawn hollow.` : '');
  return (
    <div className="ch-shs-tbars">
      <div ref={box} className="ch-shs-chart" role="img" aria-label={label}>
        <svg viewBox={`0 0 ${width} ${H}`} height={H} aria-hidden="true">
          {v.map((q, i) => {
            const len = Math.max(3, Math.abs(q) * unit);
            const under = q < 0;
            const cls = 'ch-shs-tbar' + (under ? ' is-under' : '') + (i === n - 1 ? ' is-last' : '') + (one.has(i) ? ' is-one' : '');
            return <path key={i} className={cls} d={parBarPath(cx(i) - bw / 2, bw, par, under ? par - len : par + len)} />;
          })}
          <line className="ch-shs-tbars__par" x1={G} x2={width} y1={par} y2={par} />
          <text className="ch-shs-ax" x={0} y={par} dy="0.35em">
            Par
          </text>
          <text className="ch-shs-ax" x={dateX(0, first)} y={H - 5} textAnchor="middle">
            {first}
          </text>
          {n > 1 && (
            <text className="ch-shs-ax" x={dateX(n - 1, last)} y={H - 5} textAnchor="middle">
              {last}
            </text>
          )}
        </svg>
      </div>
      <p className="ch-shs-mean-key">Each bar is a round day, against par</p>
    </div>
  );
}

/**
 * Round days as a line, in strokes, when a day has no figure against par: 160 tall, the line in the gain fill, a dot each round day,
 * the newest a size up, and the first and last dates under them. Better rounds sit higher, as on every Clubhouse score chart, and the
 * line under the drawing says so. Straight segments through every day in the window (S2.4); a one-round day is hollow (W26).
 */
function TeamTrendLine({ days: known }: { days: ReadonlyArray<TeamDay & { score: number }> }) {
  const { box, width, k } = useTeamChartBox();
  const n = known.length;
  const v = known.map((d) => d.score);
  // Dates in the footnote role, centred under the end dots: room for half of each, and for the newest dot's ring.
  const fs = 13 * k;
  const half = (label: string) => Math.ceil(label.length * fs * 0.3);
  const L = Math.max(8, half(known[0]!.label));
  const R = Math.max(8, half(known[n - 1]!.label));
  const T = 8;
  const B = Math.ceil(fs * 1.4) + 8;
  const min = Math.min(...v);
  const max = Math.max(...v);
  // At least TEAM_MIN_SPAN strokes tall, centred on the days: with no axis numbers, a 1.7-stroke drift drawn edge to edge read as a big
  // change beside "No clear change" (owner's screenshot, 27 Nov 2026). Four strokes is the span the axis'd chart drew (72 to 76).
  const pad = Math.max(0.25, (max - min) * 0.08);
  const mid = (min + max) / 2;
  const lo = Math.min(min - pad, mid - TEAM_MIN_SPAN / 2);
  const hi = Math.max(max + pad, mid + TEAM_MIN_SPAN / 2);
  // Round days sit by their dates when every day has one (CH-11), evenly otherwise.
  const share = dateShares(known.map((d) => d.date));
  const x = (i: number) => L + (n === 1 ? 0.5 : share[i]!) * (width - L - R);
  const y = (q: number) => T + ((q - lo) / (hi - lo || 1)) * (H - T - B);
  const pts = v.map((q, i) => [x(i), y(q)] as const);
  const joined = teamLineDays(known);
  const linePts = joined.line.map((i) => pts[i]!);
  const line = straightPath(linePts);
  const x0 = pts[0]![0];
  const xn = pts[n - 1]![0];
  return (
    <>
    <div ref={box} className="ch-shs-chart" role="img" aria-label={`Team scoring average by round day, from ${formatFixed(v[0]!, 1)} to ${formatFixed(v[n - 1]!, 1)}. Lower scores sit higher.${joined.one.size ? ` ${joined.one.size} ${pluralWord(joined.one.size, 'day', 'days')} with one round ${joined.one.size === 1 ? 'is' : 'are'} marked as hollow points.` : ''}`}>
      <svg viewBox={`0 0 ${width} ${H}`} height={H} aria-hidden="true">
        {line && <path className="ch-shs-avgline" d={line} stroke="var(--ch-shs-s-gain-fill)" />}
        {pts.map((p, i) => (
          <circle key={i} className={'ch-shs-rdot' + (joined.one.has(i) ? ' is-one' : '')} cx={p[0]} cy={p[1]} r={i === n - 1 ? 5 : 3.4} />
        ))}
        <text className="ch-shs-ax" x={x0} y={H - 5} textAnchor="middle">
          {known[0]!.label}
        </text>
        {n > 1 && (
          <text className="ch-shs-ax" x={xn} y={H - 5} textAnchor="middle">
            {known[n - 1]!.label}
          </text>
        )}
      </svg>
    </div>
    {/* Which way is better, in words, under the drawing: no axis numbers say it on a preview (owner's screenshot, 27 Nov 2026). */}
    <p className="ch-shs-mean-key">Lower scores sit higher</p>
    </>
  );
}

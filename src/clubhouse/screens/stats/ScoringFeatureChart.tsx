'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { hapticScrub } from '../../lib/haptics';
import { meanSeries, parLine, type TrendRound } from './round-trend';
import { monoPath, type ShsTone } from './shs-figures';

const H = 160;
const PAD = { l: 4, r: 30, t: 10, b: 26 };
/** The line's morph on a window change (07 M-STATS-10). */
const MORPH_MS = 360;
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
  let lo = Math.min(...scores, ...(par == null ? [] : [par])) - 1;
  let hi = Math.max(...scores) + 1;
  const step = hi - lo > 10 ? 4 : hi - lo > 6 ? 2 : 1;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const x = (i: number) => PAD.l + (n <= 1 ? (width - PAD.l - PAD.r) / 2 : (i * (width - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + ((v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const avg = meanSeries(shown)
    .map((v, i) => (v == null ? null : ([x(i), y(v)] as const)))
    .filter((p): p is readonly [number, number] => p != null);
  const line = monoPath(avg);
  const area = avg.length ? `${line}L${avg[avg.length - 1]![0]},${H - PAD.b}L${avg[0]![0]},${H - PAD.b}Z` : '';
  const colour = tone === 'gain' ? 'var(--s-gain-fill)' : tone === 'loss' ? 'var(--s-loss-fill)' : 'var(--s-flat)';

  // The morph, on the drawn elements: React has already written the end state, and this walks to it. A window change mid-morph starts
  // from the shape on screen; Reduce Motion and a first paint draw it at rest.
  const reduced = useChReducedMotion();
  const areaEl = useRef<SVGPathElement>(null);
  const lineEl = useRef<SVGPathElement>(null);
  const dotsEl = useRef<SVGGElement>(null);
  const shape = useRef<{ dots: readonly Pt[]; avg: readonly Pt[] } | null>(null);
  const roundsKey = shown.map((r) => r.id).join();
  const dotPts: Pt[] = shown.map((r, i) => [x(i), y(r.value)]);
  useLayoutEffect(() => {
    const was = shape.current;
    const end = { dots: dotPts, avg };
    if (!was || reduced || was.dots.length === 0) {
      shape.current = end;
      return;
    }
    const startDots = dotPts.map((p) => heightAt(was.dots, p[0]) ?? p[1]);
    const startAvg = avg.map((p) => heightAt(was.avg, p[0]) ?? p[1]);
    const bottom = H - PAD.b;
    const circles = Array.from(dotsEl.current?.querySelectorAll('circle') ?? []);
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = morphEase(Math.min(1, (now - t0) / MORPH_MS));
      const a = avg.map((p, i) => [p[0], startAvg[i]! + (p[1] - startAvg[i]!) * t] as const);
      const d = dotPts.map((p, i) => [p[0], startDots[i]! + (p[1] - startDots[i]!) * t] as const);
      shape.current = { dots: d, avg: a };
      const path = monoPath(a);
      if (lineEl.current) lineEl.current.setAttribute('d', path);
      if (areaEl.current && a.length) areaEl.current.setAttribute('d', `${path}L${a[a.length - 1]![0]},${bottom}L${a[0]![0]},${bottom}Z`);
      circles.forEach((c, i) => d[i] && c.setAttribute('cy', String(d[i]![1])));
      if (t < 1) raf = requestAnimationFrame(step);
      else shape.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new set of rounds starts it; a resize just redraws
  }, [roundsKey, reduced]);

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
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const left = e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - (e.clientX - left));
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
    <div
      ref={box}
      className="ch-shs-chart"
      data-ch="stats-hero-chart"
      data-ch-no-open=""
      role={interactive ? 'slider' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`Scores for ${n} ${n === 1 ? 'round' : 'rounds'}, from ${Math.round(first.value)} on ${first.label} to ${Math.round(last.value)} on ${last.label}. Use the arrow keys to read each round.`}
      aria-valuemin={interactive ? 1 : undefined}
      aria-valuemax={interactive ? n : undefined}
      aria-valuenow={interactive ? (read ?? n - 1) + 1 : undefined}
      aria-valuetext={interactive ? (read == null ? `Latest ${Math.round(last.value)}, ${last.label}` : `${Math.round(shown[read]!.value)}, ${shown[read]!.label}`) : undefined}
      onPointerDown={(e) => {
        if (!interactive) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        hapticScrub('start');
        pick(e);
      }}
      onPointerMove={(e) => {
        if (interactive && e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
      }}
      onPointerUp={() => {
        if (read == null) return;
        hapticScrub('end');
        set(null);
      }}
      onPointerCancel={() => set(null)}
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

/** The team's feature chart (08 criterion 50): 160 tall, its line and area always the gain fill, the mean dashed and named. Not interactive: the card is the tap. */
export function TeamFeatureChart({ days, mean }: { days: ReadonlyArray<{ label: string; score: number | null }>; mean: number | null }) {
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
  const known = days.filter((d): d is { label: string; score: number } => d.score != null);
  const n = known.length;
  if (!n) return null;
  const R = 30;
  const B = 24;
  const T = 8;
  const v = known.map((d) => d.score);
  const lo = Math.floor(Math.min(...v) - 0.5);
  const hi = Math.ceil(Math.max(...v) + 0.5);
  const x = (i: number) => (n === 1 ? (width - R) / 2 : (i * (width - R)) / (n - 1));
  const y = (q: number) => T + ((q - lo) / (hi - lo || 1)) * (H - T - B);
  const pts = v.map((q, i) => [x(i), y(q)] as const);
  const line = monoPath(pts);
  const ticks: number[] = [];
  for (let q = lo; q <= hi; q++) if ((q - lo) % (hi - lo > 4 ? 2 : 1) === 0) ticks.push(q);
  return (
    <div ref={box} className="ch-shs-chart" role="img" aria-label={`Team scoring average by round day, from ${v[0]!.toFixed(1)} to ${v[n - 1]!.toFixed(1)}. Lower scores sit higher.`}>
      <svg viewBox={`0 0 ${width} ${H}`} height={H} aria-hidden="true">
        <defs>
          <linearGradient id="ch-shs-tg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--s-gain-fill)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--s-gain-fill)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((q) => (
          <g key={q}>
            <line className="ch-shs-grid" x1="0" x2={width - R + 4} y1={y(q)} y2={y(q)} />
            <text className="ch-shs-ax" x={width} y={y(q) + 4} textAnchor="end">
              {q}
            </text>
          </g>
        ))}
        {mean != null && <line className="ch-shs-parline" x1="0" x2={width - R + 4} y1={y(mean)} y2={y(mean)} />}
        {line && <path d={`${line}L${pts[n - 1]![0]},${H - B}L0,${H - B}Z`} fill="url(#ch-shs-tg)" />}
        {line && <path className="ch-shs-avgline" d={line} stroke="var(--s-gain-fill)" />}
        {pts.map((p, i) => (
          <circle key={i} className="ch-shs-rdot" cx={p[0]} cy={p[1]} r={i === n - 1 ? 5 : 3.4} />
        ))}
        <text className="ch-shs-ax" x="0" y={H - 5}>
          {known[0]!.label}
        </text>
        {n > 1 && (
          <text className="ch-shs-ax" x={width - R} y={H - 5} textAnchor="end">
            {known[n - 1]!.label}
          </text>
        )}
        {mean != null && (
          <text className="ch-shs-ax" x="4" y={y(mean) - 6}>
            Mean {mean.toFixed(1)}
          </text>
        )}
      </svg>
    </div>
  );
}

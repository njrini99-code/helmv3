'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { hapticScrub } from '../../lib/haptics';
import { useChartPin } from '../../lib/use-chart-pin';

/**
 * One line chart for Clubhouse (B5): every trend reads the same way. Better is always up (a lower score sits higher with
 * `lowerIsBetter`), a missing value is a gap in the line, never a bridge or a zero, segments are straight, small multiples
 * share one `domain` so the same value sits at the same height in each, and ticks are a few round numbers in tabular
 * figures. A pointer, a finger dragged sideways or the arrow keys read a point in the line above the plot (`useChartPin`),
 * with a scrub tick under the finger. An early line (`early`) draws its points hollow. No draw-in animation (Q-153).
 */

export interface ChLinePoint {
  /** What the point is called on the axis and in the readout ("Sep 23"). */
  x: string;
  y: number | null;
}

/** Room for the value ticks at the left; without them the line runs nearly edge to edge. */
const PAD_AXIS = { l: 34, r: 14, t: 14, b: 24 } as const;
const PAD_BARE = { l: 4, r: 4, t: 10, b: 22 } as const;
/** Bare with no end labels (a small multiple or a row's spark): an eighth of the height above and below, 3 to 8. */
const padMini = (h: number) => {
  const v = Math.min(8, Math.max(3, h / 8));
  return { l: 4, r: 4, t: v, b: v };
};

/** A few round ticks that cover [lo, hi]: a step of 0.5, 1, 2, 5, 10 or 20, so the labels are plain numbers. */
export function lineTicks(lo: number, hi: number, want = 3): number[] {
  const span = Math.max(hi - lo, 1e-6);
  const step = [0.5, 1, 2, 5, 10, 20].find((s) => s >= span / want) ?? 20;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(2)));
  return out;
}

/** The domain a set of lines shares: their values (and a baseline), padded by an eighth of the span, at least `minPad`. */
export function lineDomain(values: Array<number | null>, baseline: number | null = null, minPad = 0.5): [number, number] {
  const known = values.filter((v): v is number => v != null);
  if (baseline != null) known.push(baseline);
  if (!known.length) return [0, 1];
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const pad = Math.max((hi - lo) * 0.12, minPad);
  return [lo - pad, hi + pad];
}

/** The plot's y for a value: better higher. With `lowerIsBetter` the low end of the domain is at the top. */
export function lineY(domain: [number, number], top: number, height: number, lowerIsBetter: boolean) {
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  return (v: number) => top + (lowerIsBetter ? (v - lo) / span : (hi - v) / span) * height;
}

/** Straight segments through the points that exist; a null ends one segment and the next value starts another (an `M`). */
export function linePath(values: Array<number | null>, x: (i: number) => number, y: (v: number) => number): string {
  let d = '';
  let open = false;
  values.forEach((v, i) => {
    if (v == null) {
      open = false;
      return;
    }
    d += `${open ? ' L' : d ? ' M' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    open = true;
  });
  return d;
}

export function Line({
  points,
  lowerIsBetter = false,
  domain,
  baseline,
  early = false,
  label,
  format = (v) => String(v),
  readout,
  note,
  size = 'phone',
  axis = true,
  marks = 'all',
  wash = false,
  readAt = 'line',
  ends = true,
  interactive = true,
  width,
  height,
  className,
}: {
  points: ChLinePoint[];
  lowerIsBetter?: boolean;
  /** Shared across small multiples; drawn from the points (and the baseline) when left out. */
  domain?: [number, number];
  /** A reference line and its words ("Par 72", "Tour average"); dashed for a mean the line moves around. */
  baseline?: { value: number; label?: string; dashed?: boolean };
  /** A thin line: its points draw hollow. */
  early?: boolean;
  /** The chart's summary for a screen reader, before the arrow-key hint. */
  label: string;
  format?: (v: number) => string;
  /** What the line above the plot says for a point; the point's name and value when left out. */
  readout?: (i: number) => string;
  /** What the line above the plot says at rest. */
  note?: ReactNode;
  size?: 'phone' | 'desktop';
  /** The value ticks and their rules; off where the page says the figures in words (a phone summary). */
  axis?: boolean;
  /** Every point drawn, or only the newest (a dense line). */
  marks?: 'all' | 'last';
  /** A faint fill under the line, toward the worse edge; or, with `'baseline'`, between the line and the baseline. */
  wash?: boolean | 'baseline';
  /** Where a point reads: a line above the plot, or a tip over its top corner (where the page has no room for a line). */
  readAt?: 'line' | 'tip';
  /** The first and last points' names under the plot. */
  ends?: boolean;
  /** Off where the chart sits inside a control (a leg card is a button): no readout, no focus, hidden from a screen reader. */
  interactive?: boolean;
  /** The plot's width in its own units: 340 on a phone, 680 on a desktop, or about its drawn width for a small multiple. */
  width?: number;
  /** The plot's height in its own units; the chart scales to fit its width. */
  height?: number;
  className?: string;
}) {
  const W = width ?? (size === 'phone' ? 340 : 680);
  const H = height ?? (size === 'phone' ? 168 : 184);
  const PAD = axis ? PAD_AXIS : ends ? PAD_BARE : padMini(H);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const n = points.length;
  const pin = useChartPin(n, 'x', [PAD.l / W, 1 - PAD.r / W]);
  const values = points.map((p) => p.y);
  const dom = domain ?? lineDomain(values, baseline?.value ?? null);
  const y = lineY(dom, PAD.t, plotH, lowerIsBetter);
  const x = (i: number) => PAD.l + ((i + 0.5) / Math.max(n, 1)) * plotW;
  const ticks = axis ? lineTicks(dom[0], dom[1]) : [];
  const newest = values.reduce<number>((at, v, i) => (v != null ? i : at), -1);
  const path = linePath(values, x, y);
  // The wash closes each segment down to the worse edge of the plot (the bottom, since better is up), or to the baseline.
  const floor = wash === 'baseline' && baseline ? y(baseline.value).toFixed(1) : String(PAD.t + plotH);
  const washPath = wash
    ? path.replace(/M([\d.]+),([\d.]+)((?: L[\d.]+,[\d.]+)*)/g, (_m, x0, y0, rest: string) => {
        const xEnd = /L([\d.]+),[\d.]+$/.exec(rest)?.[1] ?? x0;
        return `M${x0},${floor} L${x0},${y0}${rest} L${xEnd},${floor} Z`;
      })
    : '';
  const read = (i: number | null) => (i == null ? null : readout ? readout(i) : `${points[i]!.x} · ${points[i]!.y == null ? 'No figure' : format(points[i]!.y!)}`);

  // A tick under the finger as the readout moves from point to point while it scrubs (the slider's detent).
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (pin.active != null && last.current != null && pin.active !== last.current) hapticScrub('step');
    last.current = pin.active;
  }, [pin.active]);

  const washId = `ch-line-wash-${useId().replace(/:/g, '')}`;
  const shown = read(pin.active);
  const plot = (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="ch-line__svg"
      focusable="false"
      {...(interactive ? { role: 'img', 'aria-label': label, ...pin.area } : { 'aria-hidden': true })}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="ch-line__grid" />
          <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" className="ch-line__t">
            {format(t)}
          </text>
        </g>
      ))}
      {baseline && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(baseline.value)} y2={y(baseline.value)} className={'ch-line__ref' + (baseline.dashed ? ' is-dashed' : '')} />
          {baseline.label && (
            <text x={W - PAD.r} y={y(baseline.value) - 4} textAnchor="end" className="ch-line__t">
              {baseline.label}
            </text>
          )}
        </g>
      )}
      {wash === 'baseline' && baseline ? (
        <path d={washPath} className="ch-line__wash is-flat" />
      ) : wash && (
        <>
          <defs>
            <linearGradient id={washId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="ch-line__wash-top" />
              <stop offset="1" className="ch-line__wash-end" />
            </linearGradient>
          </defs>
          <path d={washPath} className="ch-line__wash" fill={`url(#${washId})`} />
        </>
      )}
      {pin.active != null && <line x1={x(pin.active)} x2={x(pin.active)} y1={PAD.t - 4} y2={H - PAD.b} className="ch-line__guide" />}
      <path d={path} className="ch-line__path" fill="none" />
      {points.map((p, i) =>
        p.y == null || (marks === 'last' && i !== newest && i !== pin.active) ? null : (
          <circle
            key={`${p.x}-${i}`}
            cx={x(i)}
            cy={y(p.y)}
            r={i === pin.active ? 5 : 3}
            className={'ch-line__dot' + (early ? ' is-hollow' : '') + (i === pin.active ? ' is-active' : '')}
          />
        ),
      )}
      {ends && n > 0 && (
        <>
          <text x={PAD.l} y={H - 6} className="ch-line__t">
            {points[0]!.x}
          </text>
          <text x={W - PAD.r} y={H - 6} textAnchor="end" className="ch-line__t">
            {points[n - 1]!.x}
          </text>
        </>
      )}
    </svg>
  );
  // A span, since this chart sits inside a button or a span (phrasing content only); .ch-line makes it a block.
  if (!interactive)
    return (
      <span className={'ch-line' + (className ? ` ${className}` : '')} aria-hidden="true">
        {plot}
      </span>
    );
  return (
    <div
      className={'ch-line' + (className ? ` ${className}` : '')}
      role="group"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the arrow keys can read each point, as a scroll region is focusable to scroll
      tabIndex={0}
      aria-label={`${label} Use the arrow keys to read each point.`}
      {...pin.container}
    >
      {readAt === 'line' ? (
        <p className={'ch-line__read' + (shown ? ' is-on' : '')} aria-hidden="true">
          {shown ?? note}
        </p>
      ) : (
        shown && (
          <p className="ch-line__tip ch-num" aria-hidden="true">
            {shown}
          </p>
        )
      )}
      <p className="ch-sr-only" aria-live="polite">
        {read(pin.pinned)}
      </p>
      {plot}
    </div>
  );
}

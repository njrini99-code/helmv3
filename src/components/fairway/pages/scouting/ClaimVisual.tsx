/**
 * ============================================================================
 * Scouting Report · ClaimVisual — one bespoke micro-visual per claim
 * ----------------------------------------------------------------------------
 * Three instruments, chosen by the view model from what the evidence can
 * honestly support. All share one convention: RIGHT (or UP) IS BETTER, so a
 * lower-is-better metric runs its axis reversed. Green ink = better, amber =
 * worse, neutral when the metric's direction is unknown. Every mark carries a
 * direct label in the metric's unit; there are no legends.
 *
 *   bar   — a signed bar off the comparison baseline (the default)
 *   pair  — before → after dots when the engine recorded a movement
 *   spark — per-round series with a dashed baseline, only when the metric
 *           maps exactly to a round column (its window is printed under it)
 *
 * Static SVG. No entrance animation, so nothing fades in from zero.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import type { ClaimVisual as ClaimVisualModel } from './scouting-model';

const W = 320;
const TONE_FILL = {
  good: 'fill-accent-500',
  warn: 'fill-fw-warning',
  neutral: 'fill-text-tertiary',
} as const;
const TONE_STROKE = {
  good: 'stroke-accent-500',
  warn: 'stroke-fw-warning',
  neutral: 'stroke-text-tertiary',
} as const;
const LABEL = 'fill-text-secondary text-caption tabular-nums';
const LABEL_QUIET = 'fill-text-tertiary text-caption tabular-nums';

function SignedBar({ v }: { v: Extract<ClaimVisualModel, { kind: 'bar' }> }) {
  const mid = W / 2;
  const half = W / 2 - 64; // room for the end label
  const len = Math.max(2, v.magnitude * half);
  const right = v.goodDelta >= 0;
  const x = right ? mid : mid - len;
  const labelX = right ? mid + len + 6 : mid - len - 6;
  return (
    <svg viewBox={`0 0 ${W} 40`} className="h-10 w-full max-w-[320px]" aria-hidden="true" focusable="false">
      <line x1={16} x2={W - 16} y1={12} y2={12} className="stroke-border-subtle" strokeWidth={1} />
      <rect x={x} y={7} width={len} height={10} rx={2} className={TONE_FILL[v.tone]} />
      <line x1={mid} x2={mid} y1={2} y2={22} className="stroke-text-primary" strokeWidth={1.25} />
      <text x={labelX} y={16} textAnchor={right ? 'start' : 'end'} className={cn(LABEL, 'font-semibold')}>
        {v.gapText}
      </text>
      <text x={mid} y={36} textAnchor="middle" className={LABEL_QUIET}>
        {v.baselineLabel}
      </text>
    </svg>
  );
}

function DotPair({ v }: { v: Extract<ClaimVisualModel, { kind: 'pair' }> }) {
  const vals = [v.from, v.to, ...(v.comparison !== null ? [v.comparison] : [])];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.18;
  lo -= pad;
  hi += pad;
  const x0 = 24;
  const x1 = W - 24;
  const sx = (n: number) => {
    const t = (n - lo) / (hi - lo);
    return v.reversed ? x1 - t * (x1 - x0) : x0 + t * (x1 - x0);
  };
  const fx = sx(v.from);
  const tx = sx(v.to);
  const cx = v.comparison !== null ? sx(v.comparison) : null;
  return (
    <svg viewBox={`0 0 ${W} 52`} className="h-[52px] w-full max-w-[320px]" aria-hidden="true" focusable="false">
      <line x1={x0} x2={x1} y1={24} y2={24} className="stroke-border-subtle" strokeWidth={1} />
      {cx !== null ? (
        <>
          <line x1={cx} x2={cx} y1={17} y2={31} className="stroke-text-primary" strokeWidth={1.25} />
          <text x={cx} y={11} textAnchor="middle" className={LABEL_QUIET}>
            {v.comparisonLabel}
          </text>
        </>
      ) : null}
      <line x1={fx} x2={tx} y1={24} y2={24} className={TONE_STROKE[v.tone]} strokeWidth={2} />
      <circle cx={fx} cy={24} r={4} className="fill-canvas stroke-text-tertiary" strokeWidth={1.5} />
      <circle cx={tx} cy={24} r={5} className={TONE_FILL[v.tone]} />
      <text x={fx} y={46} textAnchor="middle" className={LABEL_QUIET}>
        {v.fromText}
      </text>
      <text x={tx} y={46} textAnchor="middle" className={cn(LABEL, 'font-semibold')}>
        {v.toText}
      </text>
    </svg>
  );
}

function TrendSpark({ v }: { v: Extract<ClaimVisualModel, { kind: 'spark' }> }) {
  const vals = [...v.points, ...(v.baseline !== null ? [v.baseline] : [])];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = (hi - lo || 1) * 0.15;
  lo -= pad;
  hi += pad;
  const top = 6;
  const bottom = 34;
  const x0 = 16;
  const x1 = W - 96;
  const sy = (n: number) => {
    const t = (n - lo) / (hi - lo);
    // Up is better: a lower-is-better metric plots inverted.
    return v.reversed ? top + t * (bottom - top) : bottom - t * (bottom - top);
  };
  const step = v.points.length > 1 ? (x1 - x0) / (v.points.length - 1) : 0;
  const d = v.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(x0 + i * step).toFixed(1)},${sy(p).toFixed(1)}`).join(' ');
  const last = v.points[v.points.length - 1]!;
  const by = v.baseline !== null ? sy(v.baseline) : null;
  return (
    <svg viewBox={`0 0 ${W} 52`} className="h-[52px] w-full max-w-[320px]" aria-hidden="true" focusable="false">
      {by !== null ? (
        <>
          <line x1={x0} x2={x1} y1={by} y2={by} className="stroke-text-tertiary" strokeWidth={1} strokeDasharray="3 3" />
          <text x={x1 + 8} y={by + 4} className={LABEL_QUIET}>
            {v.baselineLabel}
          </text>
        </>
      ) : null}
      <path d={d} fill="none" className="stroke-text-secondary" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={x0 + (v.points.length - 1) * step} cy={sy(last)} r={3.5} className={TONE_FILL[v.tone]} />
      <text x={x0} y={49} className={LABEL_QUIET}>
        {v.caption}
      </text>
    </svg>
  );
}

export function ClaimVisual({ visual, summary }: { visual: ClaimVisualModel; summary: string }) {
  return (
    <figure className="m-0" data-slot="claim-visual" data-kind={visual.kind}>
      {visual.kind === 'bar' ? <SignedBar v={visual} /> : null}
      {visual.kind === 'pair' ? <DotPair v={visual} /> : null}
      {visual.kind === 'spark' ? <TrendSpark v={visual} /> : null}
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

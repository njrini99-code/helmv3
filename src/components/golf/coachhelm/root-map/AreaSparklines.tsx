'use client';

/**
 * "Moving": four tiny per-area sparklines of stored per-round strokes gained,
 * with the recent-vs-prior change from `computeSgTrends` (its own
 * minimum-window rule; no number when a window is too thin).
 */

import { Eyebrow } from '@/components/fairway';
import { formatStrokes } from '@/lib/coachhelm/root-map/build-root-map';
import type { AreaSparkline } from '@/lib/coachhelm/root-map/area-trends';

const W = 100;
const H = 32;

function path(points: number[]): { d: string; zeroY: number | null } {
  const min = Math.min(0, ...points);
  const max = Math.max(0, ...points);
  const span = max - min || 1;
  const y = (v: number) => H - 2 - ((v - min) / span) * (H - 4);
  const step = points.length > 1 ? W / (points.length - 1) : 0;
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  return { d, zeroY: y(0) };
}

export function AreaSparklines({ lines }: { lines: AreaSparkline[] }) {
  const maxN = Math.max(...lines.map((l) => l.points.length));
  const withTrend = lines.find((l) => l.trend);
  return (
    <section aria-labelledby="root-moving-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-text-primary pb-2">
        <h3 id="root-moving-heading" className="font-fw-display text-body-lg font-semibold text-text-primary">
          Moving
        </h3>
        <p className="text-caption text-text-tertiary">
          {withTrend?.trend
            ? `last ${withTrend.trend.recentN} rounds vs ${withTrend.trend.priorN} before`
            : `last ${maxN} rounds`}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-4 min-[520px]:grid-cols-4">
        {lines.map((l) => {
          const { d, zeroY } = l.points.length >= 2 ? path(l.points) : { d: '', zeroY: null };
          const delta = l.trend?.delta ?? null;
          const tone =
            delta === null || l.trend?.direction === 'steady'
              ? 'text-text-secondary'
              : delta > 0
                ? 'text-fw-success-ink'
                : 'text-fw-danger-ink';
          return (
            <li key={l.area} className="flex min-w-0 flex-col gap-1">
              <Eyebrow as="p" tone="secondary">
                {l.label}
              </Eyebrow>
              {d ? (
                <svg
                  role="img"
                  aria-label={`${l.label}, strokes gained per round over the last ${l.points.length} rounds: ${l.points
                    .map((p) => formatStrokes(p, { signed: true }))
                    .join(', ')}`}
                  viewBox={`0 0 ${W} ${H}`}
                  preserveAspectRatio="none"
                  className="h-8 w-full overflow-visible"
                >
                  {zeroY !== null ? (
                    <line x1={0} x2={W} y1={zeroY} y2={zeroY} style={{ stroke: 'var(--fw-viz-benchmark)' }} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                  ) : null}
                  <path d={d} fill="none" style={{ stroke: 'var(--fw-color-text-primary)' }} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                </svg>
              ) : (
                <p className="h-8 text-caption text-text-tertiary">Not enough rounds</p>
              )}
              <p className={`font-fw-mono text-body-sm font-medium tabular-nums ${tone}`}>
                {delta !== null ? formatStrokes(delta, { signed: true }) : '—'}
                <span className="sr-only">
                  {delta !== null ? ' change, recent rounds against the rounds before' : ' no change called: too few rounds in a window'}
                </span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * SplitStrip: do I score worse under pressure? (design-direction §5.1; ledger DS-13).
 *
 * Two rows (tournament and qualifier, then practice) on one shared to-par
 * axis: a tick per round, toned by the golf rule (under par green, over par
 * amber, level par secondary), a mean bar per row, and the gap between the
 * two means written between the rows. The gap is `first − second`, printed
 * by the registry as `practice_tournament_delta` (Pressure gap), so a higher
 * score under pressure reads as amber.
 *
 * The figure is `role="img"` with an aria-label that carries both means,
 * both samples and the gap. Drawn at first paint. No hooks, so it renders on
 * the server as well.
 */

import { cn } from '@/lib/utils';
import { formatMetric, formatSample, METRIC_TONE_CLASS } from '@/lib/golf/metrics/display-registry';
import { css2, spokenMetric } from './spokenMetric';

export interface SplitStripRow {
  id: string;
  /** "Tournament and qualifier", "Practice". */
  label: string;
  /** Each round's score to par. */
  rounds: number[];
}

export interface SplitStripProps {
  /** The pressure row first, the comparison row second. */
  rows: [SplitStripRow, SplitStripRow];
  /** Registry id for the gap. */
  gapMetricId?: string;
  className?: string;
}

const MEAN_ID = 'scoring_average_vs_par';

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function tickTone(v: number): string {
  return v < 0 ? 'bg-accent-fill' : v > 0 ? 'bg-fw-warning' : 'bg-text-secondary';
}

export function SplitStrip({ rows, gapMetricId = 'practice_tournament_delta', className }: SplitStripProps) {
  const reads = rows.map((row) => {
    const finite = row.rounds.filter((v) => Number.isFinite(v));
    const m = formatMetric(MEAN_ID, mean(finite), { sample: finite.length });
    return { row, rounds: finite, m, mean: m.missing ? null : mean(finite) };
  });
  const [a, b] = reads as [(typeof reads)[number], (typeof reads)[number]];
  const gapValue = a.mean != null && b.mean != null ? a.mean - b.mean : null;
  const gap = formatMetric(gapMetricId, gapValue, { sample: Math.min(a.rounds.length, b.rounds.length) });

  const all = [0, ...a.rounds, ...b.rounds];
  const lo0 = Math.min(...all);
  const hi0 = Math.max(...all);
  const pad = Math.max(1, (hi0 - lo0) * 0.08);
  const lo = lo0 - pad;
  const span = hi0 + pad - lo;
  const pct = (v: number) => css2(((v - lo) / span) * 100);

  const spoken = [
    ...reads.map((r) => `${r.row.label}: ${formatSample(r.rounds.length)}, average ${spokenMetric(r.m)}`),
    `${gap.label} ${spokenMetric(gap)}`,
  ].join('. ');

  const track = (r: (typeof reads)[number]) => (
    <div data-row={r.row.id}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 break-words text-body text-text-primary">{r.row.label}</span>
        <span className="flex-shrink-0 text-footnote text-text-secondary">
          <span
            data-mean-text
            className={cn(
              'tabular-nums',
              r.m.missing || r.m.readQuality === 'early' ? 'text-text-secondary' : 'text-text-primary',
            )}
          >
            {r.m.text}
          </span>{' '}
          avg · {r.m.missing && r.m.qualityNote ? r.m.qualityNote : formatSample(r.rounds.length)}
        </span>
      </div>
      <div className="relative mt-1 h-7">
        <span className="absolute inset-x-0 top-1/2 h-px bg-border-subtle" />
        {r.rounds.map((v, i) => (
          <span
            key={i}
            data-tick
            className={cn('absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full', tickTone(v))}
            style={{ left: `${pct(v)}%` }}
          />
        ))}
        {r.mean != null ? (
          <span
            data-mean
            className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-text-primary"
            style={{ left: `${pct(r.mean)}%` }}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <figure data-slot="split-strip" className={cn('m-0 w-full font-fw-sans', className)}>
      <div role="img" aria-label={spoken} className="relative">
        <div aria-hidden="true">
          <span
            data-par
            className="pointer-events-none absolute inset-y-0 w-px bg-border-strong"
            style={{ left: `${pct(0)}%` }}
          />
          {track(a)}
          <p className="my-2 text-footnote text-text-secondary">
            {gap.label}{' '}
            <span className={cn('tabular-nums', gap.missing ? '' : METRIC_TONE_CLASS[gap.tone] || 'text-text-primary')}>
              {gap.text}
            </span>
            {gap.missing && gap.qualityNote ? ` · ${gap.qualityNote}` : null}
          </p>
          {track(b)}
        </div>
      </div>
      <div aria-hidden="true" className="relative mt-1 h-4 text-caption text-text-tertiary">
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(0)}%` }}>
          Par
        </span>
      </div>
    </figure>
  );
}

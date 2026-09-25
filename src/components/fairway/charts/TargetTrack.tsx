/**
 * TargetTrack: is my focus area working? (design-direction §5.1; ledger DS-13).
 *
 * One metric on its own axis: where it started (baseline), where it is now
 * (current) and a target tick. The fill runs from baseline to current, green
 * when the move is toward the target and amber when it is away; a current
 * value on the far side of the target has met it. Days left print at the end.
 *
 * Every number goes through `formatMetric`, so "31.4", "48%" and "12 ft" match
 * every other golf surface. The track is `role="img"` with an aria-label
 * that carries all the numbers, so the visible readout under it is hidden
 * from assistive tech rather than read twice.
 *
 * Drawn at first paint. No hooks, so it renders on the server as well.
 */

import { cn } from '@/lib/utils';
import { formatMetric } from '@/lib/golf/metrics/display-registry';
import { css2, spokenMetric } from './spokenMetric';

export interface TargetTrackProps {
  /** Registry id that prints the three values. */
  metricId: string;
  /** Row label; defaults to the registry label. */
  label?: string;
  baseline: number;
  current: number | null;
  target: number;
  /** Sample behind `current`; under the floor no current is drawn. */
  sample?: number | null;
  daysLeft?: number | null;
  className?: string;
}

type Progress = 'toward' | 'away' | 'met' | 'none';

function progressOf(baseline: number, current: number | null, target: number): Progress {
  if (current == null) return 'none';
  const up = target >= baseline;
  if (up ? current >= target : current <= target) return 'met';
  const moved = current - baseline;
  if (moved === 0) return 'none';
  return (moved > 0) === up ? 'toward' : 'away';
}

const FILL: Record<Progress, string> = {
  toward: 'bg-accent-fill',
  met: 'bg-accent-fill',
  away: 'bg-fw-warning',
  none: 'bg-text-tertiary',
};

const INK: Record<Progress, string> = {
  toward: 'text-fw-success-ink',
  met: 'text-fw-success-ink',
  away: 'text-fw-warning-ink',
  none: 'text-text-primary',
};

function daysText(days: number): string {
  const d = Math.max(0, Math.round(days));
  return d === 0 ? 'Due today' : `${d} ${d === 1 ? 'day' : 'days'} left`;
}

export function TargetTrack({
  metricId,
  label,
  baseline,
  current,
  target,
  sample,
  daysLeft,
  className,
}: TargetTrackProps) {
  const base = formatMetric(metricId, baseline);
  const goal = formatMetric(metricId, target);
  const now = formatMetric(metricId, current, { sample });
  const name = label ?? base.label;
  const shown = now.missing ? null : current;
  const progress = progressOf(baseline, shown, target);

  // The axis spans the three values with a little room past each end.
  const values = [baseline, target, ...(shown != null ? [shown] : [])];
  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  const pad = hi0 === lo0 ? 1 : (hi0 - lo0) * 0.12;
  const lo = lo0 - pad;
  const span = hi0 + pad - lo;
  const pct = (v: number) => ((v - lo) / span) * 100;

  const fillFrom = shown != null ? Math.min(pct(baseline), pct(shown)) : pct(baseline);
  const fillTo = shown != null ? Math.max(pct(baseline), pct(shown)) : pct(baseline);

  const spoken = [
    `${name}: started ${spokenMetric(base)}`,
    `now ${spokenMetric(now)}`,
    `target ${spokenMetric(goal)}`,
    progress === 'met' ? 'target met' : null,
    daysLeft != null ? daysText(daysLeft).toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div data-slot="target-track" data-progress={progress} className={cn('w-full font-fw-sans', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 break-words text-body text-text-primary">{name}</span>
        {daysLeft != null ? (
          <span className="flex-shrink-0 text-footnote tabular-nums text-text-secondary">{daysText(daysLeft)}</span>
        ) : null}
      </div>

      <div role="img" aria-label={spoken} className="relative mt-2 h-6">
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-sunken" />
        <span
          aria-hidden="true"
          data-fill
          className={cn('absolute top-1/2 h-1 -translate-y-1/2 rounded-full', FILL[progress])}
          style={{ left: `${css2(fillFrom)}%`, width: `${css2(fillTo - fillFrom)}%` }}
        />
        <span
          aria-hidden="true"
          data-mark="baseline"
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-text-tertiary bg-surface"
          style={{ left: `${css2(pct(baseline))}%` }}
        />
        <span
          aria-hidden="true"
          data-mark="target"
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-text-primary"
          style={{ left: `${css2(pct(target))}%` }}
        />
        {shown != null ? (
          <span
            aria-hidden="true"
            data-mark="current"
            className={cn(
              'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface',
              FILL[progress],
            )}
            style={{ left: `${css2(pct(shown))}%` }}
          />
        ) : null}
      </div>

      <p aria-hidden="true" className="mt-1 flex flex-wrap gap-x-3 text-footnote text-text-secondary">
        <span>
          Now <span className={cn('tabular-nums', now.missing ? 'text-text-secondary' : INK[progress])}>{now.text}</span>
          {now.missing && now.qualityNote ? ` · ${now.qualityNote}` : null}
        </span>
        <span>
          Target <span className="tabular-nums text-text-primary">{goal.text}</span>
        </span>
        <span>
          Started <span className="tabular-nums">{base.text}</span>
        </span>
      </p>
    </div>
  );
}

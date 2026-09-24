/**
 * One Fingerprint metric as a print-friendly pill (label, value, comparison).
 *
 * Extracted from the retired `sections/FingerprintHero.tsx` (DS-04 / FP-08):
 * the print page was its only live consumer. No hooks, so it renders in the
 * server-component print route. Design tokens only; tone reads as a border
 * plus ink colour so it survives a black-and-white print.
 */
import { cn } from '@/lib/utils';
import type { FingerprintMetric } from '@/app/golf/actions/player-fingerprint-types';

export function MetricPill({ metric }: { metric: FingerprintMetric }) {
  return (
    <div
      className={cn(
        'inline-flex flex-col gap-0.5 rounded-fw-md border bg-surface-sunken px-3 py-2',
        metric.tone === 'good' && 'border-fw-success-ink',
        metric.tone === 'bad' && 'border-fw-danger-ink',
        metric.tone === 'neutral' && 'border-border-strong',
      )}
      data-tone={metric.tone}
    >
      <span className="text-eyebrow font-medium uppercase tracking-wide text-text-secondary">
        {metric.label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'text-base font-medium tabular-nums',
            metric.tone === 'good'
              ? 'text-fw-success-ink'
              : metric.tone === 'bad'
                ? 'text-fw-danger-ink'
                : 'text-text-primary',
          )}
        >
          {metric.value}
        </span>
        {metric.comparison ? (
          <span className="text-eyebrow text-text-secondary">{metric.comparison}</span>
        ) : null}
      </div>
    </div>
  );
}

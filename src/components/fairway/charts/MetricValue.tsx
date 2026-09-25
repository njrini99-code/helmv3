/**
 * MetricValue: the one way to print a golf number (design-direction §5, #10).
 *
 * A thin renderer over `formatMetric` (src/lib/golf/metrics/display-registry):
 * the registry decides precision, sign, unit, tone and read quality, and this
 * component only paints them. Tabular numerals, the true minus, green for
 * better and amber for worse on signed values, secondary ink for an early
 * read, and an optional window chip and quality note beside the figure.
 *
 * No hooks, so it renders on the server as well as in client trees.
 */

import { cn } from '@/lib/utils';
import {
  METRIC_NUMERAL_CLASS,
  METRIC_TONE_CLASS,
  formatMetric,
  type FormatMetricContext,
} from '@/lib/golf/metrics/display-registry';

export interface MetricValueProps extends FormatMetricContext {
  metricId: string;
  value: number | null | undefined;
  /** Print the registry label before the value. */
  showLabel?: boolean;
  /** Print the window chip / quality note after the value. Default true. */
  showMeta?: boolean;
  className?: string;
}

export function MetricValue({
  metricId,
  value,
  showLabel = false,
  showMeta = true,
  className,
  ...ctx
}: MetricValueProps) {
  const m = formatMetric(metricId, value, ctx);
  const ink = m.missing || m.readQuality === 'early' ? 'text-text-secondary' : METRIC_TONE_CLASS[m.tone];
  const meta = showMeta ? [m.windowChip, m.qualityNote].filter(Boolean).join(' · ') : '';

  return (
    <span className={cn('inline-flex items-baseline gap-1.5', className)} data-metric-id={metricId}>
      {showLabel ? (
        <span className="text-text-secondary" aria-hidden="true">
          {m.label}
        </span>
      ) : null}
      <span className="sr-only">{m.ariaLabel}</span>
      <span className={cn(METRIC_NUMERAL_CLASS, ink)} aria-hidden="true">
        {m.text}
      </span>
      {meta ? (
        <span className="text-text-tertiary text-caption" aria-hidden="true">
          {meta}
        </span>
      ) : null}
    </span>
  );
}

import { Info } from 'lucide-react';

/**
 * Per-tile provenance affordance — replaces the old full-width "Metric truth
 * layer" panel (`MetricTruthPanel`, dissolved). That panel repeated a KPI's
 * label/value a second time in a separate section an operator had to
 * visually re-match back to its tile; this puts the same source text
 * directly under the tile it describes.
 *
 * A native `<details>` rather than a hover tooltip: hover has no equivalent
 * on touch, and this needs to work identically tapped on a phone. Costs
 * nothing when unread (no client JS, no extra `'use client'` boundary —
 * the browser owns the toggle) and degrades to plain visible text if CSS
 * fails to load, unlike a JS-driven popover.
 */
export function KpiSourceNote({
  source,
  freshnessLabel,
}: {
  /** What table/API this value reads, in one honest sentence. */
  source: string;
  /** e.g. "fresh · 4m ago" — omitted when no watcher signal tracks this KPI. */
  freshnessLabel?: string;
}) {
  return (
    <details className="rounded-lg">
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-1.5 text-caption text-warm-500 transition-colors hover:bg-surface-sunken hover:text-warm-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      >
        <Info size={12} aria-hidden className="shrink-0" />
        <span>Source</span>
      </summary>
      <div className="space-y-1 px-1.5 pb-2 pt-1 text-caption leading-4 text-warm-600">
        <p>{source}</p>
        {freshnessLabel ? (
          <p className="font-fw-mono tabular-nums text-warm-500">{freshnessLabel}</p>
        ) : null}
      </div>
    </details>
  );
}

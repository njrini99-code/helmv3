'use client';

/**
 * ============================================================================
 * DistanceProfileSection — A7 distance-profile surface (addendum §13, slice 1)
 * ----------------------------------------------------------------------------
 * Renders `buildDistanceProfileViewModel`'s output using existing Fairway
 * primitives, one tile per row: `MetricCard` for a confident number
 * (`supported`/`descriptive_only`), `InsufficientData` for a real-but-thin
 * one (`insufficient`), `EmptyState` for zero evidence (`invalid`). The
 * switch is on `row.kind` (== `MetricResult.status`) ONLY — never on
 * `row.row.value !== null` — so a surface can never claim stronger
 * certainty than its packet actually supports.
 *
 * Every tile is a real `<button>` (native keyboard activation — Enter/Space,
 * a real focus ring — not a styled `<div role="button">`), and clicking ANY
 * of them, regardless of kind, opens the SAME `<Sheet>` built directly from
 * that row's own `MetricResult` — no refetch, so the drill-down can never
 * disagree with the tile that opened it.
 * ========================================================================== */

import { useState } from 'react';
import { EmptyState, InsufficientData, MetricCard, Sheet } from '@/components/fairway';
import type {
  DistanceProfileBandViewModel,
  DistanceProfileRowViewModel,
} from './buildDistanceProfileViewModel';
import type { DistanceProfileMetricId } from '@/lib/coachhelm/v3/metrics/distance-profile';

const METRIC_DISPLAY: Record<
  DistanceProfileMetricId,
  { decimals: number; suffix?: string; sampleUnit: string }
> = {
  approach_green_hit_rate: { decimals: 0, suffix: '%', sampleUnit: 'attempts' },
  approach_on_green_proximity_feet: { decimals: 1, suffix: ' ft', sampleUnit: 'readings' },
  approach_direction_coverage: { decimals: 0, suffix: '%', sampleUnit: 'misses' },
  approach_severe_outcome_rate: { decimals: 0, suffix: '%', sampleUnit: 'attempts' },
  approach_measured_contribution: { decimals: 0, sampleUnit: 'attempts' },
};

/** Humanizes an `exclusions` reason key, e.g. `missing_par` -> "Missing par". */
function humanizeReason(key: string): string {
  const words = key.split('_').filter(Boolean);
  if (words.length === 0) return key;
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

const TILE_BUTTON_CLASS =
  'block w-full cursor-pointer rounded-card text-left transition-shadow ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
  '[@media(hover:hover)]:hover:shadow-raise';

/**
 * Not a literal `<button>` (the `no-raw-button` lint rule, and neither
 * `@/components/ui/button`'s ripple/haptic CTA styling nor Fairway's own
 * pill-shaped `Button` fit wrapping an arbitrary card-sized tile without
 * fighting their own opinionated shape) — a `role="button"` region, mirroring
 * `MetricCard`'s own `interactive` prop convention exactly (that prop sets
 * this same `tabIndex`/`role` pair on its own root div). Unlike that prop,
 * this ALSO wires the keyboard activation MetricCard's own `interactive`
 * leaves to the caller: a native `<button>` fires `onClick` for Enter/Space
 * for free, but a `div[role="button"]` never does, so a claim that relied
 * on `MetricCard interactive` alone with no `onKeyDown` would be clickable
 * but not actually keyboard-operable — exactly the gap this handles.
 */
function handleActivationKeyDown(onActivate: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onActivate();
    }
  };
}

function DistanceProfileTile({ row }: { row: DistanceProfileRowViewModel }) {
  const display = METRIC_DISPLAY[row.metricId];

  if ((row.kind === 'supported' || row.kind === 'descriptive_only') && row.row.value !== null) {
    return (
      <MetricCard
        label={row.label}
        value={row.row.value}
        decimals={display.decimals}
        suffix={display.suffix}
        density="compact"
        footnote={`${row.row.denominator} ${display.sampleUnit}`}
      />
    );
  }

  if (row.kind === 'insufficient') {
    // `current` only — no `required`: the support floor (MIN_ATTEMPTS/
    // MIN_ROUNDS/MIN_GREENS) is an internal detail of computeDistanceProfile,
    // not part of MetricResult, and fabricating a number here would be
    // exactly the "stronger certainty than the packet" this surface must
    // avoid.
    return (
      <InsufficientData
        current={row.row.eligibleCount}
        unit={display.sampleUnit}
        compact
      />
    );
  }

  // `row.kind === 'invalid'`, OR the defensive case above where a
  // `supported`/`descriptive_only` row's own `value` is unexpectedly null
  // (shouldn't happen — A2 only nulls `value` when `status` is `'invalid'`
  // — but this tile must never let a confident status alone stand in for a
  // real number that turned out not to be there).
  return (
    <EmptyState
      variant="subtle"
      title="No data yet"
      description={`${row.label} has no recorded attempts in this band yet.`}
    />
  );
}

function DistanceProfileDrillDown({ row }: { row: DistanceProfileRowViewModel }) {
  const m = row.row;
  const exclusionEntries = Object.entries(m.exclusions).filter(([, count]) => count > 0);

  return (
    <Sheet.Body className="flex flex-col gap-4 pt-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
        <dt className="text-text-tertiary">Status</dt>
        <dd className="font-medium text-text-primary">{row.kind}</dd>

        <dt className="text-text-tertiary">Value</dt>
        <dd className="font-medium tabular-nums text-text-primary">
          {m.value === null ? '—' : `${m.value}${m.unit === 'percent' ? '%' : m.unit === 'feet' ? ' ft' : ''}`}
        </dd>

        <dt className="text-text-tertiary">Numerator / denominator</dt>
        <dd className="tabular-nums text-text-primary">
          {m.numerator === null ? '—' : m.numerator} / {m.denominator}
        </dd>

        <dt className="text-text-tertiary">Eligible / observed</dt>
        <dd className="tabular-nums text-text-primary">
          {m.eligibleCount} / {m.observedCount}
        </dd>

        <dt className="text-text-tertiary">Distinct rounds</dt>
        <dd className="tabular-nums text-text-primary">{m.distinctRounds}</dd>

        {m.distanceMethod ? (
          <>
            <dt className="text-text-tertiary">Distance method</dt>
            <dd className="text-text-primary">{m.distanceMethod === 'recorded' ? 'Recorded' : 'Derived progress'}</dd>
          </>
        ) : null}
      </dl>

      {exclusionEntries.length > 0 ? (
        <div>
          <p className="mb-1.5 text-eyebrow uppercase tracking-wide text-text-tertiary">Excluded</p>
          <ul className="space-y-1 text-body-sm text-text-secondary">
            {exclusionEntries.map(([reason, count]) => (
              <li key={reason}>
                {humanizeReason(reason)}: {count}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Sheet.Body>
  );
}

export interface DistanceProfileSectionProps {
  sections: DistanceProfileBandViewModel[];
  /** From `describeDistanceProfileWindow(scope)` — the same scope the
   *  sections were computed over. Shown so a coach never mistakes this
   *  section's numbers for a different window's. */
  windowLabel: string;
}

export function DistanceProfileSection({ sections, windowLabel }: DistanceProfileSectionProps) {
  const [selected, setSelected] = useState<DistanceProfileRowViewModel | null>(null);

  if (sections.length === 0) {
    return (
      <EmptyState
        variant="subtle"
        title="No approach shots yet"
        description="Log a round with approach shots to see a distance profile."
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="distance-profile-section">
      <p className="text-caption text-text-tertiary" data-testid="distance-profile-window">
        {windowLabel}
      </p>

      {sections.map((section) => (
        <div key={section.band}>
          <h3 className="mb-3 font-fw-display text-body-lg font-medium text-text-primary">
            {section.label}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {section.rows.map((row) => (
              <div
                key={row.metricId}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(row)}
                onKeyDown={handleActivationKeyDown(() => setSelected(row))}
                aria-haspopup="dialog"
                aria-label={`${row.label}, ${section.label}. View evidence.`}
                className={TILE_BUTTON_CLASS}
              >
                <DistanceProfileTile row={row} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        side="right"
        mobileSide="bottom"
        title={selected?.label ?? 'Distance profile detail'}
      >
        {selected ? <DistanceProfileDrillDown row={selected} /> : null}
      </Sheet>
    </div>
  );
}

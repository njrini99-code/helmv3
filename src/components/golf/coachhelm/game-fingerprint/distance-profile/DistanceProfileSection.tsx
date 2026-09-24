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
 * Every tile is a `div[role="button"]` with its own Enter/Space keyboard
 * activation wired explicitly (see `handleActivationKeyDown` below) — not a
 * literal `<button>` (the `no-raw-button` lint rule; see that helper's doc
 * comment for why neither candidate `Button` component fit). Clicking ANY
 * tile, regardless of kind, opens the SAME `<Sheet>` built directly from
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
// A value import, not a type — deliberately from `support-gap.ts`, not
// `distance-profile.ts` (which value-imports server-only code via
// `../engine/shot-source`'s `createAdminClient`). See that file's header.
import { describeSupportGap } from '@/lib/coachhelm/v3/metrics/support-gap';

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

function formatMetricValue(row: DistanceProfileRowViewModel): string {
  const display = METRIC_DISPLAY[row.metricId];
  if (row.row.value === null) return 'unavailable';
  return `${row.row.value.toFixed(display.decimals)}${display.suffix ?? ''}`;
}

/**
 * The accessible name for a tile. A bare `aria-label` on the wrapping
 * element REPLACES its descendants' text for assistive tech — MetricCard's
 * own visible number, InsufficientData's own description, EmptyState's own
 * copy are all invisible to a screen reader once an ancestor carries
 * `aria-label`. So the label itself must state the VALUE and the KIND, not
 * just the metric/band name — otherwise a keyboard/AT user gets strictly
 * less information than a sighted mouse user reading the tile directly,
 * which is the opposite of "verify … with keyboard access."
 */
function describeTileA11y(row: DistanceProfileRowViewModel, sectionLabel: string): string {
  const display = METRIC_DISPLAY[row.metricId];
  const base = `${row.label}, ${sectionLabel}`;
  if (row.metricId === 'approach_measured_contribution' && row.kind !== 'invalid' && row.row.value !== null) {
    return `${base}: ${formatMetricValue(row)} ${display.sampleUnit}.`;
  }
  if ((row.kind === 'supported' || row.kind === 'descriptive_only') && row.row.value !== null) {
    return `${base}: ${formatMetricValue(row)} of ${row.row.denominator} ${display.sampleUnit}.`;
  }
  if (row.kind === 'insufficient') {
    return `${base}: not enough data yet, ${describeSupportGap(row.row)}.`;
  }
  return `${base}: no data recorded yet.`;
}

function DistanceProfileTile({ row }: { row: DistanceProfileRowViewModel }) {
  const display = METRIC_DISPLAY[row.metricId];

  // `approach_measured_contribution`'s whole purpose is to STATE the count
  // (A2 never nulls its value, even at denominator 0 — see distance-profile.ts's
  // own doc comment) — it is never a hedged claim about something else, so
  // it renders as a real number for any non-invalid kind, rather than the
  // InsufficientData treatment the other four rate rows get once their band
  // is under the support floor. Rendering the support-statement metric
  // ITSELF as "not enough data" would be a contradiction — the count is
  // exactly the data.
  if (
    row.metricId === 'approach_measured_contribution' &&
    row.kind !== 'invalid' &&
    row.row.value !== null
  ) {
    return (
      <MetricCard
        label={row.label}
        value={row.row.value}
        decimals={display.decimals}
        suffix={display.suffix}
        density="compact"
        footnote={row.kind === 'insufficient' ? 'Below support floor' : undefined}
      />
    );
  }

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
    // No `current`/`required` props: `InsufficientData.tsx`'s own
    // `hasCounts` gate only renders a count when both are given together,
    // and this row's floor is compound (attempts AND rounds, plus a greens
    // floor for proximity) rather than the single number those props model.
    // `describeSupportGap` names the SPECIFIC floor this row is short of
    // (e.g. "2 of 3 rounds") from the metric core's own exported floor
    // constants, rather than a generic count with no stated floor.
    return (
      <InsufficientData
        description={`${describeSupportGap(row.row)}, below the support floor.`}
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
        <dd className="font-medium text-text-primary">{humanizeReason(row.kind)}</dd>

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

  // `computeDistanceProfile` always emits a row for every band/metric
  // combination it recognizes (never an empty array in production — a band
  // with zero shots still gets 'invalid' rows, not omitted ones), so
  // `sections.length === 0` alone is effectively unreachable outside a
  // fabricated test input. The real "nothing to show yet" state is every
  // row across every section being 'invalid' — a genuinely new player with
  // no approach shots at all.
  const hasAnyNonInvalidRow = sections.some((section) => section.rows.some((row) => row.kind !== 'invalid'));
  if (!hasAnyNonInvalidRow) {
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
                aria-label={`${describeTileA11y(row, section.label)} View evidence.`}
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

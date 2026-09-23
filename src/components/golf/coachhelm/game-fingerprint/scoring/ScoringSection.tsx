'use client';

/**
 * ============================================================================
 * ScoringSection — A7 Scoring surface (addendum §13, slice 2)
 * ----------------------------------------------------------------------------
 * Renders `buildScoringViewModel`'s output using the same Fairway primitives
 * and interaction pattern `DistanceProfileSection` (A2/slice 1) established:
 * `MetricCard` for a confident number (`supported`/`descriptive_only`),
 * `InsufficientData` for a real-but-thin one (`insufficient`), `EmptyState`
 * for zero evidence (`invalid`). The switch is on a row's `kind` (==
 * `MetricResult.status`) ONLY — never on `row.row.value !== null` — so this
 * surface can never claim stronger certainty than its packet supports.
 *
 * Two independent groups, per A3's own two metric families (see
 * `par-opportunities.ts`'s file header): `parSections` (identity-agnostic,
 * one section per par with an 'all' row plus any length band that cleared
 * its own sample floor) and `par5Holes` (specific-hole, one card per
 * course+hole identity). Both feed the SAME tile/drill-down mechanics —
 * `div[role="button"]` with explicit Enter/Space activation (not a literal
 * `<button>`; see `handleActivationKeyDown`'s doc comment in
 * `DistanceProfileSection.tsx` for why), one shared `<Sheet>` built directly
 * from whichever row's own `MetricResult` was clicked — no refetch, so the
 * drill-down can never disagree with the tile that opened it.
 * ========================================================================== */

import { useState } from 'react';
import { EmptyState, InsufficientData, MetricCard, Sheet } from '@/components/fairway';
import type { MetricResult, MetricStatus } from '@/lib/coachhelm/v3/metrics/par-opportunities';
import type {
  ScoringPar5HoleViewModel,
  ScoringPar5RowViewModel,
  ScoringParRowViewModel,
  ScoringParSectionViewModel,
  ScoringViewModel,
} from './buildScoringViewModel';

/** Either row shape reduces to this for tile rendering and the shared
 *  drill-down. `sectionLabel` (the par or the hole+course this row belongs
 *  to) travels with the row so the drill-down Sheet's title can say more
 *  than the bare metric/length-group name — "All" or "Regulation
 *  opportunity rate" alone tells a coach nothing about which par or hole
 *  they're looking at once it's the only text in a Sheet header. */
interface ScoringTileRow {
  label: string;
  sectionLabel: string;
  kind: MetricStatus;
  row: MetricResult;
}

const PAR5_SAMPLE_UNIT: Record<ScoringPar5RowViewModel['metricId'], string> = {
  par5_regulation_opportunity_rate: 'attempts',
  par5_green_in_two_rate: 'attempts',
  par5_putting_conversion_rate: 'opportunities',
};

/** Humanizes an `exclusions` reason key, e.g. `incomplete_sequence` ->
 *  "Incomplete sequence". Mirrors `DistanceProfileSection.tsx`'s helper. */
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

function handleActivationKeyDown(onActivate: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onActivate();
    }
  };
}

/** "+0.4" / "E" / "−0.3" — the same signed, Unicode-minus convention
 *  `formatToPar` uses elsewhere on this page, without importing it directly
 *  (that helper is typed to a whole `number | null` score-to-par, and this
 *  value may already carry a decimal). Rounds FIRST, then tests for zero —
 *  a raw value of 0.04 must read "E", not "−0" (rounding after the zero
 *  check would print the sign of a value that rounds away to nothing). */
function formatStrokesVsPar(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return 'E';
  return rounded > 0 ? `+${rounded}` : `−${Math.abs(rounded)}`;
}

/** A3 never rounds a percent (`(100 * n) / d` can be a repeating decimal) —
 *  format it here rather than let a raw `33.333333333333336%` reach the
 *  drill-down. */
function formatPercent(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

/**
 * A par-5 row that is `invalid` does NOT mean "no data" — the card only
 * exists because plays were recorded (`observedCount >= 1` by
 * construction). It means one of two more specific things depending on
 * which metric: no play had a complete, in-scope sequence to measure
 * (regulation / green-in-two), or no regulation opportunity was ever
 * created for putting conversion to measure. Stating either as "no data
 * recorded yet" would be false — and would sit right next to a sibling
 * "0% of N" supported tile on the same hole, which is a materially
 * different claim (real evidence, real zero) from this one (no eligible
 * evidence at all).
 */
function par5InvalidDescription(row: ScoringPar5RowViewModel): string {
  if (row.metricId === 'par5_putting_conversion_rate') {
    return 'No regulation opportunities were created yet — nothing to convert.';
  }
  const observed = row.row.observedCount;
  return `${observed} ${observed === 1 ? 'play' : 'plays'} recorded, none with a complete, in-scope sequence.`;
}

/** The EmptyState `title` for the same case — "No data yet" would itself be
 *  the false claim `par5InvalidDescription` exists to avoid, since data
 *  (recorded plays) does exist. */
function par5InvalidTitle(row: ScoringPar5RowViewModel): string {
  return row.metricId === 'par5_putting_conversion_rate' ? 'No conversions to measure' : 'No eligible plays';
}

function describeParTileA11y(row: ScoringParRowViewModel, parLabel: string): string {
  const base = `${row.label}, ${parLabel}`;
  if ((row.kind === 'supported' || row.kind === 'descriptive_only') && row.row.value !== null) {
    return `${base}: ${formatStrokesVsPar(row.row.value)} strokes vs par, ${row.row.denominator} holes.`;
  }
  if (row.kind === 'insufficient' && row.row.value !== null) {
    return `${base}: not enough data yet, ${row.row.eligibleCount} holes recorded.`;
  }
  return `${base}: no data recorded yet.`;
}

function describePar5TileA11y(row: ScoringPar5RowViewModel, holeLabel: string): string {
  const sampleUnit = PAR5_SAMPLE_UNIT[row.metricId];
  const base = `${row.label}, ${holeLabel}`;
  if ((row.kind === 'supported' || row.kind === 'descriptive_only') && row.row.value !== null) {
    return `${base}: ${formatPercent(row.row.value)} of ${row.row.denominator} ${sampleUnit}.`;
  }
  if (row.kind === 'insufficient' && row.row.value !== null) {
    return `${base}: not enough data yet, ${row.row.eligibleCount} ${sampleUnit} recorded.`;
  }
  if (row.kind === 'invalid') {
    return `${base}: ${par5InvalidDescription(row)}`;
  }
  return `${base}: no data recorded yet.`;
}

function ScoringParTile({ row }: { row: ScoringParRowViewModel }) {
  if ((row.kind === 'supported' || row.kind === 'descriptive_only') && row.row.value !== null) {
    return (
      <MetricCard
        label={row.label}
        value={row.row.value}
        format={{ minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }}
        density="compact"
        footnote={`${row.row.denominator} holes`}
      />
    );
  }

  if (row.kind === 'insufficient') {
    return (
      <InsufficientData
        description={`${row.row.eligibleCount} holes so far — below the support floor.`}
        compact
      />
    );
  }

  return (
    <EmptyState
      variant="subtle"
      title="No data yet"
      description={`${row.label} has no recorded holes yet.`}
    />
  );
}

function ScoringPar5Tile({ row }: { row: ScoringPar5RowViewModel }) {
  const sampleUnit = PAR5_SAMPLE_UNIT[row.metricId];

  if ((row.kind === 'supported' || row.kind === 'descriptive_only') && row.row.value !== null) {
    return (
      <MetricCard
        label={row.label}
        value={row.row.value}
        decimals={0}
        suffix="%"
        density="compact"
        footnote={`${row.row.denominator} ${sampleUnit}`}
      />
    );
  }

  if (row.kind === 'insufficient') {
    return (
      <InsufficientData
        description={`${row.row.eligibleCount} ${sampleUnit} so far — below the support floor.`}
        compact
      />
    );
  }

  // `invalid` here does NOT mean "no data" — see `par5InvalidDescription`'s
  // doc comment. A generic EmptyState with generic copy would sit next to a
  // sibling '0% of N' supported tile on the same hole and make two
  // materially different claims read the same.
  return (
    <EmptyState
      variant="subtle"
      title={par5InvalidTitle(row)}
      description={par5InvalidDescription(row)}
    />
  );
}

function ScoringDrillDown({ row }: { row: ScoringTileRow }) {
  const m = row.row;
  const exclusionEntries = Object.entries(m.exclusions).filter(([, count]) => count > 0);

  return (
    <Sheet.Body className="flex flex-col gap-4 pt-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
        <dt className="text-text-tertiary">Status</dt>
        <dd className="font-medium text-text-primary">{row.kind}</dd>

        <dt className="text-text-tertiary">Value</dt>
        <dd className="font-medium tabular-nums text-text-primary">
          {m.value === null
            ? '—'
            : m.unit === 'percent'
              ? formatPercent(m.value)
              : m.unit === 'strokes'
                ? formatStrokesVsPar(m.value)
                : m.value}
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

export interface ScoringSectionProps {
  viewModel: ScoringViewModel;
  /** From `describeDistanceProfileWindow(scope)` (reused as-is — a rolling
   *  window label is not specific to any one metric package). Shown so a
   *  coach never mistakes this section's numbers for a different window's. */
  windowLabel: string;
}

function ParGroup({
  section,
  onSelect,
}: {
  section: ScoringParSectionViewModel;
  onSelect: (row: ScoringTileRow) => void;
}) {
  return (
    <div>
      <h3 className="mb-3 font-fw-display text-body-lg font-medium text-text-primary">
        {section.label}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {section.rows.map((row) => (
          <div
            key={row.lengthGroup}
            role="button"
            tabIndex={0}
            onClick={() => onSelect({ ...row, sectionLabel: section.label })}
            onKeyDown={handleActivationKeyDown(() => onSelect({ ...row, sectionLabel: section.label }))}
            aria-haspopup="dialog"
            aria-label={`${describeParTileA11y(row, section.label)} View evidence.`}
            className={TILE_BUTTON_CLASS}
          >
            <ScoringParTile row={row} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Par5HoleGroup({
  hole,
  onSelect,
}: {
  hole: ScoringPar5HoleViewModel;
  onSelect: (row: ScoringTileRow) => void;
}) {
  // "Hole 7 · Course C0FFEE12" — the course label is what keeps this card
  // distinguishable from an identically-numbered hole at a different
  // course (see `courseLabel`'s doc comment on `ScoringPar5HoleViewModel`).
  const holeLabel = `${hole.label} · ${hole.courseLabel}`;
  return (
    <div>
      <h4 className="mb-2 font-fw-sans text-label font-medium text-text-secondary">{holeLabel}</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {hole.rows.map((row) => (
          <div
            key={row.metricId}
            role="button"
            tabIndex={0}
            onClick={() => onSelect({ ...row, sectionLabel: holeLabel })}
            onKeyDown={handleActivationKeyDown(() => onSelect({ ...row, sectionLabel: holeLabel }))}
            aria-haspopup="dialog"
            aria-label={`${describePar5TileA11y(row, holeLabel)} View evidence.`}
            className={TILE_BUTTON_CLASS}
          >
            <ScoringPar5Tile row={row} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoringSection({ viewModel, windowLabel }: ScoringSectionProps) {
  const [selected, setSelected] = useState<ScoringTileRow | null>(null);
  const { parSections, par5Holes } = viewModel;

  if (parSections.length === 0 && par5Holes.length === 0) {
    return (
      <EmptyState
        variant="subtle"
        title="No scored rounds yet"
        description="Log a completed round to see par/length and par-5 scoring."
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="scoring-section">
      <p className="text-caption text-text-tertiary" data-testid="scoring-window">
        {windowLabel}
      </p>

      {parSections.map((section) => (
        <ParGroup key={section.par} section={section} onSelect={setSelected} />
      ))}

      {par5Holes.length > 0 ? (
        <div>
          <h3 className="mb-3 font-fw-display text-body-lg font-medium text-text-primary">
            Par-5 opportunities
          </h3>
          <div className="space-y-4">
            {par5Holes.map((hole) => (
              <Par5HoleGroup key={hole.courseHoleKey} hole={hole} onSelect={setSelected} />
            ))}
          </div>
        </div>
      ) : null}

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        side="right"
        mobileSide="bottom"
        title={selected ? `${selected.sectionLabel} — ${selected.label}` : 'Scoring detail'}
      >
        {selected ? <ScoringDrillDown row={selected} /> : null}
      </Sheet>
    </div>
  );
}

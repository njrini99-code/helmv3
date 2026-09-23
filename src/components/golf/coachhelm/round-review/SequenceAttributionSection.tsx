/**
 * A4 slice 3b — Round Review mount of the sequence-attribution rollup
 * (addendum §13, work package A4). Read-only, decorative: renders the
 * rolling-12-month `computeSequenceAttribution` rollup for the round's
 * player, or nothing at all.
 *
 * WORDING (per repair-plan §14.12 / PR #2023's observed-outcome-language
 * guard, which scans this whole `components/golf/coachhelm` tree): every
 * row states an OBSERVED difference against an estimated baseline, never a
 * causal or proven claim — "gained"/"lost" (a plain measured direction),
 * never "saved" next to "strokes"/"str/rd" (that phrasing asserts a
 * measured SAVING the same way the pre-fix `InsightCard` `OutcomeBadge` did
 * for a different field), never "proven"/"caused by"/"guaranteed".
 *
 * SIGN: `computeSequenceAttribution`'s own doc comment states the
 * convention — positive `value` means strokes GAINED (performed better
 * than the baseline), the SAME direction `RoundSGSummary`'s
 * `strokes_gained_total` already uses elsewhere on this page (positive =
 * `+`, success tone). This intentionally does NOT reuse
 * `ScoringSection.tsx`'s `formatStrokesVsPar` (a different, not-yet-merged
 * component whose positive means MORE strokes than par — worse) — that
 * would invert the page's own established sign language. `formatSigned`
 * (shared with `RoundSGSummary`) is reused as-is because it already matches
 * this row's convention with no flip needed.
 *
 * RENDERING: a `'supported'` row renders as a real finding (a signed
 * number). Any other status (`'insufficient'` or `'invalid'` — the only
 * other values `computeSequenceAttribution` ever emits for this metric)
 * renders its label with "Not enough holes yet" and NO number — an
 * insufficient row's `value` is never hidden from data, but it must never
 * be presented to a coach/player as a finding either (mirrors
 * `ScoringSection.tsx`'s own "not enough data yet" per-row pattern). The
 * `sequence_hole_coverage` row is a count, not a per-event finding, and is
 * excluded from this list entirely.
 */
import { InstrumentPanel, formatSigned } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { MetricResult } from '@/lib/coachhelm/v3/metrics/types';
import type { SequenceEventKind } from '@/lib/coachhelm/v3/metrics/sequence-attribution';

export interface SequenceAttributionSectionProps {
  /** `null` hides the section entirely — a flag-off, unauthorized, or
   *  failed-read result from `getRoundReviewSequenceAttribution`. */
  results: MetricResult[] | null;
  windowLabel: string;
}

const EVENT_KIND_ORDER: readonly SequenceEventKind[] = [
  'tee_to_next',
  'approach_to_recovery',
  'first_putt_to_next_putt',
  'putting_sequence',
  'penalty',
  'other',
];

const EVENT_KIND_LABELS: Record<SequenceEventKind, string> = {
  tee_to_next: 'Tee shot',
  approach_to_recovery: 'Approach / recovery',
  first_putt_to_next_putt: 'First putt',
  putting_sequence: 'Putting sequence',
  penalty: 'Penalty',
  other: 'Other',
};

function isSequenceEventKind(value: unknown): value is SequenceEventKind {
  return typeof value === 'string' && (EVENT_KIND_ORDER as readonly string[]).includes(value);
}

function findingLabel(row: MetricResult): string {
  const kind = row.dimensions.event_kind;
  return isSequenceEventKind(kind) ? EVENT_KIND_LABELS[kind] : 'Sequence event';
}

/** Signed readout for a `'supported'` row. Zero-rounding-safe (mirrors
 *  `formatSigned`'s own guard): a value that rounds to 0.00 reads as
 *  "even", never a stray "+0.00 gained". */
/** Exported for a direct regression test pinning the sign convention —
 *  mirrors `ScoringSection.tsx`'s own `formatStrokesVsPar` export precedent
 *  (#2010 review, SHOULD 4). */
export function describeObservedGain(value: number): { text: string; toneClass: string } {
  const rounded = Number(Math.abs(value).toFixed(2));
  if (rounded === 0) {
    return { text: `${formatSigned(value)} str/rd (even vs. baseline)`, toneClass: 'text-text-primary' };
  }
  const gained = value > 0;
  return {
    text: `${formatSigned(value)} str/rd ${gained ? 'gained' : 'lost'} vs. baseline (est.)`,
    toneClass: gained ? 'text-fw-success-ink' : 'text-fw-warning-ink',
  };
}

export function SequenceAttributionSection({ results, windowLabel }: SequenceAttributionSectionProps) {
  if (results === null) return null;

  const eventRows = results
    .filter((r) => r.metricId === 'sequence_event_strokes_gained')
    .slice()
    .sort(
      (a, b) =>
        EVENT_KIND_ORDER.indexOf(a.dimensions.event_kind as SequenceEventKind) -
        EVENT_KIND_ORDER.indexOf(b.dimensions.event_kind as SequenceEventKind),
    );

  if (eventRows.length === 0) return null;

  return (
    <InstrumentPanel
      depth="base"
      tone="neutral"
      eyebrow="Sequence Attribution"
      header={windowLabel}
      className="flex flex-col gap-3"
    >
      <p className="text-sm text-text-tertiary">
        Observed strokes gained vs. an estimated baseline, by shot sequence.
      </p>
      <ul className="flex flex-col gap-2">
        {eventRows.map((row) => {
          const label = findingLabel(row);
          if (row.status !== 'supported' || row.value === null) {
            return (
              <li
                key={label}
                className="flex items-baseline justify-between gap-3 text-sm"
                data-testid="sequence-attribution-row"
                data-status="insufficient"
              >
                <span className="text-text-primary">{label}</span>
                <span className="text-text-tertiary">Not enough holes yet</span>
              </li>
            );
          }

          const { text, toneClass } = describeObservedGain(row.value);
          return (
            <li
              key={label}
              className="flex items-baseline justify-between gap-3 text-sm"
              data-testid="sequence-attribution-row"
              data-status="supported"
            >
              <span className="text-text-primary">{label}</span>
              <span className={cn('tabular-nums', toneClass)}>
                {text} <span className="text-text-tertiary">(observed, {row.denominator} events)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </InstrumentPanel>
  );
}

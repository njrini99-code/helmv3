import { describe, it, expect } from 'vitest';
import { formatStageRow } from '../stage-history-format';
import type { StageHistoryRow } from '@/app/golf/actions/crm-stage-history';

// ---------------------------------------------------------------------------
// `formatDateLabel` renders with `toLocaleDateString('en-US', { month: 'short',
// day: 'numeric' })` and NO `timeZone` option — so it deliberately shows the
// date in the VIEWER's timezone, which is what a CRM user wants. The code is
// right; the original assertions were not: they hardcoded 'Jul 20' / 'Jul 12' /
// 'Jun 1', which are the UTC calendar days of those instants.
//
// That made this the only timezone-dependent file in the whole unit suite
// (8,463 tests). Which assertion breaks depends on the offset, which is why it
// had never been noticed:
//
//   TZ=Pacific/Midway    (UTC-11) → 'formats a real transition' fails, 'Jul 11'
//   TZ=Pacific/Kiritimati(UTC+14) → the other two fail, 'Jul 21' and 'Jun 2'
//
// Same class as the bug that took `main` red at 8pm EDT on 2026-07-29 (#1123),
// where two "today" fixtures were anchored to the UTC date while the code under
// test used a local/team date. Fixtures must not assume the runner's offset.
//
// FIX: derive the expectation in the runtime zone using `getMonth()`/`getDate()`
// — different APIs from the ones the formatter uses, so this is not a tautology.
// It still fails if the formatter switches to UTC getters, picks the wrong
// `month`/`day` options, or hardcodes a `timeZone`; it just no longer fails
// because CI happens to run west of Greenwich.
// ---------------------------------------------------------------------------
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** The 'Mon D' label an ISO instant should render as, in the RUNTIME timezone. */
function expectedLocalDateLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

const statusLabelFor = (status: string | null): string => {
  if (!status) return 'Unknown';
  const labels: Record<string, string> = {
    new_lead: 'New Lead',
    contacted: 'Contacted',
    engaged: 'Engaged',
    proposal: 'Proposal',
    won: 'Customer',
    lost: 'Lost',
    nurture: 'Nurture',
  };
  return labels[status] ?? status;
};

const SEED_AT = '2026-07-20T12:00:00.000Z';
const TRANSITION_AT = '2026-07-12T09:30:00.000Z';
const FALLBACK_AT = '2026-06-01T12:00:00.000Z';

describe('formatStageRow', () => {
  it('formats a seed row as a single "Tracking started" label, not an arrow pair', () => {
    const row: StageHistoryRow = {
      from_status: null,
      to_status: 'contacted',
      changed_at: SEED_AT,
      source: 'seed',
    };

    const result = formatStageRow(row, statusLabelFor);

    expect(result.kind).toBe('seed');
    expect(result.label).toBe('Tracking started — Contacted');
    expect(result.label).not.toContain('→');
    expect(result.dateLabel).toBe(expectedLocalDateLabel(SEED_AT));
  });

  it('formats a real transition as "from → to"', () => {
    const row: StageHistoryRow = {
      from_status: 'contacted',
      to_status: 'engaged',
      changed_at: TRANSITION_AT,
      source: 'stage_change',
    };

    const result = formatStageRow(row, statusLabelFor);

    expect(result.kind).toBe('change');
    expect(result.label).toBe('Contacted → Engaged');
    expect(result.dateLabel).toBe(expectedLocalDateLabel(TRANSITION_AT));
  });

  it('falls back gracefully when from_status is null on a non-seed row', () => {
    const row: StageHistoryRow = {
      from_status: null,
      to_status: 'proposal',
      changed_at: FALLBACK_AT,
      source: 'stage_change',
    };

    const result = formatStageRow(row, statusLabelFor);

    expect(result.kind).toBe('change');
    expect(result.label).toBe('Unknown → Proposal');
    expect(result.dateLabel).toBe(expectedLocalDateLabel(FALLBACK_AT));
  });

  it('returns an empty dateLabel for an unparseable changed_at rather than "Invalid Date"', () => {
    const row: StageHistoryRow = {
      from_status: 'new_lead',
      to_status: 'contacted',
      changed_at: 'not-a-date',
      source: 'stage_change',
    };

    const result = formatStageRow(row, statusLabelFor);

    expect(result.dateLabel).toBe('');
    expect(result.label).toBe('New Lead → Contacted');
  });
});

// ============================================================================
// STAGE HISTORY — pure formatting helpers
// ============================================================================
//
// Turns a raw StageHistoryRow (from getCoachStageHistory / the
// get_crm_coach_stage_history RPC) into display-ready strings for the
// "Stage history" block in CoachDetailPanel's Quick Info collapsible.
//
// Kept side-effect-free and framework-free so it's cheaply unit-testable —
// see __tests__/stage-history-format.test.ts.
//
// ============================================================================

import type { StageHistoryRow } from '@/app/golf/actions/crm-stage-history';

export interface FormattedStageRow {
  /** 'seed' = the baseline "tracking started" row (source='seed', no real
   *  from_status); 'change' = a real from→to transition. */
  kind: 'seed' | 'change';
  label: string;
  dateLabel: string;
}

/** `changed_at` (ISO timestamp) -> 'Jul 12' style short date. Empty string
 *  for an unparseable input rather than "Invalid Date" leaking into the UI. */
function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Formats one stage-history row for display.
 *
 * `statusLabelFor` resolves a CoachStatus (or null) to its human label —
 * callers pass a wrapper around STATUS_CONFIG[s]?.label so this module
 * never needs to import the config directly.
 */
export function formatStageRow(
  row: StageHistoryRow,
  statusLabelFor: (status: string | null) => string,
): FormattedStageRow {
  const dateLabel = formatDateLabel(row.changed_at);

  if (row.source === 'seed') {
    return {
      kind: 'seed',
      label: `Tracking started — ${statusLabelFor(row.to_status)}`,
      dateLabel,
    };
  }

  return {
    kind: 'change',
    label: `${statusLabelFor(row.from_status)} → ${statusLabelFor(row.to_status)}`,
    dateLabel,
  };
}

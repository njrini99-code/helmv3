'use client';

/**
 * ============================================================================
 * ViewSwitch — the Triage Desk's Signals / Players / Effectiveness segmented
 * control (Triage Desk spec §2)
 * ----------------------------------------------------------------------------
 * URL-driven via the EXISTING `?view=` values every legacy shim redirect
 * (alerts/insights/patterns/development/analytics/coachhelm) already writes,
 * so every old bookmark keeps landing on the right tab — see
 * `resolveTriageView` in `buildTriageViewModel.ts`, the only place that
 * decodes the param.
 * ========================================================================== */

import { Segmented } from '@/components/fairway';
import type { TriageView } from './buildTriageViewModel';

export interface ViewSwitchProps {
  view: TriageView;
  onChange: (view: TriageView) => void;
}

const OPTIONS: ReadonlyArray<{ value: TriageView; label: string }> = [
  { value: 'signals', label: 'Signals' },
  { value: 'players', label: 'Players' },
  { value: 'effectiveness', label: 'Effectiveness' },
];

export function ViewSwitch({ view, onChange }: ViewSwitchProps) {
  return (
    <Segmented options={OPTIONS} value={view} onValueChange={onChange} aria-label="CoachHelm view" size="md" />
  );
}

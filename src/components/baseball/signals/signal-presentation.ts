// =============================================================================
// src/components/baseball/signals/signal-presentation.ts
//
// Packet: signal-inbox — pure presentation helpers shared by every Signals view.
//
// Maps the read model's honest fields (severity, category, disposition, action
// type, outcome verdict) onto the "Living Annual" ink system (spec
// docs/baseball/design-system-living-annual.md §4.2, §7 InkBadge doctrine).
// Signals is a THE WAR ROOM surface (clay/`pursuit` lane) — spec §4.2 rule 2
// explicitly sanctions clay/oxblood for "hot signals," so severity leans on
// `pursuit` ink at two weights (solid for critical, soft for warning) rather
// than a red/amber badge. `team` (green) marks a positive/settled outcome
// (resolved, converted, improved); `neutral` is the quiet graphite rest state.
// NEVER red, NEVER amber/yellow — the InkBadge doctrine forbids both ("the
// anti-toast").
//
// Pure module (no 'use client', no I/O) so server + client both import it.
// =============================================================================

import type { InkBadgeProps } from '@/components/baseball/living-annual';
import type {
  BaseballSignalSeverity,
  BaseballSignalDisposition,
  BaseballActionType,
  BaseballRecommendedActionType,
} from '@/lib/types/baseball-signals';
import type { SignalActionRow } from '@/lib/baseball/read-models/signal-inbox';

type InkTone = NonNullable<InkBadgeProps['tone']>;
type InkVariant = NonNullable<InkBadgeProps['variant']>;

// -----------------------------------------------------------------------------
// Severity
// -----------------------------------------------------------------------------

export interface SeverityPresentation {
  label: string;
  /** InkBadge tone for the severity stamp. */
  tone: InkTone;
  /** InkBadge presence — critical carries more weight than warning. */
  variant: InkVariant;
  /** Card accent-rule ink for the thin left-edge marker. */
  ruleClass: string;
}

export function getSeverityPresentation(
  severity: BaseballSignalSeverity,
): SeverityPresentation {
  switch (severity) {
    case 'critical':
      return { label: 'Critical', tone: 'pursuit', variant: 'solid', ruleClass: 'bg-pursuit' };
    case 'warning':
      return { label: 'Warning', tone: 'pursuit', variant: 'soft', ruleClass: 'bg-pursuit/55' };
    case 'info':
    default:
      return { label: 'Info', tone: 'neutral', variant: 'soft', ruleClass: 'bg-[color:var(--hairline)]' };
  }
}

// -----------------------------------------------------------------------------
// Disposition
// -----------------------------------------------------------------------------

export interface DispositionPresentation {
  label: string;
  tone: InkTone;
  variant: InkVariant;
}

export function getDispositionPresentation(
  disposition: BaseballSignalDisposition,
): DispositionPresentation {
  switch (disposition) {
    case 'new':
      return { label: 'New', tone: 'pursuit', variant: 'soft' };
    case 'acknowledged':
      return { label: 'Acknowledged', tone: 'neutral', variant: 'soft' };
    case 'sample_too_small':
      return { label: 'Sample too small', tone: 'neutral', variant: 'soft' };
    case 'converted':
      return { label: 'Converted', tone: 'team', variant: 'soft' };
    case 'dismissed':
      return { label: 'Dismissed', tone: 'neutral', variant: 'soft' };
    case 'resolved':
      return { label: 'Resolved', tone: 'team', variant: 'solid' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral', variant: 'soft' };
    default:
      return { label: disposition, tone: 'neutral', variant: 'soft' };
  }
}

// -----------------------------------------------------------------------------
// Did-it-move verdict (converted-action outcome ledger)
// -----------------------------------------------------------------------------

export interface VerdictPresentation {
  label: string;
  tone: InkTone;
  variant: InkVariant;
}

/**
 * Honest verdict stamp: only a measured direction earns presence (green for
 * improved, clay for regressed — never a red badge). `too_early` /
 * `insufficient_sample` never render as a win or a loss; the caller should
 * treat a null return as "say nothing" (insufficient_sample).
 */
export function getVerdictPresentation(
  verdict: SignalActionRow['outcomeVerdict'],
): VerdictPresentation | null {
  switch (verdict) {
    case 'improved':
      return { label: 'Improved', tone: 'team', variant: 'soft' };
    case 'regressed':
      return { label: 'Regressed', tone: 'pursuit', variant: 'solid' };
    case 'too_early':
      return { label: 'Too early', tone: 'neutral', variant: 'soft' };
    case 'no_change':
      return { label: 'No change', tone: 'neutral', variant: 'soft' };
    default:
      // insufficient_sample / null → not measurable; stay quiet.
      return null;
  }
}

// -----------------------------------------------------------------------------
// Category — baseball categories (NO golf terms). Human label only.
// -----------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  hitting: 'Hitting',
  pitching: 'Pitching',
  catching: 'Catching',
  defense: 'Defense',
  baserunning: 'Baserunning',
  strength: 'Strength',
  readiness: 'Readiness',
  workload: 'Workload',
  practice: 'Practice',
  academics: 'Academics',
  operations: 'Operations',
  recruiting: 'Recruiting',
  import_quality: 'Import quality',
  video_evidence: 'Video evidence',
  roster: 'Roster',
};

export function getCategoryLabel(category: string): string {
  return (
    CATEGORY_LABELS[category] ??
    category
      .split(/[_\s]+/)
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(' ')
  );
}

// -----------------------------------------------------------------------------
// Action types
// -----------------------------------------------------------------------------

const ACTION_TYPE_LABELS: Record<BaseballActionType, string> = {
  practice_block: 'Practice block',
  player_task: 'Player task',
  video_request: 'Video request',
  lift_modification: 'Lift modification',
  meeting_item: 'Decision Room item',
  message: 'Message',
  player_note: 'Player note',
  import_review: 'Import review',
};

export function getActionTypeLabel(
  type: BaseballActionType | BaseballRecommendedActionType | null,
): string {
  if (!type || type === 'none') return 'No action';
  return ACTION_TYPE_LABELS[type as BaseballActionType] ?? 'Action';
}

/**
 * The set of action types a coach can pick when converting a signal. 'none' is
 * excluded — a conversion always produces a real action.
 */
export const CONVERTIBLE_ACTION_TYPES: readonly {
  value: BaseballActionType;
  label: string;
  /** Whether this action type targets a specific player (drives the picker). */
  playerScoped: boolean;
}[] = [
  { value: 'practice_block', label: 'Practice block', playerScoped: false },
  { value: 'player_task', label: 'Player task', playerScoped: true },
  { value: 'video_request', label: 'Video request', playerScoped: true },
  { value: 'lift_modification', label: 'Lift modification', playerScoped: true },
  { value: 'meeting_item', label: 'Decision Room item', playerScoped: false },
  { value: 'message', label: 'Message', playerScoped: false },
  { value: 'player_note', label: 'Player note', playerScoped: true },
  { value: 'import_review', label: 'Import review', playerScoped: false },
] as const;

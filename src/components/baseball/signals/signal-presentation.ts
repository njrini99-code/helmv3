// =============================================================================
// src/components/baseball/signals/signal-presentation.ts
//
// Packet: signal-inbox — pure presentation helpers shared by every Signals view.
//
// Maps the read model's honest fields (severity, category, disposition, action
// type) onto cream/green GolfHelm visual tokens. NO golf labels. NO new palette:
// severity + disposition use ONLY red / amber / primary-green / warm — the same
// restricted accent set as StatVisualFrame. No blue/teal/violet categorical
// hues (binding owner decision); info/neutral states read as warm, positive
// outcomes read as primary green.
//
// Pure module (no 'use client', no I/O) so server + client both import it.
// =============================================================================

import type { BadgeTone } from '@/components/ui/badge';
import type {
  BaseballSignalSeverity,
  BaseballSignalDisposition,
  BaseballActionType,
  BaseballRecommendedActionType,
} from '@/lib/types/baseball-signals';

// -----------------------------------------------------------------------------
// Severity
// -----------------------------------------------------------------------------

export interface SeverityPresentation {
  label: string;
  tone: BadgeTone;
  /** Left accent bar color class on the card. */
  accentClass: string;
}

export function getSeverityPresentation(
  severity: BaseballSignalSeverity,
): SeverityPresentation {
  switch (severity) {
    case 'critical':
      return { label: 'Critical', tone: 'red', accentClass: 'bg-red-500' };
    case 'warning':
      return { label: 'Warning', tone: 'amber', accentClass: 'bg-amber-500' };
    case 'info':
    default:
      return { label: 'Info', tone: 'warm', accentClass: 'bg-warm-400' };
  }
}

// -----------------------------------------------------------------------------
// Disposition
// -----------------------------------------------------------------------------

export interface DispositionPresentation {
  label: string;
  tone: BadgeTone;
}

export function getDispositionPresentation(
  disposition: BaseballSignalDisposition,
): DispositionPresentation {
  switch (disposition) {
    case 'new':
      return { label: 'New', tone: 'primary' };
    case 'acknowledged':
      return { label: 'Acknowledged', tone: 'warm' };
    case 'sample_too_small':
      return { label: 'Sample too small', tone: 'warm' };
    case 'converted':
      return { label: 'Converted', tone: 'primary' };
    case 'dismissed':
      return { label: 'Dismissed', tone: 'warm' };
    case 'resolved':
      return { label: 'Resolved', tone: 'green' };
    case 'expired':
      return { label: 'Expired', tone: 'warm' };
    default:
      return { label: disposition, tone: 'warm' };
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

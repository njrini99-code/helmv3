/**
 * IntentPill — color-coded chip showing a coach's narrative posture for
 * one player. Drops into roster rows + per-player coach tiles.
 *
 * Master plan Part VIII UX: 🔴 Bubble / 🟢 Maintain / 🟡 Develop /
 * ⭐ Breakout / 🔵 Rehab. Click → opens IntentDrawer (caller wires).
 */

import { NARRATIVE_GOAL_PRESENTATION, type NarrativeGoal } from '@/lib/coachhelm/v3/intent/types';

export interface IntentPillProps {
  narrative_goal: NarrativeGoal | null;
  size?: 'sm' | 'md';
  onClick?: () => void;
  ariaLabel?: string;
}

export function IntentPill({
  narrative_goal,
  size = 'sm',
  onClick,
  ariaLabel,
}: IntentPillProps) {
  // Cold-start: no intent set → render a neutral "no intent" chip
  // that still invites a click to set it.
  const goal = narrative_goal;
  const cfg = goal ? NARRATIVE_GOAL_PRESENTATION[goal] : null;

  const sizeClasses = size === 'md'
    ? 'text-xs px-2.5 py-1 gap-1.5'
    : 'text-[10px] px-2 py-0.5 gap-1';

  const baseClasses =
    'inline-flex items-center font-medium rounded-full border tabular-nums transition-colors';

  const stateClasses = cfg
    ? cfg.pillClass
    : 'bg-warm-50 text-warm-500 border-warm-200';

  const interactive = onClick
    ? 'cursor-pointer hover:opacity-90'
    : '';

  const label = cfg?.label ?? 'No intent';
  const emoji = cfg?.emoji ?? '○';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? `Set intent (currently ${label})`}
        className={`${baseClasses} ${sizeClasses} ${stateClasses} ${interactive}`}
        data-testid="intent-pill"
        data-intent={goal ?? 'none'}
      >
        <span aria-hidden="true">{emoji}</span>
        <span>{label}</span>
      </button>
    );
  }

  return (
    <span
      className={`${baseClasses} ${sizeClasses} ${stateClasses}`}
      data-testid="intent-pill"
      data-intent={goal ?? 'none'}
      aria-label={ariaLabel ?? `Intent: ${label}`}
    >
      <span aria-hidden="true">{emoji}</span>
      <span>{label}</span>
    </span>
  );
}

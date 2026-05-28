'use client';

/**
 * IntentPill — color-coded chip showing a coach's narrative posture for
 * one player. Drops into roster rows + per-player coach tiles.
 *
 * Master plan Part VIII UX: 🔴 Bubble / 🟢 Maintain / 🟡 Develop /
 * ⭐ Breakout / 🔵 Rehab. Click → opens IntentDrawer (caller wires).
 *
 * Premium polish: when the pill is interactive (has onClick), it lifts
 * on hover + presses on tap using the canonical v3 motion vocabulary.
 * The static span variant stays motionless — it's ambient context.
 */

import { m } from 'framer-motion';
import { NARRATIVE_GOAL_PRESENTATION, type NarrativeGoal } from '@/lib/coachhelm/v3/intent/types';
import { liftHover, tapPress } from '@/lib/coachhelm/v3/motion';

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
    : 'text-eyebrow px-2 py-0.5 gap-1';

  const baseClasses =
    'inline-flex items-center font-medium rounded-full border tabular-nums transition-colors duration-[280ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]';

  const stateClasses = cfg
    ? cfg.pillClass
    : 'bg-warm-50 text-warm-500 border-warm-200';

  const label = cfg?.label ?? 'No intent';
  const emoji = cfg?.emoji ?? '○';

  if (onClick) {
    return (
      <m.button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? `Set intent (currently ${label})`}
        whileHover={liftHover}
        whileTap={tapPress}
        className={`${baseClasses} ${sizeClasses} ${stateClasses} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40`}
        data-testid="intent-pill"
        data-intent={goal ?? 'none'}
      >
        <span aria-hidden="true">{emoji}</span>
        <span>{label}</span>
      </m.button>
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

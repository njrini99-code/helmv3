'use client';

/**
 * GoalCard — render a single v3 Goal.
 *
 * Master plan Part VI display contract:
 *   - Metric label + target
 *   - Player progress (current_value → target_value) with cohort context
 *   - Time-remaining badge
 *   - State chip (active / paused / etc.)
 *   - Action menu (pause / abandon / share-with-coach toggle)
 *
 * Premium polish: card uses canonical enter motion + the progress bar
 * scales-in from the left so progress feels EARNED, not assumed.
 *
 * Tier 4 polish (v3 feature audit feature #4): pair the existing
 * `v3-lift` CSS class with canonical Framer Motion `liftHover` + `tapPress`
 * so the card responds on both pointer hover and touch press. Framer
 * Motion 12 honors `prefers-reduced-motion` automatically.
 */

import { m } from 'framer-motion';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { formatValue } from '@/components/golf/coachhelm/v3/StandingBar';
import {
  enterVariants,
  enterTransition,
  liftHover,
  tapPress,
  EASE_CINEMATIC,
  DURATION,
} from '@/lib/coachhelm/v3/motion';

export interface GoalCardProps {
  goal: Goal;
  /** When false, render a compact one-line summary instead of the full card. */
  expanded?: boolean;
}

const STATE_CHIP: Record<Goal['state'], { label: string; cls: string }> = {
  active:            { label: 'Active',            cls: 'bg-primary-50 text-primary-700' },
  paused:            { label: 'Paused',            cls: 'bg-warm-100 text-warm-700' },
  achieved:          { label: 'Achieved',          cls: 'bg-primary-100 text-primary-800' },
  missed:            { label: 'Missed',            cls: 'bg-red-50 text-red-700' },
  partial:           { label: 'Partial',           cls: 'bg-amber-50 text-amber-700' },
  abandoned:         { label: 'Abandoned',         cls: 'bg-warm-100 text-warm-500' },
  pending_baseline:  { label: 'Pending baseline',  cls: 'bg-blue-50 text-blue-700' },
};

function daysRemaining(endsAt: string): number {
  const ms = new Date(endsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400_000));
}

function progressPct(g: Goal): number | null {
  if (g.baseline_value === null || g.target_value === null || g.current_value === null) {
    return null;
  }
  const span = g.target_value - g.baseline_value;
  if (Math.abs(span) < 1e-6) return 100;
  const traveled = g.current_value - g.baseline_value;
  return Math.max(0, Math.min(100, Math.round((traveled / span) * 100)));
}

export function GoalCard({ goal, expanded = true }: GoalCardProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const cfg = getMetricRenderConfig(goal.metric_id);
  const stateChip = STATE_CHIP[goal.state];
  const days = daysRemaining(goal.ends_at);
  const pct = progressPct(goal);

  if (!expanded) {
    return (
      <m.div
        variants={enterVariants}
        initial="hidden"
        animate="visible"
        transition={prefersReducedMotion ? { duration: 0 } : (enterTransition)}
        whileHover={liftHover}
        whileTap={tapPress}
        data-testid="goal-card-compact"
        data-goal-id={goal.id}
        className="glass-standard rounded-xl px-3 py-2 flex items-center justify-between gap-3 v3-lift"
      >
        <span className="text-sm font-medium text-warm-900 truncate">{goal.title}</span>
        <span className={`text-eyebrow font-medium rounded-full px-2 py-0.5 shrink-0 ${stateChip.cls}`}>
          {stateChip.label}
        </span>
      </m.div>
    );
  }

  return (
    <m.div
      variants={enterVariants}
      initial="hidden"
      animate="visible"
      transition={prefersReducedMotion ? { duration: 0 } : (enterTransition)}
      whileHover={liftHover}
      whileTap={tapPress}
      data-testid="goal-card"
      data-goal-id={goal.id}
      className="glass-standard rounded-2xl shadow-glass p-5 v3-lift"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-base font-medium text-warm-900 tracking-[-0.012em] truncate">
          {goal.title}
        </h3>
        <span
          className={`text-eyebrow font-medium rounded-full px-2 py-0.5 shrink-0 ${stateChip.cls}`}
        >
          {stateChip.label}
        </span>
      </div>

      <p className="text-xs text-warm-500 mb-3">
        {cfg?.display_label ?? goal.metric_id} · {goal.window_days}-day window
        {goal.state === 'active' && ` · ${days} day${days === 1 ? '' : 's'} left`}
      </p>

      {/* Values row */}
      <div className="flex items-baseline justify-between text-xs text-warm-600 tabular-nums mb-3">
        <span>
          Baseline {goal.baseline_value !== null && cfg
            ? formatValue(goal.baseline_value, cfg.unit)
            : '—'}
        </span>
        <span className="text-warm-900 font-medium text-sm">
          Now {goal.current_value !== null && cfg
            ? formatValue(goal.current_value, cfg.unit)
            : '—'}
        </span>
        <span>
          Target {goal.target_value !== null && cfg
            ? formatValue(goal.target_value, cfg.unit)
            : '—'}
        </span>
      </div>

      {/* Progress bar — animates from 0 → current pct so progress
          feels EARNED rather than asserted. Helm-green fill with a
          soft ring at the leading edge. */}
      {pct !== null && (
        <div className="relative h-1.5 w-full bg-warm-100 rounded-full mb-2 overflow-hidden">
          <m.div
            className="absolute left-0 top-0 h-full bg-primary-600 rounded-full shadow-[0_0_0_2px_rgba(22,163,74,0.12)]"
            initial={{ width: '0%' }}
            animate={{ width: `${pct}%` }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: DURATION.long, ease: EASE_CINEMATIC, delay: 0.15 })}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Footer line */}
      <p className="text-eyebrow text-warm-500">
        {goal.creator_role === 'coach' ? 'Assigned by coach' : 'Self-set'}
        {goal.shared_with_coach && goal.creator_role === 'player' && ' · shared with coach'}
      </p>
    </m.div>
  );
}

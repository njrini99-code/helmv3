'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FairwayGoalCard — a single v3 Goal, Fairway-matte
 * ----------------------------------------------------------------------------
 * Surfaces the v3 GOALS system (golf_goals) on the redesigned development
 * surfaces. The shipped legacy GoalCard
 * (src/components/golf/coachhelm/v3/GoalCard/index.tsx) renders cold glass
 * (`bg-white/70 backdrop-blur-xl shadow-glass`) which violates the Fairway
 * "cream, not white / matte, no glass on content" rule inside `.fairway-ds`.
 *
 * This is the flat, matte equivalent of that display contract:
 *   • Header — goal.title + a StatusPill mapping all 7 GoalState values to
 *     Fairway tones (replaces the legacy STATE_CHIP glass map).
 *   • Sub-line — metric display_label · window · days-left (active only).
 *   • Values — Baseline / Now / Target, formatted via the shipped formatValue,
 *     honest `—` when null.
 *   • Progress — a flat Fairway track + accent fill; rendered ONLY when a real
 *     progress pct exists. When current == baseline (cron hasn't moved it) the
 *     bar reads 0 with an honest "Not started — baseline captured" caption —
 *     NEVER styled as a miss.
 *   • Standing — when `data.standing` maps to a metric, the Fairway-native
 *     StandingStrip shows the player's live PGA·team·you standing on the EXACT
 *     metric the goal targets. Omitted entirely when no standing row exists
 *     (honest — most demo goal metrics have no standing snapshot yet).
 *   • Footer — provenance (Assigned by coach / Self-set · shared with coach),
 *     and on the coach view, ghost Pause / Abandon actions wired to the shipped
 *     pauseGoal / abandonGoal server actions.
 *
 * REUSE (verbatim, no logic change):
 *   • types — Goal / PlayerStanding
 *   • metric config — getMetricRenderConfig (direction / unit / label / scale)
 *   • formatValue — the shipped value formatter (re-exported by StandingBar)
 *   • StandingStrip — the Batch-0 Fairway-native standing element
 *   • write actions — pauseGoal / abandonGoal (coach view only)
 *   • daysRemaining / progressPct — pure helpers copied from the legacy card.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork by the
 * GoalsSection consumer. Pure presentation; renders inside `.fairway-ds`.
 * ========================================================================== */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  Surface,
  StatusPill,
  type StatusPillProps,
  Button,
  StandingStrip,
} from '@/components/fairway';
import { useToast } from '@/components/ui/sonner';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { formatValue } from '@/components/golf/coachhelm/v3/StandingBar';
import { pauseGoal, abandonGoal } from '@/app/golf/actions/v3/goals';
import type { Goal, GoalState } from '@/lib/coachhelm/v3/goals/types';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

/* ───────────────────────────────────────────────────────────────────────────
 * Props
 * ────────────────────────────────────────────────────────────────────────── */

export interface FairwayGoalCardData {
  goal: Goal;
  /**
   * The player's standing on this goal's metric, when a snapshot exists.
   * `null` → no StandingStrip is rendered (honest; the cron may not have
   * populated a row for this metric yet).
   */
  standing?: PlayerStanding | null;
}

export interface FairwayGoalCardProps {
  data: FairwayGoalCardData;
  /**
   * Coach view shows "Assigned to <name>" provenance + pause/abandon controls;
   * player view shows self-set/coach provenance and no destructive controls.
   */
  role: 'coach' | 'player';
  /** Coach view only — the owning player's display name. */
  playerName?: string;
}

/* ───────────────────────────────────────────────────────────────────────────
 * State → Fairway tone (exhaustive over all 7 GoalState values)
 * ────────────────────────────────────────────────────────────────────────── */

const STATE_PILL: Record<GoalState, { label: string; tone: StatusPillProps['tone'] }> = {
  active: { label: 'Active', tone: 'accent' },
  achieved: { label: 'Achieved', tone: 'success' },
  missed: { label: 'Missed', tone: 'danger' },
  partial: { label: 'Partial', tone: 'neutral' },
  pending_baseline: { label: 'Pending baseline', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'neutral' },
  abandoned: { label: 'Abandoned', tone: 'neutral' },
};

/* ───────────────────────────────────────────────────────────────────────────
 * Pure helpers — copied verbatim from the legacy GoalCard (no behavior change).
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Humanize an unknown snake_case metric key ("sg_putting" → "Sg Putting") so a
 * raw key with underscores is NEVER shown. Mirrors the CausalWhyPanel helper,
 * title-casing each token rather than only the first word.
 */
function humanizeMetricKey(key: string): string {
  const spaced = key.replace(/_/g, ' ').trim();
  if (!spaced) return key;
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The clean, human goal title. The stored `goal.title` can carry a raw
 * snake_case metric key (engine-suggested goals are created as
 * `Goal — <metric_id>`), which must never reach the user. This card targets a
 * single metric, so we resolve the title from the canonical metric label
 * (`getMetricRenderConfig`, the SAME map the sub-line + standing already use),
 * falling back to a humanized key for any metric not in the registry.
 * Render-only — the stored value is untouched.
 */
function goalDisplayTitle(goal: Goal, cfg: ReturnType<typeof getMetricRenderConfig>): string {
  return cfg?.display_label ?? humanizeMetricKey(goal.metric_id);
}

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

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayGoalCard({ data, role, playerName }: FairwayGoalCardProps) {
  const { goal, standing } = data;
  const router = useRouter();
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const cfg = getMetricRenderConfig(goal.metric_id);
  const pill = STATE_PILL[goal.state];
  const days = daysRemaining(goal.ends_at);
  const pct = progressPct(goal);

  // Honest "not started" — the cron hasn't moved current off baseline yet, so a
  // 0% bar would otherwise read as failure. Detect current == baseline.
  const notStarted =
    pct !== null &&
    goal.current_value !== null &&
    goal.baseline_value !== null &&
    Math.abs(goal.current_value - goal.baseline_value) < 1e-6;

  const showStanding = standing != null && cfg != null;

  function runTransition(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successTitle: string,
  ) {
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) {
          addToast({ type: 'error', title: result.error || 'Something went wrong' });
          return;
        }
        addToast({ type: 'success', title: successTitle });
        router.refresh();
      } catch {
        addToast({ type: 'error', title: 'Something went wrong' });
      }
    });
  }

  return (
    <Surface
      elevation="border"
      padding="md"
      data-slot="fairway-goal-card"
      data-goal-id={goal.id}
    >
      {/* Header — title + state pill */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate font-fw-display text-body-lg font-medium text-text-primary">
          {goalDisplayTitle(goal, cfg)}
        </h3>
        <StatusPill tone={pill.tone} size="sm" className="shrink-0">
          {pill.label}
        </StatusPill>
      </div>

      {/* Sub-line — metric · window · days-left (active only) */}
      <p className="mb-4 font-fw-sans text-caption text-text-tertiary">
        {cfg?.display_label ?? goal.metric_id} · {goal.window_days}-day window
        {goal.state === 'active' && ` · ${days} day${days === 1 ? '' : 's'} left`}
      </p>

      {/* Values row — Baseline / Now / Target */}
      <div className="mb-3 flex items-baseline justify-between font-fw-mono text-caption tabular-nums text-text-tertiary">
        <span>
          Baseline{' '}
          {goal.baseline_value !== null && cfg
            ? formatValue(goal.baseline_value, cfg.unit)
            : '—'}
        </span>
        <span className="font-fw-sans text-body-sm font-medium text-text-primary">
          Now{' '}
          {goal.current_value !== null && cfg
            ? formatValue(goal.current_value, cfg.unit)
            : '—'}
        </span>
        <span>
          Target{' '}
          {goal.target_value !== null && cfg
            ? formatValue(goal.target_value, cfg.unit)
            : '—'}
        </span>
      </div>

      {/* Progress — flat Fairway track + accent fill. Only when a real pct exists. */}
      {pct !== null ? (
        <>
          <div
            className="relative h-1.5 w-full overflow-hidden rounded-full bg-warm-100"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${goalDisplayTitle(goal, cfg)} progress`}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-accent-600"
              style={{ width: `${pct}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="mt-2 font-fw-sans text-eyebrow text-text-tertiary">
            {notStarted ? 'Not started — baseline captured' : `${pct}% to target`}
          </p>
        </>
      ) : null}

      {/* Standing — the player's live PGA·team·you standing on the goal metric.
          Rendered ONLY when a standing snapshot exists for the goal's metric. */}
      {showStanding ? (
        <div className="mt-4">
          <StandingStrip
            metric_id={standing.metric_id}
            metric_label={cfg.display_label}
            player_value={standing.player_value}
            team_avg={standing.team_avg}
            team_n={standing.team_n}
            team_pct={standing.team_pct}
            pga_value={standing.pga_value}
            direction={cfg.direction}
            unit={cfg.unit}
            scale={cfg.default_scale}
            size="inline"
            show_cohort_text={false}
          />
        </div>
      ) : null}

      {/* Footer — provenance + coach controls */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate font-fw-sans text-eyebrow text-text-tertiary">
          {role === 'coach' && playerName ? `Assigned to ${playerName} · ` : ''}
          {goal.creator_role === 'coach' ? 'Assigned by coach' : 'Self-set'}
          {goal.shared_with_coach && goal.creator_role === 'player' && ' · shared with coach'}
        </p>

        {role === 'coach' && goal.state === 'active' ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              busy={isPending}
              disabled={isPending}
              onClick={() => runTransition(() => pauseGoal(goal.id), 'Goal paused')}
            >
              Pause
            </Button>
            <Button
              variant="ghost"
              size="sm"
              busy={isPending}
              disabled={isPending}
              onClick={() => runTransition(() => abandonGoal(goal.id), 'Goal abandoned')}
            >
              Abandon
            </Button>
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

export default FairwayGoalCard;

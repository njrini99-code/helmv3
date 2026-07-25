'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · GoalsSection — the GOALS block for the dev surfaces
 * ----------------------------------------------------------------------------
 * Surfaces the v3 GOALS system (golf_goals + golf_goal_suggestions) — built
 * end-to-end (loader, server actions, crons) but, until now, imported by ZERO
 * golf surfaces. This is the reusable section block the consumer pages
 * (player /my-development, coach /development — wired by separate agents) drop
 * into the redesigned development flow.
 *
 * Composition (Fairway-matte, inside `.fairway-ds`):
 *   • Header — an InstrumentPanel bezel with a Readout of the active-goal count.
 *     Honest `awaiting` state when there are no active goals (never a fake 0).
 *   • Active goals — a grid of FairwayGoalCard. Empty → EmptyState. The player
 *     view's empty CTA opens the shipped GoalCreationModal; the coach view's
 *     empty state explains goals are assigned via the focus-area flow.
 *   • Suggestions rail ("CoachHelm suggests") — compact Inset rows each with
 *     Accept (acceptGoalSuggestion) + Dismiss (dismissGoalSuggestion). Rendered
 *     ONLY when suggestions exist (no empty-state noise; suggestions are a bonus
 *     rail). Player view only — suggestions are a player-facing accept decision.
 *
 * REUSE (verbatim, no logic change):
 *   • types — Goal / GoalSuggestion (route resolves display_label + unit into
 *     the GoalSuggestionView shape this component consumes).
 *   • server actions — acceptGoalSuggestion / dismissGoalSuggestion (shipped).
 *   • GoalCreationModal — the shipped player creation flow, reused AS AN OVERLAY
 *     (portal `fixed inset-0 z-50`), which sits OUTSIDE the `.fairway-ds`
 *     content scope, so its glass material is acceptable per the overlay rule.
 *   • formatValue — the shipped value formatter (re-exported by StandingBar).
 *   • FairwayGoalCard — the matte single-goal card (this folder).
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork by the
 * consumer pages. The CONSUMER wiring (props forwarding from the route, mount
 * placement) is owned by separate agents; this file owns only the section.
 * ========================================================================== */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Target, Trophy } from 'lucide-react';

import {
  Surface,
  Inset,
  Button,
  EmptyState,
  InstrumentPanel,
  Readout,
  Sparkline,
} from '@/components/fairway';
import { useToast } from '@/components/ui/sonner';
import { formatValue } from '@/components/golf/coachhelm/v3/StandingBar';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import {
  GoalCreationModal,
} from '@/components/golf/coachhelm/v3/GoalCreationModal';
import {
  acceptGoalSuggestion,
  dismissGoalSuggestion,
} from '@/app/golf/actions/v3/goals';
import type { GoalSuggestion } from '@/lib/coachhelm/v3/goals/types';
import type { Unit } from '@/components/golf/coachhelm/v3/StandingBar';

import {
  FairwayGoalCard,
  goalDisplayLabel,
  progressPct,
  daysRemaining,
  provenanceLabel,
  type FairwayGoalCardData,
} from './FairwayGoalCard';

/* ───────────────────────────────────────────────────────────────────────────
 * Props
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A pending suggestion enriched (by the route) with the resolved display label
 * and unit for the suggested metric, so this client component need not import
 * the metric-config lookup.
 */
export interface GoalSuggestionView {
  suggestion: GoalSuggestion;
  /** Resolved metric display label (falls back to the raw metric_id). */
  display_label: string;
  /** Resolved metric unit for formatting the suggested target. */
  unit: Unit;
}

export interface GoalsSectionProps {
  /** Active goals (each joined with its standing snapshot, if any). */
  activeGoals: FairwayGoalCardData[];
  /** Pending, unexpired suggestions enriched with display label + unit. */
  suggestions: GoalSuggestionView[];
  role: 'coach' | 'player';
  /**
   * Player view: enable the "Set a goal" creation entry (opens the shipped
   * GoalCreationModal overlay). Coach view leaves this off — coaches assign
   * goals through the existing focus-area flow.
   */
  canCreate?: boolean;
  /** Coach view labels — owning player's display name keyed by player_id. */
  playerNameById?: Record<string, string>;
  /** Recently achieved goals (player view) — the validated-win surface. */
  achievedGoals?: FairwayGoalCardData[];
  /**
   * How many focus areas are rendered BELOW this section.
   *
   * Goals and focus areas are independent populations, but the page shows them
   * stacked — so a bare "No active goals yet" sat directly above "Active focus
   * areas — 3 areas" and read as a flat contradiction (audit 2026-07-24, P-04).
   * When areas exist, the empty state names the distinction instead of denying
   * what the reader can see immediately below it.
   */
  focusAreaCount?: number;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Suggestion row — compact Inset with Accept / Dismiss
 * ────────────────────────────────────────────────────────────────────────── */

function SuggestionRow({ view }: { view: GoalSuggestionView }) {
  const { suggestion, display_label, unit } = view;
  const router = useRouter();
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();

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

  const targetText =
    suggestion.suggested_target_value !== null
      ? formatValue(suggestion.suggested_target_value, unit)
      : '—';

  return (
    <Inset
      padding="sm"
      className="flex items-center justify-between gap-3"
      data-slot="goal-suggestion-row"
      data-suggestion-id={suggestion.id}
    >
      <div className="min-w-0">
        <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
          {display_label}
        </p>
        <p className="font-fw-mono text-eyebrow tabular-nums text-text-tertiary">
          Target {targetText} · {suggestion.suggested_window_days}-day window
        </p>
      </div>
      {/* Touch target: md (44px min-height) unconditionally — not sm, which is
          only 44px behind a `(pointer: coarse)` media query (mustFix #194). */}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="secondary"
          busy={isPending}
          disabled={isPending}
          onClick={() =>
            runTransition(() => acceptGoalSuggestion(suggestion.id), 'Goal started')
          }
        >
          Accept
        </Button>
        <Button
          variant="ghost"
          busy={isPending}
          disabled={isPending}
          onClick={() =>
            runTransition(() => dismissGoalSuggestion(suggestion.id), 'Suggestion dismissed')
          }
        >
          Dismiss
        </Button>
      </div>
    </Inset>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * "Your one thing" — the single highest-priority active goal, elevated
 * ----------------------------------------------------------------------------
 * Honest, deterministic priority: a coach-assigned goal outranks a self-set one
 * (the coach's directive is the player's job), then the nearest deadline (most
 * time-pressured), with a stable id tiebreak. Returns null when nothing active.
 * ────────────────────────────────────────────────────────────────────────── */

function pickPriorityGoal(goals: FairwayGoalCardData[]): FairwayGoalCardData | null {
  const active = goals.filter((d) => d.goal.state === 'active');
  if (active.length === 0) return null;
  return (
    [...active].sort((a, b) => {
      const aCoach = a.goal.creator_role === 'coach' ? 0 : 1;
      const bCoach = b.goal.creator_role === 'coach' ? 0 : 1;
      if (aCoach !== bCoach) return aCoach - bCoach;
      const at = new Date(a.goal.ends_at).getTime();
      const bt = new Date(b.goal.ends_at).getTime();
      if (at !== bt) return at - bt;
      return a.goal.id.localeCompare(b.goal.id);
    })[0] ?? null
  );
}

function GoalHero({
  data,
  totalActive,
  onCreate,
}: {
  data: FairwayGoalCardData;
  totalActive: number;
  onCreate?: () => void;
}) {
  const { goal } = data;
  const cfg = getMetricRenderConfig(goal.metric_id);
  const pct = progressPct(goal);
  const days = daysRemaining(goal.ends_at);
  const trend = goal.snapshots.map((s) => s.value);
  const goodDirection = cfg?.direction === 'lower_better' ? 'down' : 'up';

  const gap =
    cfg != null && goal.current_value !== null && goal.target_value !== null
      ? formatValue(Math.abs(goal.target_value - goal.current_value), cfg.unit)
      : null;

  const others = Math.max(0, totalActive - 1);

  return (
    <InstrumentPanel
      depth="raised"
      tone="accent"
      padding="lg"
      eyebrow="Your one thing"
      header={goalDisplayLabel(goal)}
      readout={onCreate ? (
        // Touch target: md (44px min-height) unconditionally (mustFix #194).
        <Button variant="secondary" onClick={onCreate}>
          Set another
        </Button>
      ) : undefined}
      as="div"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <Readout
            value={pct ?? 0}
            format={{ maximumFractionDigits: 0 }}
            label="To target"
            unit="%"
            size="hero"
            state={pct === null ? 'awaiting' : 'live'}
            samples={pct === null ? { have: goal.snapshots.length, need: 2 } : undefined}
            awaitingLabel="Building history"
          />
          <p className="mt-2 font-fw-sans text-caption text-text-secondary">
            {pct === null
              ? 'Log a few rounds and the trend fills in.'
              : (
                <>
                  {gap ? <>{gap} to go · </> : null}
                  {days} day{days === 1 ? '' : 's'} left · {provenanceLabel(goal)}
                  {others > 0 ? <> · +{others} more goal{others === 1 ? '' : 's'}</> : null}
                </>
              )}
          </p>
        </div>
        {trend.length >= 2 ? (
          <Sparkline
            data={trend}
            goodDirection={goodDirection}
            label={`${goalDisplayLabel(goal)} trajectory`}
            width={148}
            height={44}
            strokeWidth={2}
            className="shrink-0 translate-y-3"
          />
        ) : null}
      </div>
    </InstrumentPanel>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Section
 * ────────────────────────────────────────────────────────────────────────── */

export function GoalsSection({
  activeGoals,
  suggestions,
  role,
  canCreate = false,
  playerNameById,
  achievedGoals = [],
  focusAreaCount = 0,
}: GoalsSectionProps) {
  const [createOpen, setCreateOpen] = useState(false);

  const activeCount = activeGoals.length;
  const hasGoals = activeCount > 0;
  const hasSuggestions = suggestions.length > 0;

  // Player surfaces lead with the single most important goal ("your one thing");
  // the coach surface (many players) keeps the plain active-goal count.
  const priority = role === 'player' ? pickPriorityGoal(activeGoals) : null;

  // Touch target: md (44px min-height) unconditionally — not sm, which is
  // only 44px behind a `(pointer: coarse)` media query (mustFix #194).
  const setGoalButton = (
    <Button variant="primary" onClick={() => setCreateOpen(true)}>
      Set a goal
    </Button>
  );

  return (
    <section data-slot="goals-section" className="flex flex-col gap-6">
      {/* Header — "Your one thing" hero (player, ≥1 active) or the count
          readout (coach, or a defensive fallback if a caller ever hands this
          component goals whose state disagrees with `activeGoals`' own
          contract). The header is gated on `hasGoals`: it must NEVER claim
          "Goals in flight" over a zero count — that reads as a real, moving
          plan when there is none, directly contradicting the honest
          EmptyState rendered right below it (mustFix #118/#125). When there
          are zero active goals, this hero is skipped entirely and the
          EmptyState below is the ONE honest empty-state read. */}
      {priority ? (
        <GoalHero
          data={priority}
          totalActive={activeCount}
          onCreate={canCreate ? () => setCreateOpen(true) : undefined}
        />
      ) : hasGoals ? (
        <InstrumentPanel
          depth="raised"
          tone="accent"
          padding="lg"
          eyebrow="Goals"
          header="Goals in flight"
          readout={canCreate ? setGoalButton : undefined}
          as="div"
        >
          <Readout
            value={activeCount}
            format={{ maximumFractionDigits: 0 }}
            label="Active goals"
            unit={activeCount === 1 ? 'goal' : 'goals'}
            size="hero"
            state="live"
          />
        </InstrumentPanel>
      ) : null}

      {/* Active goals — grid, or an honest empty state */}
      {hasGoals ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {activeGoals.map((data) => (
            <FairwayGoalCard
              key={data.goal.id}
              data={data}
              role={role}
              playerName={playerNameById?.[data.goal.player_id]}
            />
          ))}
        </div>
      ) : (
        <Surface padding="lg">
          <EmptyState
            icon={Target}
            title={
              role === 'coach'
                ? 'No goals assigned yet'
                : focusAreaCount > 0
                  ? 'No goals set yet'
                  : 'No active goals yet'
            }
            description={
              role === 'coach'
                ? 'Assign focus areas to set goals for this player. Shared and assigned goals show up here.'
                : focusAreaCount > 0
                  ? `A goal tracks one stat you want to move. You have ${focusAreaCount} focus ${
                      focusAreaCount === 1 ? 'area' : 'areas'
                    } below — set a goal to put a number on one of them.`
                  : 'Set a goal to track a stat you want to improve — or accept one CoachHelm suggests below.'
            }
            action={canCreate ? setGoalButton : undefined}
          />
        </Surface>
      )}

      {/* Recent wins — achieved goals (the active loader drops these, so the
          validated-win moment would otherwise vanish). Player view only. */}
      {role === 'player' && achievedGoals.length > 0 ? (
        <Surface padding="md">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-fw-success-ink" aria-hidden />
            <h3 className="font-fw-display text-body-lg font-medium text-text-primary">
              Recent wins
            </h3>
            <span className="ml-auto font-fw-sans text-caption text-text-tertiary">
              {achievedGoals.length} hit
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {achievedGoals.map((data) => (
              <FairwayGoalCard
                key={data.goal.id}
                data={data}
                // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
                role="player"
              />
            ))}
          </div>
        </Surface>
      ) : null}

      {/* Suggestions rail — player-facing; omitted entirely when none exist */}
      {role === 'player' && hasSuggestions ? (
        <Surface padding="md">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-600" aria-hidden />
            <h3 className="font-fw-display text-body-lg font-medium text-text-primary">
              CoachHelm suggests
            </h3>
            <span className="ml-auto font-fw-sans text-caption text-text-tertiary">
              {suggestions.length} {suggestions.length === 1 ? 'suggestion' : 'suggestions'}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {suggestions.map((view) => (
              <SuggestionRow key={view.suggestion.id} view={view} />
            ))}
          </div>
        </Surface>
      ) : null}

      {/* Player creation overlay — the shipped flow, reused as an overlay. */}
      {canCreate ? (
        <GoalCreationModal open={createOpen} onClose={() => setCreateOpen(false)} />
      ) : null}
    </section>
  );
}

export default GoalsSection;

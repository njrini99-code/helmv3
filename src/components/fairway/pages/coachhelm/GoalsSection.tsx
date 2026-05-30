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
import { Sparkles, Target } from 'lucide-react';

import {
  Surface,
  Inset,
  Button,
  EmptyState,
  InstrumentPanel,
  Readout,
} from '@/components/fairway';
import { useToast } from '@/components/ui/sonner';
import { formatValue } from '@/components/golf/coachhelm/v3/StandingBar';
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
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
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
          size="sm"
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
 * Section
 * ────────────────────────────────────────────────────────────────────────── */

export function GoalsSection({
  activeGoals,
  suggestions,
  role,
  canCreate = false,
  playerNameById,
}: GoalsSectionProps) {
  const [createOpen, setCreateOpen] = useState(false);

  const activeCount = activeGoals.length;
  const hasGoals = activeCount > 0;
  const hasSuggestions = suggestions.length > 0;

  const setGoalButton = (
    <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
      Set a goal
    </Button>
  );

  return (
    <section data-slot="goals-section" className="flex flex-col gap-6">
      {/* Header — instrument bezel + active-goal readout */}
      <InstrumentPanel
        depth="raised"
        tone="accent"
        padding="lg"
        eyebrow="Goals"
        header="Goals in flight"
        readout={
          canCreate && hasGoals ? setGoalButton : undefined
        }
        as="div"
      >
        <Readout
          value={activeCount}
          format={{ maximumFractionDigits: 0 }}
          label="Active goals"
          unit={activeCount === 1 ? 'goal' : 'goals'}
          size="hero"
          state={hasGoals ? 'live' : 'awaiting'}
          samples={hasGoals ? undefined : { have: 0, need: 1 }}
          awaitingLabel={role === 'coach' ? 'None assigned' : 'None set'}
        />
      </InstrumentPanel>

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
            title={role === 'coach' ? 'No goals assigned yet' : 'No active goals yet'}
            description={
              role === 'coach'
                ? 'Assign focus areas to set goals for this player. Shared and assigned goals show up here.'
                : 'Set a goal to track a stat you want to improve — or accept one CoachHelm suggests below.'
            }
            action={canCreate ? setGoalButton : undefined}
          />
        </Surface>
      )}

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

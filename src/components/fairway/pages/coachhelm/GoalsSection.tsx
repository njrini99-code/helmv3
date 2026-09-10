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

import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import nextDynamic from 'next/dynamic';
import { ChevronRight, Sparkles, Target, Trophy, X } from 'lucide-react';
import { fwHaptic } from '@/lib/fairway/haptics';
import { useMediaQuery } from '@/hooks/use-media-query';

// Imported from each module's own leaf path, not the top `@/components/fairway`
// barrel — this file is itself re-exported (via pages/coachhelm/index.ts) from
// that barrel, so importing the barrel back here created an import cycle,
// flagged by npm run check:cycles.
import { Surface } from '@/components/fairway/surfaces';
import { InsetGroup } from '@/components/fairway/surfaces/inset-group';
import { Button, IconButton } from '@/components/fairway/controls';
import { EmptyState, InlineNotice } from '@/components/fairway/feedback';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { InstrumentPanel, Readout } from '@/components/fairway/instrument';
import { Sparkline } from '@/components/fairway/charts';
import type { TrendPoint } from '@/components/fairway/charts/TrendChart';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { ProgressTrack } from './ProgressTrack';
import { formatDay } from './format-day';
import { formatValue } from '@/components/golf/coachhelm/v3/StandingBar';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import {
  GoalCreationModal,
} from '@/components/golf/coachhelm/v3/GoalCreationModal';
import {
  acceptGoalSuggestion,
  dismissGoalSuggestion,
} from '@/app/golf/actions/v3/goals';
import type { Goal, GoalSuggestion } from '@/lib/coachhelm/v3/goals/types';
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
  /**
   * `default`: the hero panel ("Your one thing" / "Goals in flight"), a card
   * grid and the tall EmptyState card: the coach board and vizlab keep this.
   * `inline` (player-development.v2.md #4): a seam section for a page that
   * already has a stage. One heading line; each goal is a seam row (rail +
   * sparkline) opening a goal Sheet below `md`, and a TrendChart of its
   * snapshots from `md`; the empty state is an InlineNotice with "Set a goal".
   */
  variant?: 'default' | 'inline';
}

/**
 * Recharts loads on the client only, once a goal has snapshots to draw: the
 * rows paint first, the chart follows. Mounted at `md`+ only (a mounted
 * flag; the server and the first client paint both render nothing), so the
 * phone never mounts a hidden chart per goal.
 */
const TrendChart = nextDynamic(
  () => import('@/components/fairway/charts/TrendChart').then((m) => ({ default: m.TrendChart })),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" aria-hidden /> },
);

/** Sheet settle fallback where no panel animation runs (reduced motion, jsdom). */
const GOAL_SHEET_SETTLE_MS = 360;

/* ───────────────────────────────────────────────────────────────────────────
 * Inline variant pieces: the goal row, the goal trend chart, the goal sheet.
 * ────────────────────────────────────────────────────────────────────────── */

/** The chart's points: dated snapshots oldest to newest, the last one marked. */
export function goalTrendPoints(goal: Goal): TrendPoint[] {
  const snaps = goal.snapshots.filter((s) => typeof s.value === 'number' && Number.isFinite(s.value));
  return snaps.map((s, i) => ({
    x: formatDay(s.date),
    y: s.value,
    marker: i === snaps.length - 1 ? { label: 'Latest' } : undefined,
  }));
}

/** The newest team average the snapshots carry, when any snapshot has one. */
export function latestTeamAvg(goal: Goal): number | null {
  for (let i = goal.snapshots.length - 1; i >= 0; i -= 1) {
    const v = goal.snapshots[i]?.team_avg;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function GoalRow({ data, onOpen }: { data: FairwayGoalCardData; onOpen: () => void }) {
  const { goal } = data;
  const cfg = getMetricRenderConfig(goal.metric_id);
  const label = goalDisplayLabel(goal);
  const pct = progressPct(goal);
  const notStarted =
    pct !== null &&
    goal.current_value !== null &&
    goal.baseline_value !== null &&
    Math.abs(goal.current_value - goal.baseline_value) < 1e-6;
  const trend = goal.snapshots.map((s) => s.value);
  const goodDirection = cfg?.direction === 'lower_better' ? 'down' : 'up';
  const fmt = (v: number) => (cfg ? formatValue(v, cfg.unit) : String(v));
  const ends = `ends ${formatDay(goal.ends_at)}`;
  const caption =
    goal.state === 'achieved'
      ? `Hit · ${provenanceLabel(goal)}`
      : pct === null
        ? `Building history · ${ends}`
        : notStarted
          ? `Not started, baseline captured · ${ends}`
          : [
              goal.current_value !== null ? `now ${fmt(goal.current_value)}` : null,
              goal.target_value !== null ? `target ${fmt(goal.target_value)}` : null,
              ends,
            ]
              .filter(Boolean)
              .join(' · ');

  return (
    <InsetGroup.Row
      as="button"
      align="start"
      icon={goal.state === 'achieved' ? <Trophy size={18} /> : <Target size={18} />}
      trailing={<ChevronRight aria-hidden />}
      aria-haspopup="dialog"
      onClick={onOpen}
      data-slot="goal-row"
      data-goal-id={goal.id}
    >
      {/* Same ladder layout as the focus-area rows: title line with the
          sparkline, then a full-width rail with a fixed-width pct label. */}
      <span className="flex flex-col gap-1.5">
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
              {label}
            </span>
            <span className="block truncate font-fw-sans text-caption text-text-tertiary">{caption}</span>
          </span>
          {trend.length >= 2 ? (
            <Sparkline
              data={trend}
              goodDirection={goodDirection}
              width={56}
              height={18}
              label={`${label} trajectory`}
              className="mt-0.5 shrink-0"
            />
          ) : null}
        </span>
        {pct !== null ? (
          <span className="flex items-center gap-3">
            <ProgressTrack
              pct={pct}
              size="sm"
              tone={goal.state === 'achieved' ? 'done' : 'active'}
              label={`${label} progress`}
              className="flex-1"
            />
            <span className="w-9 shrink-0 text-right font-fw-mono text-caption tabular-nums text-text-secondary">
              {pct}%
            </span>
          </span>
        ) : null}
      </span>
    </InsetGroup.Row>
  );
}

/**
 * One goal's trajectory: the snapshots as a line, the target dashed, the
 * last snapshot marked, the newest team average in the takeaway. Fewer than
 * two snapshots: the frame's honest insufficient-data state, never a flat
 * line.
 */
function GoalTrendChart({ data, actions }: { data: FairwayGoalCardData; actions?: ReactNode }) {
  const { goal } = data;
  const cfg = getMetricRenderConfig(goal.metric_id);
  const label = goalDisplayLabel(goal);
  const fmt = (v: number) => (cfg ? formatValue(v, cfg.unit) : String(v));
  const points = goalTrendPoints(goal);
  const pct = progressPct(goal);
  const teamAvg = latestTeamAvg(goal);
  const subtitle = [pct !== null ? `${pct}% to target` : null, `${goal.window_days}-day window`, provenanceLabel(goal)]
    .filter(Boolean)
    .join(' · ');
  return (
    <TrendChart
      title={label}
      subtitle={subtitle}
      variant="line"
      height={160}
      data={points}
      benchmark={
        goal.target_value !== null ? { value: goal.target_value, label: `Target ${fmt(goal.target_value)}` } : undefined
      }
      valueFormatter={fmt}
      takeaway={teamAvg != null ? `Team avg ${fmt(teamAvg)}` : undefined}
      state={points.length >= 2 ? 'ready' : 'insufficient-data'}
      actions={actions}
    />
  );
}

function useGoalSheet(active: FairwayGoalCardData[], achieved: FairwayGoalCardData[]) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [heldId, setHeldId] = useState<string | null>(null);
  const openGoal = useCallback((id: string) => {
    fwHaptic('selection');
    setHeldId(id);
    setOpenId(id);
  }, []);
  const close = useCallback(() => setOpenId(null), []);
  const data = heldId
    ? active.find((d) => d.goal.id === heldId) ?? achieved.find((d) => d.goal.id === heldId) ?? null
    : null;
  return { data, open: openId != null, openGoal, close };
}

/**
 * The goal Sheet: the full bare goal card and the trend chart mount once the
 * sheet has settled (owner perf rule: no heavy trees in a sheet before
 * settle); the open translate animates a light skeleton. `data` is held
 * through the close animation so the card never swaps to the skeleton
 * mid-slide. The same settle pattern as FocusAreaSheet.
 */
function GoalSheet({
  data,
  open,
  onClose,
  role,
}: {
  data: FairwayGoalCardData | null;
  open: boolean;
  onClose: () => void;
  role: 'coach' | 'player';
}) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!open) {
      setSettled(false);
      return;
    }
    const id = window.setTimeout(() => setSettled(true), GOAL_SHEET_SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [open]);
  const onAnimationEnd = useCallback((e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setSettled(true);
  }, []);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={data ? goalDisplayLabel(data.goal) : 'Goal'}
      hideTitle
      onAnimationEnd={onAnimationEnd}
    >
      <Sheet.Body className="px-0 pt-6">
        {data && settled ? (
          <div className="flex flex-col">
            <FairwayGoalCard frame="bare" data={data} role={role} />
            <div className="px-6 pb-6">
              <GoalTrendChart data={data} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-6" aria-hidden>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </Sheet.Body>
    </Sheet>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Suggestion row — one seam row of the "CoachHelm suggests" InsetGroup:
 * label · target line, then ONE primary Accept and a quiet Dismiss glyph
 * (player-development.mobile.md #4). Two text buttons used to crush the
 * label to three characters at 393 px.
 * ────────────────────────────────────────────────────────────────────────── */

function SuggestionRow({ view }: { view: GoalSuggestionView }) {
  const { suggestion, display_label, unit } = view;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function runTransition(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successTitle: string,
  ) {
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) {
          fairwayToast.danger(result.error || 'Something went wrong');
          return;
        }
        fairwayToast.success(successTitle);
        router.refresh();
      } catch {
        fairwayToast.danger('Something went wrong');
      }
    });
  }

  const targetText =
    suggestion.suggested_target_value !== null
      ? formatValue(suggestion.suggested_target_value, unit)
      : '—';

  return (
    <InsetGroup.Row
      data-slot="goal-suggestion-row"
      data-suggestion-id={suggestion.id}
      trailing={
        /* Touch target: md (44px) unconditionally — not sm, which is only
           44px behind a `(pointer: coarse)` media query (mustFix #194). */
        <span className="inline-flex items-center gap-1">
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
          <IconButton
            variant="ghost"
            aria-label="Dismiss"
            disabled={isPending}
            onClick={() =>
              runTransition(() => dismissGoalSuggestion(suggestion.id), 'Suggestion dismissed')
            }
          >
            <X aria-hidden />
          </IconButton>
        </span>
      }
    >
      <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
        {display_label}
      </span>
      <span className="block truncate font-fw-mono text-eyebrow tabular-nums text-text-tertiary">
        Target {targetText} · {suggestion.suggested_window_days}-day window
      </span>
    </InsetGroup.Row>
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
  variant = 'default',
}: GoalsSectionProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const inline = variant === 'inline';
  const goalSheet = useGoalSheet(activeGoals, achievedGoals);
  // Mounted flag for the md+ charts (false on the server and the first client
  // paint, so there is no hydration flip; the charts appear after mount).
  const wide = useMediaQuery('(min-width: 768px)');

  const activeCount = activeGoals.length;
  const hasGoals = activeCount > 0;
  const hasSuggestions = suggestions.length > 0;

  // Player surfaces lead with the single most important goal ("your one thing");
  // the coach surface (many players) keeps the plain active-goal count. The
  // inline variant has a stage above it and no hero of its own.
  const priority = role === 'player' && !inline ? pickPriorityGoal(activeGoals) : null;

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
      {inline ? (
        <div className="flex items-center gap-2 px-1">
          <Target className="h-5 w-5 shrink-0 text-accent-600" aria-hidden />
          <h2 className="font-fw-display text-h3 font-medium text-text-primary">Goals</h2>
          {hasGoals ? (
            <span className="ml-auto font-fw-sans text-body-sm text-text-tertiary">
              {activeCount} active
            </span>
          ) : null}
          {hasGoals && canCreate ? (
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>
              Set a goal
            </Button>
          ) : null}
        </div>
      ) : priority ? (
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

      {/* Active goals — inline: seam rows below `md` (a tap opens the goal
          Sheet) and one TrendChart per goal from `md`; default: the card
          grid. Empty: an InlineNotice (inline) or the EmptyState card. */}
      {hasGoals && inline ? (
        <>
          <InsetGroup variant="matte" className="md:hidden" aria-label="Active goals">
            {activeGoals.map((data) => (
              <GoalRow key={data.goal.id} data={data} onOpen={() => goalSheet.openGoal(data.goal.id)} />
            ))}
          </InsetGroup>
          {wide ? (
            <div className="hidden flex-col gap-4 md:flex">
              {activeGoals.map((data) => (
                <GoalTrendChart
                  key={data.goal.id}
                  data={data}
                  actions={
                    <Button variant="ghost" onClick={() => goalSheet.openGoal(data.goal.id)}>
                      Details
                    </Button>
                  }
                />
              ))}
            </div>
          ) : null}
        </>
      ) : hasGoals ? (
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
      ) : inline ? (
        <InlineNotice
          tone="info"
          icon={Target}
          title={focusAreaCount > 0 ? 'No goals set yet' : 'No active goals yet'}
          action={canCreate ? setGoalButton : undefined}
        >
          {focusAreaCount > 0
            ? `A goal puts a number on one stat. You have ${focusAreaCount} focus ${
                focusAreaCount === 1 ? 'area' : 'areas'
              } above; set a goal on one of them.`
            : 'Set a goal to track a stat you want to improve, or accept one CoachHelm suggests below.'}
        </InlineNotice>
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
                    } below. Set a goal to put a number on one of them.`
                  : 'Set a goal to track a stat you want to improve, or accept one CoachHelm suggests below.'
            }
            action={canCreate ? setGoalButton : undefined}
          />
        </Surface>
      )}

      {/* Recent wins — achieved goals (the active loader drops these, so the
          validated-win moment would otherwise vanish). Player view only. */}
      {role === 'player' && achievedGoals.length > 0 && inline ? (
        <section className="flex flex-col gap-3" aria-label="Recent wins">
          <div className="flex items-center gap-2 px-1">
            <Trophy className="h-4 w-4 text-fw-success-ink" aria-hidden />
            <h3 className="font-fw-display text-body-lg font-medium text-text-primary">
              Recent wins
            </h3>
            <span className="ml-auto font-fw-sans text-caption text-text-tertiary">
              {achievedGoals.length} hit
            </span>
          </div>
          <InsetGroup variant="matte">
            {achievedGoals.map((data) => (
              <GoalRow key={data.goal.id} data={data} onOpen={() => goalSheet.openGoal(data.goal.id)} />
            ))}
          </InsetGroup>
        </section>
      ) : role === 'player' && achievedGoals.length > 0 ? (
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

      {/* Suggestions rail — player-facing; omitted entirely when none exist.
          A heading line over ONE matte InsetGroup (no card around rows). */}
      {role === 'player' && hasSuggestions ? (
        <section className="flex flex-col gap-3" aria-label="CoachHelm suggests">
          <div className="flex items-center gap-2 px-1">
            <Sparkles className="h-4 w-4 text-accent-600" aria-hidden />
            <h3 className="font-fw-display text-body-lg font-medium text-text-primary">
              CoachHelm suggests
            </h3>
            <span className="ml-auto font-fw-sans text-caption text-text-tertiary">
              {suggestions.length} {suggestions.length === 1 ? 'suggestion' : 'suggestions'}
            </span>
          </div>
          <InsetGroup variant="matte">
            {suggestions.map((view) => (
              <SuggestionRow key={view.suggestion.id} view={view} />
            ))}
          </InsetGroup>
        </section>
      ) : null}

      {/* Inline variant: the tapped goal's full card and trend in a Sheet. */}
      {inline ? (
        <GoalSheet data={goalSheet.data} open={goalSheet.open} onClose={goalSheet.close} role={role} />
      ) : null}

      {/* Player creation overlay — the shipped flow, reused as an overlay. */}
      {canCreate ? (
        <GoalCreationModal open={createOpen} onClose={() => setCreateOpen(false)} />
      ) : null}
    </section>
  );
}

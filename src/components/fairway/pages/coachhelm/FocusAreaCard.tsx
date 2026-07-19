'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FocusAreaCard — ONE focus-area vocabulary
 * ----------------------------------------------------------------------------
 * The single shared focus-area card for BOTH coach Development (PlayersGridView)
 * and player My Development (FairwayMyDevelopment). Replaces two divergent
 * hand-rolled glass cards (development-client.tsx renderFocusAreaCard +
 * my-development/page.tsx inline markup) with ONE matte Surface vocabulary.
 *
 * COMPOSES FROM (blueprint primitivesToBuild "FocusAreaCard"):
 *   - Surface / Inset (retires `bg-white/70 backdrop-blur-xl` hand-rolled glass)
 *   - Sparkline + TrendChip  (from the charts batch — phase-1 siblings)
 *   - Button                 (controls)
 *   - Chip / Badge / StatusPill (controls)
 *   - lower-is-better progress tokens + getProgressPercent (areaTypes.ts)
 *   - InsufficientData       (the honesty state for a starved per-area trend)
 *
 * HONESTY CONTRACT (lives IN this primitive):
 *   - The per-area Sparkline gets the REAL progress history; with <2 points the
 *     Sparkline renders an honest em-dash (its own contract) — never a fake flat
 *     line. We pass the true series and let the primitive decide.
 *   - The progress meter is lower-is-better aware (golf is lower-is-better) and
 *     amber-not-red; a metric with no target shows no authoritative bar.
 *
 * REAL SOURCE CHIPS (no teases):
 *   - from_review_id  → /golf/dashboard/rounds/<id>/review
 *   - from_insight_id → role-aware: player → /golf/dashboard/coachhelm#insight-<id>
 *     (player anchor); coach → /golf/dashboard/insights?id=<id> (coaches have no
 *     player profile, so the player front door always 404s them into
 *     NotPlayerState — the Insights workspace's `?id=` deep-link is the coach-
 *     facing equivalent).
 *   Both are real Next <Link>s (Button asChild) — not decorative spans.
 *
 * VARIANTS:
 *   - role="coach"  → Edit + Log progress + Mark complete actions, PLUS an
 *     additional outcome-capture control (Improved / No change / Worsened) when
 *     an `onRecordOutcome` handler is wired. That control calls the
 *     recordFocusAreaOutcome server action (closes the effectiveness loop),
 *     reflects the recorded verdict as a read-only "Outcome: …" StatusPill, and
 *     NEVER replaces the complete/progress actions.
 *   - role="player" → Log progress + Mark complete (the player's own actions);
 *     no outcome capture (coach-only).
 *
 * NAMING: lives ONLY under fairway/. The legacy
 * src/components/golf/coachhelm/insights/FocusAreaCard.tsx is NEVER touched.
 *
 * ADDITIVE ONLY — imported by nothing existing; renders inside a `.fairway-ds`
 * scope on a `bg-canvas` page.
 * ========================================================================== */

import { forwardRef, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Surface, Inset } from '@/components/fairway/surfaces';
import { ProgressTrack } from './ProgressTrack';
import { Button } from '@/components/fairway/controls/button';
import { Badge } from '@/components/fairway/controls/badge';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import type { FwStatusTone } from '@/components/fairway/controls/_internal';
import { InsufficientData } from '@/components/fairway/feedback/InsufficientData';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import { TrendChip, type GoodDirection } from '@/components/fairway/charts/TrendChip';
import { StandingStrip } from '@/components/fairway/charts/StandingStrip';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { PracticeRxForInsight } from './PracticeRxForInsight';
import {
  IconCheck,
  IconCheckCircle2,
  IconClock,
  IconFileText,
  IconSparkles,
  IconChevronRight,
  IconTarget,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconTrash,
  IconRotateCcw,
} from '@/components/icons';
import {
  getAreaType,
  getProgressPercent,
  isLowerIsBetter,
} from './areaTypes';

/* ---------------------------------------------------------------------------
 * Types — the shared focus-area shape (superset of coach + player rows)
 * ------------------------------------------------------------------------- */

export type FocusAreaRole = 'coach' | 'player';

/**
 * The three effectiveness verdicts a coach can record. Mirrors the
 * `recordFocusAreaOutcome` server-action signature (development.ts) and the
 * values the CoachHelm effectiveness reader stores in
 * `golf_coach_insights.outcome_status`.
 */
export type FocusAreaOutcome = 'improved' | 'no_change' | 'worsened';

/** One persisted progress entry (golf_player_focus_areas.progress_notes.entries[]). */
export interface FocusAreaProgressEntry {
  /** ISO timestamp. */
  at: string;
  /** The recorded current value at that time. */
  value: number;
  note?: string;
}

/**
 * The focus-area row this card renders. A superset of the fields selected by
 * both the coach Development loader and the player My Development loader, so a
 * single card serves both. All optional fields degrade honestly.
 */
export interface FocusAreaCardData {
  id: string;
  area_type: string;
  title: string | null;
  description?: string | null;
  status?: string | null;
  target_metric?: string | null;
  current_value?: number | null;
  target_value?: number | null;
  /**
   * Measurable-target TIMEFRAME (Feature F). 'date' → hit by `target_date`;
   * 'rounds' → within `target_rounds`. null/absent → no timeframe (legacy rows).
   * These map to not-yet-propagated DB columns (migration 20260621230000), so a
   * loader only surfaces them once that migration is applied; until then they're
   * simply absent and the timeframe line renders nothing (honest degrade).
   * Typed as the raw DB string ('date' | 'rounds' are the meaningful values) so
   * a Supabase row assigns directly; the render narrows via === checks.
   */
  target_kind?: string | null;
  /** ISO date (YYYY-MM-DD) when target_kind === 'date'. */
  target_date?: string | null;
  /** Round count when target_kind === 'rounds'. */
  target_rounds?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  /** Origin links — render REAL source chips, not teases. */
  from_review_id?: string | null;
  /**
   * The round id behind `from_review_id`, resolved by the route from
   * golf_round_reviews.round_id. The round-review route (/rounds/[id]/review)
   * is keyed by ROUND id, not review id — so the SourceChip's "From a round
   * review" link uses this when present. Falls back to from_review_id only as a
   * last resort (link may 404 if unresolved).
   */
  from_review_round_id?: string | null;
  from_insight_id?: string | null;
  /** Short context line carried from the origin review/insight. */
  review_context?: string | null;
  /**
   * Recorded effectiveness verdict (golf_coach_insights.outcome_status, surfaced
   * onto the focus area). When present the card reflects it as a StatusPill
   * ("Outcome: improved") instead of offering the capture control again.
   */
  outcome_status?: FocusAreaOutcome | string | null;
  /**
   * Persisted progress history (oldest→newest values) for the per-area
   * Sparkline. When fewer than 2 points exist the Sparkline shows an em-dash.
   */
  progressHistory?: FocusAreaProgressEntry[] | null;
}

export interface FocusAreaCardProps {
  /** The focus-area row to render. */
  focusArea: FocusAreaCardData;
  /** Coach vs player view — selects the action set + tone. */
  role: FocusAreaRole;
  /** Optional player name shown as an overline (coach grid groups by player). */
  playerName?: string;
  /** Edit handler (coach only). When omitted, no edit affordance is shown. */
  onEdit?: (focusArea: FocusAreaCardData) => void;
  /** Log-progress handler. When omitted, the Log progress action is hidden. */
  onLogProgress?: (focusArea: FocusAreaCardData) => void;
  /** Mark-complete handler. When omitted, the Mark complete action is hidden. */
  onComplete?: (focusArea: FocusAreaCardData) => void;
  /**
   * Reopen (reactivate) handler for a COMPLETED area. When provided, the
   * completed-card row shows a quiet "Reopen" affordance so an irreversible
   * completion is recoverable (Nielsen #3 user control / #5 error prevention).
   * The consumer owns the reactivateFocusArea write + toast + refresh.
   */
  onReopen?: (focusArea: FocusAreaCardData) => void;
  /** Busy flag for the reopen action (optimistic UI on the completed card). */
  reopening?: boolean;
  /**
   * Delete handler (coach only). When provided AND role==="coach", the card shows
   * a quiet destructive "Delete" affordance. The consumer owns the forced-choice
   * confirm + the deleteFocusArea server-action call; the card just requests it.
   */
  onDelete?: (focusArea: FocusAreaCardData) => void;
  /** Busy flag for the complete action (optimistic UI). */
  completing?: boolean;
  /**
   * Outcome-capture handler (coach only). When provided AND role==="coach" AND
   * no outcome is recorded yet, the card shows a calm "Record outcome" control
   * (Improved / No change / Worsened). It must resolve to { success, error? } —
   * the same shape `recordFocusAreaOutcome` returns. The card owns the optimistic
   * pending state + sonner toast; the consumer just performs the write + refresh.
   */
  onRecordOutcome?: (
    focusArea: FocusAreaCardData,
    outcome: FocusAreaOutcome,
  ) => Promise<{ success: boolean; error?: string; notice?: string }>;
  /** Stagger index for the in-view reveal. */
  index?: number;
  className?: string;
  /**
   * Standing snapshot for this focus area's target metric (player vs team vs
   * PGA). When present (and the metric has a render config) an inline
   * StandingStrip renders beneath the progress meter on the ACTIVE card only.
   * Renders nothing when absent — honest-empty, never a fabricated bar.
   */
  standing?: PlayerStanding | null;
}

/* ---------------------------------------------------------------------------
 * Outcome vocabulary — verdict → tone + label + icon (text always carries it)
 * ------------------------------------------------------------------------- */

const OUTCOME_META: Record<
  FocusAreaOutcome,
  { tone: FwStatusTone; label: string; Icon: (p: { size?: number; className?: string }) => ReactNode }
> = {
  improved: { tone: 'success', label: 'Improved', Icon: IconTrendingUp },
  no_change: { tone: 'neutral', label: 'No change', Icon: IconMinus },
  worsened: { tone: 'warning', label: 'Worsened', Icon: IconTrendingDown },
};

const OUTCOME_ORDER: FocusAreaOutcome[] = ['improved', 'no_change', 'worsened'];

function outcomeMeta(
  outcome: string | null | undefined,
): { tone: FwStatusTone; label: string } | null {
  if (!outcome) return null;
  const meta = OUTCOME_META[outcome as FocusAreaOutcome];
  if (meta) return { tone: meta.tone, label: meta.label };
  // Unknown stored verdict — still reflect it honestly as neutral text (DATA).
  return { tone: 'neutral', label: outcome };
}

/* ---------------------------------------------------------------------------
 * Status → tone + label (shared families; text always carries the meaning)
 * ------------------------------------------------------------------------- */

const STATUS_TONE: Record<string, { tone: FwStatusTone; label: string }> = {
  active: { tone: 'accent', label: 'Active' },
  in_progress: { tone: 'info', label: 'In Progress' },
  completed: { tone: 'success', label: 'Completed' },
  paused: { tone: 'warning', label: 'Paused' },
  // Coach-prescribed, awaiting the player's acceptance (the coach sees this on
  // their board so a prescribed area reads as pending, not already Active).
  proposed: { tone: 'warning', label: 'Proposed' },
  // Player explicitly rejected a coach-prescribed area. Distinct danger tone so
  // it never reads as "Active" (the old fallback rendered this identically to
  // real, ongoing work — see the STATUS_TONE fallback below).
  declined: { tone: 'danger', label: 'Declined' },
};

function statusMeta(status: string | null | undefined): { tone: FwStatusTone; label: string } {
  return STATUS_TONE[status ?? 'active'] ?? STATUS_TONE.active!;
}

/**
 * Lifecycle states the mutating actions (Mark complete / Log progress / Record
 * outcome) are meaningful on. Mirrors the server-side allowlist
 * (development.ts's ACTIONABLE_FOCUS_AREA_STATUSES) so a 'proposed' (not yet
 * accepted) or 'declined' (rejected) area never shows live action buttons that
 * would just be rejected by the server anyway.
 */
const ACTIONABLE_STATUSES = new Set(['active', 'in_progress', 'paused']);

function isActionableStatus(status: string | null | undefined): boolean {
  return ACTIONABLE_STATUSES.has(status ?? 'active');
}

/* ---------------------------------------------------------------------------
 * Source chip — a REAL <Link> to the origin (review or insight)
 * ------------------------------------------------------------------------- */

function SourceChip({
  reviewId,
  reviewRoundId,
  insightId,
  context,
  role,
}: {
  reviewId?: string | null;
  /** Resolved round id behind the review (route is keyed by round, not review). */
  reviewRoundId?: string | null;
  insightId?: string | null;
  context?: string | null;
  /** Viewer role — selects the insight destination (coach vs player front door). */
  role: FocusAreaRole;
}): ReactNode {
  if (!reviewId && !insightId) return null;

  // from_review_id → the round review (route /rounds/[id]/review is keyed by the
  // ROUND id, so prefer the resolved reviewRoundId; fall back to reviewId only
  // when unresolved). from_insight_id → role-aware: a COACH has no player
  // profile, so `/golf/dashboard/coachhelm` (the player-only front door) always
  // renders NotPlayerState for them — send coaches to the Insights workspace's
  // `?id=` deep-link instead (the same insight, in the coach-facing surface).
  // A player keeps the original in-page anchor.
  const href = reviewId
    ? `/golf/dashboard/rounds/${reviewRoundId ?? reviewId}/review`
    : role === 'coach'
      ? `/golf/dashboard/insights?id=${insightId}`
      : `/golf/dashboard/coachhelm#insight-${insightId}`;
  const label = reviewId ? 'From a round review' : 'From a CoachHelm insight';
  const Icon = reviewId ? IconFileText : IconSparkles;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href={href}
        className={cn(
          'group/source inline-flex flex-shrink-0 items-center gap-1.5 rounded-full',
          'border border-accent-200 bg-accent-50 px-2.5 py-1',
          'font-fw-sans text-eyebrow font-medium text-accent-700',
          'transition-[color,background-color,border-color] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
          'hover:bg-accent-100 hover:border-accent-300',
          'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'motion-reduce:transition-none',
        )}
      >
        <Icon size={11} className="text-accent-600" />
        <span>{label}</span>
        <IconChevronRight
          size={11}
          className="text-accent-400 transition-transform [transition-duration:180ms] group-hover/source:translate-x-0.5 motion-reduce:transition-none"
        />
      </Link>
      {context ? (
        <span className="truncate font-fw-sans text-eyebrow text-text-tertiary">{context}</span>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Timeframe (Feature F) — a human line for the target's deadline / round budget
 * ----------------------------------------------------------------------------
 * Returns e.g. "by Apr 12" or "within 5 rounds", or null when the focus area
 * carries no timeframe (legacy rows, or a coach who skipped it). Pairs with the
 * target value so the card reads "Target: 28.5 by Apr 12".
 * ------------------------------------------------------------------------- */

function formatTimeframe(focusArea: FocusAreaCardData): string | null {
  if (focusArea.target_kind === 'date' && focusArea.target_date) {
    // Parse the YYYY-MM-DD as a local date (split avoids the UTC-midnight
    // off-by-one that `new Date('2026-04-12')` causes in western timezones).
    const [y, m, d] = focusArea.target_date.split('-').map((n) => parseInt(n, 10));
    if (y && m && d) {
      const dt = new Date(y, m - 1, d);
      if (!Number.isNaN(dt.getTime())) {
        return `by ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      }
    }
    return null;
  }
  if (focusArea.target_kind === 'rounds' && typeof focusArea.target_rounds === 'number') {
    const n = focusArea.target_rounds;
    return `within ${n} ${n === 1 ? 'round' : 'rounds'}`;
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Progress meter — lower-is-better aware, amber-not-red, honest
 * ------------------------------------------------------------------------- */

function ProgressMeter({
  current,
  target,
  metric,
  reduced,
}: {
  current: number | null;
  target: number;
  metric: string | null | undefined;
  reduced: boolean;
}): ReactNode {
  const pct = getProgressPercent(current, target, metric);
  const lowerBetter = isLowerIsBetter(metric);
  const met = pct >= 100;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between font-fw-sans text-body-sm">
        <span className="font-medium text-text-secondary">
          {metric || 'Progress'}
          {lowerBetter ? (
            <span className="ml-1.5 font-fw-sans text-eyebrow font-normal text-text-tertiary">
              lower is better
            </span>
          ) : null}
        </span>
        <span className="font-fw-mono font-medium tabular-nums text-text-primary">
          {current ?? 0}
          <span className="mx-1 font-normal text-text-tertiary">/</span>
          {target}
          {pct > 0 ? (
            <Badge tone={met ? 'success' : 'neutral'} size="sm" numeric className="ml-2 align-middle">
              {pct}%
            </Badge>
          ) : null}
        </span>
      </div>
      {/* Shared flat track + accent fill (ProgressTrack) — the SAME rail as
          FairwayGoalCard's goal-progress bar, so the plan surface's two "how
          far along" reads render as one system. Amber (never red) is reserved
          for the trend classification, not the meter fill — a partial bar is
          "in progress", not "bad". */}
      <ProgressTrack
        pct={pct}
        size="md"
        tone={met ? 'done' : 'active'}
        animateIn
        reduced={reduced}
        label={`${metric || 'Progress'}: ${pct}% toward target`}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * OutcomeCapture — the calm "Record outcome" affordance (coach only)
 * ----------------------------------------------------------------------------
 * Three StatusPill-style buttons (Improved / No change / Worsened). On click it
 * optimistically reflects the chosen verdict, fires the passed write handler,
 * toasts on success/failure, and rolls back if the write fails. Once a verdict
 * is recorded (locally or from server data) it renders the read-only outcome
 * pill instead of the buttons.
 * ------------------------------------------------------------------------- */

function OutcomeCapture({
  focusArea,
  onRecordOutcome,
  recordedOutcome,
}: {
  focusArea: FocusAreaCardData;
  onRecordOutcome: NonNullable<FocusAreaCardProps['onRecordOutcome']>;
  /** A server-recorded verdict, if any (short-circuits to read-only). */
  recordedOutcome: string | null | undefined;
}): ReactNode {
  // Optimistic local verdict + which choice is mid-flight.
  const [optimistic, setOptimistic] = useState<FocusAreaOutcome | null>(null);
  const [pending, setPending] = useState<FocusAreaOutcome | null>(null);

  // Effective recorded verdict: server value wins; else our optimistic value.
  const effective = recordedOutcome ?? optimistic;
  const recorded = outcomeMeta(effective);

  if (recorded) {
    const meta = OUTCOME_META[(effective as FocusAreaOutcome)] ?? OUTCOME_META.no_change;
    const RecordedIcon = meta.Icon;
    return (
      <div className="flex items-center gap-2">
        <span className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
          Outcome
        </span>
        <StatusPill tone={recorded.tone} size="sm">
          <RecordedIcon size={12} className="mr-0.5" />
          Outcome: {recorded.label}
        </StatusPill>
      </div>
    );
  }

  async function handlePick(outcome: FocusAreaOutcome) {
    if (pending) return;
    setPending(outcome);
    setOptimistic(outcome); // optimistic reflection
    try {
      const res = await onRecordOutcome(focusArea, outcome);
      if (res.success) {
        if (res.notice) {
          fairwayToast.info(res.notice);
        } else {
          fairwayToast.success(`Outcome recorded: ${OUTCOME_META[outcome].label}`);
        }
      } else {
        setOptimistic(null); // roll back
        fairwayToast.error(res.error ?? 'Could not record outcome');
      }
    } catch {
      setOptimistic(null); // roll back
      fairwayToast.error('Could not record outcome');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
        Record outcome
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {OUTCOME_ORDER.map((outcome) => {
          const meta = OUTCOME_META[outcome];
          const ChoiceIcon = meta.Icon;
          const isBusy = pending === outcome;
          return (
            <Button
              key={outcome}
              variant="secondary"
              size="sm"
              busy={isBusy}
              disabled={pending != null && !isBusy}
              leftIcon={<ChoiceIcon size={14} />}
              onClick={() => handlePick(outcome)}
              aria-label={`Record outcome: ${meta.label}`}
            >
              {meta.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * FocusAreaCard
 * ------------------------------------------------------------------------- */

const revealVariants = (reduced: boolean) => ({
  hidden: reduced ? { opacity: 1 } : { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
});

export const FocusAreaCard = forwardRef<HTMLDivElement, FocusAreaCardProps>(
  function FocusAreaCard(
    {
      focusArea,
      role,
      playerName,
      onEdit,
      onLogProgress,
      onComplete,
      onReopen,
      reopening = false,
      onDelete,
      onRecordOutcome,
      completing = false,
      index = 0,
      className,
      standing,
    },
    ref,
  ) {
    const reduced = useReducedMotion() ?? false;

    const area = getAreaType(focusArea.area_type);
    const AreaIcon = area.icon;
    const status = statusMeta(focusArea.status);
    const isCompleted = focusArea.status === 'completed';

    // A server-recorded effectiveness verdict, if any (reflected as a read-only
    // pill on both the active and completed render paths).
    const recordedOutcome = outcomeMeta(focusArea.outcome_status);

    const hasTarget =
      focusArea.target_value != null && focusArea.target_value > 0;

    // Measurable-target TIMEFRAME (Feature F) — "by Apr 12" / "within 5 rounds",
    // or null when none is set. Rendered beside the target on the active card.
    const timeframe = formatTimeframe(focusArea);

    // The per-area trend series (oldest→newest values). The Sparkline applies
    // the <2-points → em-dash honesty contract itself; we just pass the truth.
    const series = useMemo(
      () =>
        (focusArea.progressHistory ?? [])
          .map((e) => e.value)
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
      [focusArea.progressHistory],
    );
    const hasTrend = series.length >= 2;

    // Trend classification is goodDirection-aware: for lower-is-better metrics,
    // a decreasing series is "improving". TrendChip hosts the shared trend fn.
    const goodDirection: GoodDirection = isLowerIsBetter(focusArea.target_metric)
      ? 'down'
      : 'up';

    // First→last delta drives the TrendChip verdict (the shared classifier).
    const trendDelta = hasTrend ? series[series.length - 1]! - series[0]! : 0;

    /* ---- COMPLETED: a quiet collapsed row (never an authoritative meter) ---- */
    if (isCompleted) {
      return (
        <motion.div
          ref={ref}
          variants={revealVariants(reduced)}
          initial="hidden"
          animate="visible"
          transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : index * 0.04, ease: [0.16, 1, 0.3, 1] }}
        >
          <Surface
            padding="sm"
            elevation="border"
            className={cn('flex items-center gap-4', className)}
          >
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-fw-md bg-surface-sunken text-text-tertiary">
              <AreaIcon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-fw-sans font-medium text-text-secondary">
                {focusArea.title || 'Untitled'}
              </p>
              <p className="font-fw-sans text-eyebrow text-text-tertiary">{area.label}</p>
            </div>
            {recordedOutcome ? (
              <StatusPill tone={recordedOutcome.tone} size="sm">
                Outcome: {recordedOutcome.label}
              </StatusPill>
            ) : null}
            <StatusPill tone="success" size="sm">
              <IconCheck size={12} className="mr-0.5" />
              Complete
            </StatusPill>
            {focusArea.completed_at ? (
              <span className="hidden font-fw-mono text-eyebrow tabular-nums text-text-tertiary sm:inline">
                {new Date(focusArea.completed_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            ) : null}
            {/* Reopen — recovers from an accidental / premature completion. Quiet
                ghost so it never competes with the "Complete" status pill. */}
            {typeof onReopen === 'function' ? (
              <Button
                variant="ghost"
                size="sm"
                busy={reopening}
                leftIcon={<IconRotateCcw size={14} />}
                onClick={() => onReopen(focusArea)}
                className="flex-shrink-0"
              >
                Reopen
              </Button>
            ) : null}
          </Surface>
        </motion.div>
      );
    }

    /* ---- ACTIVE / IN-PROGRESS: the full card ---- */
    // A 'proposed' (not yet accepted) or 'declined' area isn't being worked —
    // Log progress / Mark complete / Record outcome are hidden for it (they'd
    // just be rejected server-side anyway). Edit + Delete stay independent of
    // lifecycle so a coach can still fix or retract a pending/declined area.
    const actionable = isActionableStatus(focusArea.status);
    const showEdit = role === 'coach' && typeof onEdit === 'function';
    const showLogProgress = actionable && typeof onLogProgress === 'function';
    const showComplete = actionable && typeof onComplete === 'function';
    // Delete is a coach-only destructive capability (mirrors the legacy fork).
    // The card requests it; the consumer owns the forced-choice confirm + write.
    const showDelete = role === 'coach' && typeof onDelete === 'function';
    // Outcome capture is an ADDITIONAL coach capability — it never replaces the
    // complete/progress actions. Shown when a handler is wired for a coach.
    const showOutcome = role === 'coach' && actionable && typeof onRecordOutcome === 'function';

    return (
      <motion.div
        ref={ref}
        variants={revealVariants(reduced)}
        initial="hidden"
        animate="visible"
        transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      >
        <Surface padding="md" elevation="border" className={cn('space-y-4', className)}>
          {/* Header: area icon + title + status */}
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-fw-md bg-accent-50 text-accent-700">
              <AreaIcon size={22} />
            </span>

            <div className="min-w-0 flex-1">
              {playerName ? (
                <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
                  {playerName}
                </p>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-2 font-fw-sans text-body-lg font-semibold text-text-primary">
                    {focusArea.title || 'Untitled'}
                  </h3>
                  <p className="mt-0.5 font-fw-sans text-body-sm font-medium text-accent-700">
                    {area.label}
                  </p>
                </div>
                <StatusPill tone={status.tone} size="sm" className="flex-shrink-0">
                  {status.label}
                </StatusPill>
              </div>
            </div>
          </div>

          {/* Description */}
          {focusArea.description ? (
            <p className="font-fw-sans text-body-sm leading-relaxed text-text-secondary">
              {focusArea.description}
            </p>
          ) : null}

          {/* Real source chip */}
          <SourceChip
            reviewId={focusArea.from_review_id}
            reviewRoundId={focusArea.from_review_round_id}
            insightId={focusArea.from_insight_id}
            context={focusArea.review_context}
            role={role}
          />

          {/* Practice Rx — drills prescribed for the originating insight. Self-
              fetches via getDrillsForInsight and collapses to null when the
              focus area has no from_insight_id, or the insight has no drills
              (the honest invisible state on the demo). */}
          <PracticeRxForInsight insightId={focusArea.from_insight_id} variant="sheet" />

          {/* Trend + progress — the instrument row, nested in an Inset */}
          {hasTarget ? (
            <Inset padding="sm" className="space-y-3">
              {/* Per-area Sparkline + TrendChip — honest <2pts em-dash */}
              <div className="flex items-center justify-between gap-3">
                <span className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
                  Trend
                </span>
                <div className="flex items-center gap-2">
                  <Sparkline
                    data={series}
                    goodDirection={goodDirection}
                    label={`Progress trend for ${focusArea.title || 'this focus area'}`}
                  />
                  {hasTrend ? (
                    <TrendChip delta={trendDelta} goodDirection={goodDirection} size="sm" />
                  ) : null}
                </div>
              </div>

              <ProgressMeter
                current={focusArea.current_value ?? null}
                target={focusArea.target_value!}
                metric={focusArea.target_metric}
                reduced={reduced}
              />

              {/* Timeframe (Feature F) — "Target: 28.5 by Apr 12" / "…within 5
                  rounds". Renders only when the coach set a timeframe; absent
                  otherwise (honest, no fabricated deadline). */}
              {timeframe ? (
                <p className="flex items-center gap-1.5 font-fw-sans text-eyebrow text-text-tertiary">
                  <IconClock size={12} className="text-accent-600" />
                  <span>
                    Target:{' '}
                    <span className="font-fw-mono tabular-nums text-text-secondary">
                      {focusArea.target_value}
                    </span>{' '}
                    {timeframe}
                  </span>
                </p>
              ) : null}

              {/* Standing — you vs team vs PGA for this metric. Renders only when
                  a real standing snapshot exists AND the metric has a render
                  config; otherwise nothing (honest-empty, never a fake 0%). */}
              {standing
                ? (() => {
                    const cfg = getMetricRenderConfig(standing.metric_id);
                    return cfg ? (
                      <StandingStrip
                        size="inline"
                        metric_id={standing.metric_id}
                        metric_label={cfg.display_label}
                        player_value={standing.player_value}
                        team_avg={standing.team_avg}
                        team_n={standing.team_n}
                        team_pct={standing.team_pct}
                        pga_value={standing.pga_value}
                        is_womens={standing.is_womens}
                        direction={cfg.direction}
                        unit={cfg.unit}
                        scale={cfg.default_scale}
                        show_cohort_text={false}
                      />
                    ) : null;
                  })()
                : null}
            </Inset>
          ) : (
            // No target → no authoritative meter. Honest "set a target" prompt.
            <Inset padding="sm" className="space-y-2">
              <InsufficientData
                compact
                icon={null}
                title="No target set yet"
                description="Add a target metric to track progress on this focus area."
              />
              {/* A coach can set a timeframe without a numeric target — surface it
                  on its own so the deadline isn't silently dropped (Feature F). */}
              {timeframe ? (
                <p className="flex items-center gap-1.5 font-fw-sans text-eyebrow text-text-tertiary">
                  <IconClock size={12} className="text-accent-600" />
                  <span>Due {timeframe}</span>
                </p>
              ) : null}
              {/* Bug #58: the placeholder used to be a dead end — a coach reading
                  "No target set yet" had no way to act on it from the card
                  itself, and had to hunt for the separate Edit button below (which
                  is easy to miss once several cards repeat the identical
                  placeholder). Give it its OWN inline call-to-action that opens the
                  same edit flow (`onEdit`), gated the same way the Edit button
                  already is — coach role + a wired handler — so this never renders
                  a button that does nothing. */}
              {showEdit ? (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<IconTarget size={15} />}
                  onClick={() => onEdit!(focusArea)}
                >
                  Set a target
                </Button>
              ) : null}
            </Inset>
          )}

          {/* Started date */}
          {focusArea.started_at ? (
            <p className="flex items-center gap-1.5 font-fw-sans text-eyebrow text-text-tertiary">
              <IconClock size={12} />
              Started{' '}
              {new Date(focusArea.started_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          ) : null}

          {/* Outcome capture — an ADDITIONAL coach capability (closes the
              effectiveness loop). Its own calm sunken row so it reads as a
              distinct affordance, never crowding the complete/progress actions. */}
          {showOutcome ? (
            <Inset padding="sm">
              <OutcomeCapture
                focusArea={focusArea}
                onRecordOutcome={onRecordOutcome!}
                recordedOutcome={focusArea.outcome_status}
              />
            </Inset>
          ) : null}

          {/* Actions — role-gated. Outcome capture lives in its own row above. */}
          {(showEdit || showLogProgress || showComplete || showDelete) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {showLogProgress ? (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<IconTarget size={15} />}
                  onClick={() => onLogProgress!(focusArea)}
                >
                  Log progress
                </Button>
              ) : null}
              {showComplete ? (
                <Button
                  variant="primary"
                  size="sm"
                  busy={completing}
                  leftIcon={<IconCheckCircle2 size={15} />}
                  onClick={() => onComplete!(focusArea)}
                >
                  Mark complete
                </Button>
              ) : null}
              {/* Edit + Delete grouped to the right; Delete is a quiet destructive
                  ghost (Nielsen #3 user control) — the consumer confirms first. */}
              {showEdit || showDelete ? (
                <div className="ml-auto flex items-center gap-1">
                  {showEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit!(focusArea)}
                    >
                      Edit
                    </Button>
                  ) : null}
                  {showDelete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<IconTrash size={15} />}
                      className="text-fw-danger hover:bg-fw-danger-bg hover:text-fw-danger"
                      onClick={() => onDelete!(focusArea)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </Surface>
      </motion.div>
    );
  },
);

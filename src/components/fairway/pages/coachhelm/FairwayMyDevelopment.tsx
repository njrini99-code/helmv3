'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FairwayMyDevelopment — the player My Development surface
 * ----------------------------------------------------------------------------
 * The player terminus of the Player Development flow (feature flow 2) and the
 * destination of the player CoachHelm "View N more". A PRESENTATION + LAYOUT +
 * ORGANIZATION rebuild ONLY — it imports and reuses the EXISTING data + write
 * actions verbatim; it does NOT fetch, mutate, or reshape any business logic.
 *
 * MOUNT MODEL (blueprint shell.mountModel + flagForkTable):
 *   The route (renderMyDevelopment) runs its server select + getProgressPercent
 *   + the active/completed partition (revalidate=60) ABOVE the fork, then — when
 *   isRedesignEnabled() — passes the PRE-COMPUTED partition into this component.
 *   This component renders the player CoachHelmShell variant (Brief + Players
 *   only) and the focus-area list inside it.
 *
 * PRESERVED LOGIC (imported UNCHANGED, never rewritten):
 *   • The My Development server select + getProgressPercent + active/completed
 *     partition + revalidate=60 — owned by the route page, passed in as props.
 *   • development.ts#updateFocusAreaProgress, completeFocusArea — wired through
 *     the focus-area card actions exactly as LogProgressButton/MarkCompleteButton
 *     called them (same args, same toast voice, same router.refresh()).
 *
 * REBUILD vs the legacy surface:
 *   • Retires the hand-rolled completed-card glass
 *     (`bg-cream-100/60 backdrop-blur-xl border border-white/20`) for the shared
 *     matte Surface family via FocusAreaCard (mustFix: non-standard glass recipe).
 *   • Source chips become REAL <Link>s (from_review_id → /rounds/<id>/review;
 *     from_insight_id → /coachhelm#insight-<id>) inside FocusAreaCard
 *     (mustFix: dead source-chip drill-back).
 *   • Per-area trend Sparkline renders honest InsufficientData when progress
 *     history is thin — never a fabricated line (residual decision #5).
 *   • A REAL error state distinct from the empty state (mustFix: silent
 *     fall-through bug) via InlineNotice.
 *
 * HOSTS (AUDIT M10, resolved): `host="stage"` is the LIVE player view, mounted
 * by PlayerCoachHelmHome's StageRouter at `/coachhelm?view=development` via
 * `FairwayMyDevelopmentStage` (the stage's DrillPanel is the chrome: back
 * chip, title, the actions as its chip). `host="page"` (default) wraps the
 * same body in CoachHelmShell for the fairway preview. The legacy
 * `components/golf/coachhelm/home/DevelopmentDrill.tsx`, a drifted verbatim
 * port of this body, is deleted.
 * ========================================================================== */

import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle2, MessageSquare, Target } from 'lucide-react';

import { cn } from '@/lib/utils';
import { fairwayScope } from '@/lib/redesign/flag';
// Imported from each module's own leaf path, not the top `@/components/fairway`
// barrel — this file is itself re-exported (via pages/coachhelm/index.ts) from
// that barrel, so importing the barrel back here created an import cycle,
// flagged by npm run check:cycles.
import { Button } from '@/components/fairway/controls';
import { Surface } from '@/components/fairway/surfaces';
import { EmptyState, InlineNotice } from '@/components/fairway/feedback';
import { CoachHelmShell } from './CoachHelmShell';
import { DrillPanel } from '@/components/fairway/modules/DrillPanel';
import { useStage } from '@/components/fairway/modules/StageRouter';
import { FocusAreaCard, type FocusAreaCardData } from './FocusAreaCard';
import {
  ActiveFocusAreaList,
  FocusAreaSheet,
  LeadAreaStage,
  LogProgressSheet,
  PlanSegmentBar,
  ProposedAreaCard,
  pickLeadArea,
  useFocusAreaSheet,
  standingForArea,
  type LogProgressState,
} from './development-parts';
import { FocusAreaModal, type FocusAreaModalSubmit } from './FocusAreaModal';
import type { AreaAutoFillStats } from './areaTypes';
import { IconPlus } from '@/components/icons';
import { GoalsSection, type GoalSuggestionView } from './GoalsSection';
import { CausalWhyPanel } from './CausalWhyPanel';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
import type { FairwayGoalCardData } from './FairwayGoalCard';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
// PRESERVED WRITE ACTIONS — imported UNCHANGED (the same actions
// LogProgressButton / MarkCompleteButton called). We re-skin the trigger UI
// only; the server round-trip + payload are byte-for-byte the legacy behavior.
import {
  completeFocusArea,
  reactivateFocusArea,
  createPlayerFocusArea,
  acceptFocusArea,
  declineFocusArea,
} from '@/app/golf/actions/development';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';


/* ───────────────────────────────────────────────────────────────────────────
 * formatTargetMetricLabel — a raw `target_metric` is a snake_case DB metric
 * identifier (e.g. `putts_made_5_10ft_pct`) or a legacy catalog label; it must
 * NEVER render verbatim in player-facing copy (mustFix #202/#60). Shared with
 * FocusAreaCard.tsx (same page's dense per-area rows) via areaTypes.ts so the
 * two never drift — see the JSDoc there for the full resolution order.
 * ────────────────────────────────────────────────────────────────────────── */

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the PRE-COMPUTED partition the route page already builds.
 * The route owns the select + getProgressPercent + filter; this component just
 * presents it. `loadError` lets the route distinguish a failed select from a
 * genuinely-empty result (mustFix: no error state).
 * ────────────────────────────────────────────────────────────────────────── */

export interface FairwayMyDevelopmentProps {
  /** Active + in-progress focus areas (oldest→newest order preserved by route). */
  activeAreas: FocusAreaCardData[];
  /** Completed focus areas. */
  completedAreas: FocusAreaCardData[];
  /** Coach-prescribed areas awaiting this player's accept/decline. Defaults []. */
  proposedAreas?: FocusAreaCardData[];
  /** This player's id — required for the self-create flow. */
  playerId?: string;
  /** This player's cached stats — drives the create modal's real values + targets. */
  playerStats?: AreaAutoFillStats;
  /** True when the server select failed — render an error, not an empty state. */
  loadError?: boolean;
  /**
   * v3 Goals — active goals (each joined with its standing snapshot) the
   * GoalsSection surfaces ABOVE the focus-areas. Independent population from
   * focus areas: Goals render even when there are zero focus areas.
   */
  goals?: FairwayGoalCardData[];
  /** v3 pending goal suggestions (enriched with display label + unit). */
  suggestions?: GoalSuggestionView[];
  /**
   * Per-metric standing snapshots keyed by canonical metric_id, used to render
   * an inline StandingStrip on a focus-area card whose target_metric matches.
   */
  standingByMetric?: Record<string, PlayerStanding>;
  /**
   * Deduped + ranked causal-engine relationships for this player ("why your
   * scores move"). Read by the route via getPlayerCausalRelationships(player.id)
   * inside the redesign fork. Empty ⇒ CausalWhyPanel renders its honest empty
   * state. Defaults to [] so the route may omit it during incremental wiring.
   */
  causalRelationships?: CausalRelationshipRow[];
  /**
   * Recently achieved goals — the validated-win surface. `loadActiveGoals` is
   * active-only, so a hit goal would vanish; the route loads these separately
   * and GoalsSection renders a "Recent wins" block. Defaults to [].
   */
  achievedGoals?: FairwayGoalCardData[];
  /**
   * `page` (default): CoachHelmShell chrome on a bg-canvas page. `stage`: the
   * body inside a DrillPanel for PlayerCoachHelmHome's StageRouter (no page
   * scope, no masthead, no max-width column; the stage owns those).
   */
  host?: 'page' | 'stage';
  /** Stage host only: the DrillPanel back chip ("Home"). */
  onBack?: () => void;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayMyDevelopment({
  activeAreas,
  completedAreas,
  proposedAreas = [],
  playerId,
  playerStats,
  loadError = false,
  goals = [],
  suggestions = [],
  standingByMetric = {},
  causalRelationships = [],
  achievedGoals = [],
  host = 'page',
  onBack,
}: FairwayMyDevelopmentProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [logState, setLogState] = useState<LogProgressState | null>(null);
  // Which focus area is mid-complete (optimistic busy flag for the card button).
  const [completingId, setCompletingId] = useState<string | null>(null);
  // Which completed area is mid-reopen (busy flag for the card "Reopen" button).
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  // Which proposed area is mid-accept/decline (busy flag for its buttons).
  const [decidingId, setDecidingId] = useState<string | null>(null);
  // Player self-create modal.
  const [createOpen, setCreateOpen] = useState(false);

  // Phone focus-area Sheet (player-development.mobile.md #3).
  const areaSheet = useFocusAreaSheet(activeAreas);

  const total = activeAreas.length + completedAreas.length;
  const hasAnyArea = total + proposedAreas.length > 0;
  const canCreateOwn = Boolean(playerId);

  // Accept a coach-prescribed area → it becomes active and the window starts.
  const handleAccept = useCallback(
    (focusArea: FocusAreaCardData) => {
      if (decidingId) return;
      setDecidingId(focusArea.id);
      startTransition(async () => {
        try {
          const result = await acceptFocusArea(focusArea.id);
          if (!result.success) {
            fairwayToast.danger(result.error || 'Failed to accept');
            setDecidingId(null);
            return;
          }
          fairwayToast.success('Focus area accepted', { description: focusArea.title || 'Now tracking' });
          setDecidingId(null);
          router.refresh();
        } catch {
          fairwayToast.danger('Failed to accept');
          setDecidingId(null);
        }
      });
    },
    [decidingId, router, startTransition],
  );

  // Decline a coach-prescribed area → status 'declined' (hidden from the list).
  const handleDecline = useCallback(
    (focusArea: FocusAreaCardData) => {
      if (decidingId) return;
      setDecidingId(focusArea.id);
      startTransition(async () => {
        try {
          const result = await declineFocusArea(focusArea.id);
          if (!result.success) {
            fairwayToast.danger(result.error || 'Failed to decline');
            setDecidingId(null);
            return;
          }
          fairwayToast.success('Declined', { description: focusArea.title || 'Focus area' });
          setDecidingId(null);
          router.refresh();
        } catch {
          fairwayToast.danger('Failed to decline');
          setDecidingId(null);
        }
      });
    },
    [decidingId, router, startTransition],
  );

  // Player self-create: persist their OWN focus area (active immediately).
  const handleCreateSubmit = useCallback(
    async (payload: FocusAreaModalSubmit): Promise<{ success: boolean; error?: string }> => {
      const { player_id, ...fields } = payload;
      const res = await createPlayerFocusArea({ player_id, ...fields });
      if (res.success) router.refresh();
      return res;
    },
    [router],
  );

  const handleLogProgress = useCallback((focusArea: FocusAreaCardData) => {
    setLogState({ focusArea });
  }, []);

  // Re-open a completed focus area (the inverse of complete). Powers BOTH the
  // toast Undo on an accidental complete AND the "Reopen" button on completed
  // cards (Nielsen #3 user control / #5 error prevention — an irreversible state
  // change is now recoverable).
  const handleReopen = useCallback(
    (focusArea: FocusAreaCardData) => {
      if (reopeningId) return;
      setReopeningId(focusArea.id);
      startTransition(async () => {
        try {
          const result = await reactivateFocusArea(focusArea.id);
          if (!result.success) {
            fairwayToast.danger(result.error || 'Failed to reopen');
            setReopeningId(null);
            return;
          }
          fairwayToast.success('Reopened', { description: focusArea.title || 'Focus area' });
          setReopeningId(null);
          router.refresh();
        } catch {
          fairwayToast.danger('Failed to reopen');
          setReopeningId(null);
        }
      });
    },
    [reopeningId, router, startTransition],
  );

  // PRESERVED: identical to the legacy MarkCompleteButton call — completeFocusArea
  // + success toast + router.refresh(). Re-skinned trigger; the success toast now
  // carries an Undo that reactivates the area so an accidental tap is recoverable.
  const handleComplete = useCallback(
    (focusArea: FocusAreaCardData) => {
      if (completingId) return;
      setCompletingId(focusArea.id);
      startTransition(async () => {
        try {
          const result = await completeFocusArea(focusArea.id);
          if (!result.success) {
            fairwayToast.danger(result.error || 'Failed to mark complete');
            setCompletingId(null);
            return;
          }
          fairwayToast.success('Marked complete', { description: focusArea.title || 'Focus area', action: { label: 'Undo', onClick: () => handleReopen(focusArea) } });
          setCompletingId(null);
          router.refresh();
        } catch {
          fairwayToast.danger('Failed to mark complete');
          setCompletingId(null);
        }
      });
    },
    [completingId, handleReopen, router, startTransition],
  );

  // Header actions: the player can always create their OWN focus area (primary).
  // "Message coach" stays a secondary helper, shown only alongside real content
  // (when empty, the empty-state owns the single obvious next action). Below
  // `md` it collapses to a 44px icon-only link so the header keeps ONE primary
  // (player-development.mobile.md #6); the label stays for screen readers.
  const headerActions = (
    <div className="flex items-center gap-2">
      {/* Touch target: md (44px min-height) — not sm — every action button on
          this page must clear the 44px guideline unconditionally, not only on
          coarse pointers (mustFix #194). */}
      {total > 0 ? (
        <Button asChild variant="secondary" className="max-md:w-11 max-md:px-0">
          <Link href="/golf/dashboard/messages">
            <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />
            <span className="max-md:sr-only">Message coach</span>
          </Link>
        </Button>
      ) : null}
      {canCreateOwn ? (
        // `leftIcon`, never a bare svg child: the preflight makes svg a block,
        // which stacked "+" above the label inside the button's label span.
        <Button variant="primary" leftIcon={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          New focus area
        </Button>
      ) : null}
    </div>
  );

  // The lead area is derived on every render, never stored, so it cannot
  // drift while a sheet is open (player-development.v2.md, context rule).
  const leadArea = useMemo(
    () => pickLeadArea(activeAreas, causalRelationships),
    [activeAreas, causalRelationships],
  );
  const showPlan = total + proposedAreas.length >= 2;
  const showFirstRow = leadArea != null || showPlan || proposedAreas.length > 0;

  const prescribed =
    proposedAreas.length > 0 ? (
      <section>
        <h2 className="mb-4 flex items-center gap-2 font-fw-display text-h3 font-medium text-text-primary">
          <Target className="h-5 w-5 text-accent-600" aria-hidden />
          Prescribed for you
          <span className="ml-auto font-fw-sans text-body-sm font-normal text-text-tertiary">
            {proposedAreas.length} pending
          </span>
        </h2>
        <div className="flex flex-col gap-3">
          {proposedAreas.map((fa) => (
            <ProposedAreaCard
              key={fa.id}
              focusArea={fa}
              deciding={decidingId === fa.id}
              onAccept={() => handleAccept(fa)}
              onDecline={() => handleDecline(fa)}
            />
          ))}
        </div>
      </section>
    ) : null;

  // The body is host-independent; each host only supplies its chrome. Order
  // (player-development.v2.md): stage · plan · ladder · goals · suggestions
  // · why · completed, as three 7/5 rows from `md`; one column below it.
  const body = (
    <>
          {/* ── Error state — distinct from empty (mustFix: silent fall-through).
                When the focus-area select failed, show ONLY the error — Goals
                are a separate population but we don't want to imply the page
                loaded cleanly. ── */}
          {loadError ? (
            <InlineNotice
              tone="danger"
              title="Couldn't load your plans"
              action={
                <Button variant="secondary" onClick={() => router.refresh()}>
                  Retry
                </Button>
              }
            >
              Something went wrong loading your development plans. Try again in a
              moment.
            </InlineNotice>
          ) : (
            <div className="flex flex-col gap-10">
              {/* ── Row 1: the stage ("Your next stroke", the lead area with
                    its rail, trend and standing) beside the plan's shape and
                    any prescribed areas awaiting a decision. With no active
                    area the prescribed areas take the stage's place. ── */}
              {showFirstRow ? (
                <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
                  {leadArea ? (
                    <LeadAreaStage
                      area={leadArea}
                      standing={standingForArea(leadArea, standingByMetric)}
                      onOpen={() => areaSheet.openArea(leadArea.id)}
                      className="md:col-span-7"
                    />
                  ) : null}
                  {showPlan || prescribed ? (
                    <div
                      className={cn(
                        'flex flex-col gap-8',
                        leadArea ? 'md:col-span-5' : 'md:col-span-12',
                      )}
                    >
                      {showPlan ? (
                        <PlanSegmentBar
                          active={activeAreas.length}
                          completed={completedAreas.length}
                          proposed={proposedAreas.length}
                        />
                      ) : null}
                      {prescribed}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!hasAnyArea ? (
                /* ── Genuinely-empty (Goals below still render). The player can
                      create their own focus area OR reach out to their coach. ── */
                <Surface padding="lg">
                  <EmptyState
                    title="No development plans yet"
                    description="Set your own focus area to track an improvement, or your coach can prescribe one for you to accept."
                    action={
                      canCreateOwn ? (
                        <Button variant="primary" leftIcon={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
                          New focus area
                        </Button>
                      ) : (
                        <Button asChild variant="primary">
                          <Link href="/golf/dashboard/messages">Message coach</Link>
                        </Button>
                      )
                    }
                  />
                </Surface>
              ) : null}

              {/* ── Row 2: the progress ladder (every active area, least
                    progressed first, rails aligned) beside the goals and the
                    suggestions. GoalsSection owns its own honest empty
                    states; `variant="inline"` is the seam reading. ── */}
              <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
                {activeAreas.length > 0 ? (
                  <section className="md:col-span-7">
                    <h2 className="mb-4 flex items-center gap-2 font-fw-display text-h3 font-medium text-text-primary">
                      <Clock className="h-5 w-5 text-accent-600" aria-hidden />
                      Active focus areas
                      <span className="ml-auto font-fw-sans text-body-sm font-normal text-text-tertiary">
                        {activeAreas.length} {activeAreas.length === 1 ? 'area' : 'areas'}
                      </span>
                    </h2>
                    {/* Phone: ONE matte group of seam rows, a tap opens the
                          full card in a Sheet (player-development.mobile.md
                          #3); md and up: the full cards, in the same order. */}
                    <ActiveFocusAreaList
                      areas={activeAreas}
                      standingByMetric={standingByMetric}
                      onOpen={areaSheet.openArea}
                      onLogProgress={handleLogProgress}
                      onComplete={handleComplete}
                      completingId={completingId}
                    />
                  </section>
                ) : null}
                <div className={activeAreas.length > 0 ? 'md:col-span-5' : 'md:col-span-12'}>
                  <GoalsSection
                    // eslint-disable-next-line jsx-a11y/aria-role
                    role="player"
                    variant="inline"
                    canCreate
                    activeGoals={goals ?? []}
                    suggestions={suggestions ?? []}
                    achievedGoals={achievedGoals ?? []}
                    // ACTIVE areas only — `total` folds in completed ones, and the
                    // copy must name a number the reader can actually see above.
                    focusAreaCount={activeAreas.length}
                  />
                </div>
              </div>

              {/* ── "Why your scores move" (the causal-engine layer, its own
                    honest empty state), then the completed areas, both full
                    width: the completed card's one-line status cluster needs
                    the whole column (a 7-col cell clipped "Bounce-back" to
                    "Bounce-ba…" in the capture). ── */}
              <CausalWhyPanel relationships={causalRelationships} />
              {completedAreas.length > 0 ? (
                  <section>
                    <h2 className="mb-4 flex items-center gap-2 font-fw-display text-h3 font-medium text-text-primary">
                      <CheckCircle2 className="h-5 w-5 text-text-tertiary" aria-hidden />
                      Completed
                      <span className="ml-auto font-fw-sans text-body-sm font-normal text-text-tertiary">
                        {completedAreas.length}{' '}
                        {completedAreas.length === 1 ? 'area' : 'areas'}
                      </span>
                    </h2>
                    <div className="flex flex-col gap-3">
                      {completedAreas.map((fa, i) => (
                        <FocusAreaCard
                          key={fa.id}
                          focusArea={fa}
                          // eslint-disable-next-line jsx-a11y/aria-role
                          role="player"
                          index={i}
                          onReopen={handleReopen}
                          reopening={reopeningId === fa.id}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
            </div>
          )}
    </>
  );

  const overlays = (
    <>
      {/* Phone: the tapped focus area's full card in a matte Sheet. */}
      <FocusAreaSheet
        area={areaSheet.area}
        open={areaSheet.open}
        onClose={areaSheet.close}
        onLogProgress={handleLogProgress}
        onComplete={handleComplete}
        completing={areaSheet.area != null && completingId === areaSheet.area.id}
        standing={areaSheet.area ? standingForArea(areaSheet.area, standingByMetric) : undefined}
      />

      {/* Single controlled log-progress sheet shared by every active card and
          every phone row. */}
      <LogProgressSheet state={logState} onClose={() => setLogState(null)} />

      {/* Player self-create modal — the SAME shared modal the coach uses, in
          player mode (no player picker; created 'active' immediately). */}
      {canCreateOwn ? (
        <FocusAreaModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode="player"
          playerId={playerId}
          playerStats={playerId ? { [playerId]: playerStats } : {}}
          onSubmit={handleCreateSubmit}
        />
      ) : null}
    </>
  );

  if (host === 'stage') {
    return (
      <>
        <DrillPanel title="Development" backLabel="Home" onBack={onBack ?? (() => {})} chip={headerActions}>
          {body}
        </DrillPanel>
        {overlays}
      </>
    );
  }

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[760px] px-4 py-2 md:px-6">
        <CoachHelmShell
          active="players"
          // eslint-disable-next-line jsx-a11y/aria-role
          role="player"
          eyebrow="My Development"
          title="Your focus areas"
          description={
            total > 0
              ? `${activeAreas.length} active · ${completedAreas.length} completed`
              : 'Focus areas your coach assigns to track your improvement.'
          }
          actions={headerActions}
        >
          {body}
        </CoachHelmShell>
      </div>
      {overlays}
    </div>
  );
}

/**
 * The stage view PlayerCoachHelmHome mounts for `?view=development`: the same
 * component with the DrillPanel chrome and the stage's own `home()` as its
 * back chip. Kept here so the live host and the page host are one file.
 */
export function FairwayMyDevelopmentStage(props: Omit<FairwayMyDevelopmentProps, 'host' | 'onBack'>) {
  const { home } = useStage();
  return <FairwayMyDevelopment {...props} host="stage" onBack={home} />;
}

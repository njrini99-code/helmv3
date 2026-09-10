'use client';

/**
 * ============================================================================
 * DevelopmentDrill — `?view=development` (spec §5.3, absorbs `/my-development`)
 * ----------------------------------------------------------------------------
 * Goals + causal "why your scores move" + focus areas — the SAME body as
 * `FairwayMyDevelopment` (minus its own `CoachHelmShell`; the stage IS the
 * chrome now). The pieces both hosts share (log progress sheet, prescribed
 * card, overview instrument, the phone focus-area rows and sheet) live in
 * `fairway/pages/coachhelm/development-parts.tsx`; this file used to carry
 * verbatim copies of three of them. Every write action (`completeFocusArea`,
 * `reactivateFocusArea`, `createPlayerFocusArea`, `acceptFocusArea`,
 * `declineFocusArea`) and every reused sub-component (`GoalsSection`,
 * `CausalWhyPanel`, `FocusAreaCard`, `FocusAreaModal`) are imported
 * UNCHANGED.
 * ========================================================================== */

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle2, MessageSquare, Target } from 'lucide-react';

import { DrillPanel, useStage } from '@/components/fairway/modules';
import {
  Button,
  Surface,
  EmptyState,
  InlineNotice,
  Eyebrow,
  FocusAreaCard,
  type FocusAreaCardData,
} from '@/components/fairway';
import { GoalsSection, type GoalSuggestionView } from '@/components/fairway/pages/coachhelm/GoalsSection';
import { CausalWhyPanel } from '@/components/fairway/pages/coachhelm/CausalWhyPanel';
import { FocusAreaModal, type FocusAreaModalSubmit } from '@/components/fairway/pages/coachhelm/FocusAreaModal';
import {
  ActiveFocusAreaList,
  DevelopmentOverviewInstrument,
  FocusAreaSheet,
  LogProgressSheet,
  ProposedAreaCard,
  useFocusAreaSheet,
  standingForArea,
  type LogProgressState,
} from '@/components/fairway/pages/coachhelm/development-parts';
import type { AreaAutoFillStats } from '@/components/fairway/pages/coachhelm/areaTypes';
import { IconPlus } from '@/components/icons';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import {
  completeFocusArea,
  reactivateFocusArea,
  createPlayerFocusArea,
  acceptFocusArea,
  declineFocusArea,
} from '@/app/golf/actions/development';
import { useToast } from '@/components/ui/sonner';

export interface DevelopmentDrillProps {
  activeAreas: FocusAreaCardData[];
  completedAreas: FocusAreaCardData[];
  proposedAreas?: FocusAreaCardData[];
  playerId?: string;
  playerStats?: AreaAutoFillStats;
  loadError?: boolean;
  goals?: FairwayGoalCardData[];
  suggestions?: GoalSuggestionView[];
  standingByMetric?: Record<string, PlayerStanding>;
  causalRelationships?: CausalRelationshipRow[];
  achievedGoals?: FairwayGoalCardData[];
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function DevelopmentDrill({
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
}: DevelopmentDrillProps) {
  const { home } = useStage();
  const router = useRouter();
  const { addToast } = useToast();
  const [, startTransition] = useTransition();

  const [logState, setLogState] = useState<LogProgressState | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Phone focus-area Sheet (player-development.mobile.md #3).
  const areaSheet = useFocusAreaSheet(activeAreas);

  const total = activeAreas.length + completedAreas.length;
  const hasAnyArea = total + proposedAreas.length > 0;
  const canCreateOwn = Boolean(playerId);

  const handleAccept = useCallback(
    (focusArea: FocusAreaCardData) => {
      if (decidingId) return;
      setDecidingId(focusArea.id);
      startTransition(async () => {
        try {
          const result = await acceptFocusArea(focusArea.id);
          if (!result.success) {
            addToast({ type: 'error', title: result.error || 'Failed to accept' });
            setDecidingId(null);
            return;
          }
          addToast({ type: 'success', title: 'Focus area accepted', description: focusArea.title || 'Now tracking' });
          setDecidingId(null);
          router.refresh();
        } catch {
          addToast({ type: 'error', title: 'Failed to accept' });
          setDecidingId(null);
        }
      });
    },
    [addToast, decidingId, router, startTransition],
  );

  const handleDecline = useCallback(
    (focusArea: FocusAreaCardData) => {
      if (decidingId) return;
      setDecidingId(focusArea.id);
      startTransition(async () => {
        try {
          const result = await declineFocusArea(focusArea.id);
          if (!result.success) {
            addToast({ type: 'error', title: result.error || 'Failed to decline' });
            setDecidingId(null);
            return;
          }
          addToast({ type: 'success', title: 'Declined', description: focusArea.title || 'Focus area' });
          setDecidingId(null);
          router.refresh();
        } catch {
          addToast({ type: 'error', title: 'Failed to decline' });
          setDecidingId(null);
        }
      });
    },
    [addToast, decidingId, router, startTransition],
  );

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

  const handleReopen = useCallback(
    (focusArea: FocusAreaCardData) => {
      if (reopeningId) return;
      setReopeningId(focusArea.id);
      startTransition(async () => {
        try {
          const result = await reactivateFocusArea(focusArea.id);
          if (!result.success) {
            addToast({ type: 'error', title: result.error || 'Failed to reopen' });
            setReopeningId(null);
            return;
          }
          addToast({ type: 'success', title: 'Reopened', description: focusArea.title || 'Focus area' });
          setReopeningId(null);
          router.refresh();
        } catch {
          addToast({ type: 'error', title: 'Failed to reopen' });
          setReopeningId(null);
        }
      });
    },
    [addToast, reopeningId, router, startTransition],
  );

  const handleComplete = useCallback(
    (focusArea: FocusAreaCardData) => {
      if (completingId) return;
      setCompletingId(focusArea.id);
      startTransition(async () => {
        try {
          const result = await completeFocusArea(focusArea.id);
          if (!result.success) {
            addToast({ type: 'error', title: result.error || 'Failed to mark complete' });
            setCompletingId(null);
            return;
          }
          addToast({
            type: 'success',
            title: 'Marked complete',
            description: focusArea.title || 'Focus area',
            action: { label: 'Undo', onClick: () => handleReopen(focusArea) },
          });
          setCompletingId(null);
          router.refresh();
        } catch {
          addToast({ type: 'error', title: 'Failed to mark complete' });
          setCompletingId(null);
        }
      });
    },
    [addToast, completingId, handleReopen, router, startTransition],
  );

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {total > 0 ? (
        // Below `md` this collapses to a 44px icon-only link so the header
        // keeps ONE primary (player-development.mobile.md #6); the label
        // stays for screen readers.
        <Button asChild variant="secondary" className="max-md:w-11 max-md:px-0">
          <Link href="/golf/dashboard/messages">
            <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />
            <span className="max-md:sr-only">Message coach</span>
          </Link>
        </Button>
      ) : null}
      {canCreateOwn ? (
        // flex-nowrap + a real <span> around the label: DrillPanel gives this
        // chip slot `w-full` on mobile, so the two header buttons share one
        // narrow row and this one gets squeezed. The bare text node was an
        // anonymous flex item that broke onto its own line, stacking the "+"
        // ABOVE "New focus area" (iPhone, 2026-07-25). Button's base
        // whitespace-nowrap stops the text breaking mid-phrase but cannot stop
        // two flex items separating.
        <Button
          variant="primary"
          onClick={() => setCreateOpen(true)}
          className="flex-nowrap"
        >
          <IconPlus size={16} className="shrink-0" />
          <span className="whitespace-nowrap">New focus area</span>
        </Button>
      ) : null}
    </div>
  );

  return (
    <DrillPanel title="Development" backLabel="Home" onBack={home} chip={headerActions}>
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
          Something went wrong loading your development plans. Try again in a moment.
        </InlineNotice>
      ) : (
        <div className="flex flex-col gap-10">
          <GoalsSection
            // eslint-disable-next-line jsx-a11y/aria-role
            role="player"
            canCreate
            activeGoals={goals ?? []}
            suggestions={suggestions ?? []}
            achievedGoals={achievedGoals ?? []}
            // ACTIVE areas only, so the goals empty state never contradicts the
            // list right below it (parity with FairwayMyDevelopment).
            focusAreaCount={activeAreas.length}
          />

          <CausalWhyPanel relationships={causalRelationships} />

          {proposedAreas.length > 0 ? (
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
          ) : null}

          {!hasAnyArea ? (
            <Surface padding="lg">
              <EmptyState
                title="No development plans yet"
                description="Set your own focus area to track an improvement, or your coach can prescribe one for you to accept."
                action={
                  canCreateOwn ? (
                    <Button variant="primary" onClick={() => setCreateOpen(true)}>
                      <IconPlus size={16} />
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

          {total > 0 ? (
            <div className="flex flex-col gap-6 border-t border-border-subtle pt-8">
              <Eyebrow>Your plan</Eyebrow>

              <DevelopmentOverviewInstrument activeCount={activeAreas.length} completedCount={completedAreas.length} />

              {activeAreas.length > 0 ? (
                <section>
                  <h2 className="mb-4 flex items-center gap-2 font-fw-display text-h3 font-medium text-text-primary">
                    <Clock className="h-5 w-5 text-accent-600" aria-hidden />
                    Active focus areas
                    <span className="ml-auto font-fw-sans text-body-sm font-normal text-text-tertiary">
                      {activeAreas.length} {activeAreas.length === 1 ? 'area' : 'areas'}
                    </span>
                  </h2>
                  {/* Phone: ONE matte group of seam rows, a tap opens the full
                      card in a Sheet (player-development.mobile.md #3); md and
                      up: the full cards, unchanged. */}
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

              {completedAreas.length > 0 ? (
                <section>
                  <h2 className="mb-4 flex items-center gap-2 font-fw-display text-h3 font-medium text-text-primary">
                    <CheckCircle2 className="h-5 w-5 text-text-tertiary" aria-hidden />
                    Completed
                    <span className="ml-auto font-fw-sans text-body-sm font-normal text-text-tertiary">
                      {completedAreas.length} {completedAreas.length === 1 ? 'area' : 'areas'}
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
          ) : null}
        </div>
      )}

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

      <LogProgressSheet state={logState} onClose={() => setLogState(null)} />

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
    </DrillPanel>
  );
}

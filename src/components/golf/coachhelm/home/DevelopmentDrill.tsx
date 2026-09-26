'use client';

/**
 * ============================================================================
 * DevelopmentDrill — `?view=development` (spec §5.3, absorbs `/my-development`)
 * ----------------------------------------------------------------------------
 * Goals + causal "why your scores move" + focus areas — ported from
 * `FairwayMyDevelopment`'s body (minus its own `CoachHelmShell`; the stage IS
 * the chrome now). Every write action (`updateFocusAreaProgress`,
 * `completeFocusArea`, `reactivateFocusArea`, `createPlayerFocusArea`,
 * `acceptFocusArea`, `declineFocusArea`) and every reused sub-component
 * (`GoalsSection`, `CausalWhyPanel`, `FocusAreaCard`, `FocusAreaModal`) are
 * imported UNCHANGED — only the page-chrome wrapper is retired.
 * ========================================================================== */

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle2, Flag, Sparkles, Target } from 'lucide-react';

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  Button,
  Surface,
  EmptyState,
  InlineNotice,
  FormField,
  Input,
  TextArea,
  FocusAreaCard,
  type FocusAreaCardData,
} from '@/components/fairway';
import { GoalsSection, type GoalSuggestionView } from '@/components/fairway/pages/coachhelm/GoalsSection';
import { CausalWhyPanel } from '@/components/fairway/pages/coachhelm/CausalWhyPanel';
import { FocusAreaModal, type FocusAreaModalSubmit } from '@/components/fairway/pages/coachhelm/FocusAreaModal';
// SourceChip — the same REAL "From a round review / From a CoachHelm insight"
// link FocusAreaCard renders for active areas. A prescribed-but-not-yet-
// accepted area is exactly where a player most needs that context: it's the
// one moment they're deciding whether to accept, and until now the card gave
// them zero evidence of WHY the coach flagged this (#1290 UX audit).
import { SourceChip } from '@/components/fairway/pages/coachhelm/FocusAreaCard';
import { getAreaType, formatTargetMetricLabel, type AreaAutoFillStats } from '@/components/fairway/pages/coachhelm/areaTypes';
import { IconPlus } from '@/components/icons';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';
import { isMetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import {
  updateFocusAreaProgress,
  completeFocusArea,
  reactivateFocusArea,
  createPlayerFocusArea,
  acceptFocusArea,
  declineFocusArea,
} from '@/app/golf/actions/development';
import { logFocusAreaPracticeSession } from '@/app/golf/actions/focus-area-practice-log';
import { useToast } from '@/components/ui/sonner';
import { Disclosure } from '@/components/golf/coachhelm/root-map/Disclosure';
import { DrillSummary } from './DrillSummary';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';

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
  /**
   * A8 slice 3 — server-computed `isFlagEnabled('coachhelm_focus_area_practice_log')`
   * (that check is server-only and cannot run in this client component).
   * Gates whether the active FocusAreaCards get a "Log practice" trigger at
   * all; false/omitted renders exactly what this component rendered before
   * slice 3. Default false.
   */
  practiceLogEnabled?: boolean;
}

/* ── Log-progress drawer — ported verbatim from FairwayMyDevelopment. ────── */
interface LogProgressState {
  focusArea: FocusAreaCardData;
}

function LogProgressDrawer({ state, onClose }: { state: LogProgressState | null; onClose: () => void }) {
  const router = useRouter();
  const { addToast } = useToast();
  // Desktop-only autofocus for the measurement field: on touch, focusing it
  // as the drawer opens summons the iOS keyboard over the form (owner
  // TestFlight report, 2026-08-26). The keyboard waits for a tap.
  const finePointer = useMediaQuery('(pointer: fine)');
  const fa = state?.focusArea;
  const [newValue, setNewValue] = useState('');
  const [note, setNote] = useState('');
  const [valueError, setValueError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = state != null;
  const currentValue = fa?.current_value ?? null;
  const targetValue = fa?.target_value ?? null;
  const targetMetric = fa?.target_metric ?? null;
  const metricLabel = formatTargetMetricLabel(targetMetric) || 'Progress';

  const MAX_REASONABLE = 100_000;

  const valueHint = (() => {
    const parts: string[] = ['0 or higher'];
    if (currentValue != null) parts.push(`current ${currentValue}`);
    if (targetValue != null) parts.push(`target ${targetValue}`);
    return parts.join(' · ');
  })();

  function reset() {
    setNewValue('');
    setNote('');
    setValueError(null);
    setSubmitting(false);
  }

  function handleClose() {
    if (submitting) return;
    onClose();
    setTimeout(reset, 200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !fa) return;

    const trimmed = newValue.trim();
    if (trimmed === '') {
      setValueError('Enter a new value to log.');
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setValueError('Enter a number (e.g. 31.5).');
      return;
    }
    if (parsed < 0) {
      setValueError('Value can’t be negative — enter 0 or higher.');
      return;
    }
    if (parsed > MAX_REASONABLE) {
      setValueError(`That looks too large — enter a value up to ${MAX_REASONABLE.toLocaleString('en-US')}.`);
      return;
    }
    setValueError(null);

    setSubmitting(true);
    try {
      const trimmedNote = note.trim();
      const result = await updateFocusAreaProgress(fa.id, parsed, { note: trimmedNote || undefined });
      if (!result.success) {
        addToast({ type: 'error', title: result.error || 'Failed to log progress' });
        setSubmitting(false);
        return;
      }
      addToast({ type: 'success', title: 'Progress updated' });
      onClose();
      router.refresh();
      setTimeout(reset, 200);
    } catch {
      addToast({ type: 'error', title: 'Failed to log progress' });
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DrawerContent className="sm:max-w-md sm:mx-auto sm:rounded-3xl sm:bottom-1/2 sm:translate-y-1/2">
        <DrawerHeader>
          <DrawerTitle>Log progress</DrawerTitle>
          <DrawerDescription>{fa?.title || 'Focus area'}</DrawerDescription>
        </DrawerHeader>
        <form
          onSubmit={handleSubmit}
          className="space-y-5 px-6 pb-6 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          <div>
            <p className="mb-1.5 block font-fw-sans text-body-sm font-medium text-text-secondary">Current value</p>
            <div className="rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 font-fw-sans text-text-primary">
              {currentValue ?? '—'}
              {targetValue != null && <span className="font-normal text-text-tertiary"> / {targetValue}</span>}
              {metricLabel && metricLabel !== 'Progress' && (
                <span className="ml-2 font-fw-sans text-eyebrow text-text-tertiary">{metricLabel}</span>
              )}
            </div>
          </div>

          <FormField label={`New value (${metricLabel})`} required error={valueError ?? undefined} help={valueHint}>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={newValue}
              onChange={(e) => {
                setNewValue(e.target.value);
                if (valueError) setValueError(null);
              }}
              placeholder="Enter your latest measurement"
              required
              aria-invalid={valueError ? true : undefined}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={finePointer}
            />
          </FormField>

          <FormField label="Note" showOptional>
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="How did it go? Any context for your coach…" rows={3} />
          </FormField>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" busy={submitting} disabled={submitting}>
              Save progress
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

/* ── ProposedAreaCard — ported verbatim from FairwayMyDevelopment. ───────── */
function ProposedAreaCard({
  focusArea,
  primary = true,
  deciding,
  onAccept,
  onDecline,
}: {
  focusArea: FocusAreaCardData;
  /** Only the first prescribed card carries the screen's primary action. */
  primary?: boolean;
  deciding: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const area = getAreaType(focusArea.area_type);
  const hasTarget = focusArea.target_metric != null && focusArea.target_value != null;
  const targetMetricLabel = formatTargetMetricLabel(focusArea.target_metric);
  return (
    <Surface padding="md" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-fw-sm bg-accent-50 text-accent-700">
          <area.icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-fw-sans text-body font-semibold text-text-primary">{focusArea.title || area.label}</p>
          {focusArea.description ? (
            <p className="mt-0.5 font-fw-sans text-body-sm text-text-secondary">{focusArea.description}</p>
          ) : null}
          {focusArea.from_review_id || focusArea.from_insight_id ? (
            <div className="mt-1.5">
              <SourceChip
                reviewId={focusArea.from_review_id}
                reviewRoundId={focusArea.from_review_round_id}
                insightId={focusArea.from_insight_id}
                context={focusArea.review_context}
                // eslint-disable-next-line jsx-a11y/aria-role -- SourceChip's own viewer-role prop, not an ARIA role
                role="player"
              />
            </div>
          ) : null}
          {hasTarget ? (
            <p className="mt-1.5 font-fw-sans text-eyebrow text-text-tertiary">
              Target: <span className="font-fw-mono tabular-nums text-text-secondary">{targetMetricLabel}</span> →{' '}
              <span className="font-fw-mono tabular-nums text-text-primary">{focusArea.target_value}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onDecline} disabled={deciding}>
          Decline
        </Button>
        <Button variant={primary ? 'primary' : 'secondary'} busy={deciding} onClick={onAccept}>
          Accept
        </Button>
      </div>
    </Surface>
  );
}

/* ── DevelopmentSummary — the drill's one summary card (root-map style). ── */
function numberText(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : null;
}

function DevelopmentSummary({
  activeAreas,
  completedCount,
  proposedCount,
  goalCount,
  action,
}: {
  activeAreas: FocusAreaCardData[];
  completedCount: number;
  proposedCount: number;
  goalCount: number;
  action?: React.ReactNode;
}) {
  const activeCount = activeAreas.length;
  const total = activeCount + completedCount;
  const top = activeAreas[0] ?? null;
  const topCurrent = numberText(top?.current_value);
  const topTarget = numberText(top?.target_value);

  const takeaway =
    proposedCount > 0
      ? `Your coach prescribed ${proposedCount} focus ${proposedCount === 1 ? 'area' : 'areas'} for you. Accept to start tracking.`
      : top
        ? `Top focus: ${top.title || getAreaType(top.area_type).label}${
            topCurrent && topTarget ? `, at ${topCurrent} with a target of ${topTarget}` : ''
          }.`
        : completedCount > 0
          ? `All ${completedCount} focus ${completedCount === 1 ? 'area is' : 'areas are'} complete. Set the next one when you're ready.`
          : 'No focus areas yet. Pick one stat to work on, or wait for your coach to prescribe one.';

  const basis = [
    `${completedCount} completed`,
    `${goalCount} ${goalCount === 1 ? 'goal' : 'goals'} in flight`,
    proposedCount > 0 ? `${proposedCount} waiting for you` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <DrillSummary
      slot="development-summary"
      eyebrow="Active focus areas"
      value={String(activeCount)}
      unit={activeCount === 1 ? 'area' : 'areas'}
      takeaway={takeaway}
      visual={
        total > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div
              role="img"
              aria-label={`${completedCount} of ${total} focus areas complete`}
              className="h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
              data-slot="development-progress"
            >
              <div className="h-full rounded-full bg-accent-500" style={{ width: `${(completedCount / total) * 100}%` }} />
            </div>
            <p aria-hidden className="text-caption text-text-secondary">
              <span className="font-fw-mono tabular-nums text-text-primary">
                {completedCount}/{total}
              </span>{' '}
              of your plan complete
            </p>
          </div>
        ) : null
      }
      basis={basis}
      action={action}
    />
  );
}

function CountMeta({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <span className="shrink-0 text-caption font-normal text-text-tertiary">
      <span className="font-fw-mono tabular-nums text-text-secondary">{n}</span> {n === 1 ? one : many}
    </span>
  );
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
  practiceLogEnabled = false,
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

  // A8 slice 3: the card owns the toast + optimistic bump — this just
  // performs the write and refreshes on success (mirrors handleRecordOutcome
  // on the coach side, PlayersGridView.tsx).
  const handleLogPracticeSession = useCallback(
    async (
      focusArea: FocusAreaCardData,
      input: { clientRequestId: string; drillId?: string | null; reps?: number | null; note?: string | null },
    ) => {
      const res = await logFocusAreaPracticeSession({ focusAreaId: focusArea.id, ...input });
      if (res.success) router.refresh();
      return res;
    },
    [router],
  );

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

  // One primary action per screen: when the coach has prescribed areas, the
  // first "Accept" is it; with no areas at all, the empty state's "New focus
  // area" is it. Everywhere else "New focus area" is a secondary header
  // action (hidden while the empty state carries it). Active areas sit in a
  // closed disclosure too: each FocusAreaCard carries its own "Mark complete"
  // primary, so an open list would put N primaries on the first paint.
  const summaryAction =
    total > 0 ? (
      <Button asChild variant="ghost">
        <Link href="/golf/dashboard/messages">Message coach</Link>
      </Button>
    ) : null;

  const headerActions =
    canCreateOwn && hasAnyArea ? (
      // flex-nowrap + a real <span> around the label: DrillPanel gives this
      // chip slot `w-full` on mobile. The bare text node was an anonymous flex
      // item that broke onto its own line, stacking the "+" ABOVE "New focus
      // area" (iPhone, 2026-07-25).
      <Button variant="secondary" onClick={() => setCreateOpen(true)} className="flex-nowrap">
        <IconPlus size={16} className="shrink-0" />
        <span className="whitespace-nowrap">New focus area</span>
      </Button>
    ) : undefined;

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
        <div className="flex flex-col gap-6">
          <DevelopmentSummary
            activeAreas={activeAreas}
            completedCount={completedAreas.length}
            proposedCount={proposedAreas.length}
            goalCount={goals.length}
            action={summaryAction}
          />

          {proposedAreas.length > 0 ? (
            <section className="flex flex-col gap-3" data-slot="development-prescribed">
              <h2 className="flex items-center gap-2 px-1 font-fw-display text-body-lg font-semibold text-text-primary">
                <Target className="h-5 w-5 text-accent-600" aria-hidden />
                Prescribed for you
                <span className="ml-auto font-fw-sans text-caption font-normal text-text-tertiary">
                  <span className="font-fw-mono tabular-nums">{proposedAreas.length}</span> pending
                </span>
              </h2>
              <div className="flex flex-col gap-3">
                {proposedAreas.map((fa, i) => (
                  <ProposedAreaCard
                    key={fa.id}
                    focusArea={fa}
                    primary={i === 0}
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

          <div className="flex flex-col" data-slot="development-detail">
            {activeAreas.length > 0 ? (
              <Disclosure
                slot="development-active"
                headingLevel={2}
                title={
                  <span className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-accent-600" aria-hidden />
                    Active focus areas
                  </span>
                }
                meta={<CountMeta n={activeAreas.length} one="area" many="areas" />}
              >
                <div className="flex flex-col gap-4">
                  {activeAreas.map((fa, i) => {
                    const m = fa.target_metric;
                    const st = m && isMetricId(m) ? standingByMetric?.[m] : undefined;
                    return (
                      <FocusAreaCard
                        key={fa.id}
                        focusArea={fa}
                        // eslint-disable-next-line jsx-a11y/aria-role
                        role="player"
                        index={i}
                        onLogProgress={handleLogProgress}
                        onComplete={handleComplete}
                        completing={completingId === fa.id}
                        standing={st}
                        onLogPracticeSession={practiceLogEnabled ? handleLogPracticeSession : undefined}
                      />
                    );
                  })}
                </div>
              </Disclosure>
            ) : null}

            <Disclosure
              slot="development-goals"
              headingLevel={2}
              title={
                <span className="flex items-center gap-2">
                  <Flag className="h-5 w-5 text-accent-600" aria-hidden />
                  Goals
                </span>
              }
              meta={<CountMeta n={goals.length} one="active" many="active" />}
            >
              <GoalsSection
                // eslint-disable-next-line jsx-a11y/aria-role
                role="player"
                canCreate
                activeGoals={goals ?? []}
                suggestions={suggestions ?? []}
                achievedGoals={achievedGoals ?? []}
              />
            </Disclosure>

            <Disclosure
              slot="development-causal"
              headingLevel={2}
              title={
                <span className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-accent-600" aria-hidden />
                  What moves your score
                </span>
              }
              meta={<CountMeta n={causalRelationships.length} one="link" many="links" />}
            >
              <CausalWhyPanel relationships={causalRelationships} title="Links found in your rounds" />
            </Disclosure>

            {completedAreas.length > 0 ? (
              <Disclosure
                slot="development-completed"
                headingLevel={2}
                title={
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-text-tertiary" aria-hidden />
                    Completed
                  </span>
                }
                meta={<CountMeta n={completedAreas.length} one="area" many="areas" />}
              >
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
              </Disclosure>
            ) : null}
          </div>
        </div>
      )}

      <LogProgressDrawer state={logState} onClose={() => setLogState(null)} />

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

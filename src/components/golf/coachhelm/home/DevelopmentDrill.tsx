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
import { Clock, CheckCircle2, Target } from 'lucide-react';

import { DrillPanel, useStage } from '@/components/fairway/modules';
import {
  Button,
  Surface,
  EmptyState,
  InlineNotice,
  InstrumentPanel,
  Readout,
  formatPercent,
  FormField,
  Input,
  TextArea,
  Eyebrow,
  FocusAreaCard,
  type FocusAreaCardData,
} from '@/components/fairway';
import { GoalsSection, type GoalSuggestionView } from '@/components/fairway/pages/coachhelm/GoalsSection';
import { CausalWhyPanel } from '@/components/fairway/pages/coachhelm/CausalWhyPanel';
import { FocusAreaModal, type FocusAreaModalSubmit } from '@/components/fairway/pages/coachhelm/FocusAreaModal';
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
import { useToast } from '@/components/ui/sonner';
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
}

/* ── Log-progress drawer — ported verbatim from FairwayMyDevelopment. ────── */
interface LogProgressState {
  focusArea: FocusAreaCardData;
}

function LogProgressDrawer({ state, onClose }: { state: LogProgressState | null; onClose: () => void }) {
  const router = useRouter();
  const { addToast } = useToast();
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
              autoFocus
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
  deciding,
  onAccept,
  onDecline,
}: {
  focusArea: FocusAreaCardData;
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
        <Button variant="primary" busy={deciding} onClick={onAccept}>
          Accept
        </Button>
      </div>
    </Surface>
  );
}

/* ── DevelopmentOverviewInstrument — ported verbatim. ─────────────────────── */
function DevelopmentOverviewInstrument({ activeCount, completedCount }: { activeCount: number; completedCount: number }) {
  const total = activeCount + completedCount;
  const completionRate = total > 0 ? completedCount / total : 0;
  const anyCompleted = completedCount > 0;

  return (
    <InstrumentPanel padding="lg" header="Development progress" as="section">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex flex-col gap-4">
          <Readout
            value={activeCount}
            format={{ maximumFractionDigits: 0 }}
            label="Active focus areas"
            unit={activeCount === 1 ? 'area' : 'areas'}
            size="hero"
            state={activeCount > 0 ? 'live' : 'awaiting'}
            samples={activeCount === 0 ? { have: 0, need: 1 } : undefined}
            awaitingLabel="None active"
          />
          <InstrumentPanel depth="inset" padding="sm" className="w-full max-w-[18rem]">
            <Readout
              value={completedCount}
              format={{ maximumFractionDigits: 0 }}
              label="Completed"
              unit={completedCount === 1 ? 'area' : 'areas'}
              size="md"
              state={anyCompleted ? 'live' : 'awaiting'}
              samples={anyCompleted ? undefined : { have: 0, need: 1 }}
              awaitingLabel="None yet"
            />
          </InstrumentPanel>
        </div>
        <div className="flex justify-center sm:justify-end">
          <Readout
            value={anyCompleted ? completionRate : undefined}
            display={anyCompleted ? formatPercent(completionRate, 0) : undefined}
            label="Plan complete"
            size="lg"
            align="end"
            state={anyCompleted ? 'live' : 'awaiting'}
            samples={anyCompleted ? undefined : { have: 0, need: 1 }}
            awaitingLabel="None yet"
          />
        </div>
      </div>
    </InstrumentPanel>
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
        <Button asChild variant="secondary">
          <Link href="/golf/dashboard/messages">Message coach</Link>
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
                        />
                      );
                    })}
                  </div>
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

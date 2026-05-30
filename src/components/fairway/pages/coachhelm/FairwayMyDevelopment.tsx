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
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork (Wire
 * phase). Renders inside the `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle2 } from 'lucide-react';

import { fairwayScope } from '@/lib/redesign/flag';
import {
  Button,
  Surface,
  EmptyState,
  InlineNotice,
  InstrumentPanel,
  Readout,
  formatPercent,
} from '@/components/fairway';
import { CoachHelmShell } from './CoachHelmShell';
import {
  FocusAreaCard,
  type FocusAreaCardData,
} from './FocusAreaCard';
// PRESERVED WRITE ACTIONS — imported UNCHANGED (the same actions
// LogProgressButton / MarkCompleteButton called). We re-skin the trigger UI
// only; the server round-trip + payload are byte-for-byte the legacy behavior.
import {
  updateFocusAreaProgress,
  completeFocusArea,
} from '@/app/golf/actions/development';
import { useToast } from '@/components/ui/sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Input, Textarea } from '@/components/ui/input';
import { Button as LegacyButton } from '@/components/ui/button';

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
  /** True when the server select failed — render an error, not an empty state. */
  loadError?: boolean;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Log-progress drawer — the SAME numeric-value + optional-note form the legacy
 * LogProgressButton rendered, calling the SAME updateFocusAreaProgress action.
 * Lifted here as a controlled drawer so a single instance serves every card.
 * ────────────────────────────────────────────────────────────────────────── */

interface LogProgressState {
  focusArea: FocusAreaCardData;
}

function LogProgressDrawer({
  state,
  onClose,
}: {
  state: LogProgressState | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const fa = state?.focusArea;
  const [newValue, setNewValue] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync the input default to the card's current value whenever a new card opens.
  const open = state != null;
  const currentValue = fa?.current_value ?? null;
  const targetValue = fa?.target_value ?? null;
  const targetMetric = fa?.target_metric ?? null;
  const metricLabel = targetMetric || 'Progress';

  function reset() {
    setNewValue('');
    setNote('');
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
      addToast({ type: 'error', title: 'Please enter a new value' });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      addToast({ type: 'error', title: 'New value must be a number' });
      return;
    }

    setSubmitting(true);
    try {
      const trimmedNote = note.trim();
      // PRESERVED: identical call signature to the legacy LogProgressButton.
      const result = await updateFocusAreaProgress(fa.id, parsed, {
        note: trimmedNote || undefined,
      });
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
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DrawerContent>
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
            <label className="block text-sm font-medium text-warm-700 mb-1.5">
              Current value
            </label>
            <div className="px-3 py-2.5 rounded-lg bg-warm-50 border border-warm-200 text-warm-700">
              {currentValue ?? '—'}
              {targetValue != null && (
                <span className="text-warm-400 font-normal"> / {targetValue}</span>
              )}
              {targetMetric && (
                <span className="ml-2 text-xs text-warm-500">{targetMetric}</span>
              )}
            </div>
          </div>

          <Input
            label={`New value (${metricLabel})`}
            type="number"
            inputMode="decimal"
            step="any"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Enter your latest measurement"
            required
            autoFocus
          />

          <Textarea
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How did it go? Any context for your coach…"
            rows={3}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <LegacyButton
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </LegacyButton>
            <LegacyButton type="submit" isLoading={submitting} disabled={submitting}>
              Save progress
            </LegacyButton>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayMyDevelopment({
  activeAreas,
  completedAreas,
  loadError = false,
}: FairwayMyDevelopmentProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [, startTransition] = useTransition();

  const [logState, setLogState] = useState<LogProgressState | null>(null);
  // Which focus area is mid-complete (optimistic busy flag for the card button).
  const [completingId, setCompletingId] = useState<string | null>(null);

  const total = activeAreas.length + completedAreas.length;

  const handleLogProgress = useCallback((focusArea: FocusAreaCardData) => {
    setLogState({ focusArea });
  }, []);

  // PRESERVED: identical to the legacy MarkCompleteButton call — completeFocusArea
  // + success toast + router.refresh(). Re-skinned trigger only.
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
          });
          setCompletingId(null);
          router.refresh();
        } catch {
          addToast({ type: 'error', title: 'Failed to mark complete' });
          setCompletingId(null);
        }
      });
    },
    [addToast, completingId, router, startTransition],
  );

  const headerActions = (
    <Button asChild variant="secondary" size="sm">
      <Link href="/golf/dashboard/messages">Message coach</Link>
    </Button>
  );

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[760px] px-4 py-2 md:px-6">
        <CoachHelmShell
          active="players"
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
          {/* ── Error state — distinct from empty (mustFix: silent fall-through) ── */}
          {loadError ? (
            <InlineNotice
              tone="danger"
              title="Couldn't load your plans"
              action={
                <Button variant="secondary" size="sm" onClick={() => router.refresh()}>
                  Retry
                </Button>
              }
            >
              Something went wrong loading your development plans. Try again in a
              moment.
            </InlineNotice>
          ) : total === 0 ? (
            /* ── Genuinely-empty state ── */
            <Surface padding="lg">
              <EmptyState
                title="No development plans yet"
                description="Your coach will assign focus areas to track your improvement. Reach out if you'd like to set some goals together."
                action={
                  <Button asChild variant="primary">
                    <Link href="/golf/dashboard/messages">Message coach</Link>
                  </Button>
                }
              />
            </Surface>
          ) : (
            <div className="flex flex-col gap-10">
              {/* ── The plan instrument — ONE warm-glass focal readout of the
                    player's development progress. The dense FocusAreaCard rows
                    below stay MATTE + legible; this is the hero summary. ── */}
              <DevelopmentOverviewInstrument
                activeCount={activeAreas.length}
                completedCount={completedAreas.length}
              />

              {/* ── Active / in-progress ── */}
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
                    {activeAreas.map((fa, i) => (
                      <FocusAreaCard
                        key={fa.id}
                        focusArea={fa}
                        role="player"
                        index={i}
                        onLogProgress={handleLogProgress}
                        onComplete={handleComplete}
                        completing={completingId === fa.id}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {/* ── Completed ── */}
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
                        role="player"
                        index={i}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </CoachHelmShell>
      </div>

      {/* Single controlled log-progress drawer shared by every active card. */}
      <LogProgressDrawer state={logState} onClose={() => setLogState(null)} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The development overview instrument — ONE flat focal panel summarizing the
 * player's plan: a big mono Readout of areas in progress, a FLAT completion
 * Readout (share of all assigned areas finished — NO dial), and a micro
 * completed readout inset. Honest awaiting when no area has been completed yet —
 * never a fabricated 0% completion that reads as failure. The dense per-area
 * FocusAreaCard rows beneath this stay MATTE + legible.
 * ─────────────────────────────────────────────────────────────────────────── */
function DevelopmentOverviewInstrument({
  activeCount,
  completedCount,
}: {
  activeCount: number;
  completedCount: number;
}) {
  const total = activeCount + completedCount;
  // Share of all assigned areas the player has finished (a real 0..1 reading).
  const completionRate = total > 0 ? completedCount / total : 0;
  const anyCompleted = completedCount > 0;

  return (
    <InstrumentPanel
      depth="raised"
      tone="accent"
      padding="lg"
      header="Development progress"
      as="section"
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex flex-col gap-4">
          {/* The focal readout — active areas in flight right now. */}
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

          {/* The recessed completed sub-readout. */}
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

        {/* Plan complete — a FLAT readout (no dial). Share of all assigned areas
            finished; honest awaiting until the first completion lands. */}
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

export default FairwayMyDevelopment;

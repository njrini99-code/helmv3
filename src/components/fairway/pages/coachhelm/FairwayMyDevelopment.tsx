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
  FormField,
  Input,
  TextArea,
} from '@/components/fairway';
import { CoachHelmShell } from './CoachHelmShell';
import {
  FocusAreaCard,
  type FocusAreaCardData,
} from './FocusAreaCard';
import { GoalsSection, type GoalSuggestionView } from './GoalsSection';
import { CausalWhyPanel } from './CausalWhyPanel';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
import type { FairwayGoalCardData } from './FairwayGoalCard';
import { isMetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
// PRESERVED WRITE ACTIONS — imported UNCHANGED (the same actions
// LogProgressButton / MarkCompleteButton called). We re-skin the trigger UI
// only; the server round-trip + payload are byte-for-byte the legacy behavior.
import {
  updateFocusAreaProgress,
  completeFocusArea,
  reactivateFocusArea,
} from '@/app/golf/actions/development';
import { useToast } from '@/components/ui/sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';

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
  const [valueError, setValueError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sync the input default to the card's current value whenever a new card opens.
  const open = state != null;
  const currentValue = fa?.current_value ?? null;
  const targetValue = fa?.target_value ?? null;
  const targetMetric = fa?.target_metric ?? null;
  const metricLabel = targetMetric || 'Progress';

  // Largest plausible measurement for any tracked golf metric (scores, yards,
  // putts, percentages). Anything beyond this is a fat-finger, not a real value.
  const MAX_REASONABLE = 100_000;

  // Contextual hint near the field — anchors the player to where they are vs
  // their target so an out-of-place magnitude reads as obviously wrong.
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
    // Range guard — reject negatives + absurd magnitudes before the round-trip
    // so a fat-fingered -5 or 9999 never lands in current_value silently.
    if (parsed < 0) {
      setValueError('Value can’t be negative — enter 0 or higher.');
      return;
    }
    if (parsed > MAX_REASONABLE) {
      setValueError(`That looks too large — enter a value up to ${MAX_REASONABLE.toLocaleString()}.`);
      return;
    }
    setValueError(null);

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
      {/* Desktop center-mode: the Drawer primitive defaults to a full-width
          mobile bottom sheet; pass the documented sm:* centering utilities so it
          reads as a centered modal on desktop (premium-scrub responsive gate). */}
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
            <p className="mb-1.5 block font-fw-sans text-body-sm font-medium text-text-secondary">
              Current value
            </p>
            <div className="rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 font-fw-sans text-text-primary">
              {currentValue ?? '—'}
              {targetValue != null && (
                <span className="font-normal text-text-tertiary"> / {targetValue}</span>
              )}
              {targetMetric && (
                <span className="ml-2 font-fw-sans text-eyebrow text-text-tertiary">
                  {targetMetric}
                </span>
              )}
            </div>
          </div>

          <FormField
            label={`New value (${metricLabel})`}
            required
            error={valueError ?? undefined}
            help={valueHint}
          >
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
            <TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="How did it go? Any context for your coach…"
              rows={3}
            />
          </FormField>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={submitting}
            >
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

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayMyDevelopment({
  activeAreas,
  completedAreas,
  loadError = false,
  goals = [],
  suggestions = [],
  standingByMetric = {},
  causalRelationships = [],
}: FairwayMyDevelopmentProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [, startTransition] = useTransition();

  const [logState, setLogState] = useState<LogProgressState | null>(null);
  // Which focus area is mid-complete (optimistic busy flag for the card button).
  const [completingId, setCompletingId] = useState<string | null>(null);
  // Which completed area is mid-reopen (busy flag for the card "Reopen" button).
  const [reopeningId, setReopeningId] = useState<string | null>(null);

  const total = activeAreas.length + completedAreas.length;

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
            addToast({ type: 'error', title: result.error || 'Failed to reopen' });
            setReopeningId(null);
            return;
          }
          addToast({
            type: 'success',
            title: 'Reopened',
            description: focusArea.title || 'Focus area',
          });
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

  // Header "Message coach" is a SECONDARY helper alongside real content. When the
  // surface is genuinely empty the empty-state's own primary "Message coach" CTA
  // is the single obvious next action, so we drop the duplicate header affordance
  // to keep one primary action per screen (squint test / single-primary rule).
  const headerActions =
    total > 0 ? (
      <Button asChild variant="secondary" size="sm">
        <Link href="/golf/dashboard/messages">Message coach</Link>
      </Button>
    ) : undefined;

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
          {/* ── Error state — distinct from empty (mustFix: silent fall-through).
                When the focus-area select failed, show ONLY the error — Goals
                are a separate population but we don't want to imply the page
                loaded cleanly. ── */}
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
          ) : (
            <div className="flex flex-col gap-10">
              {/* ── Goals — the player-owned primitive, surfaced FIRST and
                    INDEPENDENT of the focus-area count. GoalsSection owns its own
                    0-goal / 0-suggestion honest-empty states internally. ── */}
              <GoalsSection
                // eslint-disable-next-line jsx-a11y/aria-role
                role="player"
                canCreate
                activeGoals={goals ?? []}
                suggestions={suggestions ?? []}
              />

              {/* ── Why your scores move — the causal-engine layer, surfaced from
                    the genuine golf_causal_relationships output. Independent of
                    focus areas + Goals (renders its own honest-empty state when
                    there aren't enough rounds to map drivers). ── */}
              <CausalWhyPanel relationships={causalRelationships} />

              {total === 0 ? (
                /* ── Genuinely-empty focus areas (Goals above still render) ── */
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
                <>
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
                        {activeAreas.map((fa, i) => {
                          // Forward the per-card standing ONLY when this focus area
                          // targets a canonical metric with a standing snapshot.
                          const m = fa.target_metric;
                          const st =
                            m && isMetricId(m) ? standingByMetric?.[m] : undefined;
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
                </>
              )}
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

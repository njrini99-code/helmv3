'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · development-parts — the player development pieces
 * ----------------------------------------------------------------------------
 * ONE home for the sub-components the player's development view is built
 * from, shared by the two hosts that render it:
 *   • `DevelopmentDrill` (components/golf/coachhelm/home) — the LIVE view at
 *     `/coachhelm?view=development`, which `/my-development` redirects to.
 *   • `FairwayMyDevelopment` (this folder) — the page-chrome variant kept for
 *     the fairway preview and the barrel.
 * Before this file each host carried its own verbatim copy of the log
 * progress drawer, the prescribed-area card and the overview instrument
 * (AUDIT.md Mobile: competing implementations); the copies had already
 * drifted (SourceChip on the prescribed card, toast wrappers).
 *
 * Exports:
 *   • LogProgressSheet          — the Log progress form as a Fairway Sheet
 *   • FocusAreaRow / FocusAreaSheet / useFocusAreaSheet / ActiveFocusAreaList
 *                               — the phone reading of the active areas
 *                                 (player-development.mobile.md #3)
 *   • ProposedAreaCard          — coach-prescribed, awaiting accept/decline
 *   • DevelopmentOverviewInstrument — "Development progress" (#1)
 *   • standingForArea           — the per-area standing lookup
 *
 * Every write action is imported UNCHANGED from development.ts.
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { fwHaptic } from '@/lib/fairway/haptics';
import { useMediaQuery } from '@/hooks/use-media-query';
// Leaf and sub-barrel imports only: this folder is re-exported from the top
// `@/components/fairway` barrel, and importing it back here is a cycle.
import { Button } from '@/components/fairway/controls';
import { Surface } from '@/components/fairway/surfaces';
import { InsetGroup } from '@/components/fairway/surfaces/inset-group';
import { StatMatrix, type StatMatrixItem } from '@/components/fairway/modules/StatMatrix';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { InstrumentPanel, Readout } from '@/components/fairway/instrument';
import { formatPercent } from '@/components/fairway/charts';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import { FormField, Input, TextArea } from '@/components/fairway/forms';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { ProgressTrack } from './ProgressTrack';
import {
  FocusAreaCard,
  SourceChip,
  focusAreaTrendSeries,
  type FocusAreaCardData,
} from './FocusAreaCard';
import {
  getAreaType,
  getProgressPercent,
  isLowerIsBetter,
  formatTargetMetricLabel,
} from './areaTypes';
import { isMetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { updateFocusAreaProgress } from '@/app/golf/actions/development';

/**
 * Phone focus-area Sheet: the full FocusAreaCard (Sparkline, StandingBars,
 * PracticeRx self-fetch, framer reveal) mounts only once the sheet has
 * SETTLED, so the open translate animates a light skeleton (owner perf rule:
 * no heavy trees in a sheet before settle). The Sheet reports the panel's
 * animation end; the timer is the fallback where no animation runs (reduced
 * motion, jsdom). Same pattern as FairwayEventDetailDrawer.
 */
const SETTLE_FALLBACK_MS = 360;
/** Close the focus-area sheet, then open Log progress once it has slid away. */
const AREA_SHEET_HANDOFF_MS = 320;
/** The standing snapshot for an area, ONLY when it targets a canonical metric. */
export function standingForArea(
  focusArea: FocusAreaCardData,
  standingByMetric: Record<string, PlayerStanding> | undefined,
): PlayerStanding | undefined {
  const m = focusArea.target_metric;
  return m && isMetricId(m) ? standingByMetric?.[m] : undefined;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Log-progress sheet — the SAME numeric-value + optional-note form the legacy
 * LogProgressButton rendered, calling the SAME updateFocusAreaProgress action.
 * Lifted here as a controlled Fairway Sheet (a bottom sheet below `md`, a
 * docked right panel above; it replaced the legacy vaul Drawer, AUDIT M3) so
 * a single instance serves every card and every phone row.
 * ────────────────────────────────────────────────────────────────────────── */

export interface LogProgressState {
  focusArea: FocusAreaCardData;
}

export function LogProgressSheet({
  state,
  onClose,
}: {
  state: LogProgressState | null;
  onClose: () => void;
}) {
  const router = useRouter();
  // Desktop-only autofocus for the measurement field: on touch, focusing it
  // as the sheet opens summons the iOS keyboard over the form (owner
  // TestFlight report, 2026-08-26). The keyboard waits for a tap.
  const finePointer = useMediaQuery('(pointer: fine)');
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
  // Human display label — NEVER the raw snake_case metric identifier
  // (mustFix #202/#60: raw DB key leaking into player-facing copy).
  const metricLabel = formatTargetMetricLabel(targetMetric) || 'Progress';

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
      setValueError('Value can’t be negative. Enter 0 or higher.');
      return;
    }
    if (parsed > MAX_REASONABLE) {
      setValueError(`That looks too large. Enter a value up to ${MAX_REASONABLE.toLocaleString('en-US')}.`);
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
        fairwayToast.danger(result.error || 'Failed to log progress');
        setSubmitting(false);
        return;
      }
      fairwayToast.success('Progress updated');
      onClose();
      router.refresh();
      setTimeout(reset, 200);
    } catch {
      fairwayToast.danger('Failed to log progress');
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
      side="right"
      mobileSide="bottom"
      title="Log progress"
      description={fa?.title || 'Focus area'}
      dismissible={!submitting}
    >
      {/* The form wraps Body + Footer so Enter submits from either field and
          the footer stays pinned while the body scrolls. */}
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <Sheet.Body className="flex flex-col gap-5">
          <div>
            <p className="mb-1.5 block font-fw-sans text-body-sm font-medium text-text-secondary">
              Current value
            </p>
            <div className="rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 font-fw-sans text-text-primary">
              {currentValue ?? '—'}
              {targetValue != null && (
                <span className="font-normal text-text-tertiary"> / {targetValue}</span>
              )}
              {metricLabel && metricLabel !== 'Progress' && (
                <span className="ml-2 font-fw-sans text-eyebrow text-text-tertiary">
                  {metricLabel}
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
              autoFocus={finePointer}
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

        </Sheet.Body>
        <Sheet.Footer>
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
        </Sheet.Footer>
      </form>
    </Sheet>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * FocusAreaRow — the phone reading of one ACTIVE focus area: a seam row with
 * the area icon, the title, one metric line ("Putts Made 3-5 ft · now 46.5 ·
 * target 68.5 · 40% there"), a slim ProgressTrack when a bar is honest (same
 * getProgressPercent rule as the card's meter, so the two never disagree) and
 * the REAL per-area Sparkline at the right when the merged history has two
 * or more points (same series as the card; nothing drawn when it is thin).
 * One visible affordance: the row itself, which opens the full card in a
 * Sheet. No target → "No target set yet", no bar.
 * ─────────────────────────────────────────────────────────────────────────── */
export function FocusAreaRow({
  focusArea,
  onOpen,
}: {
  focusArea: FocusAreaCardData;
  onOpen: () => void;
}) {
  const area = getAreaType(focusArea.area_type);
  const AreaIcon = area.icon;
  const hasTarget = focusArea.target_value != null && focusArea.target_value > 0;
  const metricLabel = formatTargetMetricLabel(focusArea.target_metric) || 'Progress';
  const pct = hasTarget
    ? getProgressPercent(
        focusArea.current_value ?? null,
        focusArea.target_value!,
        focusArea.target_metric,
        focusArea.baseline_value ?? null,
      )
    : null;
  const meta = hasTarget
    ? [
        metricLabel,
        `now ${focusArea.current_value ?? 0}`,
        `target ${focusArea.target_value}`,
        pct != null && pct > 0 ? `${pct}% there` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'No target set yet';
  const series = focusAreaTrendSeries(focusArea);
  const hasTrend = series.length >= 2;
  const title = focusArea.title || 'Untitled';

  return (
    <InsetGroup.Row
      as="button"
      align="start"
      icon={<AreaIcon size={18} />}
      trailing={<ChevronRight aria-hidden />}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      {/* The sparkline sits inside the row's content column (not `trailing`,
          whose svg sizing is the 16px glyph recipe). */}
      <span className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
            {title}
          </span>
          <span className="block truncate font-fw-sans text-caption text-text-tertiary">{meta}</span>
          {pct != null ? (
            <ProgressTrack
              pct={pct}
              size="sm"
              tone={pct >= 100 ? 'done' : 'active'}
              label={`${metricLabel}: ${pct}% toward target`}
              className="mt-2"
            />
          ) : null}
        </span>
        {hasTrend ? (
          <Sparkline
            data={series}
            goodDirection={isLowerIsBetter(focusArea.target_metric) ? 'down' : 'up'}
            width={56}
            height={18}
            label={`Progress trend for ${title}`}
            className="mt-0.5 shrink-0"
          />
        ) : null}
      </span>
    </InsetGroup.Row>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * useFocusAreaSheet / FocusAreaSheet — the phone focus-area Sheet
 * ----------------------------------------------------------------------------
 * `openId` drives the open state; `heldId` keeps the last opened area so the
 * card stays rendered through the close animation instead of swapping to the
 * skeleton mid-slide. The card mounts once the sheet has settled; the Sheet's
 * own X sits in the body's top padding, clear of the card's status pill. Log
 * progress hands off to the log sheet after this one has slid away (one
 * overlay at a time); Mark complete closes it and runs the host's handler
 * (toast with Undo), the same one the desktop card calls.
 * ─────────────────────────────────────────────────────────────────────────── */

export function useFocusAreaSheet(activeAreas: FocusAreaCardData[]) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [heldId, setHeldId] = useState<string | null>(null);
  const openArea = useCallback((id: string) => {
    fwHaptic('selection');
    setHeldId(id);
    setOpenId(id);
  }, []);
  const close = useCallback(() => setOpenId(null), []);
  const area = heldId ? activeAreas.find((fa) => fa.id === heldId) ?? null : null;
  return { area, open: openId != null, openArea, close };
}

export function FocusAreaSheet({
  area,
  open,
  onClose,
  onLogProgress,
  onComplete,
  completing,
  standing,
}: {
  area: FocusAreaCardData | null;
  open: boolean;
  onClose: () => void;
  onLogProgress: (focusArea: FocusAreaCardData) => void;
  onComplete: (focusArea: FocusAreaCardData) => void;
  completing: boolean;
  standing?: PlayerStanding;
}) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!open) {
      setSettled(false);
      return;
    }
    const id = window.setTimeout(() => setSettled(true), SETTLE_FALLBACK_MS);
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
      title={area?.title || 'Focus area'}
      hideTitle
      onAnimationEnd={onAnimationEnd}
    >
      <Sheet.Body className="px-0 pt-6">
        {area && settled ? (
          <FocusAreaCard
            frame="bare"
            focusArea={area}
            // eslint-disable-next-line jsx-a11y/aria-role
            role="player"
            index={0}
            onLogProgress={(fa) => {
              onClose();
              window.setTimeout(() => onLogProgress(fa), AREA_SHEET_HANDOFF_MS);
            }}
            onComplete={(fa) => {
              onClose();
              onComplete(fa);
            }}
            completing={completing}
            standing={standing}
          />
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

/* ────────────────────────────────────────────────────────────────────────────
 * ActiveFocusAreaList — the active areas at both widths, CSS-gated so the
 * first paint never flips: below `md` ONE matte group of FocusAreaRows (a tap
 * opens the FocusAreaSheet); from `md` the full cards, unchanged.
 * ─────────────────────────────────────────────────────────────────────────── */

export function ActiveFocusAreaList({
  areas,
  standingByMetric,
  onOpen,
  onLogProgress,
  onComplete,
  completingId,
}: {
  areas: FocusAreaCardData[];
  standingByMetric: Record<string, PlayerStanding> | undefined;
  onOpen: (id: string) => void;
  onLogProgress: (focusArea: FocusAreaCardData) => void;
  onComplete: (focusArea: FocusAreaCardData) => void;
  completingId: string | null;
}) {
  return (
    <>
      <InsetGroup variant="matte" className="md:hidden" aria-label="Active focus areas">
        {areas.map((fa) => (
          <FocusAreaRow key={fa.id} focusArea={fa} onOpen={() => onOpen(fa.id)} />
        ))}
      </InsetGroup>
      <div className="hidden flex-col gap-4 md:flex">
        {areas.map((fa, i) => (
          <FocusAreaCard
            key={fa.id}
            focusArea={fa}
            // eslint-disable-next-line jsx-a11y/aria-role
            role="player"
            index={i}
            onLogProgress={onLogProgress}
            onComplete={onComplete}
            completing={completingId === fa.id}
            standing={standingForArea(fa, standingByMetric)}
          />
        ))}
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * ProposedAreaCard — a coach-prescribed focus area awaiting the player's call.
 * A compact matte card showing the target + an Accept / Decline pair. Kept
 * separate from FocusAreaCard (which models active/completed lifecycles) so the
 * accept/decline affordance stays unambiguous. Carries the SourceChip (#1290):
 * the moment a player decides whether to accept is exactly when they need the
 * evidence of WHY the coach flagged it.
 * ─────────────────────────────────────────────────────────────────────────── */
export function ProposedAreaCard({
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
        <Button variant="primary" busy={deciding} onClick={onAccept}>
          Accept
        </Button>
      </div>
    </Surface>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The development overview instrument — a calm BASE-density summary panel of
 * the player's plan: a big mono Readout of areas in progress, a FLAT completion
 * Readout (share of all assigned areas finished — NO dial), and a micro
 * completed readout inset. Honest awaiting when no area has been completed yet —
 * never a fabricated 0% completion that reads as failure. Deliberately base
 * depth / neutral tone (NOT raised/accent) so GoalHero (GoalsSection, above)
 * stays the page's ONE accent focal point — this panel summarizes, it doesn't
 * compete for the hero read. The dense per-area FocusAreaCard rows beneath this
 * stay MATTE + legible.
 * ─────────────────────────────────────────────────────────────────────────── */
export function DevelopmentOverviewInstrument({
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

  // Phone: the same four honest readings as ONE StatMatrix (2×2 below `sm`),
  // instead of a panel of three stacked readout blocks
  // (player-development.mobile.md #1). Muted, never alarming, until a first
  // completion lands.
  const phoneItems: StatMatrixItem[] = [
    {
      label: 'Active',
      value: activeCount,
      tone: activeCount > 0 ? 'accent' : 'muted',
      hint: activeCount === 1 ? 'area' : 'areas',
    },
    {
      label: 'Completed',
      value: completedCount,
      tone: anyCompleted ? 'neutral' : 'muted',
      hint: completedCount === 1 ? 'area' : 'areas',
    },
    { label: 'All areas', value: total, hint: 'in your plan' },
    {
      label: 'Plan complete',
      value: anyCompleted ? formatPercent(completionRate, 0) : '0%',
      tone: anyCompleted ? 'accent' : 'muted',
      hint: anyCompleted ? `${completedCount} of ${total} done` : 'nothing finished yet',
    },
  ];

  return (
    <>
    <StatMatrix
      variant="matte"
      columns={4}
      items={phoneItems}
      className="md:hidden"
      aria-label="Development progress"
    />
    <InstrumentPanel
      padding="lg"
      header="Development progress"
      as="section"
      className="hidden md:block"
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
    </>
  );
}

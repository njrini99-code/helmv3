'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · development-parts — the player development pieces
 * ----------------------------------------------------------------------------
 * ONE home for the sub-components the player's development view
 * (`FairwayMyDevelopment`, both hosts: the live stage view at
 * `/coachhelm?view=development` and the page-chrome preview) is built from.
 * Before this file the legacy `DevelopmentDrill` carried its own verbatim
 * copies of the log progress drawer, the prescribed-area card and the
 * overview instrument, and they had drifted (AUDIT M10); the drill is gone.
 *
 * Exports:
 *   • LogProgressSheet          — the Log progress form as a Fairway Sheet
 *   • FocusAreaRow / FocusAreaSheet / useFocusAreaSheet / ActiveFocusAreaList
 *                               — the phone reading of the active areas
 *                                 (player-development.mobile.md #3)
 *   • ProposedAreaCard          — coach-prescribed, awaiting accept/decline
 *   • pickLeadArea / LeadAreaStage — "Your next stroke", the v2 stage
 *                                 (player-development.v2.md)
 *   • ladderOrder               — the active areas sorted by progress
 *   • PlanSegmentBar            — Active · Completed · Proposed as ONE bar
 *                                 (replaced DevelopmentOverviewInstrument)
 *   • standingForArea           — the per-area standing lookup
 *
 * Every write action is imported UNCHANGED from development.ts.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { fwHaptic } from '@/lib/fairway/haptics';
import { useMediaQuery } from '@/hooks/use-media-query';
// Leaf and sub-barrel imports only: this folder is re-exported from the top
// `@/components/fairway` barrel, and importing it back here is a cycle.
import { Button } from '@/components/fairway/controls';
import { Eyebrow } from '@/components/fairway/controls/eyebrow';
import { fwFocusRing, fwTransition } from '@/components/fairway/controls/_internal';
import { Surface } from '@/components/fairway/surfaces';
import { InsetGroup } from '@/components/fairway/surfaces/inset-group';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Readout } from '@/components/fairway/instrument';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import { Ribbon, type RibbonPoint } from '@/components/fairway/charts/Ribbon';
import { SegmentBar, type SegmentBarPart } from '@/components/fairway/charts/SegmentBar';
import { StandingBars } from '@/components/fairway/charts/StandingBars';
import { FormField, Input, TextArea } from '@/components/fairway/forms';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { ProgressTrack } from './ProgressTrack';
import { formatDay } from './format-day';
import {
  FocusAreaCard,
  SourceChip,
  focusAreaTrendEntries,
  focusAreaTrendSeries,
  formatTimeframe,
  type FocusAreaCardData,
} from './FocusAreaCard';
import {
  getAreaType,
  getProgressPercent,
  isLowerIsBetter,
  formatTargetMetricLabel,
} from './areaTypes';
import { isMetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { formatValue } from '@/components/golf/coachhelm/v3/StandingBar';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
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
    ? [metricLabel, `now ${focusArea.current_value ?? 0}`, `target ${focusArea.target_value}`].join(' · ')
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
      {/* Ladder layout (player-development.v2.md #2): the title line carries
          the sparkline; the rail is its own full-width line with a fixed
          width pct label, so every row's rail starts and ends at the same x
          and the eye reads one ladder instead of five separate bars. The
          sparkline sits inside the content column (not `trailing`, whose
          svg sizing is the 16px glyph recipe). */}
      <span className="flex flex-col gap-1.5">
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
              {title}
            </span>
            <span className="block truncate font-fw-sans text-caption text-text-tertiary">{meta}</span>
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
        {pct != null ? (
          <span className="flex items-center gap-3">
            <ProgressTrack
              pct={pct}
              size="sm"
              tone={pct >= 100 ? 'done' : 'active'}
              label={`${metricLabel}: ${pct}% toward target`}
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
 * Progress helpers shared by the stage, the ladder and the lead-area pick.
 * `areaProgress` is the row's and the card's own meter math
 * (getProgressPercent), never a second derivation.
 * ─────────────────────────────────────────────────────────────────────────── */

function areaProgress(fa: FocusAreaCardData): number | null {
  if (fa.target_value == null || fa.target_value <= 0) return null;
  return getProgressPercent(
    fa.current_value ?? null,
    fa.target_value,
    fa.target_metric,
    fa.baseline_value ?? null,
  );
}

/**
 * The ladder order: least progressed first (the area that needs the most
 * work reads at the top), areas with no honest bar last, ties by title so
 * the order is stable between renders.
 */
export function ladderOrder(areas: readonly FocusAreaCardData[]): FocusAreaCardData[] {
  return [...areas]
    .map((fa, i) => ({ fa, i, pct: areaProgress(fa) }))
    .sort((a, b) => {
      const ap = a.pct ?? Number.POSITIVE_INFINITY;
      const bp = b.pct ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      const at = a.fa.title ?? '';
      const bt = b.fa.title ?? '';
      if (at !== bt) return at.localeCompare(bt);
      return a.i - b.i;
    })
    .map((r) => r.fa);
}

/* ────────────────────────────────────────────────────────────────────────────
 * ActiveFocusAreaList — the active areas at both widths, CSS-gated so the
 * first paint never flips: below `md` ONE matte group of FocusAreaRows (a tap
 * opens the FocusAreaSheet); from `md` the full cards. Both read in ladder
 * order (least progressed first) so the phone and the desktop agree.
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
  const ordered = useMemo(() => ladderOrder(areas), [areas]);
  return (
    <>
      <InsetGroup variant="matte" className="md:hidden" aria-label="Active focus areas">
        {ordered.map((fa) => (
          <FocusAreaRow key={fa.id} focusArea={fa} onOpen={() => onOpen(fa.id)} />
        ))}
      </InsetGroup>
      <div className="hidden flex-col gap-4 md:flex">
        {ordered.map((fa, i) => (
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
 * PlanSegmentBar — the plan's shape as ONE bar: Active · Completed · Proposed
 * (counts), Completed as the called-out primary readout, "3 of 6 areas
 * complete" as the takeaway. Replaced DevelopmentOverviewInstrument (a 2×2
 * StatMatrix below `md` plus a three-readout panel above it: four numbers
 * for one fact). Hidden below two areas: one area is not a shape.
 * ─────────────────────────────────────────────────────────────────────────── */
export function PlanSegmentBar({
  active,
  completed,
  proposed = 0,
  className,
}: {
  active: number;
  completed: number;
  proposed?: number;
  className?: string;
}) {
  const total = active + completed + proposed;
  if (total < 2) return null;
  const parts: SegmentBarPart[] = [
    { label: 'Active', value: active, tone: 'neutral' },
    { label: 'Completed', value: completed, tone: 'good' },
  ];
  // Proposed areas wait on the player's call: amber, and only when any exist.
  if (proposed > 0) parts.push({ label: 'Proposed', value: proposed, tone: 'caution' });
  return (
    <SegmentBar
      title="Your plan"
      parts={parts}
      primary="good"
      takeaway={`${completed} of ${total} ${total === 1 ? 'area' : 'areas'} complete`}
      className={className}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * pickLeadArea — the ONE area the stage shows (player-development.v2.md)
 * ----------------------------------------------------------------------------
 * The active area whose target metric has the highest intervention potential
 * among the causal rows where that metric is the CAUSE (the engine's own
 * "you can change this" reading), falling back to the least progressed area,
 * then the oldest, then the id so the pick is stable. Pure: the coach persona
 * can run the same rule per player, and the stage never stores its subject.
 * ─────────────────────────────────────────────────────────────────────────── */

function interventionScore(
  fa: FocusAreaCardData,
  rels: readonly CausalRelationshipRow[],
): number | null {
  const metric = fa.target_metric;
  if (!metric) return null;
  let best: number | null = null;
  for (const rel of rels) {
    if (rel.cause_metric !== metric && rel.cause !== metric) continue;
    const v = rel.intervention_potential;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (best == null || v > best) best = v;
  }
  return best;
}

export function pickLeadArea(
  activeAreas: readonly FocusAreaCardData[],
  causalRelationships: readonly CausalRelationshipRow[] = [],
): FocusAreaCardData | null {
  if (activeAreas.length === 0) return null;
  const ranked = activeAreas.map((fa) => {
    const started = fa.started_at ? Date.parse(fa.started_at) : Number.NaN;
    return {
      fa,
      score: interventionScore(fa, causalRelationships),
      pct: areaProgress(fa),
      started: Number.isFinite(started) ? started : Number.POSITIVE_INFINITY,
    };
  });
  ranked.sort((a, b) => {
    const as = a.score ?? Number.NEGATIVE_INFINITY;
    const bs = b.score ?? Number.NEGATIVE_INFINITY;
    if (as !== bs) return bs - as;
    const ap = a.pct ?? Number.POSITIVE_INFINITY;
    const bp = b.pct ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    if (a.started !== b.started) return a.started - b.started;
    return a.fa.id.localeCompare(b.fa.id);
  });
  return ranked[0]?.fa ?? null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * LeadAreaStage — "Your next stroke"
 * ----------------------------------------------------------------------------
 * The lead area's current value in its metric unit with the change since the
 * baseline, a verdict sentence, the progress rail from baseline (empty) to
 * target (full), the trend as a Ribbon with the target dashed and the last
 * reading marked, and the You · Team · Tour standing when one resolves.
 *
 * The readout block is the press target (44px+, opens the same FocusAreaSheet
 * the rows open; Log progress and Mark complete live there). The Ribbon is
 * the section's one bezel, outside the button: it carries its own table
 * toggle, and a chart panel inside a panel would be a card in a card.
 * Fewer than two readings: the rail only and the honest line, never a flat
 * ribbon. No standing: nothing rendered, no height reserved.
 * ─────────────────────────────────────────────────────────────────────────── */

/** A value in the metric's own unit (the v3 registry), else a trimmed number. */
export function formatAreaValue(value: number, targetMetric: string | null | undefined): string {
  const cfg = targetMetric ? getMetricRenderConfig(targetMetric) : null;
  if (cfg) return formatValue(value, cfg.unit);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The stage's verdict, player voice. "No reading" until the player has
 * moved off the baseline or logged a second point; then the change since
 * the start and how far along the rail that is.
 */
export function leadAreaVerdict(area: FocusAreaCardData): string {
  const cur = area.current_value ?? null;
  const base = area.baseline_value ?? null;
  const readings = focusAreaTrendEntries(area).length;
  const delta = cur != null && base != null ? cur - base : null;
  const hasReading = readings >= 2 || (delta != null && delta !== 0);
  if (cur == null || delta == null || !hasReading) {
    return 'No reading since you started; log progress or play a round.';
  }
  const metric = area.target_metric;
  const pct = areaProgress(area);
  const along = pct != null && pct < 100 ? `, ${pct}% of the way` : '';
  if (pct != null && pct >= 100) {
    return delta === 0
      ? 'Target reached.'
      : `Target reached, ${delta > 0 ? 'up' : 'down'} ${formatAreaValue(Math.abs(delta), metric)} since you started.`;
  }
  if (delta === 0) return `Holding at ${formatAreaValue(cur, metric)} since you started${along}.`;
  return `${delta > 0 ? 'Up' : 'Down'} ${formatAreaValue(Math.abs(delta), metric)} since you started${along}.`;
}

export function LeadAreaStage({
  area,
  standing,
  onOpen,
  className,
}: {
  area: FocusAreaCardData;
  standing?: PlayerStanding;
  onOpen: () => void;
  className?: string;
}) {
  const metric = area.target_metric ?? null;
  const cfg = metric ? getMetricRenderConfig(metric) : null;
  const metricLabel = formatTargetMetricLabel(metric) || 'Progress';
  const title = area.title || getAreaType(area.area_type).label;
  const cur = area.current_value ?? null;
  const base = area.baseline_value ?? null;
  const target = area.target_value ?? null;
  const entries = focusAreaTrendEntries(area);
  const pct = areaProgress(area);
  const lowerBetter = isLowerIsBetter(metric);
  const delta = cur != null && base != null ? cur - base : null;
  const hasReading = entries.length >= 2 || (delta != null && delta !== 0);
  const fmt = (v: number) => formatAreaValue(v, metric);
  const timeframe = formatTimeframe(area);
  const targetLine =
    target != null ? `target ${fmt(target)}${timeframe ? ` ${timeframe}` : ''}` : 'No target set yet';
  const subline = metricLabel !== title && metric ? `${metricLabel} · ${targetLine}` : targetLine;
  const points: RibbonPoint[] = entries.map((e) => ({ x: formatDay(e.day), y: e.value }));
  const last = entries[entries.length - 1];
  const showStanding = standing != null && cfg != null;

  return (
    <section aria-label="Your next stroke" className={cn('flex flex-col gap-4', className)}>
      <Eyebrow>Your next stroke</Eyebrow>
      {/* A raw button on purpose: the press target is a block of Readout,
          verdict and rail, which the Button primitive's inline label span
          cannot host. Same recipe as InsetGroup.Row's `as="button"`. */}
      {/* eslint-disable-next-line helm/no-raw-button */}
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className={cn(
          'group flex min-h-11 w-full flex-col gap-4 rounded-fw-md text-left',
          fwTransition,
          fwFocusRing,
          '[@media(hover:hover)]:hover:bg-surface-tint active:bg-surface-tint',
          '-mx-2 w-[calc(100%+1rem)] px-2 py-1',
        )}
      >
        <span className="flex w-full items-start justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-1">
            <Readout
              size="lg"
              value={cur ?? undefined}
              display={cur != null ? fmt(cur) : undefined}
              label={title}
              state={cur == null ? 'awaiting' : 'live'}
              samples={cur == null ? { have: 0, need: 1 } : undefined}
              awaitingLabel="No value yet"
              delta={
                delta != null && hasReading
                  ? {
                      value: delta,
                      direction:
                        delta === 0 ? 'flat' : (delta > 0) !== lowerBetter ? 'up' : 'down',
                      format: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`,
                      caption: 'since start',
                    }
                  : undefined
              }
            />
            <span className="font-fw-sans text-caption text-text-tertiary">{subline}</span>
          </span>
          <ChevronRight
            aria-hidden
            className="mt-1 h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5"
          />
        </span>
        <span className="font-fw-sans text-body-sm text-text-secondary">{leadAreaVerdict(area)}</span>
        {pct != null && cur != null && target != null ? (
          <span className="flex w-full flex-col gap-1.5">
            <ProgressTrack
              pct={pct}
              size="md"
              tone={pct >= 100 ? 'done' : 'active'}
              label={`${metricLabel}: ${pct}% toward target`}
            />
            <span className="flex justify-between font-fw-mono text-caption tabular-nums text-text-tertiary">
              <span>{fmt(cur)} now</span>
              <span>{fmt(target)} target</span>
            </span>
          </span>
        ) : null}
      </button>

      {points.length >= 2 && last ? (
        <Ribbon
          title={null}
          seriesName={metricLabel}
          data={points}
          benchmark={target != null ? { value: target, label: `Target ${fmt(target)}` } : undefined}
          valueFormatter={fmt}
          goodDirection={lowerBetter ? 'down' : 'up'}
          minPoints={2}
          markLast
          height={160}
          readoutPlacement="below"
          readoutLabels={(first) => ({
            value: `Last: ${fmt(last.value)} · ${formatDay(last.day)}`,
            delta: `vs ${String(first.x)}`,
          })}
        />
      ) : null}

      {showStanding ? (
        <StandingBars
          frame="bare"
          size="sm"
          layout="compact"
          viewer_context="self"
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
      ) : null}
    </section>
  );
}

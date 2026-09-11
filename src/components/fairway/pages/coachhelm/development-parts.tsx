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

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { fwHaptic } from '@/lib/fairway/haptics';
import { useMediaQuery } from '@/hooks/use-media-query';
// Leaf and sub-barrel imports only: this folder is re-exported from the top
// `@/components/fairway` barrel, and importing it back here is a cycle.
import { Button } from '@/components/fairway/controls';
import { fwFocusRing, fwTransition } from '@/components/fairway/controls/_internal';
import { Surface } from '@/components/fairway/surfaces';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { FormField, Input, TextArea } from '@/components/fairway/forms';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { formatDay } from './format-day';
import {
  FocusAreaCard,
  SourceChip,
  formatTimeframe,
  type FocusAreaCardData,
} from './FocusAreaCard';
import {
  getAreaType,
  getProgressPercent,
  formatTargetMetricLabel,
} from './areaTypes';
import { isMetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { formatValue } from '@/components/golf/coachhelm/v3/StandingBar';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
import { updateFocusAreaProgress } from '@/app/golf/actions/development';
import { acceptGoalSuggestion, dismissGoalSuggestion } from '@/app/golf/actions/v3/goals';
import type { GoalSuggestionView } from './GoalsSection';
import {
  fieldRowState,
  rowReadout,
  rowTrend,
  type ReadingLogRow,
  type VerdictPart,
} from './development-logic';
import type { FocusFieldRow } from './focus-field';

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
export function SectionHead({
  children,
  action,
  id,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-fw-display text-h3 font-semibold text-text-primary">
          {children}
        </h2>
        {action}
      </div>
      <div className="h-px w-full bg-accent-300" aria-hidden="true" />
    </div>
  );
}

/**
 * The masthead verdict: one honest sentence assembled from clauses, with the
 * names and numbers as links. No eyebrow and no title, because DrillPanel
 * already prints "Development" one line above on the live host and
 * `CoachHelmShell` prints its own heading on the preview host; a second title
 * would be duplication, not anatomy.
 */
export function DevelopmentVerdict({
  parts,
  facts,
}: {
  parts: readonly VerdictPart[];
  facts?: React.ReactNode;
}) {
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-[64ch] font-fw-display text-h3 font-normal leading-snug text-text-primary">
        {parts.map((part, i) => (
          <span key={`${part.text}-${i}`}>
            {i > 0 ? ' ' : null}
            {part.href ? (
              <Link
                href={part.href}
                className="text-text-primary underline decoration-accent-300 decoration-[1.5px] underline-offset-[5px] hover:decoration-accent-500"
              >
                {part.text}
              </Link>
            ) : (
              part.text
            )}
          </span>
        ))}
      </p>
      {facts ? (
        <p className="font-fw-sans text-caption text-text-tertiary">{facts}</p>
      ) : null}
    </div>
  );
}

/**
 * The stage's frame, decided by host.
 *
 * DO NOT "restore" a border on the stage host. Under `host="stage"` DrillPanel
 * is already this page's one Surface (`modules/DrillPanel.tsx:28-53`: rounded,
 * bordered, shadowed), so a Surface here would be a nested card, the first ban
 * on LANGUAGE.md's list. Under `host="page"` nothing else on the route is a
 * Surface, so the stage takes one.
 */
export function StageFrame({
  host,
  children,
}: {
  host: 'stage' | 'page';
  children: React.ReactNode;
}) {
  if (host === 'stage') return <div data-slot="development-stage">{children}</div>;
  return (
    <Surface padding="lg" data-slot="development-stage">
      {children}
    </Surface>
  );
}

/**
 * Build the instrument's rows. Presentation-adjacent (it formats values and
 * resolves metric labels) but derives nothing: every judgement comes from
 * `development-logic.ts`, so the row and the table below it cannot disagree.
 */
export function focusFieldRows(
  areas: readonly FocusAreaCardData[],
  onHref?: (id: string) => string,
): FocusFieldRow[] {
  return ladderOrder(areas).map((fa) => {
    const state = fieldRowState(fa);
    const trend = rowTrend(fa);
    const current =
      typeof fa.current_value === 'number' && Number.isFinite(fa.current_value)
        ? fa.current_value
        : null;
    return {
      id: fa.id,
      title: fa.title || 'Untitled area',
      metricLabel: formatTargetMetricLabel(fa.target_metric) || 'Progress',
      href: onHref?.(fa.id),
      state,
      readout: rowReadout(state),
      currentDisplay: current === null ? null : formatAreaValue(current, fa.target_metric),
      trend: trend
        ? {
            direction: trend.direction,
            magnitude: formatAreaValue(trend.delta, fa.target_metric),
          }
        : null,
    };
  });
}

/**
 * The ledger row: bare columns divided by vertical hairlines, never equal
 * cards. Only non-empty columns are passed in, and the grid takes the shape of
 * however many arrive, so a player with no goals does not get an empty third.
 *
 * The split is fractional (5/4/3, 7/5), so a narrow width costs every column
 * proportionally instead of starving one. Per the amended breakpoint rule the
 * split point is whatever width still holds every column's content whole; it
 * is verified in the captures, not chosen by breakpoint name.
 */
const LEDGER_SPANS: Record<number, string[]> = {
  1: ['md:col-span-12'],
  2: ['md:col-span-7', 'md:col-span-5'],
  3: ['md:col-span-5', 'md:col-span-4', 'md:col-span-3'],
};

export function LedgerRow({ columns }: { columns: readonly React.ReactNode[] }) {
  const present = columns.filter(Boolean);
  if (present.length === 0) return null;
  const spans = LEDGER_SPANS[present.length] ?? LEDGER_SPANS[3]!;
  return (
    <div
      data-slot="development-ledger"
      className="grid grid-cols-1 divide-y divide-border-subtle md:grid-cols-12 md:divide-x md:divide-y-0"
    >
      {present.map((column, i) => (
        <div
          key={i}
          className={cn(
            'flex min-w-0 flex-col gap-3 py-5 md:py-0',
            spans[i],
            // The hairlines are the division; the padding keeps content off
            // them. First column has no left rule, so it needs no left pad.
            i > 0 ? 'md:pl-6' : '',
            i < present.length - 1 ? 'md:pr-6' : '',
          )}
        >
          {column}
        </div>
      ))}
    </div>
  );
}

/** One hairline row inside a ledger column. */
export function LedgerRowItem({
  title,
  meta,
  trailing,
  href,
  onClick,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
          {title}
        </span>
        {meta ? (
          <span className="truncate font-fw-sans text-caption text-text-tertiary">{meta}</span>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );
  const shell =
    'flex min-h-11 w-full items-center justify-between gap-3 border-b border-border-subtle py-2 text-left last:border-b-0';
  if (href) {
    return (
      <Link href={href} className={cn(shell, fwTransition, 'hover:text-accent-700')}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      // The hairline ROW is the tap target. <Button> brings its own
      // min-height, padding and hover fill, which would turn a ledger row
      // back into the tile this page bans.
      // eslint-disable-next-line helm/no-raw-button -- see above
      <button type="button" onClick={onClick} className={cn(shell, fwFocusRing, fwTransition)}>
        {body}
      </button>
    );
  }
  return <div className={shell}>{body}</div>;
}

/**
 * The Why column: the strongest causal relationships, one short row each.
 *
 * `dose_response` is a plain text tag, NEVER accent ink: on this page green
 * means improving or under par, and "more of it helps more" is a property of
 * the relationship, not a performance signal. Colouring it green would spend
 * the page's one meaningful hue on a taxonomy label.
 */
export function WhyRows({
  relationships,
  limit = 4,
}: {
  relationships: readonly CausalRelationshipRow[];
  limit?: number;
}) {
  const rows = useMemo(
    () =>
      [...relationships]
        .sort((a, b) => b.strength * b.confidence - a.strength * a.confidence)
        .slice(0, limit),
    [relationships, limit],
  );
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col">
      {rows.map((rel) => (
        <div
          key={rel.id}
          className="flex flex-col gap-1 border-b border-border-subtle py-2.5 last:border-b-0"
        >
          <span className="font-fw-sans text-body-sm font-medium text-text-primary">
            {rel.cause} tracks with {rel.effect}
            {rel.dose_response ? (
              <span className="ml-2 font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
                dose response
              </span>
            ) : null}
          </span>
          {rel.mechanism ? (
            <span className="line-clamp-2 font-fw-sans text-caption text-text-tertiary">
              {rel.mechanism}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ── The readings log ───────────────────────────────────────────────────── */

const TH =
  'py-2 text-left font-fw-sans text-eyebrow font-normal uppercase tracking-[0.07em] text-text-tertiary';
const TD = 'py-2.5 align-top font-fw-sans text-body-sm text-text-primary';
const NUM = 'text-right font-fw-mono tabular-nums';

const LOG_PAGE = 10;

/**
 * The dated evidence behind the stage: one row is one reading a player logged,
 * newest first, across active and completed areas. The stage plots; this is
 * the rows it plotted, which is also why the marks on the stage are not links
 * — every reading is reachable, dated and described here.
 */
export function ReadingsLogTable({
  rows,
  onOpenArea,
  onViewAll,
}: {
  rows: readonly ReadingLogRow[];
  onOpenArea: (areaId: string) => void;
  onViewAll?: () => void;
}) {
  const shown = rows.slice(0, LOG_PAGE);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">Every logged reading, newest first</caption>
          <thead>
            <tr className="border-b border-border-strong">
              <th scope="col" className={TH}>
                Date
              </th>
              <th scope="col" className={TH}>
                Area
              </th>
              <th scope="col" className={cn(TH, 'text-right')}>
                Value
              </th>
              <th scope="col" className={cn(TH, 'hidden text-right md:table-cell')}>
                Change
              </th>
              <th scope="col" className={cn(TH, 'hidden md:table-cell')}>
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.key} className="border-b border-border-subtle">
                <td className={cn(TD, 'whitespace-nowrap font-fw-mono tabular-nums text-text-secondary')}>
                  {formatDay(row.day)}
                </td>
                <td className={TD}>
                  {/* eslint-disable-next-line helm/no-raw-button -- one table
                      row is one link (LANGUAGE.md); this one opens a Sheet
                      rather than navigating, so it cannot be a <Link>, and
                      <Button>'s chrome would break the row rhythm. */}
                  <button
                    type="button"
                    onClick={() => onOpenArea(row.areaId)}
                    className={cn(
                      'flex min-h-11 items-center text-left font-medium hover:text-accent-700',
                      fwFocusRing,
                      fwTransition,
                    )}
                  >
                    <span className="truncate">{row.areaTitle}</span>
                    {row.completed ? (
                      <span className="ml-2 shrink-0 font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
                        done
                      </span>
                    ) : null}
                  </button>
                </td>
                <td className={cn(TD, NUM)}>{formatAreaValue(row.value, row.targetMetric)}</td>
                {/* Blank, never 0, on an area's first reading: a zero here
                    would read as "logged, no movement", which is a lie. */}
                <td className={cn(TD, NUM, 'hidden md:table-cell')}>
                  {row.change === null ? (
                    ''
                  ) : (
                    <span
                      className={cn(
                        row.towardTarget === true && 'text-accent-700',
                        row.towardTarget === false && 'text-fw-warning-ink',
                      )}
                    >
                      {row.change > 0 ? '+' : row.change < 0 ? '−' : ''}
                      {formatAreaValue(Math.abs(row.change), row.targetMetric)}
                    </span>
                  )}
                </td>
                <td className={cn(TD, 'hidden max-w-[28ch] md:table-cell')}>
                  <span className="line-clamp-1 text-text-secondary">{row.note ?? ''}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && onViewAll ? (
        <Button variant="ghost" className="self-start" onClick={onViewAll}>
          View all {rows.length}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One pending decision as a hairline ledger row.
 *
 * A coach's PROPOSED focus area and CoachHelm's suggested GOAL are the same
 * thing to a player, something waiting on their answer, so they share a column.
 * They are NOT the same underneath: a proposal accepts through the focus-area
 * actions, a suggestion through `acceptGoalSuggestion`. Each row says which it
 * is in its own label, because a blind shared shape would let a player accept
 * a goal thinking they accepted their coach's plan.
 *
 * The suggestion wiring is reproduced here rather than reusing GoalsSection's
 * `SuggestionRow`: that one is an `InsetGroup.Row`, and a matte inset panel
 * inside a bare ledger column is the nested card this page bans. The server
 * actions are the shared contract; the row shape is not.
 */
export function SuggestionLedgerRow({ view }: { view: GoalSuggestionView }) {
  const { suggestion, display_label, unit } = view;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) {
          fairwayToast.danger(result.error || 'Something went wrong');
          return;
        }
        fairwayToast.success(ok);
        router.refresh();
      } catch {
        fairwayToast.danger('Something went wrong');
      }
    });
  };

  const target =
    suggestion.suggested_target_value !== null
      ? formatValue(suggestion.suggested_target_value, unit)
      : null;

  return (
    <LedgerRowItem
      title={display_label}
      meta={
        <>
          Suggested goal
          {target ? `, target ${target}` : ''}
          {`, ${suggestion.suggested_window_days}-day window`}
        </>
      }
      trailing={
        <span className="inline-flex items-center gap-1">
          <Button
            variant="secondary"
            busy={isPending}
            disabled={isPending}
            onClick={() => run(() => acceptGoalSuggestion(suggestion.id), 'Goal started')}
          >
            Accept
          </Button>
          <Button
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => dismissGoalSuggestion(suggestion.id), 'Suggestion dismissed')}
          >
            Dismiss
          </Button>
        </span>
      }
    />
  );
}

/** A coach-prescribed focus area as a hairline ledger row. */
export function ProposedLedgerRow({
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
  const target =
    focusArea.target_value != null
      ? formatAreaValue(focusArea.target_value, focusArea.target_metric)
      : null;
  // Absent on legacy rows and until migration 20260621230000 lands, so it is
  // simply omitted rather than rendered as an empty timeframe.
  const timeframe = formatTimeframe(focusArea);
  // Names WHAT the target measures. Without it the row reads "target 68.5",
  // a number with no unit and no subject.
  const metricLabel = formatTargetMetricLabel(focusArea.target_metric);
  return (
    <LedgerRowItem
      title={focusArea.title || 'Untitled area'}
      meta={
        <>
          From your coach
          {metricLabel ? `, ${metricLabel}` : ''}
          {target ? `, target ${target}` : ''}
          {timeframe ? `, ${timeframe}` : ''}
        </>
      }
      trailing={
        <span className="inline-flex items-center gap-1">
          <Button variant="secondary" busy={deciding} disabled={deciding} onClick={onAccept}>
            Accept
          </Button>
          <Button variant="ghost" disabled={deciding} onClick={onDecline}>
            Decline
          </Button>
        </span>
      }
    />
  );
}

/**
 * One readout in the stage's readouts column: a number typeset as part of the
 * page, not a tile. No panel, no border, no fill behind the figure. Green and
 * amber are ink on the numeral itself, which is the only place LANGUAGE.md
 * spends them.
 */
export function FieldReadout({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'font-fw-mono text-h3 font-medium tabular-nums leading-none',
          tone === 'good' && 'text-accent-700',
          tone === 'warn' && 'text-fw-warning-ink',
          tone === 'neutral' && 'text-text-primary',
        )}
      >
        {value}
      </span>
      <span className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
        {label}
      </span>
    </div>
  );
}

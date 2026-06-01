'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm v3 THEMES — ThemeCard
 * ----------------------------------------------------------------------------
 * One THEME (an SG category or an outcome theme). Honest by `state`:
 *
 *   • leak     — warning-toned magnitude pill + a headline that quantifies the
 *                COLLEGE-REALISTIC strokes to gain ("{label} — ~{x}
 *                strokes/round to gain") when themeStrokesPerRound > 0;
 *                otherwise a neutral "{label}" header (NEVER a fabricated 0). A
 *                secondary, smaller line surfaces the raw vs-Tour ceiling
 *                ("{g} to Tour ceiling") only when the Tour gap exceeds the
 *                realistic gain — NEVER framed as "strokes you're losing." Below:
 *                the cause cascade (CauseRow[]).
 *   • strength — green success-toned pill + "Strength — gaining ~{x}
 *                strokes/round vs your baseline". No leak framing.
 *   • thin     — muted stub: "Not enough data yet — log more rounds (or tag
 *                your putt misses) to unlock this." The scaffold is NEVER blank.
 *
 * The magnitude pill reuses the `CauseEffectCard` pill style from
 * `FairwayStatsCockpit.tsx` verbatim: `bg-fw-warning-bg text-fw-warning` +
 * TrendingDown for a leak, `bg-fw-success-bg text-fw-success` + TrendingUp for
 * a strength.
 *
 * PRESENTATION ONLY — no data fetch, no server action. The "make it a plan"
 * handler is injected and threaded down to each {@link CauseRow}.
 *
 * ADDITIVE — new file under the Fairway tree. Renders inside `.fairway-ds`.
 * ========================================================================== */

import { TrendingDown, TrendingUp } from 'lucide-react';

import { Surface } from '@/components/fairway';
import type { CauseNode, ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import { CauseRow } from './CauseRow';

/* ───────────────────────────────────────────────────────────────────────────
 * Props
 * ────────────────────────────────────────────────────────────────────────── */

export interface ThemeCardProps {
  theme: ThemeNode;
  role: 'coach' | 'player';
  /** Injected "make it a plan" handler — receives the cause + its parent theme. */
  onMakePlan?: (cause: CauseNode, theme: ThemeNode) => void;
  /** `cause.insight_id` currently creating a plan → that CauseRow shows busy. */
  makePlanPendingId?: string | null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function ThemeCard({
  theme,
  role,
  onMakePlan,
  makePlanPendingId,
}: ThemeCardProps) {
  const { displayLabel, state, themeStrokesPerRound, tourGapPerRound, causes } = theme;
  const magnitude = themeStrokesPerRound.toFixed(1);
  const hasMagnitude = themeStrokesPerRound > 0;

  // Headline + pill per state. Honest: a leak with no positive magnitude shows
  // the neutral label only (never a fabricated 0).
  const isLeak = state === 'leak';
  const isStrength = state === 'strength';
  const isThin = state === 'thin';

  const headline = isStrength
    ? hasMagnitude
      ? `Strength — gaining ~${magnitude} strokes/round vs your baseline`
      : `${displayLabel} — a strength`
    : isLeak && hasMagnitude
      ? `${displayLabel} — ~${magnitude} strokes/round to gain`
      : displayLabel;

  // Secondary, smaller honest line: the raw vs-Tour ceiling. Only shown for a
  // quantified leak where the Tour gap is materially larger than the realistic
  // gain — context for "how far the very top is," NEVER a "losing X" framing.
  const showTourCeiling =
    isLeak && hasMagnitude && tourGapPerRound > themeStrokesPerRound;

  return (
    <Surface
      elevation="border"
      padding="lg"
      className="flex flex-col gap-4"
      data-slot="fairway-theme-card"
      data-theme-category={theme.category}
      data-theme-state={state}
    >
      {/* Header — eyebrow label + headline + magnitude pill */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
            {displayLabel}
          </span>
          <h3 className="font-fw-display text-body-lg font-medium leading-snug text-text-primary">
            {headline}
          </h3>
          {showTourCeiling ? (
            <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              {tourGapPerRound.toFixed(1)} to Tour ceiling
            </span>
          ) : null}
        </div>

        {/* Magnitude pill — same chrome as the cockpit CauseEffectCard pill. */}
        {(isLeak || isStrength) && hasMagnitude ? (
          <span
            className={
              isStrength
                ? 'inline-flex w-fit flex-shrink-0 items-center gap-1.5 rounded-full bg-fw-success-bg px-2.5 py-1 font-fw-mono text-caption font-medium tabular-nums text-fw-success'
                : 'inline-flex w-fit flex-shrink-0 items-center gap-1.5 rounded-full bg-fw-warning-bg px-2.5 py-1 font-fw-mono text-caption font-medium tabular-nums text-fw-warning'
            }
          >
            {isStrength ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden />
            )}
            {isStrength ? `+${magnitude}` : `≈ ${magnitude}`} / round
          </span>
        ) : null}
      </div>

      {/* Body */}
      {isThin ? (
        <p className="font-fw-sans text-body-sm leading-relaxed text-text-tertiary">
          Not enough data yet — log more rounds (or tag your putt misses) to
          unlock this.
        </p>
      ) : causes.length > 0 ? (
        <div className="flex flex-col gap-3">
          {causes.map((cause, i) => (
            <CauseRow
              key={cause.insight_id}
              cause={cause}
              role={role}
              defaultOpen={i === 0}
              onMakePlan={
                onMakePlan ? () => onMakePlan(cause, theme) : undefined
              }
              makePlanPending={makePlanPendingId === cause.insight_id}
            />
          ))}
        </div>
      ) : (
        // Leak/strength state with no enumerated causes — honest, never blank.
        <p className="font-fw-sans text-body-sm leading-relaxed text-text-tertiary">
          {isStrength
            ? 'Keep doing what’s working here — no leak to address.'
            : 'No specific cause surfaced yet — keep logging rounds to pinpoint it.'}
        </p>
      )}
    </Surface>
  );
}

export default ThemeCard;

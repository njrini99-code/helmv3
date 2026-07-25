'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm v3 THEMES — ThemeCard
 * ----------------------------------------------------------------------------
 * One THEME (an SG category or an outcome theme). Honest by `state`:
 *
 *   • leak     — warning-toned magnitude pill + a headline that quantifies the
 *                REALISTIC strokes to reach the player's TEAM AVERAGE ("{label}
 *                — ~{x} strokes/round to reach your team avg") when
 *                themeStrokesPerRound > 0; otherwise a neutral "{label}" header
 *                (NEVER a fabricated 0). When the team-fraction fell back to 1
 *                (no team data — detected as themeStrokesPerRound ==
 *                tourGapPerRound) the primary is honestly framed "to Tour"
 *                instead. A secondary, smaller line surfaces the raw vs-Tour
 *                ceiling ("{g} from Tour") only when the Tour gap exceeds
 *                the realistic team gain — NEVER framed as "strokes you're
 *                losing." Below: the cause cascade (CauseRow[]).
 *   • strength — green success-toned pill + "Strength — gaining ~{x}
 *                strokes/round vs your baseline". No leak framing.
 *   • thin     — muted stub: "Not enough data yet — log more rounds (or tag
 *                your putt misses) to unlock this." The scaffold is NEVER blank.
 *
 * The eyebrow (category label) is only rendered when it says something the
 * headline doesn't already — when the two are identical text (case-
 * insensitive, e.g. a `thin`/no-magnitude card where the headline IS the
 * category label), the eyebrow is dropped rather than repeating it verbatim.
 *
 * The magnitude pill reuses the `CauseEffectCard` pill placement from
 * `FairwayStatsCockpit.tsx`: `bg-fw-warning-bg text-fw-warning-ink` + TrendingDown
 * for a leak, `bg-fw-success-bg text-fw-success-ink` + TrendingUp for a strength.
 * Copy is human prose in `font-fw-sans` (tabular-nums on the digits only) —
 * NOT `font-fw-mono` debug notation (no `≈`, no `/rd`, no parenthetical
 * ceiling note cramped onto the same line).
 *
 * PRESENTATION ONLY — no data fetch, no server action. The "make it a plan"
 * handler is injected and threaded down to each {@link CauseRow}.
 *
 * ADDITIVE — new file under the Fairway tree. Renders inside `.fairway-ds`.
 * ========================================================================== */

import { TrendingDown, TrendingUp } from 'lucide-react';

import { Surface } from '@/components/fairway';
import type { CauseNode, ThemeNode, ThemeTrend } from '@/lib/coachhelm/v3/themes/types';
import { CauseRow } from './CauseRow';

/* ───────────────────────────────────────────────────────────────────────────
 * Trend chip (PLAY G)
 * ----------------------------------------------------------------------------
 * Honest per-category SG direction. SG SIGN CONVENTION: higher SG is better, so
 * `improving` = SG rising = GOOD = success/green (arrow up). This is the
 * OPPOSITE of the lower-is-better scoring trend in FairwayTeamStats. Rendered
 * only when `theme.trend` exists (never fabricated).
 * ────────────────────────────────────────────────────────────────────────── */

interface TrendChipDisplay {
  label: string;
  /** tone class — improving = success/green, declining = warning, steady = muted. */
  cls: string;
  arrow: string;
  /** |Δ| to 1 decimal, or null for steady (no magnitude shown). */
  magnitude: string | null;
}

function describeTrend(trend: ThemeTrend): TrendChipDisplay {
  if (trend.direction === 'steady') {
    return { label: 'Steady', cls: 'text-text-tertiary', arrow: '→', magnitude: null };
  }
  const magnitude = Math.abs(trend.delta).toFixed(1);
  // Higher SG is better → improving is the GOOD direction (success/green, up arrow).
  return trend.direction === 'improving'
    ? { label: 'Improving', cls: 'text-fw-success', arrow: '↗', magnitude }
    : { label: 'Declining', cls: 'text-fw-warning', arrow: '↘', magnitude };
}

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
  const { displayLabel, state, themeStrokesPerRound, tourGapPerRound, causes, trend } = theme;
  const magnitude = themeStrokesPerRound.toFixed(1);
  const hasMagnitude = themeStrokesPerRound > 0;

  // PLAY G — honest per-category SG direction. Only when a trend was supplied
  // (the 4 SG themes with enough rounds). Never fabricated.
  const trendChip = trend ? describeTrend(trend) : null;

  // Headline + pill per state. Honest: a leak with no positive magnitude shows
  // the neutral label only (never a fabricated 0).
  const isLeak = state === 'leak';
  const isStrength = state === 'strength';
  const isThin = state === 'thin';

  // When the realistic (team) magnitude equals the raw Tour gap, the team
  // fraction fell back to 1 (no usable team reference) — so the primary number is
  // honestly a gap "to Tour," not "to your team avg." Compare on the rounded
  // display values so the on-screen numbers stay consistent.
  const toTourOnly =
    hasMagnitude && tourGapPerRound.toFixed(1) === magnitude;
  const primaryTarget = toTourOnly ? 'to reach Tour' : 'to reach your team avg';

  const headline = isStrength
    ? hasMagnitude
      ? `Strength — gaining ~${magnitude} strokes/round vs your baseline`
      : `${displayLabel} — a strength`
    : isLeak && hasMagnitude
      ? `${displayLabel} — ~${magnitude} strokes/round ${primaryTarget}`
      : displayLabel;

  // Duplicate eyebrow/title guard — a `thin`/no-magnitude card's headline IS
  // the category label verbatim, so showing both reads as the card repeating
  // itself. Drop the eyebrow in that case; keep it whenever the headline says
  // something more (the quantified leak/strength copy above).
  const eyebrowRedundant = headline.trim().toLowerCase() === displayLabel.trim().toLowerCase();

  // Secondary, smaller honest line: the raw vs-Tour ceiling. Only shown for a
  // quantified leak where the Tour gap is materially larger than the realistic
  // team gain — context for "how far the very top is," NEVER a "losing X"
  // framing. Hidden when the primary already IS the Tour gap (toTourOnly).
  const showTourCeiling =
    isLeak && hasMagnitude && !toTourOnly && tourGapPerRound > themeStrokesPerRound;

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
          {!eyebrowRedundant ? (
            <span className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
              {displayLabel}
            </span>
          ) : null}
          <h3 className="font-fw-display text-body-lg font-medium leading-snug text-text-primary">
            {headline}
          </h3>
          {showTourCeiling ? (
            <span className="font-fw-sans text-caption text-text-tertiary">
              <span className="tabular-nums">{tourGapPerRound.toFixed(1)}</span> from Tour
            </span>
          ) : null}
          {/* PLAY G — SG trend chip (recent vs prior rounds). Honest: shown only
              when a trend exists. SG up = improving = green. */}
          {trendChip ? (
            <span
              className={`inline-flex w-fit items-center gap-1 font-fw-sans text-caption font-medium ${trendChip.cls}`}
              data-slot="fairway-theme-trend"
              data-trend-direction={trend?.direction}
            >
              <span aria-hidden>{trendChip.arrow}</span>
              {trendChip.label}
              {/* Direction only — the raw golf_rounds SG column is on a different
                  scale than the normalized per-round magnitude shown above, so a
                  numeric delta here would be inconsistent. Direction is scale-
                  invariant and honest; magnitude is intentionally omitted. */}
            </span>
          ) : null}
        </div>

        {/* Magnitude pill — same placement as the cockpit CauseEffectCard pill,
            human sans-serif prose (not mono debug notation). flex-wrap + no
            flex-shrink-0 on the icon lets it size to content instead of
            clipping on narrow screens. */}
        {(isLeak || isStrength) && hasMagnitude ? (
          <span
            className={
              isStrength
                ? 'inline-flex w-fit max-w-full flex-shrink-0 flex-wrap items-center gap-1.5 rounded-full bg-fw-success-bg px-2.5 py-1 font-fw-sans text-caption font-medium text-fw-success-ink'
                : 'inline-flex w-fit max-w-full flex-shrink-0 flex-wrap items-center gap-1.5 rounded-full bg-fw-warning-bg px-2.5 py-1 font-fw-sans text-caption font-medium text-fw-warning-ink'
            }
          >
            {isStrength ? (
              <TrendingUp className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            )}
            <span className="tabular-nums">{isStrength ? `+${magnitude}` : magnitude}</span>
            <span>strokes/round</span>
          </span>
        ) : null}
      </div>

      {/* Body */}
      {isThin ? (
        <p className="font-fw-sans text-body-sm leading-relaxed text-text-tertiary">
          Not enough rounds yet — log a few with shot detail (and tag your putt
          misses) and this theme will light up.
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

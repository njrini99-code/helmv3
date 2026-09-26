'use client';

/**
 * ============================================================================
 * RootSummary: the headline card on top of every root-map screen
 * ----------------------------------------------------------------------------
 * Redesigned 2026-09-25 (owner: "this page makes no sense"). The card answers
 * the one question each reader brings, in words, before any list:
 *
 *   - coach: which area costs the team most (per round, vs the Tour
 *     average), its biggest single spot and who carries it, the area's
 *     direction, and the team's strength;
 *   - player: their single biggest leak, one line of why, what the spot is
 *     read from, and their strength;
 *   - a coach looking at one player (`subjectName`): the player card in the
 *     third person ("Mia's biggest leak"), never "you".
 *
 * Then the screen's one primary action, handed in by the caller. The ranked
 * rows under it are `LeakList`; this card never repeats them.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { INFERRED_LABEL } from '@/lib/coachhelm/root-map/plain-copy';
import {
  ROOT_AREA_LABEL,
  rootStyleLabel,
  whyIdOf,
  type BranchDetail,
  type CauseBranch,
  type RootArea,
  type RootAudience,
  type RootMapModel,
} from '@/lib/coachhelm/root-map/build-root-map';
import type { AreaTrendNote } from '@/lib/coachhelm/root-map/area-trends';
import { BENCHMARK_LABEL, TrendText, carriersText, formatPerRound, rankedSpots, sampleText } from './LeakList';

/** The biggest spots across the map, largest first. */
export function topSpots(model: RootMapModel, n = 2): CauseBranch[] {
  return rankedSpots(model).slice(0, n);
}

/** One plain line of Why for a spot: its stored root in brief, or why there
 *  is none. Never states an inferred root as fact. */
export function leadWhyLine(
  spot: CauseBranch,
  details: Record<string, BranchDetail> | undefined,
  audience: RootAudience,
): string | null {
  const id = whyIdOf(spot);
  const detail = id ? details?.[id] ?? null : null;
  if (!id) return null;
  const root = detail?.rootCause ?? spot.rootCause;
  if (!root) return `${rootStyleLabel(spot.style, audience)}; the cause is not explained yet.`;
  const inferred = (detail?.causality ?? spot.causality) === 'inferred_hypothesis';
  return inferred ? `${root} (${INFERRED_LABEL.toLowerCase()})` : root;
}

export interface RootSummaryProps {
  model: RootMapModel;
  audience?: RootAudience;
  /** One player's card read by a coach: their name replaces "you". */
  subjectName?: string;
  /** Stored one-sentence headline; shown only when there is no losing area. */
  headline?: string | null;
  details?: Record<string, BranchDetail>;
  trends?: Partial<Record<RootArea, AreaTrendNote | null>>;
  /** Visuals for the lead spot (the player's lie bars / path). */
  leadVisual?: ReactNode;
  /** The screen's one primary action. */
  action?: ReactNode;
  /** Extra content under the lead (e.g. the team's "Needs you"). */
  children?: ReactNode;
  className?: string;
}

export function RootSummary({
  model,
  audience = 'player',
  subjectName,
  headline = null,
  details,
  trends,
  leadVisual,
  action,
  children,
  className,
}: RootSummaryProps) {
  // The team card speaks about the team; any single-player card, about that
  // player ("Your" for the player, the first name for a coach).
  const team = audience === 'coach' && !subjectName;
  const first = subjectName ? subjectName.split(' ')[0] || subjectName : null;
  const owner = first ? `${first}’s` : 'Your';
  const worst = [...model.losses].sort((a, b) => b.loss - a.loss)[0] ?? null;
  const lead = rankedSpots(model)[0] ?? null;
  const strength = [...model.gains].sort((a, b) => b.sg - a.sg)[0] ?? null;
  const why = lead ? leadWhyLine(lead, details, audience) : null;
  const sample = lead ? sampleText(lead) : null;
  const who = lead && team ? carriersText(lead.carriers, lead.players) : null;

  // The sentence a reader should be able to repeat back.
  let title: string;
  let sub: string | null = null;
  if (!worst) {
    title =
      headline ??
      (team ? 'No area is losing strokes to the Tour average.' : `${first ?? 'You'} ${first ? 'is' : 'are'} not losing strokes in any area.`);
  } else if (team) {
    title = `${worst.label} is the team’s biggest leak: ${formatPerRound(worst.loss)} strokes a round ${BENCHMARK_LABEL}.`;
    if (lead) {
      sub = `Biggest single spot: ${lead.label}${lead.area !== worst.area ? ` (${ROOT_AREA_LABEL[lead.area].toLowerCase()})` : ''}, ${formatPerRound(lead.strokes)} a round${who ? ` · ${who}` : ''}.`;
    }
  } else if (lead) {
    title = `${owner} biggest leak: ${lead.label}${lead.label.toLowerCase().includes(ROOT_AREA_LABEL[lead.area].toLowerCase()) ? '' : ` (${ROOT_AREA_LABEL[lead.area].toLowerCase()})`}.`;
    sub = `${formatPerRound(lead.strokes)} strokes a round ${BENCHMARK_LABEL}${sample ? `, from ${sample}` : ''}.`;
  } else {
    title = `${worst.label} costs ${first ?? 'you'} the most: ${formatPerRound(worst.loss)} strokes a round ${BENCHMARK_LABEL}.`;
  }

  return (
    <section
      className={cn('flex flex-col gap-4 rounded-fw-lg border border-border-subtle bg-surface p-5 md:p-6', className)}
      data-slot="root-summary"
      aria-label="Summary"
    >
      <div className="flex flex-col gap-1.5">
        <p className="font-fw-display text-title-2 font-semibold text-text-primary md:text-title-1" data-slot="summary-title">
          {title}
        </p>
        {sub ? (
          <p className="text-body text-text-secondary" data-slot="summary-sub">
            {sub}
          </p>
        ) : null}
        {worst && trends?.[worst.area] ? (
          <p className="text-body-sm text-text-secondary" data-slot="summary-trend">
            {worst.label}: <TrendText note={trends[worst.area]} className="text-body-sm" />{' '}
            <span className="text-text-tertiary">({trends[worst.area]!.window})</span>
          </p>
        ) : null}
      </div>

      {!team && why ? (
        <p className="text-body-sm text-text-secondary" data-slot="summary-why">
          {why}
        </p>
      ) : null}
      {leadVisual}

      {strength ? (
        <p className="text-body-sm text-text-secondary" data-slot="summary-strength">
          {team ? 'Team strength' : `${owner} strength`}:{' '}
          <span className="font-medium text-text-primary">{strength.label}</span>{' '}
          <span className="font-fw-sans font-semibold tabular-nums" style={{ color: 'var(--fw-color-success-ink)' }}>
            {formatPerRound(strength.sg, { signed: true })}
          </span>{' '}
          a round
        </p>
      ) : null}

      {children}
      {action ? <div>{action}</div> : null}
    </section>
  );
}

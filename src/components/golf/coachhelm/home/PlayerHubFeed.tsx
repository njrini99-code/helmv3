'use client';

/**
 * ============================================================================
 * PlayerHubFeed — the Player CoachHelm overview (home view of the stage)
 * ----------------------------------------------------------------------------
 * Owner direction (2026-09-24): "heavy root cause stats and trends and
 * CoachHelm insights", and not the Stats page. Stats owns where the player
 * stands (SG hero, season snapshot, percentile standing); this page owns WHY
 * and WHAT IS CHANGING. It reads like an analyst's notebook, one column of
 * numbered sections separated by hairlines, not a grid of same-shaped cards:
 *
 *   masthead   CoachHelm's read in one line, the next-round window, the last
 *              round, and the page's one primary action (Log a round)
 *   01 What's changing   score-to-par windows + per-category SG slope chart
 *   02 Why               insight units: claim, cause chain, evidence, drill
 *   03 Patterns          causes ranked by strokes to gain back, and the
 *                        situations where scores run higher
 *   04 Your plan         active focus areas with progress
 *
 * The six section tabs above the stage are the only navigation (audit
 * HUB-01): no hub cards that duplicate them. In-section links go to a
 * specific destination (an insight's evidence, the plan).
 *
 * Every number is built in `buildPlayerHubViewModel.ts` from one source each
 * (HUB-02). Frost is used twice, where it earns it: the next-round window and
 * the lead insight.
 * ========================================================================== */

import Link from 'next/link';
import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';

import { Button, InsufficientData, type FocusAreaCardData } from '@/components/fairway';
import { useStage } from '@/components/fairway/modules';
import { FROSTED_CARD_CLASS } from '@/components/fairway/modules/frosted';
import { cn } from '@/lib/utils';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';
import type { ThemeNode } from '@/lib/coachhelm/v3/themes/types';

import {
  buildDriverTrends,
  buildInsightUnit,
  buildLastRound,
  buildLeakMap,
  buildNextRoundWindow,
  buildPlanRows,
  buildScoringTrend,
  buildSituations,
  fmtShortDate,
  type SituationInput,
} from './buildPlayerHubViewModel';
import { HubInsight } from './HubInsight';
import { DriverSlopes, LeakBars, NextRoundWindowView, ScoringWindows, SenseWord, SituationRows } from './HubInstruments';

/** How many insight units the overview shows before "All insights". */
export const HUB_INSIGHT_LIMIT = 3;

export interface PlayerHubFeedProps {
  topInsight: EvidenceInsight | null;
  secondaryInsights: EvidenceInsight[];
  themes: ThemeNode[];
  themesEnabled: boolean;
  trendData: Record<string, unknown> | null | undefined;
  patterns: SituationInput[];
  prediction: PlayerCoachHelmDashboardData['prediction'];
  recentRounds: PlayerCoachHelmDashboardData['recentRounds'];
  /** golf_player_stats_cache.rounds_played — the rounds CoachHelm reads from. */
  roundsBasis: number | null;
  lastUpdated: string | null;
  planAreas: FocusAreaCardData[];
  onRate: (insightId: string, rating: 'helpful' | 'dismissed') => void;
}

function SectionHead({ index, id, title, note }: { index: string; id: string; title: string; note?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span aria-hidden="true" className="font-fw-sans text-caption font-semibold text-text-tertiary tabular-nums">
        {index}
      </span>
      <h2 id={id} className="font-fw-display text-h3 font-semibold text-text-primary">
        {title}
      </h2>
      {note ? <p className="w-full font-fw-sans text-caption text-text-tertiary sm:w-auto">{note}</p> : null}
    </div>
  );
}

const SECTION = 'border-t border-border-subtle pt-6';

export function PlayerHubFeed({
  topInsight,
  secondaryInsights,
  themes,
  themesEnabled,
  trendData,
  patterns,
  prediction,
  recentRounds,
  roundsBasis,
  lastUpdated,
  planAreas,
  onRate,
}: PlayerHubFeedProps) {
  const stage = useStage();

  // Deep link into the Insights view with this insight's evidence sheet open
  // (`?view=insights&insight=<id>`, the same URL the dashboard card uses).
  // The stage swap is a history replace, never a server round trip.
  const openInsight = (insightId: string) => {
    if (typeof window !== 'undefined') {
      const next = new URL(window.location.href);
      next.searchParams.set('insight', insightId);
      window.history.replaceState(null, '', `${next.pathname}${next.search}${next.hash}`);
    }
    stage.open('insights');
  };

  const scoring = useMemo(() => buildScoringTrend(trendData), [trendData]);
  const drivers = useMemo(() => (themesEnabled ? buildDriverTrends(themes) : []), [themes, themesEnabled]);
  const leaks = useMemo(() => (themesEnabled ? buildLeakMap(themes) : []), [themes, themesEnabled]);
  const situations = useMemo(() => buildSituations(patterns), [patterns]);
  const nextRound = useMemo(() => buildNextRoundWindow(prediction), [prediction]);
  const lastRound = useMemo(() => buildLastRound(recentRounds), [recentRounds]);
  const plan = useMemo(() => buildPlanRows(planAreas), [planAreas]);
  const lastRoundDate = recentRounds[0]?.date ?? null;
  const units = useMemo(() => {
    const all = [topInsight, ...secondaryInsights].filter((i): i is EvidenceInsight => Boolean(i));
    const seen = new Set<string>();
    return all
      .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
      .slice(0, HUB_INSIGHT_LIMIT)
      .map((i) => buildInsightUnit(i, { lastRoundDate }));
  }, [topInsight, secondaryInsights, lastRoundDate]);
  const insightTotal = (topInsight ? 1 : 0) + secondaryInsights.filter((i) => i.id !== topInsight?.id).length;

  const updated = fmtShortDate(lastUpdated);
  const meta = [
    roundsBasis !== null && roundsBasis > 0 ? `${roundsBasis} ${roundsBasis === 1 ? 'round' : 'rounds'}` : null,
    updated ? `Updated ${updated}` : null,
  ].filter(Boolean);

  const hasChanging = Boolean(scoring) || drivers.length > 0;
  const hasPatterns = leaks.length > 0 || situations.length > 0;

  return (
    <div data-slot="player-hub-feed" className="mx-auto flex w-full max-w-[920px] flex-col gap-8">
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-5">
        <div>
          <p className="font-fw-sans text-caption font-semibold text-accent-ink">
            CoachHelm read{meta.length > 0 ? <span className="font-medium text-text-secondary"> · {meta.join(' · ')}</span> : null}
          </p>
          <p className="mt-2 font-fw-display text-h2 font-semibold text-text-primary sm:text-h1">
            {scoring ? scoring.headline : 'Here is what CoachHelm sees in your game'}
          </p>
          {scoring ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 font-fw-sans text-body-sm text-text-secondary tabular-nums">
              <SenseWord sense={scoring.sense}>{scoring.word}</SenseWord>
              <span>{scoring.sentence}</span>
            </p>
          ) : null}
        </div>

        {nextRound || lastRound ? (
          <div className={cn('grid grid-cols-1 gap-3', nextRound && lastRound && 'sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]')}>
            {nextRound ? (
              <div className={cn(FROSTED_CARD_CLASS, 'p-5')}>
                <NextRoundWindowView window={nextRound} />
              </div>
            ) : null}
            {lastRound ? (
              <div data-slot="last-round" className="flex flex-col justify-center rounded-fw-lg border border-border-subtle px-5 py-4">
                <p className="font-fw-sans text-caption font-semibold text-text-secondary">Last round</p>
                <p className="mt-1 flex items-baseline gap-2 font-fw-display text-h2 font-semibold text-text-primary tabular-nums">
                  {lastRound.score}
                  {lastRound.toParText ? (
                    <span className="font-fw-sans text-body-sm font-medium text-text-secondary">{lastRound.toParText}</span>
                  ) : null}
                </p>
                {lastRound.date || lastRound.course ? (
                  <p className="mt-1 font-fw-sans text-caption text-text-tertiary">
                    {[lastRound.date, lastRound.course].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <Button asChild variant="primary" className="w-full sm:w-fit">
          <Link href="/golf/dashboard/rounds/new">Log a round</Link>
        </Button>
      </header>

      {/* ── 01 What's changing ───────────────────────────────────────────── */}
      {hasChanging ? (
        <section aria-labelledby="hub-changing" className={SECTION}>
          <SectionHead index="01" id="hub-changing" title="What's changing" note="Recent rounds against the ones before" />
          {scoring ? (
            <div>
              <p className="mb-3 font-fw-sans text-caption font-semibold text-text-secondary">Score to par</p>
              <ScoringWindows windows={scoring.windows} />
            </div>
          ) : null}
          {drivers.length > 0 ? (
            <div className={cn(scoring && 'mt-6')}>
              <p className="mb-3 font-fw-sans text-caption font-semibold text-text-secondary">
                Strokes gained a round, by part of the game
              </p>
              <DriverSlopes rows={drivers} />
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── 02 Why ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="hub-why" className={SECTION}>
        <SectionHead index="02" id="hub-why" title="Why" note="The root causes CoachHelm found, with the evidence" />
        {units.length > 0 ? (
          <div className="flex flex-col gap-6">
            {units.map((unit, i) => (
              <div key={unit.id} className={cn(i > 0 && 'border-t border-border-subtle pt-6')}>
                <HubInsight
                  unit={unit}
                  lead={i === 0}
                  onOpen={() => openInsight(unit.id)}
                  onRate={i === 0 ? (rating) => onRate(unit.id, rating) : undefined}
                />
              </div>
            ))}
            {insightTotal > units.length ? (
              <Button variant="ghost" size="sm" className="w-fit" onClick={() => stage.open('insights')}
                rightIcon={<ChevronRight size={14} aria-hidden />}>
                All {insightTotal} insights
              </Button>
            ) : null}
          </div>
        ) : (
          <InsufficientData
            compact
            title="No root cause stands out yet"
            description="CoachHelm names a cause once a pattern holds across a few rounds."
          />
        )}
      </section>

      {/* ── 03 Patterns ──────────────────────────────────────────────────── */}
      {hasPatterns ? (
        <section aria-labelledby="hub-patterns" className={SECTION}>
          <SectionHead index="03" id="hub-patterns" title="Patterns behind your scores" />
          <div className={cn('grid grid-cols-1 gap-8', leaks.length > 0 && situations.length > 0 && 'md:grid-cols-2')}>
            {leaks.length > 0 ? (
              <div>
                <p className="mb-3 font-fw-sans text-caption font-semibold text-text-secondary">
                  Strokes a round to win back by reaching your team average
                </p>
                <LeakBars rows={leaks} />
              </div>
            ) : null}
            {situations.length > 0 ? (
              <div>
                <p className="mb-3 font-fw-sans text-caption font-semibold text-text-secondary">When your scores change</p>
                <SituationRows rows={situations} />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── 04 Your plan ─────────────────────────────────────────────────── */}
      {plan.length > 0 ? (
        <section aria-labelledby="hub-plan" className={SECTION}>
          <SectionHead index={hasPatterns ? '04' : '03'} id="hub-plan" title="Your plan" />
          <ul data-slot="plan-rows" className="flex flex-col divide-y divide-border-subtle">
            {plan.map((row) => (
              <li key={row.id} className="py-3 first:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 font-fw-sans text-body-sm font-medium text-text-primary">{row.title}</p>
                  <p className="shrink-0 font-fw-sans text-caption font-medium text-text-secondary tabular-nums">{row.status}</p>
                </div>
                {row.pct !== null ? (
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-sunken" aria-hidden="true">
                    <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.max(2, row.pct)}%` }} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-3 w-fit" onClick={() => stage.open('development')}>
            Open your plan
            <ChevronRight size={14} aria-hidden />
          </Button>
        </section>
      ) : null}
    </div>
  );
}

'use client';

/**
 * ============================================================================
 * FilmstripReview — Round Review on the Spine & Stage filmstrip (Task 10)
 * ----------------------------------------------------------------------------
 * The composition root: `ReviewHero` (green panel + 18-hole `Filmstrip`) as
 * one hero unit, below it ONE AI narrative (V2 body preferred, V1 summary
 * fallback — the separate LLM opener card + the old A–F/highlights/areas
 * prose stack are retired), a "what to do next"
 * block (practice priority + add-focus-area CTA + share-with-coach), coach
 * notes, the season standing band, and one always-visible round breakdown
 * (front/back, putting bands, momentum, driving/penalties, short game —
 * previously computed but hidden).
 *
 * Pure presentation over already-fetched props, EXCEPT the per-hole shot
 * ledger (`golf_shots`), which this component fetches itself — the direct
 * successor to the retired `HoleByHoleShotPaths`' own client fetch, scoped
 * to feeding `ReviewHero`'s tap-to-open `HoleShotPath` detail instead of
 * rendering all 18 cards up front.
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Eyebrow, Surface, Button, InlineNotice, Skeleton } from '@/components/fairway';
import {
  buildReviewShotsByHole,
  type RawGolfShotRow,
  type ReviewShotInput,
} from './round-review-shots';
import { StandingBars } from '@/components/fairway/charts/StandingBars';
import { TrendChart } from '@/components/fairway/charts/TrendChart';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import {
  FocusAreaModal,
  type FocusAreaModalSubmit,
} from '@/components/fairway/pages/coachhelm/FocusAreaModal';
import { createFocusAreaFromReview } from '@/app/golf/actions/development';
import {
  CoachNotesSection,
  hasCoachNotesContent,
} from '@/app/golf/(dashboard)/dashboard/rounds/[id]/review/CoachNotesSection';
import type { RoundReviewContent, RoundReviewTrendRow } from '@/app/golf/actions/round-review-system';
import { ReviewHero, type ReviewHoleMeta } from './ReviewHero';
import {
  ReviewBreakdown,
  hasFrontBackData,
  hasPuttingRampData,
  hasDrivingDotData,
  hasApproachHeatData,
} from './ReviewBreakdown';
import { RoundSGSummary } from './RoundSGSummary';
import {
  buildCourseDateLine,
  buildDrivingPenaltyLines,
  buildDrivingDotStripData,
  buildFilmstripHoles,
  buildFrontBackDiverging,
  buildFrontBackRows,
  buildGrade,
  buildRoundTrendSeries,
  buildScoringHistogram,
  buildMomentumTicker,
  buildNarrative,
  buildPuttingRamp,
  buildShortGameRows,
  formatToPar,
  pickPracticePriority,
} from './buildReviewViewModel';

export interface PromoteSuggestion {
  title: string;
  description: string;
  areaType: string;
}

export interface FilmstripReviewProps {
  roundId: string;
  playerId: string;
  courseName: string;
  roundDate: string;
  totalScore: number;
  scoreToPar: number;
  review: RoundReviewContent;
  reviewId: string;
  sharedWithCoach: boolean;
  onShare: () => void;
  v2Body: string | null;
  v2PracticePriority: string | null;
  isCoachViewer: boolean;
  coachNotes: string | null;
  promoteSuggestion: PromoteSuggestion | null;
  standing: Record<string, PlayerStanding>;
  /** True while the season-standing fetch (`getPlayerStandingForReview`) is
   *  still in flight. Decoupled from the review's own loading state (the
   *  perf fix, AUDIT row 15) — the page clears its umbrella loading flag as
   *  soon as the review resolves, so "Where this sits" carries its own
   *  pending state here rather than the review waiting on it. */
  standingLoading: boolean;
  holes: Array<{ hole_number: number; par: number | null; yardage: number | null; score: number | null }>;
  /** The reviewed player's display name — used ONLY for the coach-facing
   *  "Where this sits" StandingBars band (`viewer_context: 'coach'` reads the
   *  player's name/initials instead of "You"). Omitted/null for a player
   *  viewing their own review — StandingBars defaults to 'self' -> "You". */
  playerName?: string | null;
  /** Round-level Strokes Gained cache (`golf_rounds.strokes_gained_*`) —
   *  feeds the `RoundSGSummary` headline. `null` on any field renders that
   *  piece's honest-empty state rather than a fabricated value (see
   *  `RoundSGSummary`'s own doc comment). */
  strokesGainedTotal: number | null;
  strokesGainedTee: number | null;
  strokesGainedApproach: number | null;
  strokesGainedAroundGreen: number | null;
  strokesGainedPutting: number | null;
  /** Already-fetched per-round detailed stats (`getDetailedStats`, same
   *  object `page.tsx` passes to `RoundStatsPanel`) — a second, round-
   *  review-local consumer for R6's Approach heat rows, no new fetch. `null`
   *  while `page.tsx`'s own fetch is still in flight or found nothing. */
  roundStats: GolfStats | null;
  /** The player's last ~12 completed rounds' score-to-par (`getRoundReviewTrend`,
   *  own effect/loading flag in `page.tsx`, R3) — reads OTHER rounds, never
   *  this one's holes/SG, so it is the one new instrument that survives a
   *  scorecard-only round. `[]` while loading or below the 4-round floor. */
  trendRounds: RoundReviewTrendRow[];
  /** True while the R3 trend fetch is in flight — its OWN flag, never folded
   *  into the page's umbrella loading state (the exact AUDIT perf row 15
   *  mistake this page already paid down once). */
  trendLoading: boolean;
}

const STANDING_BAND_METRICS = ['gir_pct', 'sg_ott', 'sg_approach', 'sg_putting'] as const;

export function FilmstripReview({
  roundId,
  playerId,
  courseName,
  roundDate,
  totalScore,
  scoreToPar,
  review,
  reviewId,
  sharedWithCoach,
  onShare,
  v2Body,
  v2PracticePriority,
  isCoachViewer,
  coachNotes,
  promoteSuggestion,
  standing,
  standingLoading,
  holes,
  playerName,
  strokesGainedTotal,
  strokesGainedTee,
  strokesGainedApproach,
  strokesGainedAroundGreen,
  strokesGainedPutting,
  roundStats,
  trendRounds,
  trendLoading,
}: FilmstripReviewProps) {
  const [shotsByHole, setShotsByHole] = useState<Map<number, ReviewShotInput[]> | null>(null);
  const [shotsError, setShotsError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  // Focus-area prescription — the same FocusAreaModal PlayersGridView and
  // DevelopmentDrill use, pre-filled from the round-review takeaway
  // (promoteSuggestion) with the from_review_id linkage preserved via
  // createFocusAreaFromReview. Replaces the legacy vaul-Drawer
  // PromoteToFocusAreaButton so round review carries the same fidelity as
  // every other "prescribe" entry point.
  const [focusAreaModalOpen, setFocusAreaModalOpen] = useState(false);

  async function handlePromoteFocusArea(
    payload: FocusAreaModalSubmit,
  ): Promise<{ success: boolean; error?: string }> {
    const res = await createFocusAreaFromReview({
      playerId: payload.player_id,
      reviewId,
      title: payload.title,
      description: payload.description ?? '',
      areaType: payload.area_type,
      targetMetric: payload.target_metric ?? undefined,
      targetValue: payload.target_value ?? undefined,
      reviewContext: courseName || undefined,
    });
    return { success: res.success, error: res.error };
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Per-team SG baseline scale (women's 1.083, NCAA D1/D2/D3, etc.) —
      // the SAME `sg_scale_for_player` RPC `stats-data.ts`/
      // `player-profile-stats.ts` resolve round-level Strokes Gained with,
      // so a shot's `sg` here agrees with the round's own
      // `strokes_gained_*` cache columns instead of silently defaulting to
      // the PGA/men's curve for a scaled team. Failure-silent: falls back
      // to 1 (unscaled) rather than blocking the shot fetch — a resolver
      // error/outage must never prevent the diagram from rendering.
      let sgScale = 1;
      try {
        const { data: sgScaleRaw } = await supabase.rpc('sg_scale_for_player', {
          p_player_id: playerId,
        });
        if (typeof sgScaleRaw === 'number' && sgScaleRaw > 0) sgScale = sgScaleRaw;
      } catch {
        // Keep the unscaled (1.0) default — see comment above.
      }
      if (cancelled) return;

      const { data, error } = await supabase
        .from('golf_shots')
        .select(
          'id, hole_number, shot_number, shot_type, lie_before, lie_after, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, shot_distance, putt_distance_feet, putt_made, result, miss_direction, is_penalty, club_type, penalty_type, putt_break, putt_slope, notes, putt_details(miss_tags, made), approach_miss_details(lie_type, distance_from_green_yards)',
        )
        .eq('round_id', roundId)
        .order('hole_number', { ascending: true })
        .order('shot_number', { ascending: true });
      if (cancelled) return;
      if (error) {
        setShotsError(error.message);
        setShotsByHole(new Map());
        return;
      }
      setShotsError(null);
      const map = buildReviewShotsByHole((data ?? []) as unknown as RawGolfShotRow[], sgScale);
      if (process.env.NODE_ENV !== 'production') {
        // Dev-only trace (Wave A verification ask): confirm sg + putt/
        // approach detail fields are actually reaching the diagram for the
        // canonical test hole, not just present in the fetch.
        const hole6 = map.get(6);
        if (hole6) {
          console.debug(
            '[round-review] hole 6 shots -> diagram (sg + dark-detail check):',
            hole6.map((s) => ({
              shot_number: s.shot_number,
              sg: s.sg,
              is_penalty: s.is_penalty,
              putt_made: s.putt_made,
              miss_tags: s.miss_tags,
              approach_miss_lie_type: s.approach_miss_lie_type,
              approach_miss_distance_from_green_yards: s.approach_miss_distance_from_green_yards,
            })),
          );
        }
      }
      setShotsByHole(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId, playerId, supabase]);

  const holeMeta = useMemo(() => {
    const map = new Map<number, ReviewHoleMeta>();
    for (const h of holes) {
      map.set(h.hole_number, { par: h.par, yardage: h.yardage, score: h.score });
    }
    return map;
  }, [holes]);

  const grade = useMemo(() => buildGrade(scoreToPar), [scoreToPar]);
  const scoringBuckets = useMemo(
    () => buildScoringHistogram(review.scoringDistribution),
    [review.scoringDistribution],
  );
  const courseDateLine = useMemo(() => buildCourseDateLine(courseName, roundDate), [courseName, roundDate]);
  const filmstripHoles = useMemo(() => buildFilmstripHoles(review.holeByHole), [review.holeByHole]);
  // Third tier — the persisted CoachHelm composed body, mirroring
  // `pickPracticePriority`'s v1CoachHelm-overlay fallback below. Ensures a
  // revisit (or the page's Refresh button, neither of which re-runs
  // useRoundReviewV2's generate()) still shows the composed narrative
  // instead of falling through to the V1 rule-based summary.
  const narrative = useMemo(
    () => buildNarrative(review.summary, v2Body, review.deepInsights?.[0]?.body),
    [review.summary, review.deepInsights, v2Body],
  );
  const practicePriority = useMemo(
    () => pickPracticePriority(v2PracticePriority, review.coachHelm),
    [v2PracticePriority, review.coachHelm],
  );

  const frontBack = useMemo(() => buildFrontBackRows(review.frontBackSplit), [review.frontBackSplit]);
  const frontBackDiverging = useMemo(
    () => buildFrontBackDiverging(review.frontBackSplit, holes),
    [review.frontBackSplit, holes],
  );
  const puttingRamp = useMemo(() => buildPuttingRamp(review.puttingBreakdown), [review.puttingBreakdown]);
  const momentum = useMemo(() => buildMomentumTicker(review.momentumData), [review.momentumData]);
  const drivingPenaltyLines = useMemo(
    () => buildDrivingPenaltyLines(review.drivingAnalysis, review.penaltyAnalysis),
    [review.drivingAnalysis, review.penaltyAnalysis],
  );
  const shortGameRows = useMemo(() => buildShortGameRows(review.shortGameAnalysis), [review.shortGameAnalysis]);
  const drivingDots = useMemo(() => buildDrivingDotStripData(review.holeByHole), [review.holeByHole]);
  const trendSeries = useMemo(
    () => buildRoundTrendSeries(trendRounds, roundId),
    [trendRounds, roundId],
  );

  // Women's-team flag for `RoundSGSummary`'s baseline caption — reads
  // `is_womens` off whichever season-standing SG metric happens to be
  // populated (they're all resolved from the SAME player-cohort lookup, see
  // `applyGenderAnchor`, so any of the three agrees). `standing` can be `{}`
  // on a cold-start player (season-standing cron hasn't run yet) — `isWomens`
  // then falls back to `false`, matching every other PGA/LPGA label call
  // site's men's/unknown default (`pgaReferenceLabel`, `tourLabel`) rather
  // than blocking the round-level SG headline on an unrelated cron.
  const isWomens = Boolean(
    standing.sg_ott?.is_womens ?? standing.sg_approach?.is_womens ?? standing.sg_putting?.is_womens,
  );

  // Whole-round Strokes Gained truly not computed — every one of the five
  // cached columns is null/absent, not just some. Gates whether the
  // `RoundSGSummary` instrument renders at all (round-detail.md CONTAINERS TO
  // REMOVE #2: the empty "Strokes gained: This round" + "By category" cards
  // collapse to nothing, replaced by one line in the standing surface below).
  // A round with EVEN ONE category computed still gets the full instrument —
  // this only catches the truly-uncomputed case.
  const hasAnySG = useMemo(
    () =>
      [strokesGainedTotal, strokesGainedTee, strokesGainedApproach, strokesGainedAroundGreen, strokesGainedPutting].some(
        (v) => typeof v === 'number' && Number.isFinite(v),
      ),
    [strokesGainedTotal, strokesGainedTee, strokesGainedApproach, strokesGainedAroundGreen, strokesGainedPutting],
  );

  const standingBars = useMemo(() => {
    // A coach viewing a PLAYER's review must read the player's standing as
    // the player's, not their own — pass viewer context + the player's name
    // through so the Card variant's visible label reads "You" only for the
    // player's own view (StandingBars' aria label already handled this; the
    // visible label previously hardcoded "You" for every viewer).
    const viewerContext: 'self' | 'coach' = isCoachViewer ? 'coach' : 'self';
    return STANDING_BAND_METRICS.map((mid): { id: string; node: ReactElement } | null => {
      const st = standing[mid];
      const cfg = getMetricRenderConfig(mid);
      if (!st || !cfg) return null;
      return {
        id: mid,
        node: (
          <StandingBars
            frame="bare"
            metric_id={mid}
            metric_label={cfg.display_label}
            player_value={st.player_value}
            team_avg={st.team_avg}
            team_n={st.team_n}
            team_pct={st.team_pct}
            pga_value={st.pga_value}
            pga_omitted={st.pga_omitted}
            is_womens={st.is_womens}
            direction={cfg.direction}
            unit={cfg.unit}
            scale={cfg.default_scale}
            viewer_context={viewerContext}
            player_name={playerName ?? undefined}
          />
        ),
      };
    }).filter((b): b is { id: string; node: ReactElement } => b !== null);
  }, [standing, isCoachViewer, playerName]);

  // The "Where this sits" seamed Surface's rows, in order: the SG-not-computed
  // notice (when applicable) first, then either the standing-loading pending
  // state, the standing rows, or the standing-absent notice — never more than
  // one of those three, since they're mutually exclusive standing states.
  // Empty overall (`sgNotComputedRow` absent AND nothing standing-related)
  // means there is truly nothing to say, so the whole section is omitted
  // below — never a floating heading over an empty Surface.
  const standingSectionRows = useMemo(() => {
    const rows: Array<{ id: string; node: ReactElement }> = [];
    if (!hasAnySG) {
      rows.push({
        id: 'sg-not-computed',
        node: <InlineNotice tone="info">SG not computed for this round.</InlineNotice>,
      });
    }
    if (standingLoading) {
      rows.push({
        id: 'standing-loading',
        node: (
          <div role="status" aria-busy="true" aria-live="polite" className="space-y-2">
            <span className="sr-only">Loading season standing…</span>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2 w-full" />
          </div>
        ),
      });
    } else if (standingBars.length > 0) {
      rows.push(...standingBars);
    } else {
      rows.push({
        id: 'standing-absent',
        node: (
          <InlineNotice tone="info">
            Season standing isn&rsquo;t available yet. It fills in once enough rounds are logged.
          </InlineNotice>
        ),
      });
    }
    return rows;
  }, [hasAnySG, standingLoading, standingBars]);

  // "The story" / "What to do next" / "Coach notes" seam rows, in that order
  // — previously three separate same-size cards (two of them side by side in
  // the `lg:grid-cols-2` grid, per the desktop capture), now one bordered
  // Surface with a hairline between each present row (round-detail.md: same
  // pattern as "Where this sits" below). "What to do next" is genuinely
  // conditional (no practice priority AND no promote suggestion => omitted);
  // "Coach notes" mirrors `CoachNotesSection`'s own honest-empty guard via
  // the exported `hasCoachNotesContent` predicate so a player with no note
  // yet never gets a padded empty row.
  const contentSectionRows = useMemo(() => {
    const rows: Array<{ id: string; node: ReactElement }> = [
      {
        id: 'story',
        node: (
          <div className="space-y-3">
            <Eyebrow as="h2">The story</Eyebrow>
            <p className="font-fw-sans text-body leading-relaxed text-text-primary">{narrative}</p>
          </div>
        ),
      },
    ];

    if (practicePriority || promoteSuggestion) {
      rows.push({
        id: 'what-to-do-next',
        node: (
          <div className="space-y-3">
            <Eyebrow as="h2">What to do next</Eyebrow>
            {practicePriority ? (
              <p className="font-fw-sans text-body-sm text-text-primary">{practicePriority}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2.5">
              {promoteSuggestion ? (
                <Button variant="secondary" size="sm" onClick={() => setFocusAreaModalOpen(true)}>
                  {isCoachViewer ? 'Prescribe focus area' : 'Add focus area'}
                </Button>
              ) : null}
              {!isCoachViewer ? (
                <Button variant="secondary" size="sm" onClick={onShare} disabled={sharedWithCoach}>
                  {sharedWithCoach ? 'Shared with coach' : 'Share with coach'}
                </Button>
              ) : null}
            </div>
          </div>
        ),
      });
    }

    if (hasCoachNotesContent(isCoachViewer, coachNotes)) {
      rows.push({
        id: 'coach-notes',
        node: <CoachNotesSection reviewId={reviewId} initialNotes={coachNotes} canEdit={isCoachViewer} />,
      });
    }

    return rows;
  }, [narrative, practicePriority, promoteSuggestion, isCoachViewer, onShare, sharedWithCoach, coachNotes, reviewId]);

  // Whole-section gate for "Round breakdown" — `hasFrontBackData`/
  // `hasPuttingRampData`/`hasDrivingDotData`/`hasApproachHeatData` mirror
  // `momentum`/`drivingPenaltyLines`/`shortGameRows`'s own honest-empty-array
  // convention, so a scorecard-only round with nothing anywhere hides the
  // section entirely rather than leaving a "Round breakdown" heading over
  // six empty rows.
  const showBreakdown = useMemo(
    () =>
      hasFrontBackData(frontBack) ||
      hasPuttingRampData(puttingRamp) ||
      hasDrivingDotData(drivingDots) ||
      hasApproachHeatData(roundStats) ||
      momentum.length > 0 ||
      drivingPenaltyLines.length > 0 ||
      shortGameRows.length > 0,
    [frontBack, puttingRamp, drivingDots, roundStats, momentum, drivingPenaltyLines, shortGameRows],
  );

  return (
    <div className="space-y-6">
      {/* The "cooler metric" headline — Strokes Gained total + by-category
          breakdown, ahead of the score/filmstrip hero so the accuracy-forward
          number is the first thing a reader sees, not buried below 18 holes
          of filmstrip. Omitted entirely when NOTHING is computed yet — see
          `hasAnySG` — collapsing to the one-line notice in "Where this sits"
          below instead of an empty-shell instrument. */}
      {hasAnySG ? (
        <RoundSGSummary
          strokesGainedTotal={strokesGainedTotal}
          strokesGainedTee={strokesGainedTee}
          strokesGainedApproach={strokesGainedApproach}
          strokesGainedAroundGreen={strokesGainedAroundGreen}
          strokesGainedPutting={strokesGainedPutting}
          isWomens={isWomens}
        />
      ) : null}

      <ReviewHero
        totalScore={totalScore}
        scoreToPar={scoreToPar}
        courseDateLine={courseDateLine}
        grade={grade}
        scoringBuckets={scoringBuckets}
        filmstripHoles={filmstripHoles}
        holeMeta={holeMeta}
        shotsByHole={shotsByHole}
        hasHoleData={filmstripHoles.length > 0}
        playerId={playerId}
      />
      {shotsError ? (
        <p className="font-fw-sans text-caption italic text-text-tertiary">
          {`Couldn't load shots for this round (${shotsError}).`}
        </p>
      ) : null}

      {/* R3, Season trajectory — a NEW standalone bare band, no wrapping
          Surface (matches "Where this sits"/"Round breakdown"'s own
          bare-band convention). Reads OTHER rounds, never this one's holes
          or SG, so it is the one new instrument that renders fully
          regardless of whether THIS round has either — gated only on round
          count (`buildRoundTrendSeries`'s own >=4 floor), never on this
          round's own data. While the fetch is in flight, a loading skeleton
          stands in (a real pending state, not a fabricated chart); once
          resolved, a series below the floor omits the section entirely
          rather than rendering an empty chart shell. */}
      {trendLoading ? (
        <div role="status" aria-busy="true" aria-live="polite" className="space-y-2">
          <span className="sr-only">Loading season trajectory…</span>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-[180px] w-full rounded-fw-lg" />
        </div>
      ) : trendSeries.points.length > 0 ? (
        <TrendChart
          title="Season trajectory"
          subtitle="Score to par, most recent rounds"
          data={trendSeries.points}
          benchmark={trendSeries.benchmark ? { value: trendSeries.benchmark.value, label: trendSeries.benchmark.label } : undefined}
          valueFormatter={(v) => formatToPar(Math.round(v))}
          height={200}
        />
      ) : null}

      {/* NOTE: the old V1 "Where strokes went" RailBars block was removed
          (2026-07-23) — it showed a heuristic strokes-lost split (with
          non-SG buckets like "Course Management") whose numbers CONTRADICTED
          the authoritative per-shot Strokes-Gained tornado now leading this
          page (RoundSGSummary). One honest SG breakdown, not two rival ones. */}

      {/* "The story" / "What to do next" / "Coach notes" — ONE seamed Surface,
          a hairline between each present row, rather than same-size cards
          side by side (round-detail.md, from the desktop capture). */}
      <Surface elevation="border" padding="none" className="divide-y divide-border-subtle overflow-hidden">
        {contentSectionRows.map((row) => (
          <div key={row.id} className="p-4 sm:p-5">
            {row.node}
          </div>
        ))}
      </Surface>

      {promoteSuggestion ? (
        <FocusAreaModal
          open={focusAreaModalOpen}
          onOpenChange={setFocusAreaModalOpen}
          mode={isCoachViewer ? 'coach' : 'player'}
          players={[{ id: playerId, name: playerName || 'This player' }]}
          playerStats={{}}
          playerId={playerId}
          initial={{
            player_id: playerId,
            area_type: promoteSuggestion.areaType,
            title: promoteSuggestion.title,
            description: promoteSuggestion.description,
          }}
          onSubmit={handlePromoteFocusArea}
        />
      ) : null}

      {standingSectionRows.length > 0 ? (
        <section className="space-y-3">
          <div>
            <Eyebrow as="h2">Where this sits</Eyebrow>
            <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">Season standing vs PGA Tour and the team.</p>
          </div>
          {/* ONE seamed Surface — a hairline between each row rather than a
              card per standing (round-detail.md: "'Where this sits' four
              cards → one Surface, four seam rows"). Each `StandingBars` row
              already carries its own "↑ vs team" delta chip in its header. */}
          <Surface elevation="border" padding="none" className="divide-y divide-border-subtle overflow-hidden">
            {standingSectionRows.map((row) => (
              <div key={row.id} className="p-4 sm:p-5">
                {row.node}
              </div>
            ))}
          </Surface>
        </section>
      ) : null}

      {showBreakdown ? (
        <section className="space-y-3">
          <div>
            <Eyebrow as="h2">Round breakdown</Eyebrow>
            <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">
              The key scoring, putting, driving, and short-game details from this round.
            </p>
          </div>
          <ReviewBreakdown
            roundId={roundId}
            frontBack={frontBack}
            frontBackDiverging={frontBackDiverging}
            drivingDots={drivingDots}
            roundStats={roundStats}
            puttingRamp={puttingRamp}
            momentum={momentum}
            drivingPenaltyLines={drivingPenaltyLines}
            shortGameRows={shortGameRows}
          />
        </section>
      ) : null}
    </div>
  );
}

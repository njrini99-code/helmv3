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
import { Eyebrow, Surface, Button } from '@/components/fairway';
import {
  buildReviewShotsByHole,
  type RawGolfShotRow,
  type ReviewShotInput,
} from './round-review-shots';
import { StandingBar } from '@/components/golf/coachhelm/v3/StandingBar';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import {
  FocusAreaModal,
  type FocusAreaModalSubmit,
} from '@/components/fairway/pages/coachhelm/FocusAreaModal';
import { createFocusAreaFromReview } from '@/app/golf/actions/development';
import { CoachNotesSection } from '@/app/golf/(dashboard)/dashboard/rounds/[id]/review/CoachNotesSection';
import type { RoundReviewContent } from '@/app/golf/actions/round-review-system';
import { ReviewHero, type ReviewHoleMeta } from './ReviewHero';
import { ReviewBreakdown } from './ReviewBreakdown';
import { RoundSGSummary } from './RoundSGSummary';
import {
  buildCourseDateLine,
  buildDrivingPenaltyLines,
  buildFilmstripHoles,
  buildFrontBackRows,
  buildGrade,
  buildMixLine,
  buildMomentumTicker,
  buildNarrative,
  buildPuttingRamp,
  buildShortGameRows,
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
  holes: Array<{ hole_number: number; par: number | null; yardage: number | null; score: number | null }>;
  /** The reviewed player's display name — used ONLY for the coach-facing
   *  "Where this sits" StandingBar band (`viewer_context: 'coach'` reads the
   *  player's name/initials instead of "You"). Omitted/null for a player
   *  viewing their own review — StandingBar defaults to 'self' -> "You". */
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
  holes,
  playerName,
  strokesGainedTotal,
  strokesGainedTee,
  strokesGainedApproach,
  strokesGainedAroundGreen,
  strokesGainedPutting,
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
  const mixLine = useMemo(() => buildMixLine(review.scoringDistribution), [review.scoringDistribution]);
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
  const puttingRamp = useMemo(() => buildPuttingRamp(review.puttingBreakdown), [review.puttingBreakdown]);
  const momentum = useMemo(() => buildMomentumTicker(review.momentumData), [review.momentumData]);
  const drivingPenaltyLines = useMemo(
    () => buildDrivingPenaltyLines(review.drivingAnalysis, review.penaltyAnalysis),
    [review.drivingAnalysis, review.penaltyAnalysis],
  );
  const shortGameRows = useMemo(() => buildShortGameRows(review.shortGameAnalysis), [review.shortGameAnalysis]);

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

  const standingBars = useMemo(() => {
    // A coach viewing a PLAYER's review must read the player's standing as
    // the player's, not their own — pass viewer context + the player's name
    // through so the Card variant's visible label reads "You" only for the
    // player's own view (StandingBar's aria label already handled this; the
    // visible label previously hardcoded "You" for every viewer).
    const viewerContext: 'self' | 'coach' = isCoachViewer ? 'coach' : 'self';
    return STANDING_BAND_METRICS.map((mid) => {
      const st = standing[mid];
      const cfg = getMetricRenderConfig(mid);
      if (!st || !cfg) return null;
      return (
        <StandingBar
          key={mid}
          size="card"
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
      );
    }).filter((b): b is ReactElement => b !== null);
  }, [standing, isCoachViewer, playerName]);

  return (
    <div className="space-y-6">
      {/* The "cooler metric" headline — Strokes Gained total + by-category
          breakdown, ahead of the score/filmstrip hero so the accuracy-forward
          number is the first thing a reader sees, not buried below 18 holes
          of filmstrip. */}
      <RoundSGSummary
        strokesGainedTotal={strokesGainedTotal}
        strokesGainedTee={strokesGainedTee}
        strokesGainedApproach={strokesGainedApproach}
        strokesGainedAroundGreen={strokesGainedAroundGreen}
        strokesGainedPutting={strokesGainedPutting}
        isWomens={isWomens}
      />

      <ReviewHero
        totalScore={totalScore}
        scoreToPar={scoreToPar}
        courseDateLine={courseDateLine}
        grade={grade}
        mixLine={mixLine}
        filmstripHoles={filmstripHoles}
        holeMeta={holeMeta}
        shotsByHole={shotsByHole}
        playerId={playerId}
      />
      {shotsError ? (
        <p className="font-fw-sans text-caption italic text-text-tertiary">
          {`Couldn't load shots for this round (${shotsError}).`}
        </p>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
        {/* ONE AI narrative — V2 composed-review body preferred, V1 rule-based
            summary as the honest fallback. */}
        <Surface elevation="border" padding="md" className="h-full space-y-3 overflow-clip">
          <Eyebrow as="h2">The story</Eyebrow>
          <p className="font-fw-sans text-body leading-relaxed text-text-primary">{narrative}</p>
        </Surface>

        {/* NOTE: the old V1 "Where strokes went" RailBars block was removed
            (2026-07-23) — it showed a heuristic strokes-lost split (with
            non-SG buckets like "Course Management") whose numbers CONTRADICTED
            the authoritative per-shot Strokes-Gained tornado now leading this
            page (RoundSGSummary). One honest SG breakdown, not two rival ones. */}

        {/* What to do next — practice priority + add-focus-area + share. */}
        {(practicePriority || promoteSuggestion) ? (
          <Surface elevation="shadow" padding="md" className="h-full space-y-3 overflow-clip">
            <Eyebrow as="h2">What to do next</Eyebrow>
            {practicePriority ? <p className="font-fw-sans text-body-sm text-text-primary">{practicePriority}</p> : null}
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
          </Surface>
        ) : null}

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

        <div className="min-w-0">
          <CoachNotesSection reviewId={reviewId} initialNotes={coachNotes} canEdit={isCoachViewer} />
        </div>
      </div>

      {standingBars.length > 0 ? (
        <section className="space-y-3">
          <div>
            <Eyebrow as="h2">Where this sits</Eyebrow>
            <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">Season standing vs PGA Tour and the team.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{standingBars}</div>
        </section>
      ) : null}

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
          puttingRamp={puttingRamp}
          momentum={momentum}
          drivingPenaltyLines={drivingPenaltyLines}
          shortGameRows={shortGameRows}
        />
      </section>
    </div>
  );
}

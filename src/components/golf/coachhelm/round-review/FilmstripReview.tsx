'use client';

/**
 * ============================================================================
 * FilmstripReview — Round Review on the Spine & Stage filmstrip (Task 10)
 * ----------------------------------------------------------------------------
 * The composition root: `ReviewHero` (green panel + 18-hole `Filmstrip`) as
 * one hero unit, below it ONE AI narrative (V2 body preferred, V1 summary
 * fallback — the separate LLM opener card + the old A–F/highlights/areas
 * prose stack are retired), the strokes-lost `RailBars`, a "what to do next"
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
import { RailBars } from '@/components/fairway/modules';
import type { ShotInput } from '@/components/golf/coachhelm/v3/HoleShotPath/types';
import { StandingBar } from '@/components/golf/coachhelm/v3/StandingBar';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { PromoteToFocusAreaButton } from '@/components/golf/coachhelm/PromoteToFocusAreaButton';
import { CoachNotesSection } from '@/app/golf/(dashboard)/dashboard/rounds/[id]/review/CoachNotesSection';
import type { RoundReviewContent } from '@/app/golf/actions/round-review-system';
import { ReviewHero, type ReviewHoleMeta } from './ReviewHero';
import { ReviewBreakdown } from './ReviewBreakdown';
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
  buildStrokesLostRows,
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
}: FilmstripReviewProps) {
  const [shotsByHole, setShotsByHole] = useState<Map<number, ShotInput[]> | null>(null);
  const [shotsError, setShotsError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('golf_shots')
        .select(
          'hole_number, shot_number, lie_before, lie_after, distance_to_hole_before, distance_to_hole_after, miss_direction, is_penalty',
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
      const map = new Map<number, ShotInput[]>();
      for (const s of (data ?? []) as (ShotInput & { hole_number: number })[]) {
        const list = map.get(s.hole_number) ?? [];
        list.push(s);
        map.set(s.hole_number, list);
      }
      setShotsByHole(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId, supabase]);

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
  const strokesLostRows = useMemo(() => buildStrokesLostRows(review.strokesToGain), [review.strokesToGain]);
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
      <ReviewHero
        totalScore={totalScore}
        scoreToPar={scoreToPar}
        courseDateLine={courseDateLine}
        grade={grade}
        mixLine={mixLine}
        filmstripHoles={filmstripHoles}
        holeMeta={holeMeta}
        shotsByHole={shotsByHole}
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

        {strokesLostRows.length > 0 ? (
          <Surface elevation="shadow" padding="md" className="h-full space-y-3 overflow-clip">
            <Eyebrow as="h2">Where strokes went</Eyebrow>
            <RailBars rows={strokesLostRows} labelWidth={112} />
          </Surface>
        ) : null}

        {/* What to do next — practice priority + add-focus-area + share. */}
        {(practicePriority || promoteSuggestion) ? (
          <Surface elevation="shadow" padding="md" className="h-full space-y-3 overflow-clip">
            <Eyebrow as="h2">What to do next</Eyebrow>
            {practicePriority ? <p className="font-fw-sans text-body-sm text-text-primary">{practicePriority}</p> : null}
            <div className="flex flex-wrap items-center gap-2.5">
              {promoteSuggestion ? (
                <PromoteToFocusAreaButton
                  source="review"
                  sourceId={reviewId}
                  playerId={playerId}
                  suggestedTitle={promoteSuggestion.title}
                  suggestedDescription={promoteSuggestion.description}
                  suggestedAreaType={promoteSuggestion.areaType}
                  reviewContext={courseName || undefined}
                />
              ) : null}
              {!isCoachViewer ? (
                <Button variant="secondary" size="sm" onClick={onShare} disabled={sharedWithCoach}>
                  {sharedWithCoach ? 'Shared with coach' : 'Share with coach'}
                </Button>
              ) : null}
            </div>
          </Surface>
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

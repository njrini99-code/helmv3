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
 * notes, the season standing band, and ONE "Full breakdown" `DrillPanel`
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
import { Eyebrow, Surface, Button, PressTarget } from '@/components/fairway';
import { DrillPanel, RailBars } from '@/components/fairway/modules';
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
}: FilmstripReviewProps) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
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
  const narrative = useMemo(() => buildNarrative(review.summary, v2Body), [review.summary, v2Body]);
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
        />
      );
    }).filter((b): b is ReactElement => b !== null);
  }, [standing]);

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

      {/* ONE AI narrative — V2 composed-review body preferred, V1 rule-based
          summary as the honest fallback. */}
      <section>
        <Eyebrow as="h2">The story</Eyebrow>
        <p className="mt-2 font-fw-sans text-body text-text-primary">{narrative}</p>
      </section>

      {/* Strokes-lost RailBars — the single home for strokesToGain. */}
      {strokesLostRows.length > 0 ? (
        <Surface elevation="border" padding="sm" className="space-y-2.5">
          <Eyebrow as="h2">Where strokes went</Eyebrow>
          <RailBars rows={strokesLostRows} labelWidth={130} />
        </Surface>
      ) : null}

      {/* What to do next — practice priority + add-focus-area + share. */}
      {(practicePriority || promoteSuggestion) ? (
        <Surface elevation="border" padding="sm" className="space-y-3">
          <Eyebrow as="h2">What to do next</Eyebrow>
          {practicePriority ? (
            <p className="font-fw-sans text-body-sm text-text-primary">{practicePriority}</p>
          ) : null}
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
            <Button variant="secondary" size="sm" onClick={onShare} disabled={sharedWithCoach}>
              {sharedWithCoach ? 'Shared with coach' : 'Share with coach'}
            </Button>
          </div>
        </Surface>
      ) : null}

      {/* Coach notes. */}
      <CoachNotesSection reviewId={reviewId} initialNotes={coachNotes} canEdit={isCoachViewer} />

      {/* Season standing band. */}
      {standingBars.length > 0 ? (
        <section className="space-y-3">
          <div>
            <Eyebrow as="h2">Where this sits</Eyebrow>
            <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">
              Your season standing vs PGA Tour and your team.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{standingBars}</div>
        </section>
      ) : null}

      {/* Full breakdown — one door for the old nine accordions. */}
      {breakdownOpen ? (
        <DrillPanel title="Full breakdown" backLabel="Back to summary" onBack={() => setBreakdownOpen(false)}>
          <ReviewBreakdown
            frontBack={frontBack}
            puttingRamp={puttingRamp}
            momentum={momentum}
            drivingPenaltyLines={drivingPenaltyLines}
            shortGameRows={shortGameRows}
          />
        </DrillPanel>
      ) : (
        <PressTarget
          onClick={() => setBreakdownOpen(true)}
          aria-expanded={breakdownOpen}
          className="w-full rounded-fw-lg border border-border-subtle bg-surface px-5 py-3.5 text-left font-fw-sans text-body-sm font-semibold text-accent-700 transition-colors duration-150 hover:bg-surface-tint"
        >
          Full breakdown →
        </PressTarget>
      )}
    </div>
  );
}

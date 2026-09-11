'use client';

/**
 * ============================================================================
 * RoundReviewFieldSheet — Round review as a field sheet (round-review.v3.md)
 * ----------------------------------------------------------------------------
 * Composition per docs/design/fairway-facelift/LANGUAGE.md:
 *   1. Masthead, bare on the canvas: the round-review eyebrow with the course
 *      and date and the actions, the player's name as the title, one verdict
 *      sentence built from this round's own fields, a mono facts line.
 *   2. The stage, the one Surface: `HoleField` — a bar per hole off the par
 *      baseline with the cumulative line crossing the same box — beside a
 *      readouts column. A scorecard-only round has no holes, so the same
 *      instrument plots the player's recent rounds with this one marked.
 *   3. The ledger row, three bare columns on vertical hairlines: the story
 *      and the coach note, where the strokes went, and where the player sits
 *      against the team and the tour.
 *   4. The hole-by-hole table.
 *
 * Selection lives here, not inside the instrument: a stage column and a table
 * row are the same press target for the same hole, and both open the same
 * `HoleDetail` under the instrument. The `?hole=` parameter keeps a shared
 * link landing on the same open hole.
 *
 * Nothing on this page fabricates a number. Every clause, bar, tick and row
 * is dropped when the field behind it is null.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Surface, Button, IconButton, Menu, InlineNotice, Skeleton } from '@/components/fairway';
import { StandingBars } from '@/components/fairway/charts/StandingBars';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { IconMoreHorizontal, IconRefresh } from '@/components/icons';
import {
  FocusAreaModal,
  type FocusAreaModalSubmit,
} from '@/components/fairway/pages/coachhelm/FocusAreaModal';
import { createFocusAreaFromReview } from '@/app/golf/actions/development';
import {
  CoachNotesSection,
  hasCoachNotesContent,
} from '@/app/golf/(dashboard)/dashboard/rounds/[id]/review/CoachNotesSection';
import type {
  ComparisonAverages,
  RoundReviewContent,
  RoundReviewTrendRow,
} from '@/app/golf/actions/round-review-system';
import { buildReviewShotsByHole, type RawGolfShotRow, type ReviewShotInput } from './round-review-shots';
import { buildCourseDateLine, buildNarrative } from './buildReviewViewModel';
import { HoleDetail } from './HoleDetail';
import { HoleField, holeFieldCap } from './HoleField';
import { FieldLedger, HoleTable, LeakLedger, LedgerHead, StageReadouts, VerdictLine } from './round-review-parts';
import {
  buildFacts,
  buildLeakRows,
  buildReadouts,
  buildVerdict,
  cumulativeLine,
  hasFairwayRow,
  holeColumns,
  holeDeltasFromMomentum,
  nineDivider,
  seasonColumns,
} from './round-shape';
import { formatToPar } from '@/lib/golf/format-to-par';

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';
const STANDING_BAND_METRICS = ['gir_pct', 'sg_ott', 'sg_approach', 'sg_putting'] as const;

export interface PromoteSuggestion {
  title: string;
  description: string;
  areaType: string;
}

export interface RoundReviewFieldSheetProps {
  roundId: string;
  playerId: string;
  courseName: string;
  roundDate: string;
  /** Masthead title: the reviewed player's name. */
  playerLabel: string;
  /** "Qualifier" / "Tournament" / "Practice", or null when unset. */
  roundTypeLabel: string | null;
  totalScore: number | null;
  scoreToPar: number | null;
  totalPutts: number | null;
  fairwaysHit: number | null;
  fairwaysPlayed: number | null;
  gir: number | null;
  girPossible: number | null;
  review: RoundReviewContent;
  reviewId: string;
  sharedWithCoach: boolean;
  onShare: () => void;
  v2Body: string | null;
  isCoachViewer: boolean;
  coachNotes: string | null;
  promoteSuggestion: PromoteSuggestion | null;
  standing: Record<string, PlayerStanding>;
  standingLoading: boolean;
  /** The reviewed player's display name for the standing rows — omitted for a
   *  player viewing their own review, where `StandingBars` reads "You". */
  playerName?: string | null;
  /** The player's own recent averages, the only honest basis for the stage
   *  readouts' deltas. `null` while the fetch is in flight or it found none. */
  averages: ComparisonAverages | null;
  /** The player's recent rounds, which the degraded stage plots. */
  trendRounds: RoundReviewTrendRow[];
  trendLoading: boolean;
  /** True when at least one round-level Strokes Gained column is populated. */
  hasAnySG: boolean;
  onRecompute: () => void;
  recomputing: boolean;
  onOpenFullBreakdown: () => void;
}

export function RoundReviewFieldSheet({
  roundId,
  playerId,
  courseName,
  roundDate,
  playerLabel,
  roundTypeLabel,
  totalScore,
  scoreToPar,
  totalPutts,
  fairwaysHit,
  fairwaysPlayed,
  gir,
  girPossible,
  review,
  reviewId,
  sharedWithCoach,
  onShare,
  v2Body,
  isCoachViewer,
  coachNotes,
  promoteSuggestion,
  standing,
  standingLoading,
  playerName,
  averages,
  trendRounds,
  trendLoading,
  hasAnySG,
  onRecompute,
  recomputing,
  onOpenFullBreakdown,
}: RoundReviewFieldSheetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [shotsByHole, setShotsByHole] = useState<Map<number, ReviewShotInput[]> | null>(null);
  const [shotsError, setShotsError] = useState<string | null>(null);
  const [focusAreaModalOpen, setFocusAreaModalOpen] = useState(false);
  const [noteEditSignal, setNoteEditSignal] = useState(0);

  const initialHole = useMemo(() => {
    const raw = searchParams.get('hole');
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);
  const [selectedHole, setSelectedHole] = useState<number | null>(initialHole);

  const holes = review.holeByHole;
  const hasHoles = holes.length > 0;

  // A different round under the same mount drops any stale selection.
  useEffect(() => {
    setSelectedHole(initialHole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const setHoleParam = useCallback(
    (hole: number | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (hole == null) next.delete('hole');
      else next.set('hole', String(hole));
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  const selectHole = useCallback(
    (hole: number) => {
      setSelectedHole((current) => {
        const next = current === hole ? null : hole;
        setHoleParam(next);
        return next;
      });
    },
    [setHoleParam],
  );

  const closeHole = useCallback(() => {
    setSelectedHole(null);
    setHoleParam(null);
  }, [setHoleParam]);

  /* ── The per-hole shot ledger ─────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Per-team SG baseline scale (women's, NCAA D1/D2/D3, etc.) — the SAME
      // `sg_scale_for_player` RPC the round's own `strokes_gained_*` cache is
      // resolved with, so a shot's `sg` here agrees with it. Failure-silent:
      // falls back to unscaled rather than blocking the shot fetch.
      let sgScale = 1;
      try {
        const { data: sgScaleRaw } = await supabase.rpc('sg_scale_for_player', { p_player_id: playerId });
        if (typeof sgScaleRaw === 'number' && sgScaleRaw > 0) sgScale = sgScaleRaw;
      } catch {
        // Keep the unscaled default — see above.
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
      setShotsByHole(buildReviewShotsByHole((data ?? []) as unknown as RawGolfShotRow[], sgScale));
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId, playerId, supabase]);

  /* ── The stage ────────────────────────────────────────────────────────── */
  // Gated on the holes the instrument and table actually draw, not on
  // `momentumData` alone: a scorecard-only round whose stored review still
  // carries stale momentum must produce no stretch and no cost clause.
  const deltas = useMemo(
    () => (hasHoles ? holeDeltasFromMomentum(review.momentumData) : []),
    [hasHoles, review.momentumData],
  );
  const columns = useMemo(() => holeColumns(holes), [holes]);
  const line = useMemo(
    () => (hasHoles ? cumulativeLine(review.momentumData, holes.map((h) => h.hole)) : null),
    [hasHoles, review.momentumData, holes],
  );
  const divider = useMemo(() => nineDivider(holes, review.frontBackSplit), [holes, review.frontBackSplit]);
  const seasonShape = useMemo(() => seasonColumns(trendRounds, roundId), [trendRounds, roundId]);
  const stageColumns = hasHoles ? columns : seasonShape;
  const cap = useMemo(() => holeFieldCap(stageColumns), [stageColumns]);
  const showFairwayRow = hasHoles && hasFairwayRow(holes);
  const showGirRow = hasHoles && holes.some((h) => h.gir != null);

  const readouts = useMemo(
    () =>
      buildReadouts({
        totalScore,
        scoreToPar,
        totalPutts,
        gir,
        girPossible,
        fairwaysHit,
        fairwaysPlayed,
        averages,
        onePutts: hasHoles ? review.puttingBreakdown.onePuttCount : null,
        threePutts: hasHoles ? review.puttingBreakdown.threePuttHoles.length : null,
      }),
    [
      totalScore,
      scoreToPar,
      totalPutts,
      gir,
      girPossible,
      fairwaysHit,
      fairwaysPlayed,
      averages,
      hasHoles,
      review.puttingBreakdown,
    ],
  );

  /* ── The masthead ─────────────────────────────────────────────────────── */
  const verdict = useMemo(
    () => buildVerdict({ totalScore, scoreToPar, courseName, deltas, strokesToGain: review.strokesToGain }),
    [totalScore, scoreToPar, courseName, deltas, review.strokesToGain],
  );
  const facts = useMemo(
    () =>
      buildFacts({
        totalPutts,
        fairwaysHit,
        fairwaysPlayed,
        gir,
        girPossible,
        penalties: hasHoles ? review.penaltyAnalysis.total : null,
      }),
    [totalPutts, fairwaysHit, fairwaysPlayed, gir, girPossible, hasHoles, review.penaltyAnalysis.total],
  );
  const courseDateLine = useMemo(() => buildCourseDateLine(courseName, roundDate), [courseName, roundDate]);

  /* ── The ledger ───────────────────────────────────────────────────────── */
  const narrative = useMemo(
    () => buildNarrative(review.summary, v2Body, review.deepInsights?.[0]?.body),
    [review.summary, review.deepInsights, v2Body],
  );
  const leakRows = useMemo(() => buildLeakRows(review.strokesToGain), [review.strokesToGain]);

  const standingRows = useMemo(() => {
    const viewerContext: 'self' | 'coach' = isCoachViewer ? 'coach' : 'self';
    return STANDING_BAND_METRICS.map((mid): { id: string; node: ReactNode } | null => {
      const st = standing[mid];
      const cfg = getMetricRenderConfig(mid);
      if (!st || !cfg) return null;
      return {
        id: mid,
        node: (
          <StandingBars
            frame="bare"
            layout="compact"
            size="sm"
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
    }).filter((row): row is { id: string; node: ReactNode } => row !== null);
  }, [standing, isCoachViewer, playerName]);

  async function handlePromoteFocusArea(payload: FocusAreaModalSubmit): Promise<{ success: boolean; error?: string }> {
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

  const selectedShots = selectedHole != null ? shotsByHole?.get(selectedHole) ?? null : null;
  const selectedMeta = selectedHole != null ? holes.find((h) => h.hole === selectedHole) ?? null : null;

  return (
    <div className="flex w-full min-w-0 flex-col">
      {/* ── 1 · Masthead ───────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p data-slot="masthead-eyebrow" className={OVERLINE}>
            Round review
            {roundTypeLabel ? (
              <>
                {' '}
                <span aria-hidden="true">·</span> {roundTypeLabel}
              </>
            ) : null}
            {courseDateLine ? (
              <>
                {' '}
                <span aria-hidden="true">·</span> {courseDateLine}
              </>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <Menu
              ariaLabel="Round review actions"
              align="end"
              trigger={
                <IconButton variant="secondary" size="md" aria-label="More actions">
                  <IconMoreHorizontal size={18} />
                </IconButton>
              }
            >
              <Menu.Item onSelect={() => onOpenFullBreakdown()}>Full breakdown</Menu.Item>
              <Menu.Item onSelect={() => router.push(`/golf/dashboard/rounds/${roundId}`)}>Open scorecard</Menu.Item>
              <Menu.Separator />
              <Menu.Item icon={<IconRefresh size={16} />} onSelect={() => onRecompute()}>
                Recompute
              </Menu.Item>
            </Menu>
            {isCoachViewer ? (
              <Button variant="primary" onClick={() => setNoteEditSignal((n) => n + 1)}>
                Add note
              </Button>
            ) : (
              <Button variant="primary" onClick={onShare} disabled={sharedWithCoach}>
                {sharedWithCoach ? 'Shared with coach' : 'Share with coach'}
              </Button>
            )}
          </div>
        </div>
        <h1 className="font-fw-display text-h1 text-text-primary md:text-display">{playerLabel}</h1>
        <VerdictLine parts={verdict} />
        {facts.length > 0 ? (
          <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1 font-fw-mono text-caption tabular-nums text-text-tertiary">
            {facts.map((fact, i) => (
              <span key={fact}>
                {i > 0 ? (
                  <span aria-hidden="true" className="mr-3">
                    ·
                  </span>
                ) : null}
                {fact}
              </span>
            ))}
          </p>
        ) : null}
      </header>

      {/* ── 2 · The stage ──────────────────────────────────────────────── */}
      <Surface as="section" aria-label="Round shape" elevation="border" padding="none" className="mt-10 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border-subtle px-5 py-4 md:px-6">
          <div className="flex min-w-0 flex-col gap-1">
            <p className={OVERLINE}>{hasHoles ? 'The round' : 'Recent rounds'}</p>
            <h2 className="font-fw-display text-h2 text-text-primary">
              {hasHoles ? 'Round shape' : 'Season trajectory'}
            </h2>
            <p className="max-w-[64ch] font-fw-sans text-caption text-text-tertiary">
              {hasHoles
                ? `Each hole against par, over in amber and under in green, scale ±${cap}. The line is the round's running total on its own scale.`
                : 'Score to par for this player’s recent rounds, with this one marked. The hole-by-hole read unlocks when holes are entered for this round.'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_15rem] lg:divide-x lg:divide-border-subtle">
          <div className="order-2 flex min-w-0 flex-col justify-center px-5 py-5 md:px-6 lg:order-1">
            {hasHoles ? (
              <HoleField
                columns={stageColumns}
                cap={cap}
                line={line}
                lineLabel={line ? formatToPar(line.last) : null}
                divider={divider}
                selectedKey={selectedHole != null ? String(selectedHole) : null}
                onSelect={(key) => selectHole(Number(key))}
                showFairwayRow={showFairwayRow}
                showGirRow={showGirRow}
                ariaLabel="Score against par, hole by hole"
              />
            ) : trendLoading ? (
              <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
                <span className="sr-only">Loading recent rounds…</span>
                <Skeleton className="h-12 w-full rounded-fw-sm" />
                <Skeleton className="h-3 w-40" />
              </div>
            ) : stageColumns.length > 0 ? (
              <HoleField columns={stageColumns} cap={cap} ariaLabel="Score to par by round" denseLabels />
            ) : (
              <p className="font-fw-sans text-body-sm text-text-tertiary">
                Scorecard only, and there are not enough other rounds yet to draw a trajectory. Enter this round&rsquo;s
                holes to unlock the hole-by-hole read.
              </p>
            )}
            {shotsError ? (
              <p className="mt-3 font-fw-sans text-caption italic text-text-tertiary">
                {`Couldn't load shots for this round (${shotsError}).`}
              </p>
            ) : null}
          </div>
          <div className="order-1 border-b border-border-subtle px-5 py-4 md:px-6 md:py-5 lg:order-2 lg:border-b-0">
            <StageReadouts items={readouts} />
          </div>
        </div>
        {selectedHole != null && selectedShots && selectedShots.length > 0 ? (
          <HoleDetail
            hole={selectedHole}
            par={selectedMeta?.par ?? null}
            yardage={null}
            score={selectedMeta?.score ?? null}
            shots={selectedShots}
            playerId={playerId}
            onClose={closeHole}
          />
        ) : selectedHole != null && shotsByHole != null ? (
          <p className="border-t border-border-subtle px-5 py-3 font-fw-sans text-caption text-text-tertiary md:px-6">
            No shots were logged for hole {selectedHole}, so there is no shot path to show.
          </p>
        ) : null}
      </Surface>

      {/* ── 3 · The ledger row ─────────────────────────────────────────── */}
      <div className="mt-12 grid grid-cols-1 divide-y divide-border-subtle lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        <section aria-label="The story" className="flex flex-col gap-3 py-8 first:pt-0 lg:col-span-5 lg:py-0 lg:pr-8">
          <LedgerHead title="The story" />
          <p className="font-fw-sans text-body leading-relaxed text-text-primary">{narrative}</p>
          {promoteSuggestion ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="secondary" size="sm" onClick={() => setFocusAreaModalOpen(true)}>
                {isCoachViewer ? 'Prescribe focus area' : 'Add focus area'}
              </Button>
            </div>
          ) : null}
          {hasCoachNotesContent(isCoachViewer, coachNotes) ? (
            <div className="border-t border-border-subtle pt-4">
              <CoachNotesSection
                reviewId={reviewId}
                initialNotes={coachNotes}
                canEdit={isCoachViewer}
                editSignal={noteEditSignal}
              />
            </div>
          ) : null}
        </section>

        <section aria-label="Where it went" className="flex flex-col gap-3 py-8 lg:col-span-4 lg:py-0 lg:px-8">
          <LedgerHead title="Where it went" note="Strokes to gain" />
          <LeakLedger
            rows={leakRows}
            empty="No strokes-to-gain breakdown was computed for this round."
          />
        </section>

        <section aria-label="Against the field" className="flex flex-col gap-3 py-8 last:pb-0 lg:col-span-3 lg:py-0 lg:pl-8">
          <LedgerHead title="Against the field" />
          {!hasAnySG ? (
            <p className="font-fw-sans text-body-sm text-text-tertiary">
              Strokes gained was not computed for this round.
            </p>
          ) : standingLoading ? (
            <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
              <span className="sr-only">Loading season standing…</span>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2 w-full" />
            </div>
          ) : (
            <FieldLedger
              rows={standingRows}
              fallback="Season standing isn’t available yet. It fills in once enough rounds are logged."
            />
          )}
        </section>
      </div>

      {/* ── 4 · Hole by hole ───────────────────────────────────────────── */}
      {hasHoles ? (
        <section aria-label="Hole by hole" className="mt-10 flex flex-col gap-3">
          <LedgerHead title="Hole by hole" note={`${holes.length} holes`} />
          <HoleTable holes={holes} selectedHole={selectedHole} onSelect={selectHole} />
        </section>
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

      {recomputing ? (
        <div className="mt-8">
          <InlineNotice tone="info" title="Recomputing this review">
            CoachHelm is rebuilding this round&rsquo;s analysis. The page updates when it finishes.
          </InlineNotice>
        </div>
      ) : null}

      {/* The link out sits quiet at the end rather than competing with the
          masthead's own primary action. */}
      <div className="mt-8 flex justify-end">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/golf/dashboard/stats?player=${playerId}`}>All stats</Link>
        </Button>
      </div>
    </div>
  );
}

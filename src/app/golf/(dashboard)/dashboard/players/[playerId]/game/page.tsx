/**
 * Player Game Fingerprint — coach scouting-report view.
 *
 * GOLF IA REORG (final_migrations #11) — this is now the CANONICAL coach
 * per-player deep-dive. It fetches BOTH the fingerprint data (the original
 * Wave 2 content below) and the insight/pattern/prediction data that used to
 * live at the standalone /players/[playerId] route (now a redirect shim
 * here), and hands both to <PlayerDeepDiveTabs> — a client tab switcher that
 * renders one or the other with zero extra round-trips:
 *
 *   Game Fingerprint (default) — Hero → Tee → Approach → Short Game →
 *     Putting → Scoring → Pressure → Trend. A coach opens this to prep for a
 *     1:1 with the player. Every section is evidence-backed — insights
 *     pre-joined to their drills via `getPlayerFingerprint`.
 *
 *   Scouting Report (`?tab=scouting`) — the narrative coaching story
 *     (verdict, standing, where-to-focus, plan, tracking) formerly rendered
 *     standalone by FairwayPlayerInsight. Content moved unchanged; only its
 *     outer shell became conditional (see FairwayPlayerInsight's `embedded`
 *     prop).
 *
 * Print-optimized variant lives at `/players/[playerId]/game/print`.
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import { isUuid } from '@/lib/utils/uuid';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { getPlayerFingerprint } from '@/app/golf/actions/player-fingerprint';
import { getThemesForCoach } from '@/app/golf/actions/insight-delivery';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { getPlayerTrendAnalysis } from '@/app/golf/actions/coachhelm-data';
import { getPlayerTrajectory } from '@/app/golf/actions/insights';
import { logServerError } from '@/lib/server-error-logger';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { fairwayScope } from '@/lib/redesign/flag';
import { computeCompositeRating } from '@/lib/coachhelm/composite-rating';
import { isFlagEnabled } from '@/lib/flags';
import {
  buildRollingDistanceProfileScope,
  describeDistanceProfileWindow,
} from '@/lib/coachhelm/v3/metrics/distance-profile-window';
import { loadDistanceProfile } from '@/lib/coachhelm/v3/metrics/load-distance-profile';
import { computeDistanceProfile } from '@/lib/coachhelm/v3/metrics/distance-profile';
import { buildDistanceProfileViewModel } from '@/components/golf/coachhelm/game-fingerprint/distance-profile/buildDistanceProfileViewModel';
import { DistanceProfileSection } from '@/components/golf/coachhelm/game-fingerprint/distance-profile/DistanceProfileSection';
import { loadParOpportunities } from '@/lib/coachhelm/v3/metrics/load-par-opportunities';
import { computeParOpportunities } from '@/lib/coachhelm/v3/metrics/par-opportunities';
import type { MetricResult } from '@/lib/coachhelm/v3/metrics/types';
import { loadPlayerContext } from '@/lib/coachhelm/v3/context/load-player-context';
import type { AnalysisScope, HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import { buildScoringViewModel } from '@/components/golf/coachhelm/game-fingerprint/scoring/buildScoringViewModel';
import { ScoringSection } from '@/components/golf/coachhelm/game-fingerprint/scoring/ScoringSection';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { PlayerDeepDiveTabs } from './PlayerDeepDiveTabs';
import type { FairwayPlayerInsightProps } from '@/components/fairway/pages/coachhelm/FairwayPlayerInsight';
import type { Database } from '@/lib/types/database';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Addendum §13 A7 slice 1 — best-effort load of the distance-profile
 * surface for the Approach section. Flag-gated (`coachhelm_a7_distance_profile_surface`,
 * default off) and isolated in its own try/catch: this is one extra panel
 * on an already-dense page, and its failure must never take down the
 * fingerprint/scouting spine above. Reuses the page's own SESSION-scoped
 * `supabase` client (never an admin client) so RLS still applies exactly
 * as it does for every other query on this page.
 */
export async function loadDistanceProfileAddendum(
  playerId: string,
  supabase: SupabaseClient<Database>,
): Promise<ReactNode | null> {
  try {
    const scope = buildRollingDistanceProfileScope(playerId);
    const results = await loadDistanceProfile(scope, { supabase });
    const sections = buildDistanceProfileViewModel(results);
    const windowLabel = describeDistanceProfileWindow(scope);
    return <DistanceProfileSection sections={sections} windowLabel={windowLabel} />;
  } catch (err) {
    void logServerError(
      `[player game page] distance-profile load failed for ${playerId}: ${describeError(err)}`,
      { action: 'players.gamePage.distanceProfile', featureArea: 'coachhelm' },
      'warning',
    );
    return null;
  }
}

/**
 * Flag gate, pulled out of the `Promise.all` array so it's directly
 * testable: `enabled: false` must never call `loadDistanceProfileAddendum`
 * at all (not just skip rendering its result), and `loadDistanceProfileAddendum`
 * always resolves (never rejects) since its own try/catch already degrades a
 * throw to `null` — this wrapper adds no new failure mode of its own.
 */
export function loadDistanceProfileAddendumIfEnabled(
  enabled: boolean,
  playerId: string,
  supabase: SupabaseClient<Database>,
): Promise<ReactNode | null> {
  return enabled ? loadDistanceProfileAddendum(playerId, supabase) : Promise.resolve(null);
}

/**
 * Resolves a par-5 opportunity row's `dimensions.course_id` against
 * `golf_courses.name`, chunked at 200 ids per the project's PostgREST
 * URL-length convention. Its OWN try/catch (#2010 review, SHOULD 2): a
 * failure here must not take down the whole Scoring section — the
 * par-length/par-5 numbers themselves already loaded fine, and
 * `buildScoringViewModel`'s `ScoringPar5HoleViewModel.courseLabel` already
 * falls back to a short id fragment for any `course_id` this map doesn't
 * cover (its own `fallbackCourseLabel`), so an empty/partial map here still
 * renders every par section — only the course-distinguishing label
 * degrades, not the data.
 */
async function resolveCourseNames(
  results: readonly MetricResult[],
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<Record<string, string>> {
  const courseNameById: Record<string, string> = {};
  try {
    const courseIds = [
      ...new Set(
        results
          .map((r) => r.dimensions.course_id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    for (const chunk of chunkIds(courseIds)) {
      if (chunk.length === 0) continue;
      const { data, error } = await supabase.from('golf_courses').select('id, name').in('id', chunk);
      if (error) throw error;
      for (const c of data ?? []) courseNameById[c.id] = c.name;
    }
  } catch (err) {
    void logServerError(
      `[player game page] golf_courses name lookup failed for ${playerId}: ${describeError(err)}`,
      { action: 'players.gamePage.scoringCourseNames', featureArea: 'coachhelm' },
      'warning',
    );
    // Falls through with whatever courseNameById already has (possibly
    // empty) — the par sections still render, just without every course
    // label resolved.
  }
  return courseNameById;
}

/**
 * Addendum §13 A7 slice 2 — best-effort load of the Scoring surface
 * (par/length + par-5 opportunities). Same shape as
 * `loadDistanceProfileAddendum` above: flag-gated
 * (`coachhelm_a7_scoring_surface`, default off), its own try/catch so a
 * failure here never takes down the fingerprint/scouting spine, and the
 * page's own session-scoped `supabase` client (never admin). Exported (not
 * just internal) so `loadScoringAddendumIfEnabled` below is directly
 * unit-testable, mirroring `loadDistanceProfileAddendum`.
 */
export async function loadScoringAddendum(
  playerId: string,
  supabase: SupabaseClient<Database>,
): Promise<ReactNode | null> {
  try {
    const scope = buildRollingDistanceProfileScope(playerId);
    const results = await loadParOpportunities(scope, { supabase });
    const courseNameById = await resolveCourseNames(results, supabase, playerId);
    const viewModel = buildScoringViewModel(results, courseNameById);
    const windowLabel = describeDistanceProfileWindow(scope);
    return <ScoringSection viewModel={viewModel} windowLabel={windowLabel} />;
  } catch (err) {
    void logServerError(
      `[player game page] scoring surface load failed for ${playerId}: ${describeError(err)}`,
      { action: 'players.gamePage.scoring', featureArea: 'coachhelm' },
      'warning',
    );
    return null;
  }
}

/**
 * Flag gate, mirroring `loadDistanceProfileAddendumIfEnabled` above:
 * `enabled: false` must never call `loadScoringAddendum` at all.
 */
export function loadScoringAddendumIfEnabled(
  enabled: boolean,
  playerId: string,
  supabase: SupabaseClient<Database>,
): Promise<ReactNode | null> {
  return enabled ? loadScoringAddendum(playerId, supabase) : Promise.resolve(null);
}

/** Builds the DistanceProfileSection addendum from an ALREADY-LOADED
 *  `{scope, shots, holes}` — the shared-context half of
 *  `loadDistanceProfileAndScoringAddenda` below. Its own try/catch: a bug in
 *  `computeDistanceProfile`/the view-model builder must not take down the
 *  Scoring addendum computed from the same shared context. */
function renderDistanceProfileFromContext(
  scope: AnalysisScope,
  shots: ShotFact[],
  holes: HoleContext[],
  playerId: string,
): ReactNode | null {
  try {
    const results = computeDistanceProfile(shots, scope, holes);
    const sections = buildDistanceProfileViewModel(results);
    const windowLabel = describeDistanceProfileWindow(scope);
    return <DistanceProfileSection sections={sections} windowLabel={windowLabel} />;
  } catch (err) {
    void logServerError(
      `[player game page] distance-profile render failed for ${playerId} (shared context): ${describeError(err)}`,
      { action: 'players.gamePage.distanceProfile', featureArea: 'coachhelm' },
      'warning',
    );
    return null;
  }
}

/** Scoring counterpart to `renderDistanceProfileFromContext` above — same
 *  shared-context input, same own-try/catch isolation. */
async function renderScoringFromContext(
  scope: AnalysisScope,
  shots: ShotFact[],
  holes: HoleContext[],
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<ReactNode | null> {
  try {
    const results = computeParOpportunities(shots, holes, scope);
    const courseNameById = await resolveCourseNames(results, supabase, playerId);
    const viewModel = buildScoringViewModel(results, courseNameById);
    const windowLabel = describeDistanceProfileWindow(scope);
    return <ScoringSection viewModel={viewModel} windowLabel={windowLabel} />;
  } catch (err) {
    void logServerError(
      `[player game page] scoring render failed for ${playerId} (shared context): ${describeError(err)}`,
      { action: 'players.gamePage.scoring', featureArea: 'coachhelm' },
      'warning',
    );
    return null;
  }
}

/**
 * Entry point for BOTH A7 per-player addenda (#2010 review, SHOULD 3). With
 * only one flag on, this is a thin pass-through to that addendum's own
 * existing loader above — unchanged behavior, unchanged failure isolation.
 * With BOTH flags on, `loadPlayerContext` previously ran TWICE for the
 * exact same window (once inside `loadDistanceProfile`, once inside
 * `loadParOpportunities`) — a known, accepted-at-the-time cost documented
 * at this function's former call site. This version calls it ONCE, with
 * one shared `now`/scope, and feeds the same `{shots, holes}` straight to
 * `computeDistanceProfile` and `computeParOpportunities`. Each surface
 * keeps its OWN failure isolation on top of that shared read (see
 * `renderDistanceProfileFromContext`/`renderScoringFromContext`) — only the
 * single shared `loadPlayerContext` call is common, and its own failure
 * legitimately degrades both (there is no shot/hole data for either
 * surface without it).
 */
export async function loadDistanceProfileAndScoringAddenda(
  distanceProfileEnabled: boolean,
  scoringEnabled: boolean,
  playerId: string,
  supabase: SupabaseClient<Database>,
): Promise<{ distanceProfile: ReactNode | null; scoring: ReactNode | null }> {
  if (!(distanceProfileEnabled && scoringEnabled)) {
    const [distanceProfile, scoring] = await Promise.all([
      loadDistanceProfileAddendumIfEnabled(distanceProfileEnabled, playerId, supabase),
      loadScoringAddendumIfEnabled(scoringEnabled, playerId, supabase),
    ]);
    return { distanceProfile, scoring };
  }

  try {
    const scope = buildRollingDistanceProfileScope(playerId);
    const { shots, holes } = await loadPlayerContext(scope, { supabase });
    const [distanceProfile, scoring] = await Promise.all([
      renderDistanceProfileFromContext(scope, shots, holes, playerId),
      renderScoringFromContext(scope, shots, holes, supabase, playerId),
    ]);
    return { distanceProfile, scoring };
  } catch (err) {
    void logServerError(
      `[player game page] shared A7 player-context load failed for ${playerId}: ${describeError(err)}`,
      { action: 'players.gamePage.a7SharedContext', featureArea: 'coachhelm' },
      'warning',
    );
    return { distanceProfile: null, scoring: null };
  }
}

export const metadata: Metadata = {
  title: 'Game Fingerprint | Helm Golf',
  description:
    "Scouting report for a player's game — tee, approach, short game, putting, scoring, pressure, and trend.",
};

export const revalidate = 60;

// ---------------------------------------------------------------------------
// Types for the Scouting Report data fetched on this page (unchanged from the
// former /players/[playerId] route — moved, not rewritten).
// ---------------------------------------------------------------------------

interface PlayerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
}

interface RoundRow {
  id: string;
  created_at: string;
  round_date: string | null;
  total_score: number | null;
  holes_played: number | null;
  course_name: string | null;
  score_to_par: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_gir_possible: number | null;
}

interface PatternRow {
  id: string;
  pattern_type: string | null;
  /**
   * Derived client-side from metadata.description (the column `name`
   * and top-level `description` do not exist in live schema).
   */
  name: string | null;
  description: string | null;
  severity: string | null;
  stroke_impact: number | null;
  /** Live column name is `lifecycle_state` (not `lifecycle_stage`). */
  lifecycle_state: string | null;
  /** Live column name is `first_detected` (not `first_detected_at`). */
  first_detected: string | null;
  is_active: boolean | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface InsightRow {
  id: string;
  title: string | null;
  content: string | null;
  /** Derived client-side — no dedicated `tone` column in live schema. */
  tone: string | null;
  /** Derived client-side from metadata when present. */
  confidence: number | null;
  dismissed: boolean | null;
  /** Live schema stores acknowledgement via `acknowledged_at` timestamp. */
  acknowledged: boolean | null;
  created_at: string;
}

interface FocusAreaRow {
  id: string;
  title: string | null;
  area_type: string | null;
  status: string | null;
  current_value: number | null;
  target_value: number | null;
  baseline_value: number | null;
  target_metric: string | null;
  created_at: string;
}

interface PredictionRow {
  id: string;
  /**
   * Replaces the phantom `prediction_type` + `title` fields. `metric` is
   * the live schema's descriptor; formatMetricLabel() turns it into a
   * human-readable title client-side.
   */
  metric: string | null;
  predicted_value: number | null;
  confidence: number | null;
  trend: string | null;
  due_date: string | null;
  prediction_context: Record<string, unknown> | null;
  related_round_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function PlayerGamePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  if (!isUuid(playerId)) notFound();

  // Coach-only surface. Players hit the legacy Hub/CoachHelm views.
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  const { coach } = session;
  if (!coach) redirect('/golf/dashboard');

  // Scope to the coach's ACTIVE team (cookie-resolved) — shared by both the
  // fingerprint and the (absorbed) Scouting Report data below. Without this
  // gate, getPlayerFingerprint's any-staffed-team access would let a coach
  // open the deep-dive for a player on a non-active team — inconsistent with
  // the rest of the surface.
  const supabase = await createClient();
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  if (!teamId) redirect('/golf/dashboard/roster');

  const { data: membership, error: membershipError } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .maybeSingle();

  // A failed read is not "this player is not on your team". Left unchecked,
  // this returned a 404 for a player the coach had just clicked on their own
  // roster — the most confusing thing this page can do, because the roster
  // right behind it still lists them. There is an error boundary at
  // (dashboard)/dashboard/error.tsx, so throwing shows "something went wrong,
  // try again" instead. notFound() still fires for a genuine non-member.
  if (membershipError) {
    void logServerError(
      `[player game page] membership read failed for ${playerId}: ${describeError(membershipError)}`,
      { action: 'players.gamePage', featureArea: 'roster' },
      'warning',
    );
    throw new Error("Couldn't confirm this player is on your team. Please try again.");
  }
  if (!membership) notFound();

  // ---------------------------------------------------------------------
  // Fetch fingerprint data + the former /players/[playerId] Scouting
  // Report data in parallel — ONE round trip for both tabs, so switching
  // between them client-side is instant.
  // ---------------------------------------------------------------------
  const distanceProfileEnabled = isFlagEnabled('coachhelm_a7_distance_profile_surface');
  const scoringSurfaceEnabled = isFlagEnabled('coachhelm_a7_scoring_surface');

  const [
    fingerprint,
    playerResult,
    roundsResult,
    patternsResult,
    insightsResult,
    focusAreasResult,
    predictionsResult,
    themesResult,
    countsRes,
    trendRes,
    trajectoryRes,
    a7Addenda,
  ] = await Promise.all([
    getPlayerFingerprint(playerId),

    // Player profile
    supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url, graduation_year, handicap')
      .eq('id', playerId)
      .maybeSingle(),

    // Recent rounds (last 10)
    supabase
      .from('golf_rounds')
      .select('id, created_at, round_date, total_score, holes_played, course_name, score_to_par, total_fairways_hit, total_gir, total_putts, total_fairways, total_gir_possible')
      .eq('player_id', playerId)
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(10),

    // Active patterns — cap to the 8 most impactful to avoid rendering
    // thousands of low-signal/contextual rows from historical mining.
    supabase
      .from('golf_patterns_v2')
      .select('id, pattern_type, severity, stroke_impact, lifecycle_state, first_detected, is_active, created_at, metadata')
      .eq('player_id', playerId)
      .eq('is_active', true)
      .order('stroke_impact', { ascending: true })
      .limit(8),

    // Insights (not dismissed). `tone` + `acknowledged` columns don't
    // exist on live schema — they're derived from metadata / acknowledged_at
    // in the client component. Apply the SAME shared product-visibility
    // contract (P2 legacy-surface): this SSR fetch feeds the flag-off
    // PlayerInsightClient, so it must not surface stale v2 phantoms or
    // archived/tentative rows. (In the redesign branch FairwayPlayerInsight
    // re-fetches via the already-filtered getInsightsForCoach.)
    applyInsightVisibility(
      supabase
        .from('golf_coach_insights')
        .select('id, title, content, metadata, dismissed, acknowledged_at, created_at')
        .eq('player_id', playerId)
        .eq('dismissed', false),
    )
      .order('created_at', { ascending: false })
      .limit(20),

    // Focus areas
    supabase
      .from('golf_player_focus_areas')
      .select(
        'id, title, area_type, status, current_value, target_value, baseline_value, target_metric, created_at',
      )
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),

    // Predictions — fetch a wider window so we can dedupe to one row per
    // metric (otherwise the seed engine produces many "Score To Par"
    // duplicates that all render as identical cards). Recency-bounded: dedupe
    // takes the newest per metric, but a months-old "newest" would otherwise
    // surface forever (the stale-row pattern closed elsewhere) — only show
    // predictions generated in the last 90 days; older → honestly absent.
    supabase
      .from('golf_predictions')
      .select('id, metric, predicted_value, confidence, trend, due_date, prediction_context, related_round_id, created_at')
      .eq('player_id', playerId)
      .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(40),

    // Hierarchical THEME scaffold for the redesigned coach surface. Per-player.
    // Degrades to null (→ []) on any failure so it never errors the page — but LOGS
    // the failure so a real load/auth/query regression is observable, not silent.
    getThemesForCoach({ player_id: playerId }).catch((err) => {
      void logServerError(
        `player game-deep-dive themes fetch failed (continuing without themes): ${describeError(err)}`,
        { action: 'players-game-page.getThemesForCoach', featureArea: 'insights', playerId },
      ).catch(() => undefined);
      return null;
    }),

    // These used to run only after every fingerprint/scouting query above had
    // finished, adding an avoidable second loading phase to an already dense
    // page. They are independent, so start them with the rest of the batch.
    getAlertCounts(coach.id),
    getPlayerTrendAnalysis(playerId).catch(() => null),

    // #1485 — TrajectoryForecaster's first consumer. Best-effort: any THROWN
    // failure degrades to `undefined` below (TrajectoryCard's neutral
    // "unavailable" state) — a returned `{success:false, insufficientHistory}`
    // is a normal, expected outcome, not an error, and is handled separately
    // where `trajectory` is computed below.
    getPlayerTrajectory(playerId).catch((err) => {
      void logServerError(
        `player game-deep-dive trajectory fetch failed (continuing without it): ${describeError(err)}`,
        { action: 'players-game-page.getPlayerTrajectory', featureArea: 'coachhelm', playerId },
      ).catch(() => undefined);
      return undefined;
    }),

    // Addendum §13 A7 slices 1+2 (#2010 review, SHOULD 3) — one entry
    // point for both per-player addenda. Each is still independently
    // flag-gated and independently best-effort (its own try/catch +
    // logServerError, degrading to `null`, never a thrown page error);
    // with BOTH flags on, this also shares a single `loadPlayerContext`
    // call instead of one per addendum. See its own doc comment.
    loadDistanceProfileAndScoringAddenda(distanceProfileEnabled, scoringSurfaceEnabled, playerId, supabase),
  ]);

  const { distanceProfile: distanceProfileAddendum, scoring: scoringAddendum } = a7Addenda;

  if (!fingerprint) notFound();

  // Every `?? []` and `?? null` below turns a FAILED read into an empty one,
  // and this page is where a coach decides what to work on with a player. An
  // empty patterns list reads as "nothing wrong", an empty rounds list as
  // "hasn't played", and neither is retractable once the coach has acted on it.
  //
  // The profile and the rounds are the spine of both tabs — without them the
  // page is not a degraded view, it is a wrong one, so those throw to the error
  // boundary. The analysis panels are additive: they degrade, but loudly, so a
  // silent stretch shows up in Bridge rather than as a coach wondering why
  // CoachHelm has stopped noticing anything.
  const spineFailure = playerResult.error ?? roundsResult.error ?? null;
  if (spineFailure) {
    void logServerError(
      `[player game page] profile/rounds read failed for ${playerId}: ${describeError(spineFailure)}`,
      { action: 'players.gamePage', featureArea: 'stats' },
      'error',
    );
    throw new Error("Couldn't load this player's game. Please try again.");
  }

  for (const [label, failed] of [
    ['patterns', patternsResult.error],
    ['insights', insightsResult.error],
    ['focus areas', focusAreasResult.error],
    ['predictions', predictionsResult.error],
    ['themes', themesResult?.error ?? null],
  ] as const) {
    if (!failed) continue;
    void logServerError(
      `[player game page] ${label} read failed for ${playerId}; that panel will render empty: ${describeError(failed)}`,
      { action: 'players.gamePage', featureArea: 'coachhelm' },
      'warning',
    );
  }

  const player = (playerResult.data as PlayerProfile | null) ?? null;
  if (!player) notFound();

  const rounds = (roundsResult.data as RoundRow[] | null) ?? [];

  // Patterns: derive name/description from metadata since the live schema
  // has neither column (LIVE-8). Two metadata shapes coexist:
  //   - "conditional" patterns carry `name` + `description` directly.
  //   - "contextual" / shot-dispersion patterns carry a richer
  //     {situation, tendencies, recommendation, insight} blob — synthesize a
  //     human title from situation.distanceRange.label + lie, and use the
  //     embedded `insight` text as the description.
  // We also dedupe by the synthesized title so the 4-of-a-kind "Wedge from
  // rough" rows the miner emits collapse to one card.
  const rawPatterns = (patternsResult.data as Array<Record<string, unknown>> | null) ?? [];
  const seenTitles = new Set<string>();
  const patterns: PatternRow[] = [];
  for (const p of rawPatterns) {
    const meta = (p.metadata as Record<string, unknown> | null) ?? null;
    const metaDescription = typeof meta?.description === 'string' ? meta.description : null;
    const metaName = typeof meta?.name === 'string' ? meta.name : null;
    const metaInsight = typeof meta?.insight === 'string' ? meta.insight : null;
    const metaRecommendation = typeof meta?.recommendation === 'string' ? meta.recommendation : null;

    let name = metaName;
    const description = metaDescription ?? metaInsight ?? metaRecommendation;
    if (!name) {
      const situation = (meta?.situation as Record<string, unknown> | null) ?? null;
      const lie = typeof situation?.lie === 'string' ? situation.lie : null;
      const range = (situation?.distanceRange as Record<string, unknown> | null) ?? null;
      const rangeLabel = typeof range?.label === 'string' ? range.label : null;
      const tendencies = Array.isArray(meta?.tendencies)
        ? (meta?.tendencies as Array<Record<string, unknown>>)
        : [];
      const topTendency = tendencies[0];
      const direction = typeof topTendency?.direction === 'string'
        ? topTendency.direction.replace(/_/g, ' ')
        : null;

      if (rangeLabel && lie) {
        name = direction
          ? `${rangeLabel} from ${lie} → ${direction}`
          : `${rangeLabel} from ${lie}`;
      } else if (rangeLabel) {
        name = rangeLabel;
      } else if ((p.pattern_type as string | null) === 'contextual') {
        name = 'Shot pattern';
      } else {
        name = (p.pattern_type as string | null) ?? null;
      }
    }

    const dedupKey = (name ?? '').toLowerCase().trim();
    if (dedupKey && seenTitles.has(dedupKey)) continue;
    if (dedupKey) seenTitles.add(dedupKey);

    patterns.push({
      id: p.id as string,
      pattern_type: (p.pattern_type as string | null) ?? null,
      name,
      description,
      severity: (p.severity as string | null) ?? null,
      stroke_impact: (p.stroke_impact as number | null) ?? null,
      lifecycle_state: (p.lifecycle_state as string | null) ?? null,
      first_detected: (p.first_detected as string | null) ?? null,
      is_active: (p.is_active as boolean | null) ?? null,
      created_at: p.created_at as string,
      metadata: meta,
    });
  }

  // Insights: derive tone + acknowledged from live columns.
  const rawInsights = (insightsResult.data as Array<Record<string, unknown>> | null) ?? [];
  const insights: InsightRow[] = rawInsights.map((i) => {
    const meta = (i.metadata as Record<string, unknown> | null) ?? null;
    const tone = typeof meta?.tone === 'string' ? meta.tone : null;
    const confidence = typeof meta?.confidence === 'number' ? meta.confidence : null;
    return {
      id: i.id as string,
      title: (i.title as string | null) ?? null,
      content: (i.content as string | null) ?? null,
      tone,
      confidence,
      dismissed: (i.dismissed as boolean | null) ?? null,
      acknowledged: i.acknowledged_at != null,
      created_at: i.created_at as string,
    };
  });

  const focusAreas = (focusAreasResult.data as FocusAreaRow[] | null) ?? [];

  // Predictions: keep the most recent row per distinct metric — seed data
  // generates many duplicates per metric that all render as identical cards.
  const rawPredictions = (predictionsResult.data as Array<Record<string, unknown>> | null) ?? [];
  const seenMetrics = new Set<string>();
  const predictions: PredictionRow[] = [];
  for (const p of rawPredictions) {
    const metric = (p.metric as string | null) ?? null;
    const key = metric ?? '__null__';
    if (seenMetrics.has(key)) continue;
    seenMetrics.add(key);
    predictions.push({
      id: p.id as string,
      metric,
      predicted_value: (p.predicted_value as number | null) ?? null,
      confidence: (p.confidence as number | null) ?? null,
      trend: (p.trend as string | null) ?? null,
      due_date: (p.due_date as string | null) ?? null,
      prediction_context: (p.prediction_context as Record<string, unknown> | null) ?? null,
      related_round_id: (p.related_round_id as string | null) ?? null,
      created_at: p.created_at as string,
    });
    if (predictions.length >= 5) break;
  }

  // -----------------------------------------------------------------------
  // Compute composite rating (simple heuristic) from available data
  // -----------------------------------------------------------------------
  // null = no recorded rounds → the client renders an honest "awaiting first
  // round" state (it gates every rating/bar/verdict on `rounds.length > 0`), so
  // the numeric prop is never displayed in that case. Coalesce to 0 only to
  // satisfy the component's `number` contract; the zero-data guard owns honesty.
  // (Wave 2 — this now imports the SAME canonical formula the Game
  // Fingerprint tab's composite uses, so the two tabs can never disagree.)
  const compositeRating = computeCompositeRating(rounds, patterns).rating ?? 0;
  const categoryBreakdown = computeCategoryBreakdown(rounds);
  const trendSummary = computeTrendSummary(rounds);
  const playerStatus = derivePlayerStatus(trendSummary.trend);

  // Hierarchical THEME scaffold — additive, redesign-only. Degrades to [] when
  // the fetch failed or returned no data (themesResult may be null on throw).
  const themes = themesResult?.data?.themes ?? [];

  // P410 — this surface mounts the CoachHelm shell as a Players-tab leaf, so
  // it needs the SAME urgent/high open-signal count the rest of the cluster
  // shows on the Signals badge (ONE source: getAlertCounts().counts.critical).
  // Degrades to null (no badge) on failure — never a fabricated "0".
  // Honest signal-vs-noise trends (FairwayTrendBrain) for THIS player. Best-
  // effort: null on failure → the component renders its own honest-empty
  // state.
  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;
  const trendData =
    trendRes && trendRes.success
      ? (trendRes.data as unknown as Record<string, unknown>)
      : null;
  // #1485 — TrajectoryCard renders a DIFFERENT honest message for each of
  // these, so preserve the distinction rather than collapsing every outcome
  // to one state: a real forecast; `null` when the action succeeded but the
  // forecaster itself found too little round history (getPlayerTrajectory
  // returns `{success: true, insufficientHistory: true}` for that case, NOT
  // success: false — see that action's own comment on why); `undefined` for
  // every other outcome (thrown fetch, auth/rate-limit/disabled/unexpected —
  // "not enough rounds" would be a false claim in those cases).
  const trajectory = trajectoryRes?.success ? (trajectoryRes.trajectory ?? null) : undefined;

  const insightProps: FairwayPlayerInsightProps = {
    player,
    compositeRating,
    categoryBreakdown,
    trendSummary,
    playerStatus,
    rounds,
    patterns,
    insights,
    focusAreas,
    predictions,
    themes,
    trendData,
    trajectory,
    signalCount,
  };

  const rawSectionAddenda: Record<string, ReactNode> = {};
  if (distanceProfileAddendum) rawSectionAddenda.approach = distanceProfileAddendum;
  if (scoringAddendum) rawSectionAddenda.scoring = scoringAddendum;
  // `undefined` (not `{}`) when neither flag produced anything — matches
  // exactly what the page sent before this addendum existed, so
  // `FairwayPlayerGameFingerprint.mode.test.tsx`'s "no-op when absent"
  // guarantee stays literal, not just behaviorally equivalent.
  const sectionAddenda = Object.keys(rawSectionAddenda).length > 0 ? rawSectionAddenda : undefined;

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <PlayerDeepDiveTabs fingerprint={fingerprint} insight={insightProps} sectionAddenda={sectionAddenda} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Computation helpers (moved verbatim from the former /players/[playerId]
// route — same formulas, same rounding, same fallbacks)
// ---------------------------------------------------------------------------

interface CategoryBreakdown {
  teeGame: number;
  approach: number;
  shortGame: number;
  putting: number;
  scoring: number;
}

function computeCategoryBreakdown(rounds: RoundRow[]): CategoryBreakdown {
  if (rounds.length === 0) {
    return { teeGame: 50, approach: 50, shortGame: 50, putting: 50, scoring: 50 };
  }

  const recent = rounds.slice(0, 5);

  // Tee Game — fairways hit percentage (use actual total_fairways per round, fallback to 14)
  const fairwayRounds = recent.filter((r) => r.total_fairways_hit !== null);
  const teeGame = fairwayRounds.length > 0
    ? Math.round(
        (fairwayRounds.reduce((s, r) => s + (r.total_fairways_hit ?? 0), 0) /
         fairwayRounds.reduce((s, r) => s + (r.total_fairways ?? 14), 0)) * 100
      )
    : 50;

  // Approach — GIR percentage (use actual total_gir_possible per round, fallback to 18)
  const girRounds = recent.filter((r) => r.total_gir !== null);
  const approach = girRounds.length > 0
    ? Math.round(
        (girRounds.reduce((s, r) => s + (r.total_gir ?? 0), 0) /
         girRounds.reduce((s, r) => s + (r.total_gir_possible ?? 18), 0)) * 100
      )
    : 50;

  // Putting — based on putts per round (30 putts = 60, 36+ = 30, 25 = 90)
  const puttRounds = recent.filter((r) => r.total_putts !== null);
  const putting = puttRounds.length > 0
    ? Math.round(
        Math.max(0, Math.min(100,
          90 - ((puttRounds.reduce((s, r) => s + (r.total_putts ?? 0), 0) / puttRounds.length) - 25) * 5,
        )),
      )
    : 50;

  // Short game — estimated as the average of other categories (no direct data available)
  const shortGame = Math.round((teeGame + approach + putting) / 3);

  // Scoring — based on score_to_par
  const scoringRounds = recent.filter((r) => r.score_to_par != null);
  const scoring = scoringRounds.length > 0
    ? Math.round(
        Math.max(0, Math.min(100,
          80 - ((scoringRounds.reduce((s, r) => s + (r.score_to_par ?? 0), 0) / scoringRounds.length) * 3),
        )),
      )
    : 50;

  return {
    teeGame: Math.max(0, Math.min(100, teeGame)),
    approach: Math.max(0, Math.min(100, approach)),
    shortGame: Math.max(0, Math.min(100, shortGame)),
    putting: Math.max(0, Math.min(100, putting)),
    scoring: Math.max(0, Math.min(100, scoring)),
  };
}

interface TrendSummary {
  trend: 'improving' | 'stable' | 'declining';
  recentAvg: number;
  previousAvg: number;
  streakCount: number;
  streakType: 'positive' | 'negative' | 'neutral';
}

function computeTrendSummary(rounds: RoundRow[]): TrendSummary {
  const defaults: TrendSummary = {
    trend: 'stable',
    recentAvg: 0,
    previousAvg: 0,
    streakCount: 0,
    streakType: 'neutral',
  };

  const scoredRounds = rounds.filter((r) => r.score_to_par != null);
  if (scoredRounds.length < 2) return defaults;

  const diffs = scoredRounds.map((r) => r.score_to_par ?? 0);
  const mid = Math.floor(diffs.length / 2);
  const recentAvg = diffs.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const previousAvg = diffs.slice(mid).reduce((a, b) => a + b, 0) / (diffs.length - mid);

  const diff = previousAvg - recentAvg;
  const trend: TrendSummary['trend'] = diff > 1.5 ? 'improving' : diff < -1.5 ? 'declining' : 'stable';

  // Compute streak
  let streakCount = 1;
  const streakType: TrendSummary['streakType'] = (diffs[0] ?? 0) <= 0 ? 'positive' : (diffs[0] ?? 0) > 5 ? 'negative' : 'neutral';
  for (let i = 1; i < diffs.length; i++) {
    const currentType = (diffs[i] ?? 0) <= 0 ? 'positive' : (diffs[i] ?? 0) > 5 ? 'negative' : 'neutral';
    if (currentType === streakType) {
      streakCount++;
    } else {
      break;
    }
  }

  return { trend, recentAvg, previousAvg, streakCount, streakType };
}

function derivePlayerStatus(trend: TrendSummary['trend']): 'Improving' | 'Needs Attention' | 'Stable' {
  switch (trend) {
    case 'improving':
      return 'Improving';
    case 'declining':
      return 'Needs Attention';
    default:
      return 'Stable';
  }
}

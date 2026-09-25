/**
 * /golf/dashboard/players/[playerId]/game — the coach per-player deep dive.
 *
 * Two sibling views behind one Segmented (PlayerDeepDiveTabs):
 *   Game Fingerprint (default): where the strokes go (waterfall, per-area
 *     ledger, CoachHelm claims inline).
 *   Scouting Report (`?tab=scouting`): the verdict / evidence / plan memo
 *     (ScoutingReport).
 *
 * Loading: the fingerprint starts before the team/membership check (it
 * checks access itself), both views' data load in ONE Promise.all, and the
 * shot-level approach ladder plus the A7 addenda stream behind Suspense.
 *
 * Print-optimized variant lives at `/players/[playerId]/game/print`.
 */
import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import { isUuid } from '@/lib/utils/uuid';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { getPlayerFingerprint } from '@/app/golf/actions/player-fingerprint';
import { getThemesForCoach } from '@/app/golf/actions/insight-delivery';
import { logServerError } from '@/lib/server-error-logger';
import { fairwayScope } from '@/lib/redesign/flag';
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
import { PlayerDeepDiveTabs, type PlayerDeepDiveTabsProps } from './PlayerDeepDiveTabs';
import { ApproachLadderSkeleton, ApproachLadderSlot } from './sections/loadApproachLadder';
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
  title: 'Game Fingerprint',
  description:
    "Scouting report for a player's game: tee, approach, short game, putting, scoring, pressure, and trend.",
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

interface FocusAreaRow {
  id: string;
  title: string | null;
  area_type: string | null;
  status: string | null;
  current_value: number | null;
  target_value: number | null;
  baseline_value: number | null;
  target_metric: string | null;
  from_insight_id: string | null;
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
  // Perf (owner: "everything takes a long time"): the fingerprint is the
  // first paint and runs its own access check, so start it now, in parallel
  // with the team + membership chain below, instead of after it. Settled into
  // a result object so an early redirect/notFound never leaves an unhandled
  // rejection behind.
  const fingerprintSettled = getPlayerFingerprint(playerId).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
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
  // One parallel batch for both tabs, so switching tabs stays instant. It
  // carries only what the two views read:
  //   Game Fingerprint: the fingerprint (already in flight, see above).
  //   Scouting Report:  player, rounds, focus areas, themes. ScoutingReport
  //                     fetches its own insights client-side.
  // The patterns / SSR insights / predictions / trend / trajectory / alert-
  // count queries fed FairwayPlayerInsight only and are gone with it. The
  // approach ladder and the A7 addenda stream behind Suspense below, so the
  // masthead and the waterfall never wait on shot-level reads.
  // ---------------------------------------------------------------------
  const distanceProfileEnabled = isFlagEnabled('coachhelm_a7_distance_profile_surface');
  const scoringSurfaceEnabled = isFlagEnabled('coachhelm_a7_scoring_surface');

  const [fingerprint, playerResult, roundsResult, focusAreasResult, themesResult] = await Promise.all([
    fingerprintSettled.then((r) => {
      if (!r.ok) throw r.error;
      return r.value;
    }),

    supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url, graduation_year, handicap')
      .eq('id', playerId)
      .maybeSingle(),

    // Recent rounds (last 10), most recent first.
    supabase
      .from('golf_rounds')
      .select('id, created_at, round_date, total_score, holes_played, course_name, score_to_par, total_fairways_hit, total_gir, total_putts, total_fairways, total_gir_possible')
      .eq('player_id', playerId)
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(10),

    // `from_insight_id` lets ScoutingReport match "In plan" exactly.
    supabase
      .from('golf_player_focus_areas')
      .select(
        'id, title, area_type, status, current_value, target_value, baseline_value, target_metric, from_insight_id, created_at',
      )
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),

    // Degrades to null (→ []) on failure but logs it.
    getThemesForCoach({ player_id: playerId }).catch((err) => {
      void logServerError(
        `player game-deep-dive themes fetch failed (continuing without themes): ${describeError(err)}`,
        { action: 'players-game-page.getThemesForCoach', featureArea: 'insights', playerId },
      ).catch(() => undefined);
      return null;
    }),
  ]);

  if (!fingerprint) notFound();

  // The profile and the rounds are the spine of both tabs; without them the
  // page is wrong, not degraded, so those throw to the error boundary.
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
    ['focus areas', focusAreasResult.error],
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

  const insightProps: PlayerDeepDiveTabsProps['insight'] = {
    player,
    rounds: (roundsResult.data as RoundRow[] | null) ?? [],
    focusAreas: (focusAreasResult.data as FocusAreaRow[] | null) ?? [],
    themes: themesResult?.data?.themes ?? [],
    // The embedded CoachHelmShell renders no sub-nav, so there is no badge.
    signalCount: null,
  };

  // A7 addenda (flag-off in every environment today) and the approach ladder
  // stream: each sits in its own Suspense boundary so the first paint never
  // waits on them.
  const a7Addenda =
    distanceProfileEnabled || scoringSurfaceEnabled
      ? loadDistanceProfileAndScoringAddenda(distanceProfileEnabled, scoringSurfaceEnabled, playerId, supabase)
      : null;
  const rawSectionAddenda: Record<string, ReactNode> = {};
  if (a7Addenda && distanceProfileEnabled) {
    rawSectionAddenda.approach = (
      <Suspense fallback={null}>
        <AwaitNode promise={a7Addenda.then((r) => r.distanceProfile)} />
      </Suspense>
    );
  }
  if (a7Addenda && scoringSurfaceEnabled) {
    rawSectionAddenda.scoring = (
      <Suspense fallback={null}>
        <AwaitNode promise={a7Addenda.then((r) => r.scoring)} />
      </Suspense>
    );
  }
  const sectionAddenda = Object.keys(rawSectionAddenda).length > 0 ? rawSectionAddenda : undefined;

  const approachLadder = (
    <Suspense fallback={<ApproachLadderSkeleton />}>
      <ApproachLadderSlot playerId={playerId} supabase={supabase} />
    </Suspense>
  );

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <PlayerDeepDiveTabs
        fingerprint={fingerprint}
        insight={insightProps}
        sectionAddenda={sectionAddenda}
        approachLadder={approachLadder}
      />
    </div>
  );
}

/** Streams one server-built node out of a shared promise. */
async function AwaitNode({ promise }: { promise: Promise<ReactNode | null> }) {
  return <>{await promise}</>;
}

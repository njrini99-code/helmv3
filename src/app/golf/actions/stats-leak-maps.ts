'use server';

/**
 * ============================================================================
 * stats-leak-maps — shared, read-only leak-map loader (BATCH 0 / Item 0a)
 * ----------------------------------------------------------------------------
 * Derives putt-make%-by-distance and approach-proximity-by-distance "leak
 * maps" from RAW `golf_shots`, compared against `golf_pga_standards`. The
 * per-bucket stats-cache columns are populated for only 0-1 of 6 demo players,
 * so we compute from raw shots (never the cache) — see spec-stats-coach §0.
 *
 * Consumed by BOTH stats surfaces:
 *   - coach  → `getTeamLeakMaps(teamId)` (team aggregate) + per-player drill-down
 *   - player → `getPuttMakeLeakMap` / `getApproachProximityLeakMap` /
 *              `getPlayerStandingRows` (single player)
 *
 * ADDITIVE + read-only (SELECT only). No DDL, no existing loader changed.
 *
 * AUTH:
 *   - team-level export gates on the golf coach session (mirrors
 *     `stats-intelligence.ts:getTeamStatsIntelligence`).
 *   - player-level exports gate on `verifyPlayerAccess` (re-exported from
 *     `stats-data.ts`) so a coach only sees their own team's players and a
 *     player only sees themselves.
 *
 * UNIT NORMALIZATION (critical — confirmed on the demo team):
 *   `golf_shots.distance_to_hole_after` is stored in MIXED units per row via
 *   `distance_unit_after` ('feet' OR 'yards'); PGA proximity refs are in FEET.
 *   We normalize every after-value to feet (`yards → *3`) and drop outliers
 *   (> 150 ft post-normalization, e.g. a mis-entered 265 yd blow-up shot) so
 *   the average isn't dragged. `distance_to_hole_before` is uniformly yards.
 * ========================================================================== */

import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { round } from '@/lib/golf/stat-formulas';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { getStatsActionContext } from '@/lib/golf/stats-action-context';

import { verifyPlayerAccess } from './stats-data';
import type {
  LeakBucket,
  LeakMapResult,
  PlayerLeakMaps,
  PlayerStandingRow,
  TeamLeakMaps,
} from './stats-leak-maps-types';

// ============================================================================
// AUTH GUARD (mirrors stats-data.ts:47-59 — verifyPlayerAccess is imported)
// ============================================================================

/**
 * Resolve the authenticated user. Mirrors the `requireAuth()` pattern in
 * `stats-data.ts:47-59`; kept local because that helper is intentionally
 * unexported (the spec permits exporting only `verifyPlayerAccess`).
 */
async function requireAuth(playerId?: string) {
  const shared = getStatsActionContext();
  if (shared && (!playerId || shared.requestedPlayerId === playerId)) {
    return { supabase: shared.supabase, user: shared.user };
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('Unauthorized');
  }
  return { supabase, user };
}

// ============================================================================
// BUCKET DEFINITIONS (mirror metric-config.ts band edges exactly)
// ============================================================================

/** Putt-make% bands, low → high feet. The 0-3 ft band has no PGA standard. */
const PUTT_BANDS: ReadonlyArray<{
  bucket_id: string;
  label: string;
  metric_id: string | null;
  min: number;
  /** exclusive upper edge; null = open-ended (25+). */
  max: number | null;
}> = [
  { bucket_id: '0_3', label: '0-3 ft', metric_id: null, min: 0, max: 3 },
  { bucket_id: '3_5', label: '3-5 ft', metric_id: 'putts_made_3_5ft_pct', min: 3, max: 5 },
  { bucket_id: '5_10', label: '5-10 ft', metric_id: 'putts_made_5_10ft_pct', min: 5, max: 10 },
  { bucket_id: '10_15', label: '10-15 ft', metric_id: 'putts_made_10_15ft_pct', min: 10, max: 15 },
  { bucket_id: '15_25', label: '15-25 ft', metric_id: 'putts_made_15_25ft_pct', min: 15, max: 25 },
  { bucket_id: '25_plus', label: '25+ ft', metric_id: 'putts_made_25_plus_ft_pct', min: 25, max: null },
];

/** Approach-proximity bands bucketed on `distance_to_hole_before` (yards). */
const APPROACH_BANDS: ReadonlyArray<{
  bucket_id: string;
  label: string;
  metric_id: string;
  min: number;
  max: number | null;
}> = [
  { bucket_id: '50_125', label: '50-125 yd', metric_id: 'approach_proximity_50_125ft', min: 50, max: 125 },
  { bucket_id: '125_175', label: '125-175 yd', metric_id: 'approach_proximity_125_175ft', min: 125, max: 175 },
  { bucket_id: '175_plus', label: '175+ yd', metric_id: 'approach_proximity_175_plus_ft', min: 175, max: null },
];

/** Drop normalized after-distances above this (ft): a mis-entered blow-up shot. */
const APPROACH_PROXIMITY_CEILING_FT = 150;
/** Ignore approach attempts shorter than this band floor (yd). */
const APPROACH_MIN_BEFORE_YD = 50;

/**
 * Overall safety ceiling on raw shot rows pulled per surface. Enforced via
 * page accumulation in the paginated fetches below — NEVER via a single
 * `.limit()`: PostgREST hard-caps every response at 1000 rows server-side,
 * so `.limit(MAX_SHOT_ROWS)` silently returned ≤1000 rows and truncated
 * every aggregate past the first 1000 shots.
 */
const MAX_SHOT_ROWS = 20000;

// ============================================================================
// RAW ROW SHAPES (golf_shots is in generated types; columns confirmed present)
// ============================================================================

interface PuttRow {
  round_id: string;
  putt_distance_feet: number | null;
  putt_made: boolean | null;
}

interface ApproachRow {
  round_id: string;
  distance_to_hole_before: number | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  result: string | null;
}

interface PgaRefRow {
  metric_id: string;
  pga_tour_value: number | null;
  div1_avg_value: number | null;
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

/** Normalize a raw after-distance to FEET given its per-row unit. */
function toFeet(value: number, unit: string | null): number {
  // PGA proximity refs are in feet; rows tagged 'yards' must be scaled.
  return unit === 'yards' ? value * 3 : value;
}

/** Find the band for a value: [min, max) with the last band open-ended. */
function bandFor<T extends { min: number; max: number | null }>(
  bands: ReadonlyArray<T>,
  value: number,
): T | null {
  for (const band of bands) {
    if (value < band.min) continue;
    if (band.max === null || value < band.max) return band;
  }
  return null;
}

/**
 * Pull reference rows for a set of metric ids, gender-routed.
 *
 * Women's teams get LPGA rows (tour='lpga') first; any metric not covered by
 * an LPGA row falls back to the PGA row automatically. Men's / unknown teams
 * get PGA rows (tour='pga') only — unchanged behaviour.
 *
 * The column `pga_tour_value` is the "tour average for this row's tour" in
 * both cases (the column name is reused to avoid a breaking schema rename).
 */
async function loadPgaRefs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  metricIds: string[],
  teamGender?: string | null,
): Promise<Map<string, PgaRefRow>> {
  const refs = new Map<string, PgaRefRow>();
  if (metricIds.length === 0) return refs;

  if (teamGender === 'womens') {
    // Step 1: load LPGA rows
    const { data: lpgaData } = await supabase
      .from('golf_pga_standards')
      .select('metric_id, pga_tour_value, div1_avg_value')
      .in('metric_id', metricIds)
      .eq('tour', 'lpga');
    for (const row of (lpgaData ?? []) as PgaRefRow[]) {
      refs.set(row.metric_id, row);
    }
    // Step 2: PGA fallback for any metric missing an LPGA row
    const missingIds = metricIds.filter((id) => !refs.has(id));
    if (missingIds.length > 0) {
      const { data: pgaData } = await supabase
        .from('golf_pga_standards')
        .select('metric_id, pga_tour_value, div1_avg_value')
        .in('metric_id', missingIds)
        .eq('tour', 'pga');
      for (const row of (pgaData ?? []) as PgaRefRow[]) {
        refs.set(row.metric_id, row);
      }
    }
  } else {
    // Men's / unknown — PGA only (unchanged behaviour)
    const { data } = await supabase
      .from('golf_pga_standards')
      .select('metric_id, pga_tour_value, div1_avg_value')
      .in('metric_id', metricIds)
      .eq('tour', 'pga');
    for (const row of (data ?? []) as PgaRefRow[]) {
      refs.set(row.metric_id, row);
    }
  }
  return refs;
}

/**
 * Resolve a player's team gender. Used by player-scoped leak-map functions to
 * select the correct tour benchmark set (LPGA for women's teams, PGA otherwise).
 * Fails safe to null (PGA fallback) if the player has no active team membership.
 */
async function resolvePlayerTeamGender(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('golf_team_members')
    .select('golf_teams(gender)')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .maybeSingle();
  const team = (data as { golf_teams: { gender?: string | null } | null } | null)?.golf_teams;
  return team?.gender ?? null;
}

/**
 * Resolve completed-round ids for a set of player ids. Self-contained so the
 * loader doesn't depend on the calling page recomputing the round window.
 */
async function completedRoundIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerIds: string[],
): Promise<string[]> {
  if (playerIds.length === 0) return [];
  // Paginated: PostgREST caps each response at 1000 rows, so a roster's
  // season can silently truncate an unpaginated id fetch (rounds beyond the
  // first 1000 would vanish from every leak map).
  const { data, error } = await fetchAllRowsResult((from, to) =>
    supabase
      .from('golf_rounds')
      .select('id')
      .in('player_id', playerIds)
      .eq('status', 'completed')
      .order('id', { ascending: true })
      .range(from, to),
    undefined,
    { table: 'golf_rounds', action: 'completedRoundIds', feature: 'stats_analytics', sport: 'golf' },
  );
  // Empty here starves BOTH bucket builders, so a failure silently empties every
  // leak map at once rather than one category.
  if (error) {
    throw new Error(`completed-round id read failed: ${error.message}`);
  }
  return (data ?? [])
    .map((r) => (r as { id: string }).id)
    .filter((id): id is string => typeof id === 'string');
}

// ============================================================================
// AGGREGATION — putting
// ============================================================================

async function buildPuttBuckets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roundIds: string[],
  teamGender?: string | null,
): Promise<LeakBucket[]> {
  const metricIds = PUTT_BANDS
    .map((b) => b.metric_id)
    .filter((id): id is string => id !== null);
  const refs = await loadPgaRefs(supabase, metricIds, teamGender);

  // attempts = gradeable putts (putt_made non-null); made = putt_made === true.
  const made = new Map<string, number>();
  const gradeable = new Map<string, number>();

  if (roundIds.length > 0) {
    // Paginated past the PostgREST 1000-row cap; MAX_SHOT_ROWS is enforced by
    // stopping page accumulation (a single `.limit()` silently capped at 1000).
    const { data, error } = await fetchAllRowsResult<PuttRow>((from, to) => {
      if (from >= MAX_SHOT_ROWS) return Promise.resolve({ data: [], error: null });
      return supabase
        .from('golf_shots')
        .select('round_id, putt_distance_feet, putt_made')
        .in('round_id', roundIds)
        .eq('shot_type', 'putting')
        .not('putt_distance_feet', 'is', null)
        .order('id', { ascending: true })
        .range(from, Math.min(to, MAX_SHOT_ROWS - 1));
    }, undefined, { table: 'golf_shots', action: 'buildPuttBuckets', feature: 'stats_analytics', sport: 'golf' });

    if (error) {
      throw new Error(`putting shot read failed: ${error.message}`);
    }

    for (const row of data ?? []) {
      const ft = row.putt_distance_feet;
      if (ft === null || Number.isNaN(ft)) continue;
      const band = bandFor(PUTT_BANDS, ft);
      if (!band) continue;
      // Only rows with a known outcome count toward make% (null = ungraded).
      if (row.putt_made === null) continue;
      gradeable.set(band.bucket_id, (gradeable.get(band.bucket_id) ?? 0) + 1);
      if (row.putt_made === true) {
        made.set(band.bucket_id, (made.get(band.bucket_id) ?? 0) + 1);
      }
    }
  }

  return PUTT_BANDS.map((band) => {
    const n = gradeable.get(band.bucket_id) ?? 0;
    const ref = band.metric_id ? refs.get(band.metric_id) : undefined;
    return {
      metric_id: band.metric_id,
      bucket_id: band.bucket_id,
      label: band.label,
      team_value: n > 0 ? round((100 * (made.get(band.bucket_id) ?? 0)) / n, 1) : null,
      pga_value: ref?.pga_tour_value ?? null,
      div1_value: ref?.div1_avg_value ?? null,
      sample_n: n,
    };
  });
}

// ============================================================================
// AGGREGATION — approach proximity
// ============================================================================

async function buildApproachBuckets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roundIds: string[],
  teamGender?: string | null,
): Promise<LeakBucket[]> {
  const refs = await loadPgaRefs(supabase, APPROACH_BANDS.map((b) => b.metric_id), teamGender);

  const sumFt = new Map<string, number>();
  const count = new Map<string, number>();

  if (roundIds.length > 0) {
    // Paginated past the PostgREST 1000-row cap; MAX_SHOT_ROWS is enforced by
    // stopping page accumulation (a single `.limit()` silently capped at 1000).
    const { data, error } = await fetchAllRowsResult<ApproachRow>((from, to) => {
      if (from >= MAX_SHOT_ROWS) return Promise.resolve({ data: [], error: null });
      return supabase
        .from('golf_shots')
        .select('round_id, distance_to_hole_before, distance_to_hole_after, distance_unit_after, result')
        .in('round_id', roundIds)
        .eq('shot_type', 'approach')
        // ON-GREEN ONLY: proximity is a green-surface distance, so only approaches that
        // FOUND the green count. A missed approach finishes off-green (stored in YARDS);
        // including it ×3'd those finishes into "feet" and inflated every band ~2× (the
        // "175+ → 63 ft" artifact). Green-hit rate covers the missed approaches instead.
        .in('result', ['green', 'hole', 'gir'])
        .not('distance_to_hole_before', 'is', null)
        .not('distance_to_hole_after', 'is', null)
        .order('id', { ascending: true })
        .range(from, Math.min(to, MAX_SHOT_ROWS - 1));
    }, undefined, { table: 'golf_shots', action: 'buildApproachBuckets', feature: 'stats_analytics', sport: 'golf' });

    if (error) {
      throw new Error(`approach shot read failed: ${error.message}`);
    }

    for (const row of data ?? []) {
      const beforeYd = row.distance_to_hole_before;
      const afterRaw = row.distance_to_hole_after;
      if (beforeYd === null || Number.isNaN(beforeYd)) continue;
      if (afterRaw === null || Number.isNaN(afterRaw)) continue;
      if (beforeYd < APPROACH_MIN_BEFORE_YD) continue;

      const band = bandFor(APPROACH_BANDS, beforeYd);
      if (!band) continue;

      // Mixed units → normalize to feet, then drop blow-up outliers.
      const afterFt = toFeet(afterRaw, row.distance_unit_after);
      if (afterFt < 0 || afterFt > APPROACH_PROXIMITY_CEILING_FT) continue;

      sumFt.set(band.bucket_id, (sumFt.get(band.bucket_id) ?? 0) + afterFt);
      count.set(band.bucket_id, (count.get(band.bucket_id) ?? 0) + 1);
    }
  }

  return APPROACH_BANDS.map((band) => {
    const n = count.get(band.bucket_id) ?? 0;
    const ref = refs.get(band.metric_id);
    return {
      metric_id: band.metric_id,
      bucket_id: band.bucket_id,
      label: band.label,
      team_value: n > 0 ? round((sumFt.get(band.bucket_id) ?? 0) / n, 1) : null,
      pga_value: ref?.pga_tour_value ?? null,
      div1_value: ref?.div1_avg_value ?? null,
      sample_n: n,
    };
  });
}

// ============================================================================
// PUBLIC EXPORTS
// ============================================================================

/**
 * Team-level leak maps (putting + approach) for the coach stats surface.
 * Gates on the golf coach session; resolves the team via organization_id
 * when `teamId` is omitted, then aggregates raw shots across the active
 * roster's completed rounds.
 */
async function getTeamLeakMapsImpl(
  teamId?: string,
): Promise<LeakMapResult<TeamLeakMaps>> {
  try {
    const session = await getGolfSessionProfile();
    if (!session?.coach) return { success: false, error: 'Unauthorized' };
    const supabase = await createClient();

    let resolvedTeamId: string | null = teamId ?? null;
    let teamGender: string | null = null;
    if (!resolvedTeamId && session.coach.organization_id) {
      resolvedTeamId = await resolveCoachTeamIdWithCookie(
        supabase,
        session.coach.organization_id,
        session.coach.id,
      );
    }
    if (!resolvedTeamId) return { success: false, error: 'No team found for coach' };

    // Fetch the team's gender (drives gender-specific PGA/LPGA refs) now that we
    // have the resolved id — covers both the caller-supplied and resolved paths.
    const { data: team } = await supabase
      .from('golf_teams')
      .select('gender')
      .eq('id', resolvedTeamId)
      .maybeSingle();
    teamGender = (team as { gender?: string } | null)?.gender ?? null;

    // The `error` is READ on this and the three paginated reads below. Every one
    // of them failed to an EMPTY result, and an empty leak map does not read as
    // "we could not measure" — it reads as a clean scorecard, on the one screen
    // whose entire job is to say where the team is losing strokes.
    //
    // Thrown, not defaulted: the catch in this function already logs with
    // context and returns { success: false }, so the honest report was wired up
    // all along and simply never given anything to report.
    const { data: members, error: membersError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', resolvedTeamId)
      .eq('status', 'active');

    if (membersError) {
      throw new Error(`roster read failed for team ${resolvedTeamId}: ${membersError.message}`);
    }

    const playerIds = (members ?? [])
      .map((m) => m.player_id)
      .filter((id): id is string => typeof id === 'string');

    const roundIds = await completedRoundIds(supabase, playerIds);

    const [putting, approach] = await Promise.all([
      buildPuttBuckets(supabase, roundIds, teamGender),
      buildApproachBuckets(supabase, roundIds, teamGender),
    ]);

    return {
      success: true,
      data: { teamId: resolvedTeamId, putting, approach, roundsIncluded: roundIds.length },
    };
  } catch (error) {
    await logServerError(`[LeakMaps] getTeamLeakMaps: ${describeError(error)}`, {
      action: 'stats_leak_maps.getTeamLeakMaps',
    });
    return { success: false, error: 'Failed to load team leak maps' };
  }
}

const observedGetTeamLeakMaps = withAdminObserved(
  'getTeamLeakMaps',
  { sport: 'golf', feature: 'stats_analytics' },
  getTeamLeakMapsImpl,
);

export async function getTeamLeakMaps(
  teamId?: string,
): Promise<LeakMapResult<TeamLeakMaps>> {
  return observedGetTeamLeakMaps(teamId);
}

/**
 * Single-player putt-make% leak map. Gated by `verifyPlayerAccess`.
 * Returns the same `LeakBucket[]` shape (putting only) the chart consumes.
 */
async function getPuttMakeLeakMapImpl(
  playerId: string,
): Promise<LeakMapResult<{ putting: LeakBucket[]; roundsIncluded: number }>> {
  try {
    const { supabase, user } = await requireAuth();
    if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
      return { success: false, error: 'Unauthorized' };
    }
    const [roundIds, teamGender] = await Promise.all([
      completedRoundIds(supabase, [playerId]),
      resolvePlayerTeamGender(supabase, playerId),
    ]);
    const putting = await buildPuttBuckets(supabase, roundIds, teamGender);
    return { success: true, data: { putting, roundsIncluded: roundIds.length } };
  } catch (error) {
    await logServerError(`[LeakMaps] getPuttMakeLeakMap: ${describeError(error)}`, {
      action: 'stats_leak_maps.getPuttMakeLeakMap',
    });
    return { success: false, error: 'Failed to load putt leak map' };
  }
}

const observedGetPuttMakeLeakMap = withAdminObserved(
  'getPuttMakeLeakMap',
  { sport: 'golf', feature: 'stats_analytics' },
  getPuttMakeLeakMapImpl,
);

export async function getPuttMakeLeakMap(
  playerId: string,
): Promise<LeakMapResult<{ putting: LeakBucket[]; roundsIncluded: number }>> {
  return observedGetPuttMakeLeakMap(playerId);
}

/**
 * Single-player approach-proximity leak map. Gated by `verifyPlayerAccess`.
 */
async function getApproachProximityLeakMapImpl(
  playerId: string,
): Promise<LeakMapResult<{ approach: LeakBucket[]; roundsIncluded: number }>> {
  try {
    const { supabase, user } = await requireAuth();
    if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
      return { success: false, error: 'Unauthorized' };
    }
    const [roundIds, teamGender] = await Promise.all([
      completedRoundIds(supabase, [playerId]),
      resolvePlayerTeamGender(supabase, playerId),
    ]);
    const approach = await buildApproachBuckets(supabase, roundIds, teamGender);
    return { success: true, data: { approach, roundsIncluded: roundIds.length } };
  } catch (error) {
    await logServerError(`[LeakMaps] getApproachProximityLeakMap: ${describeError(error)}`, {
      action: 'stats_leak_maps.getApproachProximityLeakMap',
    });
    return { success: false, error: 'Failed to load approach leak map' };
  }
}

const observedGetApproachProximityLeakMap = withAdminObserved(
  'getApproachProximityLeakMap',
  { sport: 'golf', feature: 'stats_analytics' },
  getApproachProximityLeakMapImpl,
);

export async function getApproachProximityLeakMap(
  playerId: string,
): Promise<LeakMapResult<{ approach: LeakBucket[]; roundsIncluded: number }>> {
  return observedGetApproachProximityLeakMap(playerId);
}

/**
 * Convenience: both leak maps for one player in a single round-id pass.
 * Gated by `verifyPlayerAccess`.
 */
async function getPlayerLeakMapsImpl(
  playerId: string,
): Promise<LeakMapResult<PlayerLeakMaps>> {
  try {
    const { supabase, user } = await requireAuth(playerId);
    if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
      return { success: false, error: 'Unauthorized' };
    }
    const [roundIds, teamGender] = await Promise.all([
      completedRoundIds(supabase, [playerId]),
      resolvePlayerTeamGender(supabase, playerId),
    ]);
    const [putting, approach] = await Promise.all([
      buildPuttBuckets(supabase, roundIds, teamGender),
      buildApproachBuckets(supabase, roundIds, teamGender),
    ]);
    return {
      success: true,
      data: { playerId, putting, approach, roundsIncluded: roundIds.length },
    };
  } catch (error) {
    await logServerError(`[LeakMaps] getPlayerLeakMaps: ${describeError(error)}`, {
      action: 'stats_leak_maps.getPlayerLeakMaps',
    });
    return { success: false, error: 'Failed to load player leak maps' };
  }
}

const observedGetPlayerLeakMaps = withAdminObserved(
  'getPlayerLeakMaps',
  { sport: 'golf', feature: 'stats_analytics' },
  getPlayerLeakMapsImpl,
);

export async function getPlayerLeakMaps(
  playerId: string,
): Promise<LeakMapResult<PlayerLeakMaps>> {
  if (getStatsActionContext()?.requestedPlayerId === playerId) {
    return getPlayerLeakMapsImpl(playerId);
  }
  return observedGetPlayerLeakMaps(playerId);
}

/**
 * Plain, serialization-safe standing rows for one player. Wraps
 * `loadPlayerStandingMap` (admin client → no RLS) behind `verifyPlayerAccess`
 * so the StandingBar / StandingStrip data wiring can run from a client subtree.
 */
async function getPlayerStandingRowsImpl(
  playerId: string,
): Promise<LeakMapResult<PlayerStandingRow[]>> {
  try {
    const { supabase, user } = await requireAuth(playerId);
    if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
      return { success: false, error: 'Unauthorized' };
    }
    const map = await loadPlayerStandingMap(playerId);
    const rows: PlayerStandingRow[] = Array.from(map.values()).map((s) => ({
      metric_id: s.metric_id,
      player_value: s.player_value,
      team_avg: s.team_avg,
      team_n: s.team_n,
      team_pct: s.team_pct,
      pga_value: s.pga_value,
      pga_delta: s.pga_delta,
      is_womens: s.is_womens,
    }));
    return { success: true, data: rows };
  } catch (error) {
    await logServerError(`[LeakMaps] getPlayerStandingRows: ${describeError(error)}`, {
      action: 'stats_leak_maps.getPlayerStandingRows',
    });
    return { success: false, error: 'Failed to load player standing' };
  }
}

const observedGetPlayerStandingRows = withAdminObserved(
  'getPlayerStandingRows',
  { sport: 'golf', feature: 'stats_analytics' },
  getPlayerStandingRowsImpl,
);

export async function getPlayerStandingRows(
  playerId: string,
): Promise<LeakMapResult<PlayerStandingRow[]>> {
  if (getStatsActionContext()?.requestedPlayerId === playerId) {
    return getPlayerStandingRowsImpl(playerId);
  }
  return observedGetPlayerStandingRows(playerId);
}

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
 *   We normalize every after-value to feet (`yards → *3`). Proximity is
 *   ALL-SHOT (misses included, the Tour reference's basis); only an on-green
 *   finish beyond 150 ft is dropped as a mis-entry, and par-5 lay-ups leave
 *   the 175+ band (see src/lib/golf/leak-map-buckets.ts, audit rows 9/32).
 * ========================================================================== */

import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import {
  aggregateApproachBuckets,
  aggregatePuttBuckets,
  APPROACH_BANDS,
  PUTT_BANDS,
} from '@/lib/golf/leak-map-buckets';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { getStatsActionContext } from '@/lib/golf/stats-action-context';
import { resolvePlayerTeamGender } from '@/lib/golf/resolve-player-tour';

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
// BUCKET DEFINITIONS + AGGREGATION live in '@/lib/golf/leak-map-buckets'
// (pure; this 'use server' file may only export async functions).
// ============================================================================

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

/** A putting shot on the shared make % definition (src/lib/golf/putt-make.ts):
 *  start distance = distance_to_hole_before, made = result 'hole' OR putt_made. */
interface PuttRow {
  round_id: string;
  distance_to_hole_before: number | null;
  result: string | null;
  putt_made: boolean | null;
}

interface ApproachRow {
  round_id: string;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  result: string | null;
  lie_after: string | null;
  golf_holes: { par: number | null } | Array<{ par: number | null }> | null;
}

interface PgaRefRow {
  metric_id: string;
  pga_tour_value: number | null;
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

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
      .select('metric_id, pga_tour_value')
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
        .select('metric_id, pga_tour_value')
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
      .select('metric_id, pga_tour_value')
      .in('metric_id', metricIds)
      .eq('tour', 'pga');
    for (const row of (data ?? []) as PgaRefRow[]) {
      refs.set(row.metric_id, row);
    }
  }
  return refs;
}

/** The countable completed rounds a leak map reads, with their date span. */
interface CompletedRoundSet {
  ids: string[];
  /** Oldest / newest `round_date` (ISO date-only) in `ids`; null when empty. */
  windowFrom: string | null;
  windowTo: string | null;
}

/**
 * Resolve the countable completed rounds for a set of player ids. Self-contained
 * so the loader doesn't depend on the calling page recomputing the round window.
 */
async function completedRoundSet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerIds: string[],
): Promise<CompletedRoundSet> {
  if (playerIds.length === 0) return { ids: [], windowFrom: null, windowTo: null };
  // Paginated: PostgREST caps each response at 1000 rows, so a roster's
  // season can silently truncate an unpaginated id fetch (rounds beyond the
  // first 1000 would vanish from every leak map).
  const { data, error } = await fetchAllRowsResult((from, to) =>
    supabase
      .from('golf_rounds')
      .select('id, round_date, holes_played, total_score, front_nine, back_nine, total_putts')
      .in('player_id', playerIds)
      .eq('is_test', false)
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
  // Countable rounds only (src/lib/golf/round-countable.ts): a partial,
  // hole-less or implausible round must not feed the leak maps or the
  // "rounds included" count shown above them.
  type Row = CountableRoundInput & { id: string; round_date?: string | null };
  const rows = ((data ?? []) as Row[])
    .filter(isCountableRound)
    .filter((r) => typeof r.id === 'string');
  // round_date is a DATE column, so ISO strings order lexically.
  const dates = rows
    .map((r) => r.round_date)
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .sort();
  return {
    ids: rows.map((r) => r.id),
    windowFrom: dates[0] ?? null,
    windowTo: dates[dates.length - 1] ?? null,
  };
}

async function completedRoundIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerIds: string[],
): Promise<string[]> {
  return (await completedRoundSet(supabase, playerIds)).ids;
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

  let rows: PuttRow[] = [];
  if (roundIds.length > 0) {
    // Paginated past the PostgREST 1000-row cap; MAX_SHOT_ROWS is enforced by
    // stopping page accumulation (a single `.limit()` silently capped at 1000).
    const { data, error } = await fetchAllRowsResult<PuttRow>((from, to) => {
      if (from >= MAX_SHOT_ROWS) return Promise.resolve({ data: [], error: null });
      return supabase
        .from('golf_shots')
        .select('round_id, distance_to_hole_before, result, putt_made')
        .in('round_id', roundIds)
        .eq('shot_type', 'putting')
        // A putt without a start distance is not banded (nothing to read here).
        // Rows with a NULL putt_made are kept: a holed result makes them a make.
        .not('distance_to_hole_before', 'is', null)
        .order('id', { ascending: true })
        .range(from, Math.min(to, MAX_SHOT_ROWS - 1));
    }, undefined, { table: 'golf_shots', action: 'buildPuttBuckets', feature: 'stats_analytics', sport: 'golf' });

    if (error) {
      throw new Error(`putting shot read failed: ${error.message}`);
    }
    rows = data ?? [];
  }

  return aggregatePuttBuckets(rows, refs);
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

  let rows: ApproachRow[] = [];
  if (roundIds.length > 0) {
    // Paginated past the PostgREST 1000-row cap; MAX_SHOT_ROWS is enforced by
    // stopping page accumulation (a single `.limit()` silently capped at 1000).
    const { data, error } = await fetchAllRowsResult<ApproachRow>((from, to) => {
      if (from >= MAX_SHOT_ROWS) return Promise.resolve({ data: [], error: null });
      return supabase
        .from('golf_shots')
        .select('round_id, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, lie_after, golf_holes ( par )')
        .in('round_id', roundIds)
        .eq('shot_type', 'approach')
        // ALL approaches, misses included (audit rows 9/32): the Tour
        // reference counts every approach, and averaging only green-finders
        // let a team that missed more greens look better than Tour. Units
        // and the on-green / lay-up rules are applied in aggregateApproachBuckets.
        .not('distance_to_hole_before', 'is', null)
        .not('distance_to_hole_after', 'is', null)
        .order('id', { ascending: true })
        .range(from, Math.min(to, MAX_SHOT_ROWS - 1));
    }, undefined, { table: 'golf_shots', action: 'buildApproachBuckets', feature: 'stats_analytics', sport: 'golf' });

    if (error) {
      throw new Error(`approach shot read failed: ${error.message}`);
    }
    rows = data ?? [];
  }

  return aggregateApproachBuckets(
    rows.map(({ golf_holes, ...shot }) => {
      const hole = Array.isArray(golf_holes) ? golf_holes[0] : golf_holes;
      return { ...shot, par: typeof hole?.par === 'number' ? hole.par : null };
    }),
    refs,
  );
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
      data: {
        teamId: resolvedTeamId,
        putting,
        approach,
        roundsIncluded: roundIds.length,
        tour: teamGender === 'womens' ? 'lpga' : 'pga',
      },
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
    const [rounds, teamGender] = await Promise.all([
      completedRoundSet(supabase, [playerId]),
      resolvePlayerTeamGender(supabase, playerId),
    ]);
    const roundIds = rounds.ids;
    const [putting, approach] = await Promise.all([
      buildPuttBuckets(supabase, roundIds, teamGender),
      buildApproachBuckets(supabase, roundIds, teamGender),
    ]);
    return {
      success: true,
      data: {
        playerId,
        putting,
        approach,
        roundsIncluded: roundIds.length,
        windowFrom: rounds.windowFrom,
        windowTo: rounds.windowTo,
        // Same routing loadPgaRefs applied to the references above.
        tour: teamGender === 'womens' ? 'lpga' : 'pga',
      },
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
      pga_omitted: s.pga_omitted,
      pga_omitted_reason: s.pga_omitted_reason,
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

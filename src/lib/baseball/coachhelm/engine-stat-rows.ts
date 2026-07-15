import 'server-only';

// =============================================================================
// src/lib/baseball/coachhelm/engine-stat-rows.ts
//
// #379 Phase 4b — the ONE place the CoachHelm baseball engine reads per-session
// stat rows. Centralizes the three engine callers' (engine-run.ts,
// outcome-sweep.ts, action-baseline.ts) previously-duplicated direct
// `baseball_player_stats` reads and reconciles them onto the CANONICAL
// box-score layer per the #379 precedence rule. This mirrors
// `src/lib/baseball/read-models/legacy-stat-adapters.ts`, but at ROW grain —
// the engine's loaders need per-session rows (dispersion, rolling windows,
// after-window filtering), not the adapter's pre-reconciled season aggregates:
//
//   1. GAME context — scoped by (PLAYER, DATE), not player alone. A player's
//      canonical box-score rows (`baseball_box_score_batting` / `_pitching`)
//      always win for their own game-context, normalized via loaders.ts's
//      `normalizeBoxScoreBattingRow` / `normalizeBoxScorePitchingRow` so every
//      source_ref the loaders emit cites the REAL table. That player's legacy
//      `stat_type='game'` rows are dropped ONLY where their `session_date`
//      matches a date the player has canonical coverage for — never blended
//      on that date, so the same game can never be counted twice (the #827
//      demo seed intentionally writes BOTH layers for the same games).
//      Legacy game rows on dates with NO canonical coverage (e.g. a team's
//      first 10 games logged the old way before box-score import started on
//      game 11) stay in the pool — a mid-season transition must not silently
//      erase a player's early-season games. Caveat: `baseball_player_stats`
//      has no `game_id` column, only `session_date` — there is no FK to
//      correlate a legacy row to the specific canonical game it might
//      duplicate, so this is a same-day heuristic, not a guaranteed
//      game-identity match (a double-header would collide). The design
//      rule's stated concern is preventing double-counting the SAME game,
//      not excluding DIFFERENT ones, so this trade-off is accepted.
//   2. PRACTICE carve-out — legacy non-game rows (practice/other) always pass
//      through unchanged: the canonical layers have no practice-session
//      concept yet (same permanent carve-out as the shared adapter).
//   3. LEGACY FALLBACK — a player with zero canonical rows keeps their full
//      legacy row set, so a team that never re-imported through the box-score
//      pipeline does not regress from "engine sees old numbers" to "engine
//      sees nothing".
//
// Known, accepted caveat (documented, not silent): a legacy GAME row's
// `exit_velocity` / `pitch_velocity` sensor scalars are dropped along with the
// row for box-score players (rule 1) — the canonical box-score tables carry no
// velocity columns, and per #379 design rule 4 the canonical velocity source
// is the elite event layer (loaders.ts `eventDerived`), never a legacy scalar.
// Practice-row sensor scalars still flow through the carve-out.
//
// Error semantics (parity with the pre-#379 callers):
//   * Legacy read failure -> { data: null, error } (engine-run treats this as
//     a hard failure exactly as before; sweep/baseline degrade to empty).
//   * ANY canonical-side read failure (games/batting/pitching) -> all-or-
//     nothing fallback to the legacy rows alone — i.e. exactly the
//     pre-migration behavior, never a partial blend that could double count a
//     two-way player whose batting read succeeded but pitching read failed.
//
// This module is the engine's grandfathered legacy-fallback read (see
// src/lib/baseball/stat-layer-manifest.ts) — it retires only when Phase 5
// retires the legacy writer and the fallback tier has nothing left to serve.
// =============================================================================

import {
  normalizeBoxScoreBattingRow,
  normalizeBoxScorePitchingRow,
  type BoxScoreRow,
} from '@/lib/coachhelm/baseball/loaders';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

// A minimally-typed client so this runs against the RLS server client or the
// service-role admin client (both expose `.from`) — the same loose-client
// pattern as the three callers. RLS still applies to the RLS client.
export type EngineStatRowsClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * The legacy stat projection all three engine callers historically read —
 * kept in lockstep with the loaders' `BoxScoreRow` shape so baseline capture,
 * the outcome sweep, and the engine run all measure identically
 * (apples-to-apples did-it-move).
 */
const LEGACY_STAT_SELECT =
  'id, player_id, stat_type, session_date, at_bats, hits, doubles, triples, home_runs, walks, strikeouts, innings_pitched, earned_runs, walks_allowed, strikeouts_thrown, exit_velocity, pitch_velocity';

/** Canonical box-score projections — exactly what the normalizers consume. */
const BOX_BATTING_SELECT = 'id, game_id, player_id, ab, h, doubles, triples, hr, bb, k, hbp, sf';
const BOX_PITCHING_SELECT = 'id, game_id, player_id, ip, er, bb, k, pitch_count, strikes';

interface BoxBattingRow {
  id: string;
  game_id: string;
  player_id: string;
  ab: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  k: number;
  hbp: number | null;
  sf: number;
}

interface BoxPitchingRow {
  id: string;
  game_id: string;
  player_id: string;
  ip: number;
  er: number;
  bb: number;
  k: number;
  pitch_count: number | null;
  strikes: number | null;
}

interface GameRow {
  id: string;
  game_date: string | null;
}

const isLegacyGameRow = (r: BoxScoreRow): boolean => (r.stat_type ?? '').toLowerCase() === 'game';

/**
 * Load the reconciled per-session stat-row pool for the given players.
 *
 * Every read is team-scoped and paginated past the PostgREST 1000-row cap with
 * a stable order (the legacy read keeps its original newest-first
 * session_date + id-asc tiebreak; canonical reads page on id) so page
 * boundaries are deterministic. Box-score rows carry no date of their own, so
 * `session_date` comes from the joined `baseball_games.game_date`; a row whose
 * game has no resolvable date gets `session_date: null` and is excluded from
 * date-scoped aggregates (rolling windows, after-window filters) exactly as a
 * legacy row missing `session_date` always was — counted in totals, never
 * silently placed in time.
 */
export async function loadEngineStatRows(
  db: EngineStatRowsClient,
  teamId: string,
  playerIds: string[],
): Promise<{ data: BoxScoreRow[] | null; error: { message: string; code?: string | null } | null }> {
  if (playerIds.length === 0) return { data: [], error: null };

  const [legacyRes, gamesRes, battingRes, pitchingRes] = await Promise.all([
    fetchAllRowsResult<BoxScoreRow>((from, to) =>
      db
        .from('baseball_player_stats')
        .select(LEGACY_STAT_SELECT)
        .eq('team_id', teamId)
        .in('player_id', playerIds)
        .order('session_date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult<GameRow>((from, to) =>
      db
        .from('baseball_games')
        .select('id, game_date')
        .eq('team_id', teamId)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult<BoxBattingRow>((from, to) =>
      db
        .from('baseball_box_score_batting')
        .select(BOX_BATTING_SELECT)
        .eq('team_id', teamId)
        .in('player_id', playerIds)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult<BoxPitchingRow>((from, to) =>
      db
        .from('baseball_box_score_pitching')
        .select(BOX_PITCHING_SELECT)
        .eq('team_id', teamId)
        .in('player_id', playerIds)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  // Legacy read failure is the callers' pre-existing hard-failure path.
  if (legacyRes.error) return { data: null, error: legacyRes.error };
  const legacyRows = (legacyRes.data ?? []) as BoxScoreRow[];

  // Canonical-side failure degrades ALL-OR-NOTHING to the legacy pool — the
  // exact pre-migration behavior. A partial blend (batting ok, pitching
  // failed) could double count a two-way player, so we never take one side.
  if (gamesRes.error || battingRes.error || pitchingRes.error) {
    return { data: legacyRows, error: null };
  }

  const gameDateById = new Map<string, string | null>();
  for (const g of (gamesRes.data ?? []) as GameRow[]) {
    gameDateById.set(g.id, g.game_date ?? null);
  }

  const normalized: BoxScoreRow[] = [
    ...((battingRes.data ?? []) as BoxBattingRow[]).map((r) =>
      normalizeBoxScoreBattingRow(r, gameDateById.get(r.game_id) ?? null),
    ),
    ...((pitchingRes.data ?? []) as BoxPitchingRow[]).map((r) =>
      normalizeBoxScorePitchingRow(r, gameDateById.get(r.game_id) ?? null),
    ),
  ];
  if (normalized.length === 0) return { data: legacyRows, error: null };

  // Precedence rule 1, scoped by (player_id, date) — NOT by player alone.
  // `baseball_player_stats` has no game_id, so we correlate on the resolved
  // canonical game date instead, truncated to YYYY-MM-DD on both sides (a
  // `date` column round-trips bare already, but callers/mocks shouldn't have
  // to guarantee that). A legacy game row drops only when THIS player has a
  // canonical row on THAT calendar day; legacy games on dates the canonical
  // layer never covered stay in the pool (rule 3's fallback, at row grain).
  const toDateOnly = (d: string | null | undefined): string | null => (d ? d.slice(0, 10) : null);
  const canonicalPlayerDates = new Set<string>();
  for (const r of normalized) {
    const d = toDateOnly(r.session_date);
    if (d) canonicalPlayerDates.add(`${r.player_id}|${d}`);
  }
  // Rules 2 + 3: practice/other rows, and any legacy game row whose date has
  // no canonical coverage for that player, always pass through untouched.
  const retainedLegacy = legacyRows.filter((r) => {
    if (!isLegacyGameRow(r)) return true;
    const d = toDateOnly(r.session_date);
    return !d || !canonicalPlayerDates.has(`${r.player_id}|${d}`);
  });

  return { data: [...normalized, ...retainedLegacy], error: null };
}

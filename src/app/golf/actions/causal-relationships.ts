'use server';

/**
 * ============================================================================
 * CoachHelm · Causal relationships — dedupe-aware READ action
 * ----------------------------------------------------------------------------
 * The `golf_causal_relationships` table holds GENUINE causal-engine output (real
 * Pearson / temporal / dose-response analysis over real rounds — "why your
 * scores move"). It was NEVER read back into any browsing UI, and a save-path
 * bug (fresh `crypto.randomUUID()` on every run + `upsert(onConflict:'id')`)
 * APPENDED a duplicate row per per-round review — 3,118 physical rows for only
 * ~33 distinct logical relationships (one gir→scoring relationship 1,831×).
 *
 * This action surfaces the table for the player + coach browsing panels, with a
 * MANDATORY JS dedupe by natural key so the same relationship is never shown
 * more than once. Supabase JS has no DISTINCT ON, so we dedupe in JS (no raw
 * SQL / RPC / migration). The natural key here MUST match the engine's
 * select-then-update key in
 * `src/lib/coachhelm/v2/mining/causal-engine.ts#saveRelationships`:
 *
 *     `${player_id}|${cause}|${effect}|${relationship_type}`
 *
 * Scope facts (verified): rows are keyed by `player_id` only — the `team_id`
 * column is NULL on every row, so team scope is resolved via `golf_team_members`
 * (active) → fetch per player, NOT a `team_id` filter. `confounders` is always
 * `[]` (the panel renders no confounders affordance).
 * ========================================================================== */

import { createClient } from '@/lib/supabase/server';
import {
  verifyPlayerAccess,
  verifyTeamAccess,
} from '@/lib/auth/verify-player-access';
import { logServerError } from '@/lib/server-error-logger';

/** One de-duplicated causal relationship row for the browsing panels. */
export interface CausalRelationshipRow {
  id: string;
  player_id: string;
  cause: string;
  cause_metric: string | null;
  effect: string;
  effect_metric: string | null;
  relationship_type: string;
  strength: number;
  confidence: number;
  mechanism: string;
  dose_response: boolean;
  intervention_potential: number;
  created_at: string | null;
}

/** The raw row shape we select from `golf_causal_relationships`. */
interface RawCausalRow {
  id: string;
  player_id: string;
  cause: string | null;
  cause_metric: string | null;
  effect: string | null;
  effect_metric: string | null;
  relationship_type: string | null;
  strength: number | null;
  confidence: number | null;
  mechanism: string | null;
  dose_response: boolean | null;
  intervention_potential: number | null;
  created_at: string | null;
}

const SELECT_COLUMNS =
  'id, player_id, cause, cause_metric, effect, effect_metric, relationship_type, strength, confidence, mechanism, dose_response, intervention_potential, created_at';

/**
 * Cap the per-player fetch so a 2,033-row player doesn't over-fetch. We order
 * newest-first and keep the FIRST row per natural key, so the cap still captures
 * every distinct logical relationship in practice (there are only ~4 causes × 1
 * effect × 2 relationship types).
 */
const FETCH_LIMIT = 2500;

/** Natural-key dedupe key — kept consistent with the engine save path. */
function naturalKey(row: RawCausalRow): string {
  return `${row.player_id}|${row.cause ?? ''}|${row.effect ?? ''}|${row.relationship_type ?? ''}`;
}

/**
 * Dedupe a newest-first list of raw rows by natural key, keeping the FIRST
 * (newest) per key, normalize to `CausalRelationshipRow`, and sort by
 * `confidence * intervention_potential DESC` (the most actionable first).
 */
function dedupeAndRank(rows: RawCausalRow[]): CausalRelationshipRow[] {
  const seen = new Set<string>();
  const out: CausalRelationshipRow[] = [];

  for (const row of rows) {
    // Skip rows missing the identity fields that make a relationship meaningful.
    if (!row.cause || !row.effect || !row.relationship_type) continue;
    const key = naturalKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: row.id,
      player_id: row.player_id,
      cause: row.cause,
      cause_metric: row.cause_metric,
      effect: row.effect,
      effect_metric: row.effect_metric,
      relationship_type: row.relationship_type,
      strength: row.strength ?? 0,
      confidence: row.confidence ?? 0,
      mechanism: row.mechanism ?? '',
      dose_response: Boolean(row.dose_response),
      intervention_potential: row.intervention_potential ?? 0,
      created_at: row.created_at,
    });
  }

  // Most actionable first: confidence × intervention potential, descending.
  out.sort(
    (a, b) =>
      b.confidence * b.intervention_potential -
      a.confidence * a.intervention_potential,
  );

  return out;
}

/**
 * Fetch (newest-first, capped) + dedupe one player's causal relationships.
 * Assumes the caller has already authorized access to `playerId`.
 */
async function fetchPlayerRowsDeduped(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
  includeInactive = false,
): Promise<CausalRelationshipRow[]> {
  // Table is not in the generated types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from('golf_causal_relationships' as any) as any)
    .select(SELECT_COLUMNS)
    .eq('player_id', playerId);

  // Default to ACTIVE rows only. A relationship the engine stops detecting is
  // soft-superseded (is_active=false) by CausalEngine.saveRelationships; without
  // this default the panel showed those stale rows forever (the "old stuff"
  // bug). Analytics callers can opt back in via includeInactive.
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) {
    await logServerError(
      `getPlayerCausalRelationships fetch failed: ${error.message ?? String(error)}`,
      { action: 'causal-relationships.fetchPlayerRowsDeduped', playerId },
    );
    return [];
  }

  return dedupeAndRank((data ?? []) as unknown as RawCausalRow[]);
}

/**
 * Player-scoped read. Auth: the authenticated caller must BE the player
 * (self-access) or a coach who staffs a team the player is an active member of
 * (mirrors `verifyPlayerAccess`). Returns a de-duplicated, actionability-sorted
 * list. Returns `[]` on any auth failure or DB error (honest-empty; the panel
 * renders a calm empty state — never a fabricated relationship).
 */
export async function getPlayerCausalRelationships(
  playerId: string,
  opts?: { includeInactive?: boolean },
): Promise<CausalRelationshipRow[]> {
  if (!playerId) return [];

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const access = await verifyPlayerAccess(playerId, user.id, supabase);
  if (!access.allowed) return [];

  return fetchPlayerRowsDeduped(supabase, playerId, opts?.includeInactive ?? false);
}

/**
 * Team-scoped read. Auth: the authenticated caller must staff `teamId`
 * (`verifyTeamAccess`). Resolves the team's ACTIVE player_ids via
 * `golf_team_members`, then fetches + dedupes per player. Returns a
 * `Record<playerId, CausalRelationshipRow[]>` (players with no rows are simply
 * absent from the map). Returns `{}` on any auth failure or DB error.
 */
export async function getTeamCausalRelationships(
  teamId: string,
  opts?: { includeInactive?: boolean },
): Promise<Record<string, CausalRelationshipRow[]>> {
  if (!teamId) return {};

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const access = await verifyTeamAccess(teamId, user.id, supabase);
  if (!access.allowed) return {};

  // Resolve active roster player_ids (team scope is via membership — the table's
  // own team_id column is NULL on every row, so it can't be filtered on).
  const { data: members, error: membersError } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  if (membersError) {
    await logServerError(
      `getTeamCausalRelationships members fetch failed: ${membersError.message ?? String(membersError)}`,
      { action: 'causal-relationships.getTeamCausalRelationships', metadata: { teamId } },
    );
    return {};
  }

  const playerIds = (members ?? [])
    .map((m) => m.player_id)
    .filter((id): id is string => Boolean(id));

  if (playerIds.length === 0) return {};

  const byPlayer: Record<string, CausalRelationshipRow[]> = {};
  await Promise.all(
    playerIds.map(async (pid) => {
      const rows = await fetchPlayerRowsDeduped(supabase, pid, opts?.includeInactive ?? false);
      // Only include players who actually have relationships (honest-empty:
      // players with zero rows — e.g. Tyler Passmore — are absent from the map,
      // and the panel renders its calm empty state via `?? []`).
      if (rows.length > 0) byPlayer[pid] = rows;
    }),
  );

  return byPlayer;
}

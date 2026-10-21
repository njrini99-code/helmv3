import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isFlagEnabled } from '@/lib/flags';
import { logServerError } from '@/lib/server-error-logger';
import { chunkIds } from '@/lib/supabase/chunk-ids';

/**
 * CoachHelm's one-team canary (turn-on plan: each wave runs on one team
 * first). The v3 flags in `config/feature-flags.yml` are global booleans;
 * `HELM_COACHHELM_TEAMS` narrows them to a list of golf_teams ids, the same way
 * `HELM_CLUBHOUSE_TEAMS` narrows Clubhouse (`src/clubhouse/gate.ts`).
 *
 * - Unset, empty or `*`: no limit. `isCoachHelmFlagEnabled` is exactly
 *   `isFlagEnabled`, and no team is ever read.
 * - A list: a flag reads as on only inside a team scope
 *   (`runWithCoachHelmTeams`) that holds a listed team. No scope, or a team
 *   that could not be read, reads as off: today's production state.
 *
 * Only the CoachHelm v3 engine and delivery flags go through this. Never auth,
 * RLS or `golf_clubhouse_ui`.
 */

type AnyClient = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The canary team list, or null when every team gets the global flag. */
export function coachhelmTeamAllowlist(): Set<string> | null {
  const ids = (process.env.HELM_COACHHELM_TEAMS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.includes('*')) return null;
  return ids.length ? new Set(ids) : null;
}

const teamScope = new AsyncLocalStorage<readonly string[]>();

/** Run `fn` with these golf_teams ids as the CoachHelm team scope. Nests: the inner scope wins. */
export function runWithCoachHelmTeams<T>(teamIds: readonly string[], fn: () => T): T {
  return teamScope.run([...teamIds], fn);
}

/** The team scope `fn` runs in, or undefined outside any scope. */
export function currentCoachHelmTeams(): readonly string[] | undefined {
  return teamScope.getStore();
}

/**
 * The CoachHelm v3 flag read. With no allowlist this is `isFlagEnabled`. With
 * one, the flag must be on AND the current team scope must hold a listed team;
 * outside a scope it is off (fail closed).
 */
export function isCoachHelmFlagEnabled(featureId: string): boolean {
  if (!isFlagEnabled(featureId)) return false;
  const allow = coachhelmTeamAllowlist();
  if (!allow) return true;
  const teams = currentCoachHelmTeams();
  return teams !== undefined && teams.some((id) => allow.has(id));
}

/**
 * The player's active golf_teams ids, or null when the read failed (logged).
 * Callers treat null as no team, so the gate fails closed (the flag reads as
 * off for this player).
 */
export async function loadPlayerTeamIds(supabase: AnyClient, playerId: string): Promise<string[] | null> {
  try {
    const { data, error } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', playerId)
      .eq('status', 'active');
    if (error) {
      void logServerError(`[coachhelm canary] team read failed; flags read as off: ${error.message}`, {
        action: 'coachhelm.canary.loadPlayerTeamIds',
        featureArea: 'coachhelm',
      }, 'warning');
      return null;
    }
    return ((data ?? []) as Array<{ team_id: string | null }>)
      .map((r) => r.team_id)
      .filter((id): id is string => typeof id === 'string');
  } catch (err) {
    void logServerError(
      `[coachhelm canary] team read threw; flags read as off: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'coachhelm.canary.loadPlayerTeamIds', featureArea: 'coachhelm' },
      'warning',
    );
    return null;
  }
}

/**
 * Run a per-player entry point in that player's team scope. With no
 * allowlist it calls `fn` directly: no client is made and nothing is read.
 * A client that cannot be made counts as a failed team read (empty scope).
 */
export async function withPlayerCoachHelmTeams<T>(
  playerId: string,
  getClient: () => AnyClient | Promise<AnyClient>,
  fn: () => Promise<T>,
): Promise<T> {
  if (!coachhelmTeamAllowlist()) return fn();
  let teamIds: string[];
  try {
    // A failed read is no team: every canary flag reads as off (fail closed).
    teamIds = (await loadPlayerTeamIds(await getClient(), playerId)) ?? [];
  } catch {
    teamIds = [];
  }
  return runWithCoachHelmTeams(teamIds, fn);
}

/**
 * For batch jobs over many players: player id → the canary teams that player
 * is active on, in one read. Null with no allowlist (nothing read). A read
 * error returns an empty map, so every player reads as off.
 */
export async function loadCanaryPlayerTeams(supabase: AnyClient): Promise<Map<string, string[]> | null> {
  const allow = coachhelmTeamAllowlist();
  if (!allow) return null;
  const out = new Map<string, string[]>();
  try {
    const { data, error } = await supabase
      .from('golf_team_members')
      .select('player_id, team_id')
      .in('team_id', [...allow])
      .eq('status', 'active');
    if (error) {
      void logServerError(`[coachhelm canary] roster read failed; flags read as off: ${error.message}`, {
        action: 'coachhelm.canary.loadCanaryPlayerTeams',
        featureArea: 'coachhelm',
      }, 'warning');
      return out;
    }
    for (const row of (data ?? []) as Array<{ player_id: string | null; team_id: string | null }>) {
      if (!row.player_id || !row.team_id) continue;
      out.set(row.player_id, [...(out.get(row.player_id) ?? []), row.team_id]);
    }
  } catch (err) {
    void logServerError(
      `[coachhelm canary] roster read threw; flags read as off: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'coachhelm.canary.loadCanaryPlayerTeams', featureArea: 'coachhelm' },
      'warning',
    );
  }
  return out;
}

/**
 * For a feed over a known set of players (a coach's team sweep) during a
 * canary (`allow` is `coachhelmTeamAllowlist()`): player id → the listed teams
 * that player is active on. The ids go in slices of `ID_CHUNK_SIZE`, each well
 * under the 1,000-row response cap. Null when any slice fails (logged):
 * callers read every player as off (fail closed) rather than half the feed.
 */
export async function loadCanaryTeamsForPlayers(
  supabase: AnyClient,
  playerIds: readonly string[],
  allow: ReadonlySet<string>,
): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>();
  const ids = [...new Set(playerIds.filter(Boolean))];
  try {
    for (const chunk of chunkIds(ids)) {
      const { data, error } = await supabase
        .from('golf_team_members')
        .select('player_id, team_id')
        .in('player_id', chunk)
        .in('team_id', [...allow])
        .eq('status', 'active');
      if (error) {
        void logServerError(`[coachhelm canary] player team read failed; flags read as off: ${error.message}`, {
          action: 'coachhelm.canary.loadCanaryTeamsForPlayers',
          featureArea: 'coachhelm',
        }, 'warning');
        return null;
      }
      for (const row of (data ?? []) as Array<{ player_id: string | null; team_id: string | null }>) {
        if (!row.player_id || !row.team_id) continue;
        out.set(row.player_id, [...(out.get(row.player_id) ?? []), row.team_id]);
      }
    }
  } catch (err) {
    void logServerError(
      `[coachhelm canary] player team read threw; flags read as off: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'coachhelm.canary.loadCanaryTeamsForPlayers', featureArea: 'coachhelm' },
      'warning',
    );
    return null;
  }
  return out;
}

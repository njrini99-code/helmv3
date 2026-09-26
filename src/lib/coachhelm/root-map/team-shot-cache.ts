import 'server-only';
/**
 * Cross-request cache for the coach Brief's team shot read
 * (`loaders.ts#loadTeamShotContext`, ~2 s of holes + shots paging per load).
 *
 * Order matters, and every step before the cache runs on the REQUEST client:
 *   1. Access gate: `is_golf_team_coach(teamId)` must be true, and only
 *      players on that team's active roster go further (requested ids that
 *      are not on it are dropped, never read).
 *   2. Round pick (`selectTeamShotRounds`): RLS decides which rounds the
 *      coach can see. The cache only ever receives these round ids.
 *   3. Per player, `unstable_cache` over the holes, shots and SG scale of
 *      exactly those rounds, read with the service client (unstable_cache
 *      cannot read cookies). The key is team id + player id + the round ids +
 *      the newest round `updated_at`, so a new, removed or edited round is a
 *      new entry, and one team's entry can never answer another team's call.
 *      TTL {@link TEAM_SHOT_CACHE_TTL_S}.
 *
 * Per player, not per team: Next's data cache skips entries over 2 MB, and a
 * roster's rows are several times that (the largest single player's 40
 * rounds of shots is under 1 MB on production, 2026-09).
 *
 * Failure contract matches the loaders: null on a failed gate or read.
 */
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { loadTeamShotChildren, selectTeamShotRounds, type ApproachContextLoad, type TeamShotChildren } from './loaders';

type Sb = SupabaseClient<Database>;

/** About ten minutes: a new round changes the key at once, the TTL bounds
 *  staleness from edits that do not touch the round row. */
export const TEAM_SHOT_CACHE_TTL_S = 600;

export const TEAM_SHOT_CACHE_KEY = 'coachhelm-team-shot-context-v1';

export function teamShotCacheTag(teamId: string): string {
  return `coachhelm-team-shots:${teamId}`;
}

async function readPlayerChildren(teamId: string, playerId: string, roundIds: string[], stamp: string): Promise<TeamShotChildren> {
  // teamId and stamp are key parts only (unstable_cache keys on the args).
  void teamId;
  void stamp;
  const admin = createAdminClient();
  const out = await loadTeamShotChildren(admin, new Map([[playerId, roundIds]]));
  return out.get(playerId) ?? { holes: [], shots: [], scale: 1 };
}

function cachedPlayerChildren(teamId: string, playerId: string, roundIds: string[], stamp: string): Promise<TeamShotChildren> {
  return unstable_cache(readPlayerChildren, [TEAM_SHOT_CACHE_KEY], {
    revalidate: TEAM_SHOT_CACHE_TTL_S,
    tags: [teamShotCacheTag(teamId)],
  })(teamId, playerId, roundIds, stamp);
}

function warn(message: string, err: unknown): void {
  void logServerError(
    `${message}: ${describeError(err)}`,
    { action: 'rootMap.loadTeamShotContextCached', featureArea: 'coachhelm', skipSentry: true },
    'warning',
  ).catch(() => undefined);
}

/**
 * `loadTeamShotContext` for one team, gated and cached. Same result shape;
 * players with no countable round are absent.
 */
export async function loadTeamShotContextCached(
  sb: Sb,
  teamId: string,
  playerIds: string[],
): Promise<Map<string, ApproachContextLoad> | null> {
  const out = new Map<string, ApproachContextLoad>();
  if (!teamId) return null;
  try {
    const { data: isCoach, error: gateErr } = await sb.rpc('is_golf_team_coach', { team_uuid: teamId });
    if (gateErr) throw gateErr;
    if (isCoach !== true) {
      warn(`[root-map] team shot read refused: caller is not a coach of team ${teamId}`, new Error('not a team coach'));
      return null;
    }
    if (playerIds.length === 0) return out;
    const { data: members, error: rosterErr } = await sb
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');
    if (rosterErr) throw rosterErr;
    const onRoster = new Set((members ?? []).map((m) => m.player_id));
    const allowed = [...new Set(playerIds)].filter((id) => onRoster.has(id));

    const picked = await selectTeamShotRounds(sb, allowed);
    const entries = await Promise.all(
      [...picked].map(async ([playerId, { rounds, stamp }]) => {
        const c = await cachedPlayerChildren(teamId, playerId, rounds.map((r) => r.id), stamp);
        return [playerId, { rounds, holes: c.holes, shots: c.shots, scale: c.scale }] as const;
      }),
    );
    for (const [playerId, load] of entries) out.set(playerId, load);
    return out;
  } catch (err) {
    warn(`[root-map] cached team shot context read failed for team ${teamId}`, err);
    return null;
  }
}

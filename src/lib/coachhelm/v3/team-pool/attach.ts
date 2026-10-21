/**
 * The one call the generator base makes (CoachHelm Slice 7a): with
 * `coachhelm_team_pool_v1` on, put the team line on a read as
 * `comparison.primary`; with it off, return the evidence untouched (the same
 * object), so every read is byte-for-byte what it was before this slice.
 *
 * Never throws: a read whose family no pool measures, a player with no single
 * team, a roster under the privacy or teammate floor, or a failed load all
 * leave the evidence as composed.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { computeTeamPool, familyForRead, poolWindowFor, withTeamComparison } from './pool';
import { loadTeamPoolPlayers, resolvePlayerTeam } from './loader';
import { teamPoolEnabled } from './flag';

export { TEAM_POOL_FLAG, teamPoolEnabled } from './flag';

export async function attachTeamPool<E extends InsightEvidence>(input: {
  supabase: SupabaseClient;
  playerId: string;
  insightType: string;
  evidence: E;
  /** The window the read's value covers (a rolling generator's own window). */
  windowSource?: Pick<InsightEvidence, 'window_start' | 'window_end' | 'window_days' | 'window_basis'>;
  now?: Date;
}): Promise<E> {
  const { evidence } = input;
  if (!teamPoolEnabled()) return evidence;
  try {
    const family = familyForRead(input.insightType, evidence.metric);
    if (!family) return evidence;
    const teamId = await resolvePlayerTeam(input.supabase, input.playerId);
    if (!teamId) return evidence;
    const players = await loadTeamPoolPlayers(input.supabase, teamId);
    if (!players) return evidence;
    const outcome = computeTeamPool({
      players,
      playerId: input.playerId,
      family,
      window: poolWindowFor(input.windowSource ?? evidence, input.now),
    });
    return outcome.kind === 'pool' ? withTeamComparison(evidence, outcome.pool) : evidence;
  } catch {
    return evidence;
  }
}

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { BaseballPlayerAggregates } from '@/lib/types';
import { mergeSeasonStatsIntoAggregates } from './roster-aggregates-merge';
import { fetchRosterLegacyAggregates } from './roster-legacy-aggregates-source';

export type RosterMemberStatus =
  | 'pending'
  | 'active'
  | 'inactive'
  | 'removed'
  | 'injured'
  | 'alumni';

export interface RosterPlayerBio {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  recruiting_activated: boolean | null;
}

export interface RosterTeamMember {
  id: string;
  jersey_number: number | null;
  joined_at: string | null;
  status: RosterMemberStatus | null;
  player: RosterPlayerBio;
}

export interface RosterReadModel {
  teamId: string;
  authorized: boolean;
  members: RosterTeamMember[];
  aggregates: Record<string, BaseballPlayerAggregates>;
  rosterError: boolean;
  aggregatesError: boolean;
}

const REVOKED_STAFF_STATUSES = new Set(['suspended', 'removed', 'invited']);

async function isTeamStaff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) return false;

  const { data: staff } = await supabase
    .from('baseball_team_coach_staff')
    .select('id, status')
    .eq('team_id', teamId)
    .eq('coach_id', coach.id)
    .maybeSingle();

  if (!staff) return false;
  const status = typeof staff.status === 'string' ? staff.status : null;
  if (status && REVOKED_STAFF_STATUSES.has(status)) return false;
  return true;
}

function emptyResult(teamId: string, authorized: boolean): RosterReadModel {
  return {
    teamId,
    authorized,
    members: [],
    aggregates: {},
    rosterError: false,
    aggregatesError: false,
  };
}

/**
 * Canonical roster read model (#411). Distinguishes load failures from empty rosters.
 */
export async function getRoster(teamId: string): Promise<RosterReadModel> {
  const supabase = await createClient();

  if (!(await isTeamStaff(supabase, teamId))) {
    return emptyResult(teamId, false);
  }

  const { data: rosterData, error: rosterError } = await supabase
    .from('baseball_team_members')
    .select(`
      id,
      jersey_number,
      joined_at,
      status,
      player:baseball_players (
        id,
        first_name,
        last_name,
        email,
        primary_position,
        secondary_position,
        grad_year,
        city,
        state,
        avatar_url,
        recruiting_activated
      )
    `)
    .eq('team_id', teamId)
    .order('joined_at', { ascending: false });

  if (rosterError) {
    return {
      ...emptyResult(teamId, true),
      rosterError: true,
    };
  }

  const members = (rosterData ?? []) as unknown as RosterTeamMember[];

  // Raw legacy-fallback input for the shared adapter (see
  // legacy-stat-adapters.ts): fetching the deprecated aggregates table itself
  // now lives entirely in roster-legacy-aggregates-source.ts, so this file
  // stays off the stat-layer-manifest allowlist (#379).
  const { aggregates: legacyAggregates, error: aggregatesFetchError } =
    await fetchRosterLegacyAggregates(supabase, teamId);

  let aggregates: Record<string, BaseballPlayerAggregates> = legacyAggregates;
  const aggregatesError = aggregatesFetchError;

  // Box-score-canonical season stats (baseball_player_season_stats, written by
  // recalculate_baseball_season_stats on every box-score save) is the source
  // of truth the rest of the product treats as current — the Player Profile
  // Stats tab and Passport both read it. The legacy aggregates row fetched
  // above is only ever written by the deprecated CSV/manual stat-log
  // recompute path, so a team that logs games via box scores (the modern,
  // promoted path) has a real, current season_stats row with NO matching
  // legacy row. Merge season_stats OVER the legacy aggregates (via the shared
  // adapter's box-score > legacy-fallback > no-data precedence) so the roster
  // wall/leaderboard/dev-board never show em-dash/0 for a player who
  // genuinely has recent performance data one click away on their own profile.
  const currentSeasonYear = new Date().getFullYear();
  const { data: seasonStatsData, error: seasonStatsError } = await supabase
    .from('baseball_player_season_stats')
    .select('player_id, avg, obp, slg, ops, g, last_updated')
    .eq('team_id', teamId)
    .eq('season_year', currentSeasonYear);

  if (!seasonStatsError && seasonStatsData) {
    aggregates = mergeSeasonStatsIntoAggregates(aggregates, seasonStatsData, teamId);
  }

  return {
    teamId,
    authorized: true,
    members,
    aggregates,
    rosterError: false,
    aggregatesError: Boolean(aggregatesError) || Boolean(seasonStatsError),
  };
}

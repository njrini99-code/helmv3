'use server';

import { createClient } from '@/lib/supabase/server';
import type { Organization, Player } from '@/lib/types';

// Coach type for discoverability filtering
export type CoachType = 'college' | 'juco' | 'high_school' | 'showcase';

// Filters for discover
export interface DiscoverFilters {
  mode?: 'players' | 'teams';
  state?: string;
  states?: string[]; // Support multiple states
  gradYear?: number;
  position?: string;
  minVelo?: number;
  maxVelo?: number;
  minExit?: number;
  maxExit?: number;
  hasVideo?: boolean;
  search?: string;
  teamType?: 'high_school' | 'showcase' | 'travel_ball' | 'juco';
  page?: number;
  perPage?: number;
  // Coach context for discoverability filtering
  coachId?: string;
  coachType?: CoachType;
}

// Team with additional computed fields for discover
export interface DiscoverTeam extends Organization {
  player_count?: number;
  recruiting_active_count?: number;
  top_prospects?: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    grad_year: number | null;
    avatar_url?: string | null;
  }>;
}

// Player with joined data for discover
export interface DiscoverPlayer extends Player {
  high_school_org?: { name: string } | null;
  videos?: Array<{ thumbnail_url: string | null }> | null;
}

interface DiscoverPlayersResult {
  players: DiscoverPlayer[];
  count: number;
  pages: number;
}

interface DiscoverTeamsResult {
  teams: DiscoverTeam[];
  count: number;
  pages: number;
}

/**
 * Get player IDs on the coach's own team (to exclude from discover - they see them in roster)
 */
async function getCoachRosterPlayerIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachId: string | undefined
): Promise<Set<string>> {
  const excludedIds = new Set<string>();

  if (!coachId) return excludedIds;

  // Single query to get all teams the coach manages
  const { data: coachTeams } = await supabase
    .from('baseball_teams')
    .select('id')
    .eq('head_coach_id', coachId);

  const teamIds = coachTeams?.map((t) => t.id) || [];

  if (teamIds.length === 0) return excludedIds;

  // Get roster players for coach's teams
  const { data: rosterPlayers } = await supabase
    .from('baseball_team_members')
    .select('player_id')
    .in('team_id', teamIds);

  rosterPlayers?.forEach((p) => {
    if (p.player_id) excludedIds.add(p.player_id);
  });

  return excludedIds;
}

/**
 * Fetch players for discover page with filters and pagination.
 * OPTIMIZED: Uses is_on_college_team column and proper DB pagination.
 *
 * DISCOVERABILITY RULES:
 * 1. Players must have recruiting_activated = true
 * 2. Players must have is_on_college_team = false (not on a college roster)
 * 3. Players on the coach's own team are excluded (they're in roster)
 */
export async function getDiscoverPlayers(
  filters: DiscoverFilters
): Promise<DiscoverPlayersResult> {
  const supabase = await createClient();
  const perPage = filters.perPage || 24;
  const page = filters.page || 1;
  const offset = (page - 1) * perPage;

  // Get coach's roster player IDs to exclude (single query)
  const coachRosterIds = await getCoachRosterPlayerIds(supabase, filters.coachId);

  // Build optimized query with DB-level filtering and pagination
  let query = supabase
    .from('baseball_players')
    .select(
      `
      id,
      first_name,
      last_name,
      full_name,
      avatar_url,
      city,
      state,
      primary_position,
      secondary_position,
      grad_year,
      pitch_velo,
      exit_velo,
      sixty_time,
      bats,
      throws,
      gpa,
      high_school_name,
      has_video,
      recruiting_activated,
      updated_at,
      high_school_org:organizations!players_high_school_org_id_fkey(name)
    `,
      { count: 'exact' }
    )
    .eq('recruiting_activated', true)
    .eq('is_on_college_team', false); // Use indexed column instead of complex join

  // Apply filters at DB level
  if (filters.gradYear) {
    query = query.eq('grad_year', filters.gradYear);
  }
  if (filters.position) {
    query = query.or(
      `primary_position.eq.${filters.position},secondary_position.eq.${filters.position}`
    );
  }
  if (filters.states && filters.states.length > 0) {
    const validStates = filters.states.filter((s): s is string => Boolean(s));
    if (validStates.length === 1 && validStates[0]) {
      query = query.eq('state', validStates[0]);
    } else if (validStates.length > 1) {
      query = query.in('state', validStates);
    }
  } else if (filters.state) {
    query = query.eq('state', filters.state);
  }
  if (filters.minVelo) {
    query = query.gte('pitch_velo', filters.minVelo);
  }
  if (filters.maxVelo) {
    query = query.lte('pitch_velo', filters.maxVelo);
  }
  if (filters.minExit) {
    query = query.gte('exit_velo', filters.minExit);
  }
  if (filters.maxExit) {
    query = query.lte('exit_velo', filters.maxExit);
  }
  if (filters.hasVideo) {
    query = query.eq('has_video', true);
  }
  if (filters.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,high_school_name.ilike.%${filters.search}%`
    );
  }

  // Execute with DB-level pagination
  const { data: players, count, error } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  if (error) {
    console.error('Error fetching players:', error);
    return { players: [], count: 0, pages: 0 };
  }

  // Filter out coach's own roster players (small client-side filter)
  const filteredPlayers = (players || []).filter(
    (p) => !coachRosterIds.has(p.id)
  );

  // Adjust count for excluded roster players (approximate)
  const adjustedCount = Math.max(0, (count || 0) - coachRosterIds.size);

  return {
    players: filteredPlayers as DiscoverPlayer[],
    count: adjustedCount,
    pages: Math.ceil(adjustedCount / perPage),
  };
}

/**
 * Fetch teams/organizations for discover page with filters and pagination
 */
export async function getDiscoverTeams(
  filters: DiscoverFilters
): Promise<DiscoverTeamsResult> {
  const supabase = await createClient();
  const perPage = filters.perPage || 24;
  const page = filters.page || 1;
  const offset = (page - 1) * perPage;

  // Build base query for organizations
  let query = supabase
    .from('organizations')
    .select('*', { count: 'exact' })
    .in('type', ['high_school', 'showcase', 'travel_ball', 'juco']);

  // Apply filters
  if (filters.teamType) {
    query = query.eq('type', filters.teamType);
  }
  // Support multiple states (preferred) or single state
  if (filters.states && filters.states.length > 0) {
    const validStates = filters.states.filter((s): s is string => Boolean(s));
    if (validStates.length === 1 && validStates[0]) {
      query = query.eq('location_state', validStates[0]);
    } else if (validStates.length > 1) {
      query = query.in('location_state', validStates);
    }
  } else if (filters.state) {
    query = query.eq('location_state', filters.state);
  }
  if (filters.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,location_city.ilike.%${filters.search}%`
    );
  }

  // Execute query
  const { data: orgs, count, error } = await query
    .order('name', { ascending: true })
    .range(offset, offset + perPage - 1);

  if (error) {
    console.error('Error fetching teams:', error);
    return { teams: [], count: 0, pages: 0 };
  }

  if (!orgs || orgs.length === 0) {
    return { teams: [], count: 0, pages: 0 };
  }

  // Get all org IDs
  const allOrgIds = orgs.map((o) => o.id);
  const highSchoolOrgIds = orgs.filter((o) => o.type === 'high_school').map((o) => o.id);

  // Count players per org (using Set to track unique player IDs per org)
  const playerIdsByOrg: Record<string, Set<string>> = {};
  const countByOrg: Record<string, number> = {};
  const recruitingByOrg: Record<string, number> = {};
  const playersByOrg: Record<string, Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    grad_year: number | null;
    avatar_url: string | null;
    pitch_velo: number | null;
    recruiting_activated: boolean | null;
  }>> = {};

  // Helper to add player to org (deduplicates)
  const addPlayerToOrg = (orgId: string, player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    grad_year: number | null;
    avatar_url: string | null;
    pitch_velo: number | null;
    recruiting_activated: boolean | null;
  }) => {
    if (!playerIdsByOrg[orgId]) {
      playerIdsByOrg[orgId] = new Set();
    }
    if (playerIdsByOrg[orgId].has(player.id)) return; // Skip duplicates

    playerIdsByOrg[orgId].add(player.id);
    countByOrg[orgId] = (countByOrg[orgId] || 0) + 1;
    if (player.recruiting_activated) {
      recruitingByOrg[orgId] = (recruitingByOrg[orgId] || 0) + 1;
    }
    if (!playersByOrg[orgId]) {
      playersByOrg[orgId] = [];
    }
    playersByOrg[orgId].push(player);
  };

  // 1. Get players directly linked via high_school_org_id (for high school teams)
  if (highSchoolOrgIds.length > 0) {
    const { data: hsPlayers } = await supabase
      .from('baseball_players')
      .select('id, first_name, last_name, primary_position, grad_year, avatar_url, pitch_velo, recruiting_activated, high_school_org_id')
      .in('high_school_org_id', highSchoolOrgIds);

    if (hsPlayers) {
      hsPlayers.forEach((p) => {
        if (p.high_school_org_id) {
          addPlayerToOrg(p.high_school_org_id, p);
        }
      });
    }
  }

  // 2. Get players linked via team_members → teams → organizations (for ALL org types)
  if (allOrgIds.length > 0) {
    // First get teams for these organizations
    const { data: teamsData } = await supabase
      .from('baseball_teams')
      .select('id, organization_id')
      .in('organization_id', allOrgIds);

    if (teamsData && teamsData.length > 0) {
      const teamIds = teamsData.map((t) => t.id);
      const teamToOrgMap: Record<string, string> = {};
      teamsData.forEach((t) => {
        if (t.organization_id) {
          teamToOrgMap[t.id] = t.organization_id;
        }
      });

      // Get team members with player data
      const { data: teamMembers } = await supabase
        .from('baseball_team_members')
        .select(`
          team_id,
          player:players!team_members_player_id_fkey(
            id, first_name, last_name, primary_position, grad_year, avatar_url, pitch_velo, recruiting_activated
          )
        `)
        .in('team_id', teamIds);

      if (teamMembers) {
        teamMembers.forEach((tm) => {
          const orgId = teamToOrgMap[tm.team_id];
          const player = tm.player as {
            id: string;
            first_name: string | null;
            last_name: string | null;
            primary_position: string | null;
            grad_year: number | null;
            avatar_url: string | null;
            pitch_velo: number | null;
            recruiting_activated: boolean | null;
          } | null;

          if (orgId && player) {
            addPlayerToOrg(orgId, player);
          }
        });
      }
    }
  }

  // Get top prospects per org (recruiting-active players with best stats)
  type ProspectType = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    grad_year: number | null;
    avatar_url: string | null;
  };
  const prospectsByOrg: Record<string, ProspectType[]> = {};

  Object.entries(playersByOrg).forEach(([orgId, players]) => {
    // Filter recruiting-active and sort by pitch_velo
    const recruitingPlayers = players
      .filter((p) => p.recruiting_activated)
      .sort((a, b) => (b.pitch_velo || 0) - (a.pitch_velo || 0))
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        primary_position: p.primary_position,
        grad_year: p.grad_year,
        avatar_url: p.avatar_url,
      }));

    if (recruitingPlayers.length > 0) {
      prospectsByOrg[orgId] = recruitingPlayers;
    }
  });

  // Combine data
  const teams: DiscoverTeam[] = orgs.map((org) => ({
    ...org,
    player_count: countByOrg[org.id] || 0,
    recruiting_active_count: recruitingByOrg[org.id] || 0,
    top_prospects: prospectsByOrg[org.id] || [],
  }));

  // Sort by player count (teams with more recruiting-active players first)
  teams.sort((a, b) => (b.recruiting_active_count || 0) - (a.recruiting_active_count || 0));

  return {
    teams,
    count: count || 0,
    pages: Math.ceil((count || 0) / perPage),
  };
}

/**
 * Get watchlist IDs for a coach
 */
export async function getWatchlistIds(coachId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data: watchlist, error } = await supabase
    .from('baseball_watchlists')
    .select('player_id')
    .eq('coach_id', coachId);

  if (error) {
    console.error('Error fetching watchlist:', error);
    return [];
  }

  return watchlist?.map((w) => w.player_id) || [];
}

/**
 * Get state-level counts for the map visualization.
 * OPTIMIZED: Uses is_on_college_team column for fast filtering.
 */
export async function getStateCounts(
  mode: 'players' | 'teams',
  coachId?: string,
  _coachType?: CoachType
): Promise<Record<string, number>> {
  const supabase = await createClient();

  if (mode === 'players') {
    // Get coach's roster to exclude
    const coachRosterIds = await getCoachRosterPlayerIds(supabase, coachId);

    // Single optimized query using is_on_college_team column
    const { data } = await supabase
      .from('baseball_players')
      .select('id, state')
      .eq('recruiting_activated', true)
      .eq('is_on_college_team', false)
      .not('state', 'is', null);

    const counts: Record<string, number> = {};
    data?.forEach((p) => {
      if (!p.state || coachRosterIds.has(p.id)) return;
      counts[p.state] = (counts[p.state] || 0) + 1;
    });
    return counts;
  } else {
    const { data } = await supabase
      .from('organizations')
      .select('location_state')
      .in('type', ['high_school', 'showcase', 'travel_ball', 'juco'])
      .not('location_state', 'is', null);

    const counts: Record<string, number> = {};
    data?.forEach((o) => {
      if (o.location_state) {
        counts[o.location_state] = (counts[o.location_state] || 0) + 1;
      }
    });
    return counts;
  }
}

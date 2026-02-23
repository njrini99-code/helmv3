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
  teamType?: 'high_school' | 'showcase' | 'juco';
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
  head_coach_name?: string | null;
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
 * Get all player IDs who are assigned to a discoverable team (HS / showcase / JUCO org).
 * Players with no team assignment are not surfaced in Discover — basic business rule.
 * Returns null only on DB error (caller should treat as "no filter" fallback).
 */
async function getDiscoverableTeamPlayerIds(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string[] | null> {
  // Step 1: discoverable org IDs
  const { data: orgs, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .in('type', ['high_school', 'showcase', 'juco']);

  if (orgErr || !orgs?.length) return [];

  const orgIds = orgs.map((o) => o.id);

  // Step 2: teams belonging to those orgs
  const { data: teams, error: teamErr } = await supabase
    .from('baseball_teams')
    .select('id')
    .in('organization_id', orgIds);

  if (teamErr || !teams?.length) return [];

  const teamIds = teams.map((t) => t.id);

  // Step 3: members of those teams → unique player IDs
  const { data: members, error: memberErr } = await supabase
    .from('baseball_team_members')
    .select('player_id')
    .in('team_id', teamIds);

  if (memberErr) return null;

  return [...new Set((members ?? []).map((m) => m.player_id).filter(Boolean))];
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

  // head_coach_id does not exist on baseball_teams — get teams via team_coach_staff
  const { data: staffEntries } = await supabase
    .from('baseball_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coachId);

  const coachTeams = staffEntries?.map((e) => ({ id: e.team_id })) ?? [];

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

  // Run pre-queries in parallel: coach's own roster to exclude + all discoverable team player IDs
  const [coachRosterIds, discoverablePlayerIds] = await Promise.all([
    getCoachRosterPlayerIds(supabase, filters.coachId),
    getDiscoverableTeamPlayerIds(supabase),
  ]);

  // If no players are on any discoverable team, return early
  if (discoverablePlayerIds !== null && discoverablePlayerIds.length === 0) {
    return { players: [], count: 0, pages: 0 };
  }

  // Build optimized query with DB-level filtering and pagination
  let query = supabase
    .from('baseball_players')
    .select(
      `
      id,
      first_name,
      last_name,
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
      height_feet,
      height_inches,
      weight_lbs,
      gpa,
      high_school_name,
      has_video,
      recruiting_activated,
      updated_at,
      player_type
    `,
      { count: 'exact' }
    )
    .eq('recruiting_activated', true)
    .neq('player_type', 'college'); // College players are never recruitable

  // Coach-type visibility rules:
  // - JUCO coaches: can only recruit HS/showcase players (not JUCO players)
  // - College coaches: can recruit HS, showcase, AND JUCO players
  if (filters.coachType === 'juco') {
    query = query.in('player_type', ['high_school', 'showcase'] as const);
  }

  // CORE RULE: only players assigned to a discoverable team (HS/showcase/JUCO)
  if (discoverablePlayerIds && discoverablePlayerIds.length > 0) {
    query = query.in('id', discoverablePlayerIds);
  }

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

  // Discoverable org types by coach type:
  // - college: can recruit from HS, showcase, AND JUCO programs
  // - juco: can only recruit from HS programs (not showcase/JUCO)
  const discoverableOrgTypes: readonly ('high_school' | 'showcase' | 'juco')[] =
    filters.coachType === 'juco'
      ? ['high_school']
      : ['high_school', 'showcase', 'juco'];

  // Build base query for organizations
  let query = supabase
    .from('organizations')
    .select('*', { count: 'exact' })
    .in('type', discoverableOrgTypes);

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
  const { data: orgs, error } = await query
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

  // Map orgId → head coach name (primary coach with a name, required for discoverability)
  const headCoachByOrg: Record<string, string> = {};

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

  // Note: baseball_players doesn't have direct high_school_org_id link
  // Players are linked via team_members -> teams -> organizations

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

      // Fetch primary coaches for these teams (parallel with member fetch)
      const [{ data: teamMembers }, { data: primaryCoachRows }] = await Promise.all([
        supabase
          .from('baseball_team_members')
          .select(`
            team_id,
            baseball_players!inner(
              id, first_name, last_name, primary_position, grad_year, avatar_url, pitch_velo, recruiting_activated
            )
          `)
          .in('team_id', teamIds),
        supabase
          .from('baseball_team_coach_staff')
          .select(`
            team_id,
            baseball_coaches!inner(first_name, last_name)
          `)
          .eq('is_primary', true)
          .in('team_id', teamIds),
      ]);

      // Map orgId → primary head coach name
      if (primaryCoachRows) {
        primaryCoachRows.forEach((row) => {
          const orgId = teamToOrgMap[row.team_id];
          const coach = row.baseball_coaches as unknown as { first_name: string | null; last_name: string | null } | null;
          if (!orgId || !coach) return;
          const name = `${coach.first_name ?? ''} ${coach.last_name ?? ''}`.trim();
          if (name && !headCoachByOrg[orgId]) {
            headCoachByOrg[orgId] = name;
          }
        });
      }

      if (teamMembers) {
        teamMembers.forEach((tm) => {
          const orgId = teamToOrgMap[tm.team_id];
          const player = tm.baseball_players as {
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

  // Combine data — only include orgs with a named primary head coach
  const teams: DiscoverTeam[] = orgs
    .map((org) => ({
      ...org,
      player_count: countByOrg[org.id] || 0,
      recruiting_active_count: recruitingByOrg[org.id] || 0,
      head_coach_name: headCoachByOrg[org.id] ?? null,
      top_prospects: prospectsByOrg[org.id] || [],
    }))
    .filter((org) => Boolean(org.head_coach_name));

  // Sort by recruiting-active count (most active prospects first)
  teams.sort((a, b) => (b.recruiting_active_count || 0) - (a.recruiting_active_count || 0));

  return {
    teams,
    count: teams.length,
    pages: Math.ceil(teams.length / perPage),
  };
}

/**
 * Get watchlist IDs for a coach
 */
/**
 * Get watchlist player IDs for the authenticated coach
 * SECURITY: No coachId parameter - derives from authenticated user to prevent IDOR
 */
export async function getWatchlistIds(): Promise<string[]> {
  const supabase = await createClient();

  // SECURITY: Get coach ID from authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return [];
  }

  const { data: watchlist, error } = await supabase
    .from('baseball_watchlists')
    .select('player_id')
    .eq('coach_id', coach.id);

  if (error) {
    // Silent failure for read operations - return empty array
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
   
  _coachType?: CoachType // Reserved: will filter differently by coach type
): Promise<Record<string, number>> {
  const supabase = await createClient();

  if (mode === 'players') {
    // Run pre-queries in parallel
    const [coachRosterIds, discoverablePlayerIds] = await Promise.all([
      getCoachRosterPlayerIds(supabase, coachId),
      getDiscoverableTeamPlayerIds(supabase),
    ]);

    if (discoverablePlayerIds !== null && discoverablePlayerIds.length === 0) {
      return {};
    }

    let stateQuery = supabase
      .from('baseball_players')
      .select('id, state')
      .eq('recruiting_activated', true)
      .neq('player_type', 'college')
      .not('state', 'is', null);

    if (discoverablePlayerIds && discoverablePlayerIds.length > 0) {
      stateQuery = stateQuery.in('id', discoverablePlayerIds);
    }

    const { data } = await stateQuery;

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
      .in('type', ['high_school', 'showcase', 'juco'])
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

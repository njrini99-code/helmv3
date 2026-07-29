'use server';

import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { createClient } from '@/lib/supabase/server';
import type { Organization, Player } from '@/lib/types';
import { logServerError } from '@/lib/server-error-logger';
import {
  getPrivatePlayerIds,
  formatIdListForNotIn,
  getCoachRosterPlayerIds,
} from '@/lib/baseball/player-visibility';
import { describeError } from '@/lib/utils/describe-error';

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

  // Step 2: teams belonging to those orgs.
  //
  // Read through public.baseball_teams_public_profile, not the base table.
  // Discover is deliberately cross-tenant, but baseball_teams' SELECT policy
  // scopes rows to teams the caller staffs or plays for — against the base
  // table this step would resolve to the coach's own program and silently
  // zero out Discover. The view is security_invoker = false (evaluated as its
  // owner), exposes only non-sensitive identity columns, and never join_code.
  //
  // It also excludes programs with public_profile_mode = 'private'. That is
  // the intended discovery semantic, not an accident: a program that turned
  // its public profile off has opted out of being surfaced to other programs,
  // and its players' own recruiting_activated flag still governs whether they
  // appear via any other route.
  const { data: teams, error: teamErr } = await supabase
    .from('baseball_teams_public_profile')
    .select('id')
    .in('organization_id', orgIds);

  if (teamErr || !teams?.length) return [];

  // The view's generated column types are nullable (every column of a view is),
  // so narrow before feeding the ids back into a filter.
  const teamIds = teams.map((t) => t.id).filter((id): id is string => Boolean(id));

  if (teamIds.length === 0) return [];

  // Step 3: members of those teams → unique player IDs
  const { data: members, error: memberErr } = await supabase
    .from('baseball_team_members')
    .select('player_id')
    .in('team_id', teamIds);

  if (memberErr) return null;

  return [...new Set((members ?? []).map((m) => m.player_id).filter(Boolean))];
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
async function getDiscoverPlayersImpl(
  filters: DiscoverFilters
): Promise<DiscoverPlayersResult> {
  const supabase = await createClient();

  // SECURITY: Derive coach identity and type from authenticated session — ignore client-supplied values
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { players: [], count: 0, pages: 0 };

  const { data: coachProfile } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type')
    .eq('user_id', user.id)
    .single();

  if (!coachProfile) return { players: [], count: 0, pages: 0 };

  const serverCoachId = coachProfile.id as string;
  const serverCoachType = coachProfile.coach_type as CoachType;

  const perPage = filters.perPage || 24;
  const page = filters.page || 1;
  const offset = (page - 1) * perPage;

  // Run pre-queries in parallel: coach's own roster to exclude + all discoverable
  // team player IDs + players whose profile_visibility is 'private' (P0 privacy —
  // must exclude these the same way assertCoachCanRecruitPlayer does).
  const [coachRosterIds, discoverablePlayerIds, privatePlayerIds] = await Promise.all([
    getCoachRosterPlayerIds(supabase, serverCoachId),
    getDiscoverableTeamPlayerIds(supabase),
    getPrivatePlayerIds(supabase),
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

  // Coach-type visibility rules (server-derived — not client-supplied):
  // - JUCO coaches: can only recruit HS/showcase players (not JUCO players)
  // - College coaches: can recruit HS, showcase, AND JUCO players
  if (serverCoachType === 'juco') {
    query = query.in('player_type', ['high_school', 'showcase'] as const);
  }

  // CORE RULE: only players assigned to a discoverable team (HS/showcase/JUCO)
  if (discoverablePlayerIds && discoverablePlayerIds.length > 0) {
    query = query.in('id', discoverablePlayerIds);
  }

  // P0 PRIVACY: exclude players with profile_visibility = 'private' (same
  // semantics as assertCoachCanRecruitPlayer). Applied at the DB level (not a
  // post-fetch JS filter) so pagination/count stay correct even when many
  // players are private.
  if (privatePlayerIds.size > 0) {
    query = query.not('id', 'in', formatIdListForNotIn(privatePlayerIds));
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
    await logServerError(`Error fetching players: ${describeError(error)}`, { action: 'discover.getDiscoverPlayers' });
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
 * Get organization IDs that have a named primary head coach.
 * Discoverability rule: an org only appears in Discover if it has a primary
 * coach on staff with a resolvable name. Pushed into the DB query (via `.in`)
 * so the exact count / pagination reflects this filter instead of a JS
 * post-filter after pagination.
 */
async function getOrgIdsWithNamedHeadCoach(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('baseball_team_coach_staff')
    .select(
      `
      team_id,
      baseball_teams!inner(organization_id),
      baseball_coaches!inner(full_name)
    `
    )
    .eq('is_primary', true);

  if (error) return null;

  const orgIds = new Set<string>();
  (data ?? []).forEach((row) => {
    const team = row.baseball_teams as unknown as { organization_id: string | null } | null;
    const coach = row.baseball_coaches as unknown as { full_name: string | null } | null;
    if (!team?.organization_id || !coach) return;
    const name = (coach.full_name ?? '').trim();
    if (name) orgIds.add(team.organization_id);
  });

  return [...orgIds];
}

/**
 * Fetch teams/organizations for discover page with filters and pagination
 */
async function getDiscoverTeamsImpl(
  filters: DiscoverFilters
): Promise<DiscoverTeamsResult> {
  const supabase = await createClient();

  // SECURITY: Derive coach type from authenticated session — ignore client-supplied coachType
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { teams: [], count: 0, pages: 0 };

  const { data: coachProfile } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type')
    .eq('user_id', user.id)
    .single();

  if (!coachProfile) return { teams: [], count: 0, pages: 0 };

  const serverCoachType = coachProfile.coach_type as CoachType;

  const perPage = filters.perPage || 24;
  const page = filters.page || 1;
  const offset = (page - 1) * perPage;

  // Discoverable org types by coach type (server-derived — not client-supplied):
  // - college: can recruit from HS, showcase, AND JUCO programs
  // - juco: can only recruit from HS programs (not showcase/JUCO)
  const discoverableOrgTypes: readonly ('high_school' | 'showcase' | 'juco')[] =
    serverCoachType === 'juco'
      ? ['high_school']
      : ['high_school', 'showcase', 'juco'];

  // Discoverability rule: only orgs with a named primary head coach.
  // Resolved up front so it can be pushed into the DB query (`.in`) rather
  // than filtered in JS after pagination, which would corrupt both the
  // returned page and the count used to compute total pages.
  // Also fetch private players (P0 privacy) so they never surface in an
  // org's player_count/recruiting_active_count/top_prospects below — same
  // vulnerability class as getDiscoverPlayers/getStateCounts, same fix.
  const [orgIdsWithHeadCoach, privatePlayerIds] = await Promise.all([
    getOrgIdsWithNamedHeadCoach(supabase),
    getPrivatePlayerIds(supabase),
  ]);

  if (orgIdsWithHeadCoach !== null && orgIdsWithHeadCoach.length === 0) {
    return { teams: [], count: 0, pages: 0 };
  }

  // Build base query for organizations
  let query = supabase
    .from('organizations')
    .select('*', { count: 'exact' })
    .in('type', discoverableOrgTypes);

  if (orgIdsWithHeadCoach && orgIdsWithHeadCoach.length > 0) {
    query = query.in('id', orgIdsWithHeadCoach);
  }

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

  // Execute query with DB-level pagination and exact count
  const { data: orgs, count, error } = await query
    .order('name', { ascending: true })
    .range(offset, offset + perPage - 1);

  if (error) {
    await logServerError(`Error fetching teams: ${describeError(error)}`, { action: 'discover.getDiscoverTeams' });
    return { teams: [], count: 0, pages: 0 };
  }

  const totalCount = count || 0;

  if (!orgs || orgs.length === 0) {
    return { teams: [], count: totalCount, pages: Math.ceil(totalCount / perPage) };
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
    // First get teams for these organizations. Same reason as
    // getDiscoverableTeamPlayerIds above: this is a cross-org read, so it goes
    // through the anon-safe public-profile view rather than baseball_teams,
    // whose SELECT policy only admits the caller's own teams. Rosters and
    // head-coach names below still come from the base tables, which have their
    // own (unchanged) policies.
    const { data: teamsData } = await supabase
      .from('baseball_teams_public_profile')
      .select('id, organization_id')
      .in('organization_id', allOrgIds);

    if (teamsData && teamsData.length > 0) {
      const teamIds = teamsData
        .map((t) => t.id)
        .filter((id): id is string => Boolean(id));
      const teamToOrgMap: Record<string, string> = {};
      teamsData.forEach((t) => {
        if (t.id && t.organization_id) {
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
            baseball_coaches!inner(full_name)
          `)
          .eq('is_primary', true)
          .in('team_id', teamIds),
      ]);

      // Map orgId → primary head coach name. baseball_coaches stores the name
      // in a single `full_name` column (there is no first_name/last_name), so
      // read that — using the wrong columns here left head_coach_name null for
      // every org, and the trailing `.filter(Boolean(head_coach_name))` then
      // dropped every result.
      if (primaryCoachRows) {
        primaryCoachRows.forEach((row) => {
          const orgId = teamToOrgMap[row.team_id];
          const coach = row.baseball_coaches as unknown as { full_name: string | null } | null;
          if (!orgId || !coach) return;
          const name = (coach.full_name ?? '').trim();
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

          // P0 PRIVACY: never surface a player whose profile_visibility is
          // 'private' via an org's player_count/top_prospects.
          if (orgId && player && !privatePlayerIds.has(player.id)) {
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
    count: totalCount,
    pages: Math.ceil(totalCount / perPage),
  };
}

/**
 * Get watchlist IDs for a coach
 */
/**
 * Get watchlist player IDs for the authenticated coach
 * SECURITY: No coachId parameter - derives from authenticated user to prevent IDOR
 */
async function getWatchlistIdsImpl(): Promise<string[]> {
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
 *
 * coachType gates which player/org types appear in the map counts so the map
 * reflects what the coach can actually recruit (same rules as getDiscoverPlayers
 * and getDiscoverTeams).
 *
 * SECURITY: Coach identity and type are derived from the authenticated session.
 */
async function getStateCountsImpl(
  mode: 'players' | 'teams',
): Promise<Record<string, number>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const { data: coachProfile } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type')
    .eq('user_id', user.id)
    .single();

  if (!coachProfile) return {};

  const coachId = coachProfile.id as string;
  const coachType = coachProfile.coach_type as CoachType;

  // Non-recruiting coach types see nothing in discover map.
  if (coachType === 'high_school' || coachType === 'showcase') {
    return {};
  }

  if (mode === 'players') {
    // Eligible player types by coach type.
    // college (and undefined/unknown) → HS + showcase + JUCO
    // juco → HS + showcase only (cannot recruit other JUCO players)
    const eligiblePlayerTypes =
      coachType === 'juco'
        ? (['high_school', 'showcase'] as const)
        : (['high_school', 'showcase', 'juco'] as const);

    // Run pre-queries in parallel (incl. P0 privacy: profile_visibility='private'
    // players must never contribute to the map counts either).
    const [coachRosterIds, discoverablePlayerIds, privatePlayerIds] = await Promise.all([
      getCoachRosterPlayerIds(supabase, coachId),
      getDiscoverableTeamPlayerIds(supabase),
      getPrivatePlayerIds(supabase),
    ]);

    if (discoverablePlayerIds !== null && discoverablePlayerIds.length === 0) {
      return {};
    }

    let stateQuery = supabase
      .from('baseball_players')
      .select('id, state')
      .eq('recruiting_activated', true)
      .in('player_type', eligiblePlayerTypes)
      .not('state', 'is', null);

    if (discoverablePlayerIds && discoverablePlayerIds.length > 0) {
      stateQuery = stateQuery.in('id', discoverablePlayerIds);
    }

    if (privatePlayerIds.size > 0) {
      stateQuery = stateQuery.not('id', 'in', formatIdListForNotIn(privatePlayerIds));
    }

    const { data } = await stateQuery;

    const counts: Record<string, number> = {};
    data?.forEach((p) => {
      if (!p.state || coachRosterIds.has(p.id)) return;
      counts[p.state] = (counts[p.state] || 0) + 1;
    });
    return counts;
  } else {
    // Teams mode: discoverable org types by coach type.
    // college (and undefined/unknown) → HS + showcase + JUCO
    // juco → HS only
    const eligibleOrgTypes =
      coachType === 'juco'
        ? (['high_school'] as const)
        : (['high_school', 'showcase', 'juco'] as const);

    const { data } = await supabase
      .from('organizations')
      .select('location_state')
      .in('type', eligibleOrgTypes)
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

// ============================================================================
// GUARDED ACTIONS (#394)
//
// Discover is deliberately CROSS-TEAM (a coach browses OTHER orgs'/players'
// pools to recruit from) — every staff coach type may call it, and the
// results are already server-filtered by coach_type inside each impl above.
// So: no requiredCapability, no teamFrom (there is no single "target team"),
// requireActiveContext: false (a coach with no active team membership can
// still browse Discover — identity here comes from the coach's own
// baseball_coaches row, resolved inside each impl, not from an active-team
// context). demoSafe: true — all 4 are read-only, safe for the shared demo
// coach session.
//
// Each impl's body is UNCHANGED: manual auth+coachProfile derivation and the
// graceful empty-shape early return on no-session/no-profile. The only
// behavior delta is the wrapper's own unconditional throw-on-no-session (an
// edge case an authenticated dashboard route shouldn't hit) plus gained
// Sentry scope / demo-guard / RLS-denial capture — DiscoverClient.tsx already
// try/catches every call site and falls back to an error state, so this
// throw (vs. the prior silent empty grid) is a visible-but-handled edge case,
// not a crash.
// ============================================================================

export const getDiscoverPlayers = withBaseballAction(
  'getDiscoverPlayers',
  { featureArea: 'baseball-discover', requireActiveContext: false, demoSafe: true },
  (_ctx, filters: DiscoverFilters) => getDiscoverPlayersImpl(filters),
);

export const getDiscoverTeams = withBaseballAction(
  'getDiscoverTeams',
  { featureArea: 'baseball-discover', requireActiveContext: false, demoSafe: true },
  (_ctx, filters: DiscoverFilters) => getDiscoverTeamsImpl(filters),
);

export const getWatchlistIds = withBaseballAction(
  'getWatchlistIds',
  { featureArea: 'baseball-discover', requireActiveContext: false, demoSafe: true },
  (_ctx) => getWatchlistIdsImpl(),
);

export const getStateCounts = withBaseballAction(
  'getStateCounts',
  { featureArea: 'baseball-discover', requireActiveContext: false, demoSafe: true },
  (_ctx, mode: 'players' | 'teams') => getStateCountsImpl(mode),
);

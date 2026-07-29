'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { assertCoachCanRecruitPlayer } from '@/lib/baseball/recruitability';
import type { CoachType } from '@/app/baseball/actions/discover';
import type { Player } from '@/lib/types';

interface SaveComparisonParams {
  name: string;
  notes?: string;
  playerIds: string[];
}

async function saveComparisonImpl(params: SaveComparisonParams) {
  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { error: 'Coach not found' };
  }

  // Validate player IDs
  if (!params.playerIds || params.playerIds.length < 2) {
    return { error: 'At least 2 players required for comparison' };
  }

  if (params.playerIds.length > 4) {
    return { error: 'Maximum 4 players allowed' };
  }

  // Validate name
  if (!params.name || params.name.trim().length === 0) {
    return { error: 'Comparison name is required' };
  }

  // Insert into database
  // Database columns: coach_id, name, notes, player_ids
  const { data: comparison, error: insertError } = await supabase
    .from('baseball_player_comparisons')
    .insert({
      coach_id: coach.id,
      name: params.name.trim(),
      notes: params.notes?.trim() || null,
      player_ids: params.playerIds,
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error saving comparison:', insertError);
    return { error: 'Failed to save comparison' };
  }

  // Revalidate the comparisons page
  revalidatePath('/baseball/dashboard/compare');
  revalidatePath('/baseball/dashboard/comparisons');

  return { success: true, comparison };
}

async function deleteComparisonImpl(comparisonId: string) {
  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { error: 'Coach not found' };
  }

  // Delete comparison (RLS will ensure only coach's own comparisons can be deleted)
  const { error: deleteError } = await supabase
    .from('baseball_player_comparisons')
    .delete()
    .eq('id', comparisonId)
    .eq('coach_id', coach.id);

  if (deleteError) {
    console.error('Error deleting comparison:', deleteError);
    return { error: 'Failed to delete comparison' };
  }

  // Revalidate the comparisons page
  revalidatePath('/baseball/dashboard/compare');
  revalidatePath('/baseball/dashboard/comparisons');

  return { success: true };
}

interface SavedComparison {
  id: string;
  coach_id: string;
  name: string | null;
  notes: string | null;
  player_ids: string[];
  created_at: string | null;
  updated_at: string | null;
}

async function getSavedComparisonsImpl() {
  const supabase = await createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized', comparisons: [] as SavedComparison[] };
  }

  // Get coach record
  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { error: 'Coach not found', comparisons: [] as SavedComparison[] };
  }

  // Fetch comparisons
  const { data: comparisons, error: fetchError } = await supabase
    .from('baseball_player_comparisons')
    .select('*')
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('Error fetching comparisons:', fetchError);
    return { error: 'Failed to fetch comparisons', comparisons: [] as SavedComparison[] };
  }

  return { comparisons: (comparisons || []) as SavedComparison[] };
}

// =============================================================================
// Recruitability-gated search + fetch (P0 fix). `getDiscoverPlayers` in
// discover.ts already computes these exact 3 exclusion sets (private
// profiles, non-discoverable-team players, coach's own roster) plus
// `player_type != 'college'` — none of it was reused here, so Compare's
// "Add Players to Compare" search (and Watchlist's identical quick-add
// search) surfaced EVERY recruiting_activated player with zero other
// checks, and the URL-driven `?players=` fetch had no checks at all. The
// discover.ts helpers are module-private (not exported), so the same
// set-computation shape is reproduced locally rather than duplicating a
// per-candidate `assertCoachCanRecruitPlayer` DB round-trip for every
// search result. (sharedComponentRequest: export those 3 helpers from
// discover.ts so this becomes a straight import instead of a 3rd copy.)
// =============================================================================

async function getActiveCoachForRecruiting(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ id: string; coachType: CoachType } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type')
    .eq('user_id', user.id)
    .single();

  if (!coach) return null;

  return { id: coach.id as string, coachType: coach.coach_type as CoachType };
}

async function getPrivatePlayerIdsForCompare(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('baseball_player_settings')
    .select('player_id')
    .eq('profile_visibility', 'private');

  if (error) return new Set();
  return new Set((data ?? []).map((s) => s.player_id).filter(Boolean));
}

async function getDiscoverableTeamPlayerIdsForCompare(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Set<string>> {
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id')
    .in('type', ['high_school', 'showcase', 'juco']);

  if (!orgs?.length) return new Set();
  const orgIds = orgs.map((o) => o.id);

  // Cross-org read → public.baseball_teams_public_profile, matching
  // discover.ts / recruitability.ts. baseball_teams' SELECT policy is scoped to
  // the caller's own teams, so the base table would reduce this set to the
  // coach's roster and leave Compare unable to add anyone. The view carries
  // only non-sensitive identity columns (no join_code) and drops programs with
  // public_profile_mode = 'private', which is the same discoverable definition
  // the search results are expected to honor.
  const { data: teams } = await supabase
    .from('baseball_teams_public_profile')
    .select('id')
    .in('organization_id', orgIds);

  if (!teams?.length) return new Set();
  // Every view column is nullable in the generated types — narrow first.
  const teamIds = teams.map((t) => t.id).filter((id): id is string => Boolean(id));
  if (teamIds.length === 0) return new Set();

  const { data: members } = await supabase
    .from('baseball_team_members')
    .select('player_id')
    .in('team_id', teamIds);

  return new Set((members ?? []).map((m) => m.player_id).filter(Boolean));
}

async function getCoachRosterPlayerIdsForCompare(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachId: string,
): Promise<Set<string>> {
  const { data: staffEntries } = await supabase
    .from('baseball_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coachId);

  const teamIds = staffEntries?.map((e) => e.team_id) ?? [];
  if (teamIds.length === 0) return new Set();

  const { data: rosterPlayers } = await supabase
    .from('baseball_team_members')
    .select('player_id')
    .in('team_id', teamIds);

  return new Set((rosterPlayers ?? []).map((p) => p.player_id).filter(Boolean));
}

/**
 * Search recruitable players by name/school/high-school for the Compare
 * page's "Add Players to Compare" box AND Watchlist's quick-add search
 * (identical pattern, same gap, shared here on purpose). Excludes private
 * profiles, college players, players off any discoverable HS/showcase/JUCO
 * team, the coach's own roster, and (for JUCO coaches) other JUCO players —
 * the same rule set `getDiscoverPlayers`/`assertCoachCanRecruitPlayer`
 * already enforce elsewhere.
 */
async function searchRecruitablePlayersImpl(
  query: string,
  excludeIds: string[],
): Promise<Player[]> {
  if (!query || query.length < 2) return [];

  const supabase = await createClient();
  const coach = await getActiveCoachForRecruiting(supabase);
  if (!coach) return [];

  // HS/showcase coaches can't recruit anyone (same gate assertCoachCanRecruitPlayer applies).
  if (coach.coachType === 'high_school' || coach.coachType === 'showcase') {
    return [];
  }

  const [privateIds, discoverableIds, rosterIds] = await Promise.all([
    getPrivatePlayerIdsForCompare(supabase),
    getDiscoverableTeamPlayerIdsForCompare(supabase),
    getCoachRosterPlayerIdsForCompare(supabase, coach.id),
  ]);

  let queryBuilder = supabase
    .from('baseball_players')
    .select('*')
    .eq('recruiting_activated', true)
    .neq('player_type', 'college')
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,high_school_name.ilike.%${query}%`)
    .limit(30); // over-fetch — the set-based exclusions below narrow this to <=10

  if (coach.coachType === 'juco') {
    // JUCO coaches can't recruit other JUCO players.
    queryBuilder = queryBuilder.in('player_type', ['high_school', 'showcase'] as const);
  }

  if (excludeIds.length > 0) {
    queryBuilder = queryBuilder.not('id', 'in', `(${excludeIds.join(',')})`);
  }

  const { data, error } = await queryBuilder;
  if (error) {
    console.error('Error searching recruitable players:', error);
    return [];
  }

  return (data ?? [])
    .filter((player) =>
      discoverableIds.has(player.id) &&
      !privateIds.has(player.id) &&
      !rosterIds.has(player.id),
    )
    .slice(0, 10) as Player[];
}

/**
 * Fetch full player rows for the Compare page's URL-driven `?players=` list.
 * Previously a bare client-side `.in('id', ids)` query with ZERO filters —
 * not even `recruiting_activated` — so a bookmarked `/compare?players=<id>`
 * URL could permanently render a private/college/off-territory player's
 * full profile regardless of the search-box filter. Gated identically to
 * the search above.
 */
async function getComparablePlayersImpl(ids: string[]): Promise<Player[]> {
  if (!ids || ids.length === 0) return [];

  const supabase = await createClient();
  const coach = await getActiveCoachForRecruiting(supabase);
  if (!coach) return [];

  if (coach.coachType === 'high_school' || coach.coachType === 'showcase') {
    return [];
  }

  const [privateIds, discoverableIds, rosterIds] = await Promise.all([
    getPrivatePlayerIdsForCompare(supabase),
    getDiscoverableTeamPlayerIdsForCompare(supabase),
    getCoachRosterPlayerIdsForCompare(supabase, coach.id),
  ]);

  const { data, error } = await supabase
    .from('baseball_players')
    .select('*')
    .in('id', ids);

  if (error) {
    console.error('Error fetching comparable players:', error);
    return [];
  }

  return (data ?? []).filter((player) =>
    player.recruiting_activated &&
    player.player_type !== 'college' &&
    !(coach.coachType === 'juco' && player.player_type === 'juco') &&
    discoverableIds.has(player.id) &&
    !privateIds.has(player.id) &&
    !rosterIds.has(player.id),
  ) as Player[];
}

/**
 * Defense-in-depth gate before a player id is accepted into the Compare
 * page's `players=` query param — mirrors Watchlist's `addToWatchlist`
 * gate. The search results above are already filtered, but this stops an
 * ineligible id from ever landing in the URL (rather than silently
 * vanishing from render once `getComparablePlayers` re-validates it on
 * next fetch, which would desync the "N / 4 players" counter from what's
 * actually shown).
 */
async function canAddPlayerToCompareImpl(playerId: string): Promise<{ allowed: boolean }> {
  const supabase = await createClient();
  const coach = await getActiveCoachForRecruiting(supabase);
  if (!coach) return { allowed: false };

  const result = await assertCoachCanRecruitPlayer(supabase, coach.id, coach.coachType, playerId);
  return { allowed: result.allowed };
}

export const saveComparison = withAdminObserved(
  'saveComparison',
  { sport: 'baseball', feature: 'baseball_compare', featureArea: 'baseball-compare' },
  saveComparisonImpl,
);

export const deleteComparison = withAdminObserved(
  'deleteComparison',
  { sport: 'baseball', feature: 'baseball_compare', featureArea: 'baseball-compare' },
  deleteComparisonImpl,
);

export const getSavedComparisons = withAdminObserved(
  'getSavedComparisons',
  { sport: 'baseball', feature: 'baseball_compare', featureArea: 'baseball-compare' },
  getSavedComparisonsImpl,
);

export const searchRecruitablePlayers = withAdminObserved(
  'searchRecruitablePlayers',
  { sport: 'baseball', feature: 'baseball_compare', featureArea: 'baseball-compare' },
  searchRecruitablePlayersImpl,
);

export const getComparablePlayers = withAdminObserved(
  'getComparablePlayers',
  { sport: 'baseball', feature: 'baseball_compare', featureArea: 'baseball-compare' },
  getComparablePlayersImpl,
);

export const canAddPlayerToCompare = withAdminObserved(
  'canAddPlayerToCompare',
  { sport: 'baseball', feature: 'baseball_compare', featureArea: 'baseball-compare' },
  canAddPlayerToCompareImpl,
);

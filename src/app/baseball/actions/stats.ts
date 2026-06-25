'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { BaseballPlayerStats, BaseballStatUpload, BaseballPlayerAggregates } from '@/lib/types';
import {
  parseCSV,
  findBestPlayerMatch,
  findColumnMapping,
  type CSVRow,
  type PlayerMatch,
} from '@/lib/baseball/csv-utils';
import { logServerError } from '@/lib/server-error-logger';

// Re-export types and utilities for backward compatibility
export { parseCSV, findBestPlayerMatch, type CSVRow, type PlayerMatch };

// ============================================================================
// TYPES
// ============================================================================

export interface UploadResult {
  success: boolean;
  uploadId?: string;
  totalRows?: number;
  matchedRows?: number;
  unmatchedRows?: number;
  unmatchedNames?: string[];
  error?: string;
}

export interface StatsFilter {
  playerId?: string;
  statType?: 'practice' | 'game' | 'other';
  startDate?: string;
  endDate?: string;
}

// ============================================================================
// AUTH HELPERS
// ============================================================================

interface CoachAuthResult {
  user: { id: string };
  coach: { id: string; organization_id: string | null };
  supabase: Awaited<ReturnType<typeof createClient>>;
}

/**
 * SECURITY: Require authenticated coach for stats operations
 */
async function requireCoachAuth(): Promise<CoachAuthResult | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { error: 'Coach profile not found' };
  }

  return { user, coach, supabase };
}

/**
 * SECURITY: Verify coach has access to a team
 */
async function verifyTeamAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachId: string,
  teamId: string
): Promise<boolean> {
  // head_coach_id column does not exist on baseball_teams — check via team_coach_staff only
  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id')
    .eq('id', teamId)
    .single();

  if (!team) return false;

  // Check if assistant coach
  const { data: staffMember } = await supabase
    .from('baseball_team_coach_staff')
    .select('id')
    .eq('team_id', teamId)
    .eq('coach_id', coachId)
    .single();

  return !!staffMember;
}

// ============================================================================
// STATS UPLOAD
// ============================================================================

/**
 * Process CSV stats upload
 */
export async function uploadStatsCSV(
  teamId: string,
  csvContent: string,
  statType: 'practice' | 'game' | 'other',
  sessionDate: string,
  sessionName?: string
): Promise<UploadResult> {
  const supabase = await createClient();

  // Verify user is authenticated coach
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  // Get team players
  const { data: teamMembers } = await supabase
    .from('baseball_team_members')
    .select(`
      player_id,
      baseball_players!inner (
        id,
        first_name,
        last_name
      )
    `)
    .eq('team_id', teamId);

  const players = (teamMembers || []).map(tm => ({
    id: (tm.baseball_players as { id: string }).id,
    first_name: (tm.baseball_players as { first_name: string | null }).first_name,
    last_name: (tm.baseball_players as { last_name: string | null }).last_name,
  }));

  // Parse CSV
  const rows = parseCSV(csvContent);
  if (rows.length === 0) {
    return { success: false, error: 'No valid data found in CSV' };
  }

  const headers = Object.keys(rows[0]!);
  const playerNameCol = findColumnMapping(headers, 'player_name');

  if (!playerNameCol) {
    return { success: false, error: 'Could not find player name column in CSV' };
  }

  // Create upload record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: upload, error: uploadError } = await (supabase as any)
    .from('baseball_stat_uploads')
    .insert({
      team_id: teamId,
      coach_id: coach.id,
      filename: `upload_${Date.now()}.csv`,
      stat_type: statType,
      session_date: sessionDate,
      session_name: sessionName || null,
      total_rows: rows.length,
      matched_rows: 0,
      unmatched_rows: 0,
      status: 'processing',
    })
    .select()
    .single() as { data: BaseballStatUpload | null; error: unknown };

  if (uploadError || !upload) {
    return { success: false, error: 'Failed to create upload record' };
  }

  // Match and insert stats
  const unmatchedNames: string[] = [];
  let matchedCount = 0;
  const statsToInsert: Partial<BaseballPlayerStats>[] = [];

  for (const row of rows) {
    const csvName = row[playerNameCol] || '';
    if (!csvName) continue;

    const match = findBestPlayerMatch(csvName, players);

    if (match.confidence >= 0.7 && match.playerId) {
      // Good match - prepare stat record
      const statRecord: Partial<BaseballPlayerStats> = {
        player_id: match.playerId,
        team_id: teamId,
        coach_id: coach.id,
        stat_type: statType,
        session_date: sessionDate,
        session_name: sessionName || undefined,
        upload_batch_id: upload.id,
        source: 'csv_upload',
      };

      // Map CSV columns to stat fields
      const atBatsCol = findColumnMapping(headers, 'at_bats');
      if (atBatsCol) statRecord.at_bats = parseInt(row[atBatsCol] || '0') || 0;

      const hitsCol = findColumnMapping(headers, 'hits');
      if (hitsCol) statRecord.hits = parseInt(row[hitsCol] || '0') || 0;

      const doublesCol = findColumnMapping(headers, 'doubles');
      if (doublesCol) statRecord.doubles = parseInt(row[doublesCol] || '0') || 0;

      const triplesCol = findColumnMapping(headers, 'triples');
      if (triplesCol) statRecord.triples = parseInt(row[triplesCol] || '0') || 0;

      const hrCol = findColumnMapping(headers, 'home_runs');
      if (hrCol) statRecord.home_runs = parseInt(row[hrCol] || '0') || 0;

      const rbiCol = findColumnMapping(headers, 'rbis');
      if (rbiCol) statRecord.rbis = parseInt(row[rbiCol] || '0') || 0;

      const walksCol = findColumnMapping(headers, 'walks');
      if (walksCol) statRecord.walks = parseInt(row[walksCol] || '0') || 0;

      const soCol = findColumnMapping(headers, 'strikeouts');
      if (soCol) statRecord.strikeouts = parseInt(row[soCol] || '0') || 0;

      const sbCol = findColumnMapping(headers, 'stolen_bases');
      if (sbCol) statRecord.stolen_bases = parseInt(row[sbCol] || '0') || 0;

      const evCol = findColumnMapping(headers, 'exit_velocity');
      if (evCol) statRecord.exit_velocity = parseFloat(row[evCol] || '0') || undefined;

      const laCol = findColumnMapping(headers, 'launch_angle');
      if (laCol) statRecord.launch_angle = parseFloat(row[laCol] || '0') || undefined;

      statsToInsert.push(statRecord);
      matchedCount++;
    } else {
      unmatchedNames.push(csvName);
    }
  }

  // Insert stats
  if (statsToInsert.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('baseball_player_stats')
      .insert(statsToInsert);

    if (insertError) {
      await logServerError(`Failed to insert stats: ${insertError instanceof Error ? insertError.message : String(insertError)}`, { action: 'stats.uploadStatsCSV' });
    }
  }

  // Update upload record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('baseball_stat_uploads')
    .update({
      matched_rows: matchedCount,
      unmatched_rows: unmatchedNames.length,
      unmatched_data: unmatchedNames,
      status: 'completed',
    })
    .eq('id', upload.id);

  // Recalculate aggregates for affected players
  const affectedPlayerIds = [...new Set(statsToInsert.map(s => s.player_id!))];
  for (const playerId of affectedPlayerIds) {
    await recalculatePlayerAggregates(playerId, teamId);
  }

  revalidatePath('/baseball/dashboard/command-center');
  revalidatePath('/baseball/dashboard/stats');

  return {
    success: true,
    uploadId: upload.id,
    totalRows: rows.length,
    matchedRows: matchedCount,
    unmatchedRows: unmatchedNames.length,
    unmatchedNames,
  };
}

/**
 * Manually resolve unmatched player names
 */
// W5a HONESTY FIX — resolveUnmatchedPlayers.
//
// The legacy flat upload path (uploadStatsCSV) does NOT store the original CSV
// body — only a processed row count. Re-processing unmatched players requires
// the raw file, which was never retained for these uploads. Persisting manual
// match assignments and re-ingesting against the stored body is implemented in
// the NEW import path (actions/imports.ts → commitImport, which uses
// rawFileBody + baseball_import_raw_file_and_hash). The legacy path cannot be
// re-processed here without the original file.
//
// This function does NOT pretend to succeed. It surfaces the honest constraint
// so callers can disable / relabel the control and prompt the user to re-upload.
export async function resolveUnmatchedPlayers(
  uploadId: string,
  _mappings: Array<{ csvName: string; playerId: string }>,
): Promise<{ success: boolean; error?: string; reason?: 'original_file_not_stored' }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: upload } = await (supabase as any)
    .from('baseball_stat_uploads')
    .select('id, import_run_id')
    .eq('id', uploadId)
    .single() as { data: { id: string; import_run_id: string | null } | null };

  if (!upload) {
    return { success: false, error: 'Upload not found' };
  }

  // Check whether this upload was done via the new import path, which DOES
  // preserve the original file (import_run_id is set + file_hash on the run).
  if (upload.import_run_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: run } = await (supabase as any)
      .from('baseball_import_runs')
      .select('id, file_hash')
      .eq('id', upload.import_run_id)
      .maybeSingle() as { data: { id: string; file_hash: string | null } | null };

    if (run?.file_hash) {
      // New import path with preserved file — re-processing is possible via
      // the imports.ts previewImport / commitImport path. Direct the caller
      // there instead of duplicating that logic here.
      return {
        success: false,
        error:
          'This upload was created with the new import system. Re-resolve unmatched players by re-opening the import run from Recent imports and re-committing with updated player matches.',
        reason: 'original_file_not_stored',
      };
    }
  }

  // Legacy upload: no file body stored — honest refusal.
  return {
    success: false,
    error:
      'Re-processing needs the original file (not stored for this upload). Re-upload the same file from Import Center to match the remaining players.',
    reason: 'original_file_not_stored',
  };
}

// W5a HONESTY FIX — reprocessUpload.
//
// The legacy upload path does not store the raw file body. Re-processing is a
// no-op for any upload created before the new import path (which DOES store
// files via baseball_import_raw_file_and_hash). This function returns an
// honest failure so callers can disable / relabel the button rather than
// showing a success toast for a silent no-op.
export async function reprocessUpload(
  uploadId: string,
): Promise<{ success: boolean; error?: string; reason?: 'original_file_not_stored' }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: upload } = await (supabase as any)
    .from('baseball_stat_uploads')
    .select('id, import_run_id')
    .eq('id', uploadId)
    .single() as { data: { id: string; import_run_id: string | null } | null };

  if (!upload) {
    return { success: false, error: 'Upload not found' };
  }

   
  const rawFileExists = upload.import_run_id
    ? await (supabase as any)
        .from('baseball_import_runs')
        .select('file_hash')
        .eq('id', upload.import_run_id)
        .maybeSingle()
        .then(({ data }: { data: { file_hash: string | null } | null }) => !!data?.file_hash)
    : false;

  if (!rawFileExists) {
    // Honest refusal — never a silent no-op with a success toast.
    return {
      success: false,
      error:
        'Re-processing needs the original file (not stored yet). Re-upload the same file from Import Center to apply updated settings.',
      reason: 'original_file_not_stored',
    };
  }

  // The file IS stored — re-processing would require replaying commitImport with
  // the stored body. That path is intentionally NOT duplicated here; direct the
  // caller to re-commit via the Import Center.
  return {
    success: false,
    error:
      'Re-processing this run requires re-opening it in the Import Center and re-committing with updated player matches.',
    reason: 'original_file_not_stored',
  };
}

// ============================================================================
// AGGREGATES CALCULATION
// ============================================================================

/**
 * Recalculate aggregates for a player
 * SECURITY: Requires authenticated coach with team access
 */
export async function recalculatePlayerAggregates(
  playerId: string,
  teamId: string
): Promise<{ success: boolean; error?: string }> {
  // SECURITY: Require authenticated coach
  const authResult = await requireCoachAuth();
  if ('error' in authResult) {
    return { success: false, error: authResult.error };
  }
  const { coach, supabase } = authResult;

  // SECURITY: Verify coach has access to this team
  const hasAccess = await verifyTeamAccess(supabase, coach.id, teamId);
  if (!hasAccess) {
    return { success: false, error: 'You do not have access to this team' };
  }

  // Get all stats for this player on this team
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stats } = await (supabase as any)
    .from('baseball_player_stats')
    .select('*')
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .order('session_date', { ascending: false }) as { data: BaseballPlayerStats[] | null };

  if (!stats || stats.length === 0) {
    // Remove aggregates if no stats
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('baseball_player_aggregates')
      .delete()
      .eq('player_id', playerId)
      .eq('team_id', teamId);
    return { success: true };
  }

  // Calculate totals
  const practiceStats = stats.filter(s => s.stat_type === 'practice');
  const gameStats = stats.filter(s => s.stat_type === 'game');

  const calculateAvg = (statList: BaseballPlayerStats[]): number | null => {
    const totalAB = statList.reduce((sum, s) => sum + (s.at_bats || 0), 0);
    const totalHits = statList.reduce((sum, s) => sum + (s.hits || 0), 0);
    if (totalAB === 0) return null;
    return totalHits / totalAB;
  };

  const careerAvg = calculateAvg(stats);
  const practiceAvg = calculateAvg(practiceStats);
  const gameAvg = calculateAvg(gameStats);
  const pressureGap = practiceAvg != null && gameAvg != null ? gameAvg - practiceAvg : null;

  // Last 5 and 10 sessions
  const last5 = stats.slice(0, 5);
  const last10 = stats.slice(0, 10);
  const last5Avg = calculateAvg(last5);
  const last10Avg = calculateAvg(last10);

  // Calculate trend
  let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
  let trendMagnitude = 0;

  if (last5Avg != null && last10Avg != null) {
    const diff = last5Avg - last10Avg;
    trendMagnitude = Math.abs(diff);

    if (diff > 0.020) recentTrend = 'improving';
    else if (diff < -0.020) recentTrend = 'declining';
  }

  // Exit velocity
  const evStats = stats.filter(s => s.exit_velocity != null);
  const avgEV = evStats.length > 0
    ? evStats.reduce((sum, s) => sum + (s.exit_velocity || 0), 0) / evStats.length
    : null;
  const maxEV = evStats.length > 0
    ? Math.max(...evStats.map(s => s.exit_velocity || 0))
    : null;

  // Upsert aggregates
  const aggregates: Partial<BaseballPlayerAggregates> = {
    player_id: playerId,
    team_id: teamId,
    total_sessions: stats.length,
    practice_sessions: practiceStats.length,
    game_sessions: gameStats.length,
    career_avg: careerAvg,
    practice_avg: practiceAvg,
    game_avg: gameAvg,
    pressure_gap: pressureGap,
    recent_trend: recentTrend,
    trend_magnitude: trendMagnitude,
    last_5_avg: last5Avg,
    last_10_avg: last10Avg,
    avg_exit_velocity: avgEV,
    max_exit_velocity: maxEV,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('baseball_player_aggregates')
    .upsert(aggregates, { onConflict: 'player_id' });

  revalidatePath('/baseball/dashboard/stats');
  revalidatePath(`/baseball/dashboard/players/${playerId}`);
  return { success: true };
}

/**
 * Recalculate aggregates for all players on a team
 * SECURITY: Requires authenticated coach with team access
 */
export async function recalculateTeamAggregates(teamId: string): Promise<{ success: boolean; error?: string }> {
  // SECURITY: Require authenticated coach
  const authResult = await requireCoachAuth();
  if ('error' in authResult) {
    return { success: false, error: authResult.error };
  }
  const { coach, supabase } = authResult;

  // SECURITY: Verify coach has access to this team
  const hasAccess = await verifyTeamAccess(supabase, coach.id, teamId);
  if (!hasAccess) {
    return { success: false, error: 'You do not have access to this team' };
  }

  const { data: teamMembers } = await supabase
    .from('baseball_team_members')
    .select('player_id')
    .eq('team_id', teamId);

  for (const member of teamMembers || []) {
    await recalculatePlayerAggregates(member.player_id, teamId);
  }

  revalidatePath('/baseball/dashboard/command-center');
  return { success: true };
}

// ============================================================================
// PLAYER SELF-SERVICE QUERIES
// ============================================================================

interface PlayerAuthResult {
  user: { id: string };
  player: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; primary_position: string | null; secondary_position: string | null; grad_year: number | null };
  supabase: Awaited<ReturnType<typeof createClient>>;
}

/**
 * SECURITY: Require authenticated player for player self-service operations
 */
async function requirePlayerAuth(): Promise<PlayerAuthResult | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { data: player } = await supabase
    .from('baseball_players')
    .select('id, first_name, last_name, avatar_url, primary_position, secondary_position, grad_year')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return { error: 'Player profile not found' };
  }

  return { user, player, supabase };
}

/**
 * Get the authenticated player's own stats
 * SECURITY: Players can only view their own stats
 */
export async function getMyStats(
  filters?: StatsFilter
): Promise<{ data: BaseballPlayerStats[] | null; error?: string }> {
  const authResult = await requirePlayerAuth();
  if ('error' in authResult) {
    return { data: null, error: authResult.error };
  }
  const { player, supabase } = authResult;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('baseball_player_stats')
    .select('*')
    .eq('player_id', player.id)
    .order('session_date', { ascending: false });

  if (filters?.statType) {
    query = query.eq('stat_type', filters.statType);
  }

  if (filters?.startDate) {
    query = query.gte('session_date', filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte('session_date', filters.endDate);
  }

  const { data, error } = await query as { data: BaseballPlayerStats[] | null; error: unknown };

  if (error) {
    return { data: null, error: 'Failed to fetch your stats' };
  }

  return { data };
}

/**
 * Get the authenticated player's aggregates
 * SECURITY: Players can only view their own aggregates
 */
export async function getMyAggregates(): Promise<{ 
  data: BaseballPlayerAggregates | null; 
  player: PlayerAuthResult['player'] | null;
  teamName: string | null;
  error?: string 
}> {
  const authResult = await requirePlayerAuth();
  if ('error' in authResult) {
    return { data: null, player: null, teamName: null, error: authResult.error };
  }
  const { player, supabase } = authResult;

  // Get player's team info
  const { data: teamMembership } = await supabase
    .from('baseball_team_members')
    .select(`
      jersey_number,
      baseball_teams (
        id,
        name
      )
    `)
    .eq('player_id', player.id)
    .limit(1)
    .single();

  const teamName = (teamMembership?.baseball_teams as { name: string } | null)?.name || null;
  const teamId = (teamMembership?.baseball_teams as { id: string } | null)?.id;
  const jerseyNumber = teamMembership?.jersey_number || null;

  // Add jersey number to player response
  const playerWithJersey = { ...player, jersey_number: jerseyNumber };

  // Get aggregates for this player (they may have aggregates for multiple teams)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aggregatesQuery = (supabase as any)
    .from('baseball_player_aggregates')
    .select('*')
    .eq('player_id', player.id);

  // If on a team, get that team's aggregates
  if (teamId) {
    aggregatesQuery = aggregatesQuery.eq('team_id', teamId);
  }

  const { data: aggregates, error } = await aggregatesQuery.maybeSingle() as { 
    data: BaseballPlayerAggregates | null; 
    error: unknown 
  };

  if (error) {
    return { data: null, player: playerWithJersey, teamName, error: 'Failed to fetch your aggregates' };
  }

  return { data: aggregates, player: playerWithJersey, teamName };
}

// ============================================================================
// STATS QUERIES
// ============================================================================

/**
 * Get player stats with filtering
 * SECURITY: Requires authenticated coach with access to view the player
 */
export async function getPlayerStats(
  playerId: string,
  filters?: StatsFilter
): Promise<{ data: BaseballPlayerStats[] | null; error?: string }> {
  // SECURITY: Require authenticated coach
  const authResult = await requireCoachAuth();
  if ('error' in authResult) {
    return { data: null, error: authResult.error };
  }
  const { coach, supabase } = authResult;

  // SECURITY: Verify coach has access to view this player's stats
  // Coach can view if: player is on their team OR player has recruiting_activated=true
  const { data: player } = await supabase
    .from('baseball_players')
    .select('id, recruiting_activated')
    .eq('id', playerId)
    .single();

  if (!player) {
    return { data: null, error: 'Player not found' };
  }

  // Check if player is publicly discoverable (recruiting activated)
  const isPubliclyDiscoverable = player.recruiting_activated === true;

  // Check if player is on one of the coach's teams via baseball_team_members
  const { data: teamMembership } = await supabase
    .from('baseball_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .limit(10);

  let isOnCoachTeam = false;
  if (teamMembership && teamMembership.length > 0) {
    // Check if coach has access to any of the player's teams
    for (const membership of teamMembership) {
      if (await verifyTeamAccess(supabase, coach.id, membership.team_id)) {
        isOnCoachTeam = true;
        break;
      }
    }
  }

  if (!isPubliclyDiscoverable && !isOnCoachTeam) {
    return { data: null, error: 'You do not have permission to view this player\'s stats' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('baseball_player_stats')
    .select('*')
    .eq('player_id', playerId)
    .order('session_date', { ascending: false });

  if (filters?.statType) {
    query = query.eq('stat_type', filters.statType);
  }

  if (filters?.startDate) {
    query = query.gte('session_date', filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte('session_date', filters.endDate);
  }

  const { data, error } = await query as { data: BaseballPlayerStats[] | null; error: unknown };

  if (error) {
    return { data: null, error: 'Failed to fetch stats' };
  }

  return { data };
}

/**
 * Get recent uploads for a team
 * SECURITY: Requires authenticated coach with access to the team
 */
export async function getRecentUploads(
  teamId: string,
  limit = 10
): Promise<{ data: BaseballStatUpload[] | null; error?: string }> {
  // SECURITY: Require authenticated coach
  const authResult = await requireCoachAuth();
  if ('error' in authResult) {
    return { data: null, error: authResult.error };
  }
  const { coach, supabase } = authResult;

  // SECURITY: Verify coach has access to this team
  const hasAccess = await verifyTeamAccess(supabase, coach.id, teamId);
  if (!hasAccess) {
    return { data: null, error: 'You do not have permission to view this team\'s uploads' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_stat_uploads')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(limit) as { data: BaseballStatUpload[] | null; error: unknown };

  if (error) {
    return { data: null, error: 'Failed to fetch uploads' };
  }

  return { data };
}

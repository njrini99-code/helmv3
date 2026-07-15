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
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
import { BaseballCapabilityError, requireBaseballCapability } from '@/lib/baseball/capabilities';
import { computeCareerSlashLine } from '@/lib/baseball/aggregates/career-slash-line';

/**
 * Shared error-message mapping for every action in this file. All exported
 * actions below are wrapped in withBaseballAction; their thin public
 * exports catch the sanitized errors it can throw and translate them to a
 * user-safe message via this helper.
 */
function statsActionErrorMessage(error: unknown): string {
  if (error instanceof BaseballUnauthorizedError) {
    return 'Not authenticated';
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return 'Coach or team not found';
  }
  if (error instanceof BaseballCapabilityError) {
    return 'You do not have permission to manage stats for this team';
  }
  if (error instanceof BaseballActionError) {
    return 'Could not complete the request. Please try again.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

function mapStatsActionError(error: unknown): { success: false; error: string } {
  return { success: false, error: statsActionErrorMessage(error) };
}

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
  /**
   * SECURITY: populated (and success:false) when coach-supplied playerMatches
   * referenced a playerId that is not on the target team's roster. Lets
   * callers surface exactly which coach-supplied matches were rejected.
   */
  invalidPlayerMatches?: Array<{ csvName: string; playerId: string }>;
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
 * SECURITY: Requires can_manage_imports capability on the target team,
 * enforced server-side by withBaseballAction (see uploadStatsCSVAction below).
 */
const uploadStatsCSVAction = withBaseballAction(
  'uploadStatsCSV',
  {
    featureArea: 'baseball-stats',
    requiredCapability: 'can_manage_imports',
    teamFrom: (
      teamId: string,
      _csvContent?: string,
      _statType?: 'practice' | 'game' | 'other',
      _sessionDate?: string,
      _sessionName?: string,
      _columnMappings?: Record<string, string | null>,
      _playerMatches?: PlayerMatch[],
    ) => teamId,
  },
  async (
    ctx,
    teamId: string,
    csvContent: string,
    statType: 'practice' | 'game' | 'other',
    sessionDate: string,
    sessionName?: string,
    columnMappings?: Record<string, string | null>,
    playerMatches?: PlayerMatch[],
  ): Promise<UploadResult> => {
  const supabase = await createClient();

  const coachId = ctx.activeCoachId;
  if (!coachId) {
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

  // SECURITY: playerMatches is coach-supplied client state from the
  // Match-Players wizard step. Never trust a playerId from it without
  // verifying it belongs to the target team's own roster (fetched above,
  // server-side) — otherwise a coach could fabricate baseball_player_stats
  // rows for a player on a completely different team. Reject the whole
  // upload up front (before creating any upload/stat rows) with a
  // structured error listing every offending match, rather than silently
  // dropping or accepting the tampered assignment.
  if (playerMatches) {
    const rosterPlayerIds = new Set(players.map((p) => p.id));
    const invalidPlayerMatches = playerMatches
      .filter((m) => !!m.playerId && !rosterPlayerIds.has(m.playerId))
      .map((m) => ({ csvName: m.csvName, playerId: m.playerId! }));

    if (invalidPlayerMatches.length > 0) {
      await logServerError(
        `Rejected uploadStatsCSV: ${invalidPlayerMatches.length} playerMatches entr${invalidPlayerMatches.length === 1 ? 'y references' : 'ies reference'} a player not on team ${teamId}'s roster`,
        {
          action: 'stats.uploadStatsCSV',
          metadata: { teamId, coachId, invalidPlayerMatches },
        },
      );
      return {
        success: false,
        error: `Some player matches are not on this team's roster: ${invalidPlayerMatches
          .map((m) => `"${m.csvName}"`)
          .join(', ')}. Please re-match these players and try again.`,
        invalidPlayerMatches,
      };
    }
  }

  // Parse CSV
  const rows = parseCSV(csvContent);
  if (rows.length === 0) {
    return { success: false, error: 'No valid data found in CSV' };
  }

  const headers = Object.keys(rows[0]!);

  // Resolve a stat field to its CSV column. When the coach's Map-Columns step
  // supplied explicit column -> field assignments, honor those verbatim (a
  // coach override always wins, including "unmap this column" via null).
  // Falls back to header-alias auto-detection when no mapping was supplied,
  // matching the same explicit-first / auto-detect-fallback pattern used by
  // the newer import path (actions/imports.ts's resolveNameColumn).
  const resolveColumn = (field: string): string | null => {
    if (columnMappings) {
      const explicit = Object.entries(columnMappings).find(
        ([csvColumn, mappedTo]) => mappedTo === field && headers.includes(csvColumn)
      );
      if (explicit) return explicit[0];
      return null;
    }
    return findColumnMapping(headers, field);
  };

  const playerNameCol = resolveColumn('player_name');

  if (!playerNameCol) {
    return { success: false, error: 'Could not find player name column in CSV' };
  }

  // Create upload record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: upload, error: uploadError } = await (supabase as any)
    .from('baseball_stat_uploads')
    .insert({
      team_id: teamId,
      coach_id: coachId,
      filename: `upload_${Date.now()}.csv`,
      stat_type: statType,
      session_date: sessionDate,
      session_name: sessionName || null,
      total_rows: rows.length,
      matched_rows: 0,
      unmatched_rows: 0,
      row_count: rows.length,
      processed_count: 0,
      status: 'processing',
    })
    .select()
    .single() as { data: BaseballStatUpload | null; error: unknown };

  if (uploadError || !upload) {
    return { success: false, error: 'Failed to create upload record' };
  }

  // Coach's Match-Players step, keyed by the CSV name it was resolved against.
  // Falls back to auto-matching (findBestPlayerMatch) for any csvName the
  // coach's wizard state doesn't cover, so partial/omitted matches never
  // silently drop rows that would otherwise have auto-matched cleanly.
  const coachMatchesByName = playerMatches
    ? new Map(playerMatches.map((m) => [m.csvName, m]))
    : null;

  // Match and insert stats
  const unmatchedNames: string[] = [];
  let matchedCount = 0;
  const statsToInsert: Partial<BaseballPlayerStats>[] = [];

  for (const row of rows) {
    const csvName = row[playerNameCol] || '';
    if (!csvName) continue;

    const coachMatch = coachMatchesByName?.get(csvName);
    let resolvedPlayerId: string | null = null;

    if (coachMatch) {
      if (coachMatch.playerId && (coachMatch.confidence >= 0.7 || coachMatch.isManualMatch)) {
        // Auto-match the coach kept, or a manual re-assignment.
        resolvedPlayerId = coachMatch.playerId;
      } else if (coachMatch.isManualMatch && !coachMatch.playerId) {
        // Coach explicitly chose "skip this player" in the Match step —
        // honor it as a deliberate do-not-insert, not an unmatched failure.
        continue;
      } else {
        unmatchedNames.push(csvName);
        continue;
      }
    } else {
      const autoMatch = findBestPlayerMatch(csvName, players);
      if (autoMatch.confidence >= 0.7 && autoMatch.playerId) {
        resolvedPlayerId = autoMatch.playerId;
      } else {
        unmatchedNames.push(csvName);
        continue;
      }
    }

    if (!resolvedPlayerId) {
      unmatchedNames.push(csvName);
      continue;
    }

    // Good match - prepare stat record
    const statRecord: Partial<BaseballPlayerStats> = {
      player_id: resolvedPlayerId,
      team_id: teamId,
      coach_id: coachId,
      stat_type: statType,
      session_date: sessionDate,
      session_name: sessionName || undefined,
      source: 'csv_upload',
    };

    // Map CSV columns to stat fields
    const atBatsCol = resolveColumn('at_bats');
    if (atBatsCol) statRecord.at_bats = parseInt(row[atBatsCol] || '0') || 0;

    const hitsCol = resolveColumn('hits');
    if (hitsCol) statRecord.hits = parseInt(row[hitsCol] || '0') || 0;

    const doublesCol = resolveColumn('doubles');
    if (doublesCol) statRecord.doubles = parseInt(row[doublesCol] || '0') || 0;

    const triplesCol = resolveColumn('triples');
    if (triplesCol) statRecord.triples = parseInt(row[triplesCol] || '0') || 0;

    const hrCol = resolveColumn('home_runs');
    if (hrCol) statRecord.home_runs = parseInt(row[hrCol] || '0') || 0;

    const rbiCol = resolveColumn('rbis');
    if (rbiCol) statRecord.rbis = parseInt(row[rbiCol] || '0') || 0;

    const walksCol = resolveColumn('walks');
    if (walksCol) statRecord.walks = parseInt(row[walksCol] || '0') || 0;

    const soCol = resolveColumn('strikeouts');
    if (soCol) statRecord.strikeouts = parseInt(row[soCol] || '0') || 0;

    const sbCol = resolveColumn('stolen_bases');
    if (sbCol) statRecord.stolen_bases = parseInt(row[sbCol] || '0') || 0;

    const evCol = resolveColumn('exit_velocity');
    if (evCol) statRecord.exit_velocity = parseFloat(row[evCol] || '0') || undefined;

    const laCol = resolveColumn('launch_angle');
    if (laCol) statRecord.launch_angle = parseFloat(row[laCol] || '0') || undefined;

    statsToInsert.push(statRecord);
    matchedCount++;
  }

  // Insert stats
  if (statsToInsert.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('baseball_player_stats')
      .insert(statsToInsert);

    if (insertError) {
      const insertErrorMessage =
        insertError instanceof Error ? insertError.message : String(insertError);
      await logServerError(`Failed to insert stats: ${insertErrorMessage}`, { action: 'stats.uploadStatsCSV' });

      // HONESTY FIX: the bulk insert persisted zero rows — never stamp this
      // upload 'completed' (UploadHistory reads status + processed_count to
      // show a success badge with a nonzero processed count). Record the
      // real failure status + error_message so the coach sees an honest
      // failed upload instead of a false "completed" with lost data.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('baseball_stat_uploads')
        .update({
          matched_rows: 0,
          unmatched_rows: unmatchedNames.length,
          unmatched_data: unmatchedNames,
          processed_count: 0,
          completed_at: new Date().toISOString(),
          status: 'failed',
          error_message: insertErrorMessage,
        })
        .eq('id', upload.id);

      return {
        success: false,
        uploadId: upload.id,
        totalRows: rows.length,
        matchedRows: 0,
        unmatchedRows: unmatchedNames.length,
        unmatchedNames,
        error: 'Failed to save stats. Please try again.',
      };
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
      processed_count: matchedCount,
      completed_at: new Date().toISOString(),
      status: 'completed',
    })
    .eq('id', upload.id);

  // Recalculate aggregates for affected players
  const affectedPlayerIds = [...new Set(statsToInsert.map(s => s.player_id!))];
  for (const playerId of affectedPlayerIds) {
    await recalculatePlayerAggregates(playerId, teamId);
  }

  revalidatePath('/baseball/dashboard/command-center');
  revalidatePath('/baseball/dashboard/stats-center');

  return {
    success: true,
    uploadId: upload.id,
    totalRows: rows.length,
    matchedRows: matchedCount,
    unmatchedRows: unmatchedNames.length,
    unmatchedNames,
  };
  },
);

export async function uploadStatsCSV(
  teamId: string,
  csvContent: string,
  statType: 'practice' | 'game' | 'other',
  sessionDate: string,
  sessionName?: string,
  columnMappings?: Record<string, string | null>,
  playerMatches?: PlayerMatch[],
): Promise<UploadResult> {
  try {
    return await uploadStatsCSVAction(
      teamId,
      csvContent,
      statType,
      sessionDate,
      sessionName,
      columnMappings,
      playerMatches,
    );
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_stats.uploadStatsCSV', featureArea: 'baseball-stats' },
    );
    return mapStatsActionError(error);
  }
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
// SECURITY: Requires can_manage_stats on the upload's own team, enforced
// server-side by withBaseballAction (see resolveUnmatchedPlayersAction below).
// The team is derived from the upload row itself (this action takes an
// uploadId, not a teamId), mirroring the lookup-then-enforce pattern used by
// academics.ts's updateEligibility action.
const resolveUnmatchedPlayersAction = withBaseballAction(
  'resolveUnmatchedPlayers',
  { featureArea: 'baseball-stats' },
  async (
    ctx,
    uploadId: string,
    _mappings: Array<{ csvName: string; playerId: string }>,
  ): Promise<{ success: boolean; error?: string; reason?: 'original_file_not_stored' }> => {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: upload } = await (supabase as any)
      .from('baseball_stat_uploads')
      .select('id, team_id, import_run_id')
      .eq('id', uploadId)
      .single() as { data: { id: string; team_id: string | null; import_run_id: string | null } | null };

    if (!upload) {
      return { success: false, error: 'Upload not found' };
    }

    const teamId = upload.team_id ? String(upload.team_id) : ctx.activeTeamId;
    await requireBaseballCapability(teamId, 'can_manage_stats');

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
  },
);

export async function resolveUnmatchedPlayers(
  uploadId: string,
  _mappings: Array<{ csvName: string; playerId: string }>,
): Promise<{ success: boolean; error?: string; reason?: 'original_file_not_stored' }> {
  try {
    return await resolveUnmatchedPlayersAction(uploadId, _mappings);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_stats.resolveUnmatchedPlayers', featureArea: 'baseball-stats' },
    );
    return { success: false, error: statsActionErrorMessage(error) };
  }
}

// W5a HONESTY FIX — reprocessUpload.
//
// The legacy upload path does not store the raw file body. Re-processing is a
// no-op for any upload created before the new import path (which DOES store
// files via baseball_import_raw_file_and_hash). This function returns an
// honest failure so callers can disable / relabel the button rather than
// showing a success toast for a silent no-op.
// SECURITY: Requires can_manage_stats on the upload's own team, enforced
// server-side by withBaseballAction (see reprocessUploadAction below). Team
// is derived from the upload row (see resolveUnmatchedPlayersAction above).
const reprocessUploadAction = withBaseballAction(
  'reprocessUpload',
  { featureArea: 'baseball-stats' },
  async (
    ctx,
    uploadId: string,
  ): Promise<{ success: boolean; error?: string; reason?: 'original_file_not_stored' }> => {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: upload } = await (supabase as any)
      .from('baseball_stat_uploads')
      .select('id, team_id, import_run_id')
      .eq('id', uploadId)
      .single() as { data: { id: string; team_id: string | null; import_run_id: string | null } | null };

    if (!upload) {
      return { success: false, error: 'Upload not found' };
    }

    const teamId = upload.team_id ? String(upload.team_id) : ctx.activeTeamId;
    await requireBaseballCapability(teamId, 'can_manage_stats');

    const rawFileExists = upload.import_run_id
      ? await fromUntyped(supabase, 'baseball_import_runs')
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
  },
);

export async function reprocessUpload(
  uploadId: string,
): Promise<{ success: boolean; error?: string; reason?: 'original_file_not_stored' }> {
  try {
    return await reprocessUploadAction(uploadId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_stats.reprocessUpload', featureArea: 'baseball-stats' },
    );
    return { success: false, error: statsActionErrorMessage(error) };
  }
}

// ============================================================================
// AGGREGATES CALCULATION
// ============================================================================

/**
 * Recalculate aggregates for a player
 * SECURITY: Requires can_manage_stats on the target team, enforced
 * server-side by withBaseballAction (see recalculatePlayerAggregatesAction
 * below).
 *
 * #379 Phase 2 status: this derivation stays a raw legacy-row calculator
 * (baseball_player_stats -> baseball_player_aggregates) rather than moving
 * behind src/lib/baseball/read-models/legacy-stat-adapters.ts. The adapter
 * reconciles two ALREADY-COMPUTED sources (a box-score/season row vs. a
 * legacy aggregate row) for READERS; it has no place to plug in a raw-row ->
 * aggregate calculator like this one. More importantly, roster.ts,
 * command-center.ts, and player-today.ts/player-snapshot-cards.ts/
 * player-passport.ts (see stat-layer-manifest.ts) still read
 * baseball_player_aggregates directly and have not yet migrated to a
 * read-model that would degrade gracefully without it — retiring this write
 * path now would regress those surfaces from "shows real numbers" to "shows
 * nothing" for every team whose only stat history is legacy CSV uploads.
 * Revisit once those read-model migrations land (see the #379 design's
 * chunk sequencing).
 */
const recalculatePlayerAggregatesAction = withBaseballAction(
  'recalculatePlayerAggregates',
  {
    featureArea: 'baseball-stats',
    requiredCapability: 'can_manage_stats',
    teamFrom: (_playerId: string, teamId: string) => teamId,
  },
  async (_ctx, playerId: string, teamId: string): Promise<{ success: boolean; error?: string }> => {
  const supabase = await createClient();

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
  const totalAtBats = stats.reduce((sum, s) => sum + (s.at_bats || 0), 0);
  const totalHits = stats.reduce((sum, s) => sum + (s.hits || 0), 0);

  // Slash line — OBP/SLG/OPS from summed counting stats (null on zero
  // denominators). Pure helper is unit-tested; see #436.
  const { obp: careerObp, slg: careerSlg, ops: careerOps } = computeCareerSlashLine(stats);

  // Last 5 and 10 sessions
  const last5 = stats.slice(0, 5);
  const last10 = stats.slice(0, 10);
  const last5Avg = calculateAvg(last5);
  const last10Avg = calculateAvg(last10);

  // Calculate trend
  let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (last5Avg != null && last10Avg != null) {
    const diff = last5Avg - last10Avg;

    if (diff > 0.020) recentTrend = 'improving';
    else if (diff < -0.020) recentTrend = 'declining';
  }

  const trendData = stats
    .slice(0, 14)
    .reverse()
    .map((s, index) => ({
      session: index + 1,
      date: s.session_date,
      type: s.stat_type,
      avg: calculateAvg([s]) ?? 0,
    }));

  // Upsert the aggregate shape that exists in production. The wider
  // BaseballPlayerAggregates TS type covers future analytics fields, but the
  // live table is keyed by (player_id, team_id) and does not have those columns.
  const aggregates = {
    player_id: playerId,
    team_id: teamId,
    total_sessions: stats.length,
    career_avg: careerAvg,
    career_obp: careerObp,
    career_slg: careerSlg,
    career_ops: careerOps,
    practice_avg: practiceAvg,
    game_avg: gameAvg,
    pressure_gap: pressureGap,
    recent_trend: recentTrend,
    total_at_bats: totalAtBats,
    total_hits: totalHits,
    last_5_avg: last5Avg,
    last_10_avg: last10Avg,
    trend_data: trendData,
    last_session_at: stats[0]?.session_date ?? null,
    updated_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: aggregateError } = await (supabase as any)
    .from('baseball_player_aggregates')
    .upsert(aggregates, { onConflict: 'player_id,team_id' });

  if (aggregateError) {
    await logServerError(
      `Failed to upsert baseball player aggregates: ${aggregateError instanceof Error ? aggregateError.message : String(aggregateError)}`,
      { action: 'stats.recalculatePlayerAggregates', playerId, metadata: { teamId } },
    );
    return { success: false, error: 'Failed to recalculate player aggregates' };
  }

  revalidatePath('/baseball/dashboard/command-center');
  revalidatePath('/baseball/dashboard/stats-center');
  revalidatePath(`/baseball/dashboard/players/${playerId}`);
  return { success: true };
  },
);

export async function recalculatePlayerAggregates(
  playerId: string,
  teamId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    return await recalculatePlayerAggregatesAction(playerId, teamId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_stats.recalculatePlayerAggregates', featureArea: 'baseball-stats' },
    );
    return { success: false, error: statsActionErrorMessage(error) };
  }
}

/**
 * Recalculate aggregates for all players on a team
 * SECURITY: Requires can_manage_stats on the target team, enforced
 * server-side by withBaseballAction (see recalculateTeamAggregatesAction
 * below).
 */
const recalculateTeamAggregatesAction = withBaseballAction(
  'recalculateTeamAggregates',
  {
    featureArea: 'baseball-stats',
    requiredCapability: 'can_manage_stats',
    teamFrom: (teamId: string) => teamId,
  },
  async (_ctx, teamId: string): Promise<{ success: boolean; error?: string }> => {
    const supabase = await createClient();

    const { data: teamMembers } = await supabase
      .from('baseball_team_members')
      .select('player_id')
      .eq('team_id', teamId);

    for (const member of teamMembers || []) {
      await recalculatePlayerAggregates(member.player_id, teamId);
    }

    revalidatePath('/baseball/dashboard/command-center');
    return { success: true };
  },
);

export async function recalculateTeamAggregates(teamId: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await recalculateTeamAggregatesAction(teamId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_stats.recalculateTeamAggregates', featureArea: 'baseball-stats' },
    );
    return { success: false, error: statsActionErrorMessage(error) };
  }
}

// ============================================================================
// PLAYER SELF-SERVICE QUERIES
// ============================================================================

interface StatsPlayerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
}

/**
 * Get the authenticated player's own stats
 * SECURITY: Players can only view their own stats — ctx.activePlayerId is
 * resolved server-side by withBaseballAction from the server-validated
 * active baseball context, never from a client-supplied id. Read-only, so
 * marked demoSafe.
 */
const getMyStatsAction = withBaseballAction(
  'getMyStats',
  { featureArea: 'baseball-stats', demoSafe: true },
  async (ctx, filters?: StatsFilter): Promise<{ data: BaseballPlayerStats[] | null; error?: string }> => {
    const playerId = ctx.activePlayerId;
    if (!playerId) {
      return { data: null, error: 'Player profile not found' };
    }
    const supabase = await createClient();

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
      return { data: null, error: 'Failed to fetch your stats' };
    }

    return { data };
  },
);

export async function getMyStats(
  filters?: StatsFilter
): Promise<{ data: BaseballPlayerStats[] | null; error?: string }> {
  try {
    return await getMyStatsAction(filters);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_stats.getMyStats', featureArea: 'baseball-stats' },
    );
    return { data: null, error: statsActionErrorMessage(error) };
  }
}

/**
 * Get the authenticated player's aggregates
 * SECURITY: Players can only view their own aggregates — ctx.activePlayerId
 * is resolved server-side. Read-only, so marked demoSafe.
 */
const getMyAggregatesAction = withBaseballAction(
  'getMyAggregates',
  { featureArea: 'baseball-stats', demoSafe: true },
  async (ctx): Promise<{
    data: BaseballPlayerAggregates | null;
    player: StatsPlayerProfile | null;
    teamName: string | null;
    error?: string;
  }> => {
    const playerId = ctx.activePlayerId;
    if (!playerId) {
      return { data: null, player: null, teamName: null, error: 'Player profile not found' };
    }
    const supabase = await createClient();

    const { data: player } = await supabase
      .from('baseball_players')
      .select('id, first_name, last_name, avatar_url, primary_position, secondary_position, grad_year')
      .eq('id', playerId)
      .single();

    if (!player) {
      return { data: null, player: null, teamName: null, error: 'Player profile not found' };
    }

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
  },
);

export async function getMyAggregates(): Promise<{
  data: BaseballPlayerAggregates | null;
  player: StatsPlayerProfile | null;
  teamName: string | null;
  error?: string
}> {
  try {
    return await getMyAggregatesAction();
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_stats.getMyAggregates', featureArea: 'baseball-stats' },
    );
    return { data: null, player: null, teamName: null, error: statsActionErrorMessage(error) };
  }
}

// ============================================================================
// STATS QUERIES
// ============================================================================

/**
 * Get player stats with filtering
 * SECURITY: Requires authenticated coach; access to the specific player is
 * still verified in-body (public recruiting profile OR shared team), since
 * that check spans potentially several of the player's team memberships
 * rather than a single capability-checked team. Read-only, so marked
 * demoSafe.
 */
const getPlayerStatsAction = withBaseballAction(
  'getPlayerStats',
  { featureArea: 'baseball-stats', demoSafe: true },
  async (ctx, playerId: string, filters?: StatsFilter): Promise<{ data: BaseballPlayerStats[] | null; error?: string }> => {
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { data: null, error: 'Coach profile not found' };
    }
    const supabase = await createClient();

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
        if (await verifyTeamAccess(supabase, coachId, membership.team_id)) {
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
  },
);

export async function getPlayerStats(
  playerId: string,
  filters?: StatsFilter
): Promise<{ data: BaseballPlayerStats[] | null; error?: string }> {
  try {
    return await getPlayerStatsAction(playerId, filters);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_stats.getPlayerStats', featureArea: 'baseball-stats' },
    );
    return { data: null, error: statsActionErrorMessage(error) };
  }
}

/**
 * Get recent uploads for a team
 * SECURITY: Requires authenticated coach with access to the team. Read-only,
 * so marked demoSafe.
 */
const getRecentUploadsAction = withBaseballAction(
  'getRecentUploads',
  { featureArea: 'baseball-stats', demoSafe: true },
  async (ctx, teamId: string, limit: number = 10): Promise<{ data: BaseballStatUpload[] | null; error?: string }> => {
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { data: null, error: 'Coach profile not found' };
    }
    const supabase = await createClient();

    // SECURITY: Verify coach has access to this team
    const hasAccess = await verifyTeamAccess(supabase, coachId, teamId);
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
  },
);

export async function getRecentUploads(
  teamId: string,
  limit = 10
): Promise<{ data: BaseballStatUpload[] | null; error?: string }> {
  try {
    return await getRecentUploadsAction(teamId, limit);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_stats.getRecentUploads', featureArea: 'baseball-stats' },
    );
    return { data: null, error: statsActionErrorMessage(error) };
  }
}

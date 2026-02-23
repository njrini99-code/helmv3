'use server';

import { createClient } from '@/lib/supabase/server';
import { sanitizeDbError } from '@/lib/db-error';
import { revalidatePath } from 'next/cache';
import {
  parseCSV,
  findBestPlayerMatch,
  findColumnMapping,
  type CSVRow,
} from '@/lib/baseball/csv-utils';
import type {
  BaseballGame,
  BaseballBoxScoreBatting,
  BaseballBoxScorePitching,
  BaseballPlayerSeasonStats,
  BoxScoreBattingInput,
  BoxScorePitchingInput,
  CreateGameInput,
  BaseballGameType,
  BaseballGameStatus,
  BaseballPitchingResult,
} from '@/lib/types';

const STATS_PATHS = [
  '/baseball/dashboard/stats',
  '/baseball/dashboard/stats/games',
  '/baseball/dashboard/stats/season',
  '/baseball/dashboard/calendar',
];

function revalidateStatsPaths() {
  STATS_PATHS.forEach((p) => revalidatePath(p));
}

// ============================================================================
// AUTH HELPERS
// ============================================================================

interface CoachAuthResult {
  user: { id: string };
  coach: { id: string; organization_id: string | null };
  supabase: Awaited<ReturnType<typeof createClient>>;
}

async function requireCoachAuth(): Promise<CoachAuthResult | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated' };

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) return { error: 'Coach profile not found' };

  return { user, coach, supabase };
}

async function verifyTeamAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachId: string,
  teamId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('baseball_team_coach_staff')
    .select('id')
    .eq('team_id', teamId)
    .eq('coach_id', coachId)
    .single();
  return !!data;
}

// ============================================================================
// GAME CRUD
// ============================================================================

export interface CreateGameResult {
  success: boolean;
  data?: BaseballGame;
  error?: string;
}

export async function createGame(
  teamId: string,
  input: CreateGameInput
): Promise<CreateGameResult> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { coach, supabase } = authResult;

  const hasAccess = await verifyTeamAccess(supabase, coach.id, teamId);
  if (!hasAccess) return { success: false, error: 'You do not have access to this team' };

  // Optionally create a linked calendar event first
  let eventId = input.event_id ?? null;

  if (input.create_calendar_event && !eventId) {
    const startDateTime = input.event_time
      ? `${input.game_date}T${input.event_time}`
      : `${input.game_date}T12:00:00`;

    const { data: event } = await supabase
      .from('baseball_events')
      .insert({
        team_id: teamId,
        created_by: coach.id,
        title: input.opponent_name
          ? `${input.game_type === 'scrimmage' ? 'Scrimmage' : 'Game'} vs ${input.opponent_name}`
          : input.game_type === 'scrimmage'
            ? 'Scrimmage'
            : 'Game',
        event_type: input.game_type,
        start_time: startDateTime,
        end_time: `${input.game_date}T15:00:00`,
        location: input.location ?? null,
        is_mandatory: true,
        created_by_id: authResult.user.id,
      })
      .select('id')
      .single();

    if (event) eventId = event.id;
  }

  const { data: game, error } = await (supabase as any)
    .from('baseball_games')
    .insert({
      team_id: teamId,
      event_id: eventId,
      game_date: input.game_date,
      game_type: input.game_type,
      opponent_name: input.opponent_name ?? null,
      location: input.location ?? null,
      home_away: input.home_away ?? null,
      innings_played: input.innings_played ?? 9,
      notes: input.notes ?? null,
      weather: input.weather ?? null,
      created_by: coach.id,
      status: 'scheduled',
    })
    .select()
    .single();

  if (error) return { success: false, error: sanitizeDbError(error, 'games') };

  revalidateStatsPaths();
  return { success: true, data: game as BaseballGame };
}

export async function updateGame(
  gameId: string,
  input: Partial<CreateGameInput> & {
    our_score?: number;
    opponent_score?: number;
    status?: BaseballGameStatus;
  }
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { coach, supabase } = authResult;

  const { data: game } = await (supabase as any)
    .from('baseball_games')
    .select('team_id')
    .eq('id', gameId)
    .single();

  if (!game) return { success: false, error: 'Game not found' };

  const hasAccess = await verifyTeamAccess(supabase, coach.id, game.team_id);
  if (!hasAccess) return { success: false, error: 'Access denied' };

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.game_date !== undefined) updateData.game_date = input.game_date;
  if (input.game_type !== undefined) updateData.game_type = input.game_type;
  if (input.opponent_name !== undefined) updateData.opponent_name = input.opponent_name;
  if (input.location !== undefined) updateData.location = input.location;
  if (input.home_away !== undefined) updateData.home_away = input.home_away;
  if (input.innings_played !== undefined) updateData.innings_played = input.innings_played;
  if (input.notes !== undefined) updateData.notes = input.notes;
  if (input.weather !== undefined) updateData.weather = input.weather;
  if (input.our_score !== undefined) updateData.our_score = input.our_score;
  if (input.opponent_score !== undefined) updateData.opponent_score = input.opponent_score;
  if (input.status !== undefined) updateData.status = input.status;

  const { error } = await (supabase as any)
    .from('baseball_games')
    .update(updateData)
    .eq('id', gameId);

  if (error) return { success: false, error: sanitizeDbError(error, 'games') };

  revalidateStatsPaths();
  return { success: true };
}

export async function deleteGame(gameId: string): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { coach, supabase } = authResult;

  const { data: game } = await (supabase as any)
    .from('baseball_games')
    .select('team_id')
    .eq('id', gameId)
    .single();

  if (!game) return { success: false, error: 'Game not found' };

  const hasAccess = await verifyTeamAccess(supabase, coach.id, game.team_id);
  if (!hasAccess) return { success: false, error: 'Access denied' };

  const { error } = await (supabase as any).from('baseball_games').delete().eq('id', gameId);

  if (error) return { success: false, error: sanitizeDbError(error, 'games') };

  revalidateStatsPaths();
  return { success: true };
}

// ============================================================================
// QUERIES
// ============================================================================

export interface GetTeamGamesResult {
  success: boolean;
  data?: BaseballGame[];
  error?: string;
}

export async function getTeamGames(
  teamId: string,
  filters?: {
    seasonYear?: number;
    gameType?: BaseballGameType;
    status?: BaseballGameStatus;
    limit?: number;
  }
): Promise<GetTeamGamesResult> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { coach, supabase } = authResult;

  const hasAccess = await verifyTeamAccess(supabase, coach.id, teamId);
  if (!hasAccess) return { success: false, error: 'Access denied' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('baseball_games')
    .select(`
      *,
      batting:baseball_box_score_batting(id),
      pitching:baseball_box_score_pitching(id)
    `)
    .eq('team_id', teamId)
    .order('game_date', { ascending: false });

  if (filters?.gameType) query = query.eq('game_type', filters.gameType);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.seasonYear) {
    const year = filters.seasonYear;
    query = query
      .gte('game_date', `${year}-01-01`)
      .lte('game_date', `${year}-12-31`);
  }
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;

  if (error) return { success: false, error: sanitizeDbError(error, 'games') };

  // Attach counts
  type GameRow = Record<string, unknown> & { batting?: unknown[]; pitching?: unknown[] };
  const games = (data ?? []).map((g: GameRow) => ({
    ...g,
    batting_count: Array.isArray(g.batting) ? g.batting.length : 0,
    pitching_count: Array.isArray(g.pitching) ? g.pitching.length : 0,
    batting: undefined,
    pitching: undefined,
  })) as BaseballGame[];

  return { success: true, data: games };
}

export interface GetGameBoxScoreResult {
  success: boolean;
  game?: BaseballGame;
  batting?: BaseballBoxScoreBatting[];
  pitching?: BaseballBoxScorePitching[];
  error?: string;
}

export async function getGameBoxScore(gameId: string): Promise<GetGameBoxScoreResult> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { coach, supabase } = authResult;

  const { data: game, error: gameError } = await (supabase as any)
    .from('baseball_games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (gameError || !game) return { success: false, error: 'Game not found' };

  const hasAccess = await verifyTeamAccess(supabase, coach.id, game.team_id);
  if (!hasAccess) return { success: false, error: 'Access denied' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = supabase as any;
  const [battingResult, pitchingResult] = await Promise.all([
    dbAny
      .from('baseball_box_score_batting')
      .select(`
        *,
        player:baseball_players!player_id(first_name, last_name, avatar_url, primary_position)
      `)
      .eq('game_id', gameId)
      .order('batting_order', { ascending: true, nullsFirst: false }),
    dbAny
      .from('baseball_box_score_pitching')
      .select(`
        *,
        player:baseball_players!player_id(first_name, last_name, avatar_url, primary_position)
      `)
      .eq('game_id', gameId),
  ]);

  return {
    success: true,
    game: game as BaseballGame,
    batting: (battingResult.data ?? []) as BaseballBoxScoreBatting[],
    pitching: (pitchingResult.data ?? []) as BaseballBoxScorePitching[],
  };
}

// ============================================================================
// BOX SCORE SAVE
// ============================================================================

function computeBattingRates(line: BoxScoreBattingInput): {
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
} {
  const { ab, h, doubles, triples, hr, bb, hbp, sf } = line;
  if (ab === 0) return { avg: null, obp: null, slg: null, ops: null };

  const avg = h / ab;
  const singles = h - doubles - triples - hr;
  const slg = (singles + 2 * doubles + 3 * triples + 4 * hr) / ab;
  const pa = ab + bb + hbp + sf;
  const obp = pa > 0 ? (h + bb + hbp) / pa : null;
  const ops = obp !== null ? obp + slg : null;

  return {
    avg: parseFloat(avg.toFixed(3)),
    obp: obp !== null ? parseFloat(obp.toFixed(3)) : null,
    slg: parseFloat(slg.toFixed(3)),
    ops: ops !== null ? parseFloat(ops.toFixed(3)) : null,
  };
}

function computePitchingRates(line: BoxScorePitchingInput): {
  era: number | null;
  whip: number | null;
  k9: number | null;
  bb9: number | null;
} {
  const { ip, er, h, bb, k } = line;
  if (ip === 0) return { era: null, whip: null, k9: null, bb9: null };

  return {
    era: parseFloat((9 * er / ip).toFixed(2)),
    whip: parseFloat(((bb + h) / ip).toFixed(3)),
    k9: parseFloat((9 * k / ip).toFixed(2)),
    bb9: parseFloat((9 * bb / ip).toFixed(2)),
  };
}

export interface SaveBoxScoreResult {
  success: boolean;
  error?: string;
}

export async function saveBoxScoreBatting(
  gameId: string,
  battingLines: BoxScoreBattingInput[]
): Promise<SaveBoxScoreResult> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { coach, supabase } = authResult;

  const { data: game } = await (supabase as any)
    .from('baseball_games')
    .select('team_id')
    .eq('id', gameId)
    .single();

  if (!game) return { success: false, error: 'Game not found' };

  const hasAccess = await verifyTeamAccess(supabase, coach.id, game.team_id);
  if (!hasAccess) return { success: false, error: 'Access denied' };

  // Delete existing batting lines for this game before re-inserting
  await (supabase as any).from('baseball_box_score_batting').delete().eq('game_id', gameId);

  const rows = battingLines.map((line) => {
    const rates = computeBattingRates(line);
    return {
      game_id: gameId,
      player_id: line.player_id,
      team_id: game.team_id,
      batting_order: line.batting_order ?? null,
      ab: line.ab,
      r: line.r,
      h: line.h,
      doubles: line.doubles,
      triples: line.triples,
      hr: line.hr,
      rbi: line.rbi,
      bb: line.bb,
      k: line.k,
      sb: line.sb,
      cs: line.cs,
      hbp: line.hbp,
      sac: line.sac,
      sf: line.sf,
      lob: line.lob,
      avg: rates.avg,
      obp: rates.obp,
      slg: rates.slg,
      ops: rates.ops,
    };
  });

  const { error } = await (supabase as any).from('baseball_box_score_batting').insert(rows);

  if (error) return { success: false, error: sanitizeDbError(error, 'games') };

  return { success: true };
}

export async function saveBoxScorePitching(
  gameId: string,
  pitchingLines: BoxScorePitchingInput[]
): Promise<SaveBoxScoreResult> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { coach, supabase } = authResult;

  const { data: game } = await (supabase as any)
    .from('baseball_games')
    .select('team_id')
    .eq('id', gameId)
    .single();

  if (!game) return { success: false, error: 'Game not found' };

  const hasAccess = await verifyTeamAccess(supabase, coach.id, game.team_id);
  if (!hasAccess) return { success: false, error: 'Access denied' };

  await (supabase as any).from('baseball_box_score_pitching').delete().eq('game_id', gameId);

  const rows = pitchingLines.map((line) => {
    const rates = computePitchingRates(line);
    return {
      game_id: gameId,
      player_id: line.player_id,
      team_id: game.team_id,
      ip: line.ip,
      h: line.h,
      r: line.r,
      er: line.er,
      bb: line.bb,
      k: line.k,
      hr: line.hr,
      pitch_count: line.pitch_count ?? null,
      strikes: line.strikes ?? null,
      result: line.result ?? null,
      era: rates.era,
      whip: rates.whip,
      k9: rates.k9,
      bb9: rates.bb9,
    };
  });

  const { error } = await (supabase as any).from('baseball_box_score_pitching').insert(rows);

  if (error) return { success: false, error: sanitizeDbError(error, 'games') };

  return { success: true };
}

export async function markGameCompleted(
  gameId: string,
  ourScore: number,
  opponentScore: number
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { coach, supabase } = authResult;

  const { data: game } = await (supabase as any)
    .from('baseball_games')
    .select('team_id')
    .eq('id', gameId)
    .single();

  if (!game) return { success: false, error: 'Game not found' };

  const hasAccess = await verifyTeamAccess(supabase, coach.id, game.team_id);
  if (!hasAccess) return { success: false, error: 'Access denied' };

  const { error } = await (supabase as any)
    .from('baseball_games')
    .update({
      status: 'completed',
      our_score: ourScore,
      opponent_score: opponentScore,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameId);

  if (error) return { success: false, error: sanitizeDbError(error, 'games') };

  // Recalculate season stats for all players who appeared in this game
  const { data: battingPlayers } = await (supabase as any)
    .from('baseball_box_score_batting')
    .select('player_id')
    .eq('game_id', gameId);

  const { data: pitchingPlayers } = await (supabase as any)
    .from('baseball_box_score_pitching')
    .select('player_id')
    .eq('game_id', gameId);

  const allPlayerIds = [
    ...new Set([
      ...(battingPlayers ?? []).map((p: { player_id: string }) => p.player_id),
      ...(pitchingPlayers ?? []).map((p: { player_id: string }) => p.player_id),
    ]),
  ];

  const currentYear = new Date().getFullYear();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db2 = supabase as any;
  await Promise.all(
    allPlayerIds.map((playerId) =>
      db2.rpc('recalculate_baseball_season_stats', {
        p_player_id: playerId,
        p_team_id: game.team_id,
        p_season_year: currentYear,
      })
    )
  );

  revalidateStatsPaths();
  revalidatePath(`/baseball/dashboard/players`);
  return { success: true };
}

// ============================================================================
// FULL BOX SCORE SAVE (batting + pitching + complete)
// ============================================================================

export async function saveFullBoxScore(
  gameId: string,
  batting: BoxScoreBattingInput[],
  pitching: BoxScorePitchingInput[],
  ourScore: number,
  opponentScore: number
): Promise<SaveBoxScoreResult> {
  const battingResult = await saveBoxScoreBatting(gameId, batting);
  if (!battingResult.success) return battingResult;

  const pitchingResult = await saveBoxScorePitching(gameId, pitching);
  if (!pitchingResult.success) return pitchingResult;

  return markGameCompleted(gameId, ourScore, opponentScore);
}

// ============================================================================
// CSV UPLOAD
// ============================================================================

export interface CSVUploadResult {
  success: boolean;
  uploadId?: string;
  matched: Array<{ csvName: string; playerId: string; playerName: string; confidence: number }>;
  unmatched: Array<{ csvName: string }>;
  battingRows: BoxScoreBattingInput[];
  pitchingRows: BoxScorePitchingInput[];
  allMatched: boolean;
  error?: string;
}

export async function uploadBoxScoreCSV(
  teamId: string,
  gameId: string,
  csvContent: string,
  csvType: 'batting' | 'pitching'
): Promise<CSVUploadResult> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) {
    return {
      success: false,
      matched: [],
      unmatched: [],
      battingRows: [],
      pitchingRows: [],
      allMatched: false,
      error: authResult.error,
    };
  }
  const { coach, supabase } = authResult;

  const hasAccess = await verifyTeamAccess(supabase, coach.id, teamId);
  if (!hasAccess) {
    return {
      success: false,
      matched: [],
      unmatched: [],
      battingRows: [],
      pitchingRows: [],
      allMatched: false,
      error: 'Access denied',
    };
  }

  // Get team players for name matching
  const { data: teamMembers } = await supabase
    .from('baseball_team_members')
    .select(`
      player_id,
      baseball_players!inner(id, first_name, last_name)
    `)
    .eq('team_id', teamId);

  type TeamMemberRow = {
    player_id: string;
    baseball_players: { id: string; first_name: string | null; last_name: string | null };
  };
  const players = (teamMembers as TeamMemberRow[] ?? []).map((tm) => ({
    id: tm.baseball_players.id,
    first_name: tm.baseball_players.first_name,
    last_name: tm.baseball_players.last_name,
  }));

  const rows: CSVRow[] = parseCSV(csvContent);
  if (rows.length === 0) {
    return {
      success: false,
      matched: [],
      unmatched: [],
      battingRows: [],
      pitchingRows: [],
      allMatched: false,
      error: 'No valid rows found in CSV',
    };
  }

  const headers = Object.keys(rows[0]!);
  const nameCol = findColumnMapping(headers, 'player_name');

  if (!nameCol) {
    return {
      success: false,
      matched: [],
      unmatched: [],
      battingRows: [],
      pitchingRows: [],
      allMatched: false,
      error: 'Could not find player name column. Expected: player_name, name, or player',
    };
  }

  const matched: CSVUploadResult['matched'] = [];
  const unmatched: CSVUploadResult['unmatched'] = [];
  const battingRows: BoxScoreBattingInput[] = [];
  const pitchingRows: BoxScorePitchingInput[] = [];

  for (const row of rows) {
    const csvName = (row[nameCol] ?? '').trim();
    if (!csvName) continue;

    const match = findBestPlayerMatch(csvName, players);

    if (match.confidence >= 0.7 && match.playerId) {
      const playerObj = players.find((p) => p.id === match.playerId);
      matched.push({
        csvName,
        playerId: match.playerId,
        playerName: playerObj
          ? `${playerObj.first_name ?? ''} ${playerObj.last_name ?? ''}`.trim()
          : csvName,
        confidence: match.confidence,
      });

      if (csvType === 'batting') {
        battingRows.push(parseCSVBattingRow(row, headers, match.playerId));
      } else {
        pitchingRows.push(parseCSVPitchingRow(row, headers, match.playerId));
      }
    } else {
      unmatched.push({ csvName });
    }
  }

  const allMatched = unmatched.length === 0;

  // Track the upload
  const { data: upload } = await (supabase as any)
    .from('baseball_box_score_uploads')
    .insert({
      team_id: teamId,
      game_id: gameId,
      coach_id: coach.id,
      filename: `upload_${Date.now()}.csv`,
      upload_type: 'csv',
      raw_content: csvContent,
      parsed_data: { csvType, rowCount: rows.length },
      status: allMatched ? 'completed' : 'review_needed',
      matched_players: matched,
      unmatched_players: unmatched,
    })
    .select('id')
    .single();

  // If all matched, auto-save the box score
  if (allMatched && rows.length > 0) {
    if (csvType === 'batting') {
      await saveBoxScoreBatting(gameId, battingRows);
    } else {
      await saveBoxScorePitching(gameId, pitchingRows);
    }
  }

  return {
    success: true,
    uploadId: upload?.id,
    matched,
    unmatched,
    battingRows,
    pitchingRows,
    allMatched,
  };
}

function parseCSVBattingRow(
  row: CSVRow,
  headers: string[],
  playerId: string
): BoxScoreBattingInput {
  const getInt = (colAlias: string) =>
    parseInt(row[findColumnMapping(headers, colAlias) ?? ''] ?? '0', 10) || 0;
  const getOrder = () => {
    const col = findColumnMapping(headers, 'batting_order');
    return col ? parseInt(row[col] ?? '0', 10) || undefined : undefined;
  };

  return {
    player_id: playerId,
    batting_order: getOrder(),
    ab: getInt('at_bats'),
    r: getInt('runs'),
    h: getInt('hits'),
    doubles: getInt('doubles'),
    triples: getInt('triples'),
    hr: getInt('home_runs'),
    rbi: getInt('rbis'),
    bb: getInt('walks'),
    k: getInt('strikeouts'),
    sb: getInt('stolen_bases'),
    cs: getInt('caught_stealing'),
    hbp: getInt('hit_by_pitch'),
    sac: getInt('sacrifice_bunts'),
    sf: getInt('sacrifice_flies'),
    lob: getInt('left_on_base'),
  };
}

function parseCSVPitchingRow(
  row: CSVRow,
  headers: string[],
  playerId: string
): BoxScorePitchingInput {
  const getInt = (colAlias: string) =>
    parseInt(row[findColumnMapping(headers, colAlias) ?? ''] ?? '0', 10) || 0;
  const getFloat = (colAlias: string) =>
    parseFloat(row[findColumnMapping(headers, colAlias) ?? ''] ?? '0') || 0;

  const resultCol = findColumnMapping(headers, 'result');
  const rawResult = resultCol ? (row[resultCol] ?? '').toUpperCase() : '';
  const validResults: BaseballPitchingResult[] = ['W', 'L', 'S', 'H', 'BS', 'ND'];
  const result = validResults.includes(rawResult as BaseballPitchingResult)
    ? (rawResult as BaseballPitchingResult)
    : undefined;

  return {
    player_id: playerId,
    ip: getFloat('innings_pitched'),
    h: getInt('hits_allowed'),
    r: getInt('runs_allowed'),
    er: getInt('earned_runs'),
    bb: getInt('walks'),
    k: getInt('strikeouts'),
    hr: getInt('home_runs_allowed'),
    pitch_count: getInt('pitch_count') || undefined,
    strikes: getInt('strikes') || undefined,
    result,
  };
}

export async function resolveBoxScoreUpload(
  uploadId: string,
  gameId: string,
  resolvedMappings: Array<{ csvName: string; playerId: string }>,
  csvType: 'batting' | 'pitching'
): Promise<SaveBoxScoreResult> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { supabase } = authResult;

  // Get the original upload
  const { data: upload } = await (supabase as any)
    .from('baseball_box_score_uploads')
    .select('*')
    .eq('id', uploadId)
    .single();

  if (!upload?.raw_content) return { success: false, error: 'Upload not found' };

  const rows: CSVRow[] = parseCSV(upload.raw_content);
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const nameCol = findColumnMapping(headers, 'player_name');
  if (!nameCol) return { success: false, error: 'Cannot re-parse CSV' };

  // Build a name → playerId map from resolutions
  const nameToPlayer = new Map(resolvedMappings.map((m) => [m.csvName, m.playerId]));

  // Also include the already-matched players
  const alreadyMatched = (upload.matched_players as Array<{ csvName: string; playerId: string }>) ?? [];
  alreadyMatched.forEach((m) => nameToPlayer.set(m.csvName, m.playerId));

  const battingRows: BoxScoreBattingInput[] = [];
  const pitchingRows: BoxScorePitchingInput[] = [];

  for (const row of rows) {
    const csvName = (row[nameCol] ?? '').trim();
    const playerId = nameToPlayer.get(csvName);
    if (!playerId) continue;

    if (csvType === 'batting') {
      battingRows.push(parseCSVBattingRow(row, headers, playerId));
    } else {
      pitchingRows.push(parseCSVPitchingRow(row, headers, playerId));
    }
  }

  // Save
  let result: SaveBoxScoreResult;
  if (csvType === 'batting') {
    result = await saveBoxScoreBatting(gameId, battingRows);
  } else {
    result = await saveBoxScorePitching(gameId, pitchingRows);
  }

  if (result.success) {
    await (supabase as any)
      .from('baseball_box_score_uploads')
      .update({ status: 'completed' })
      .eq('id', uploadId);
  }

  return result;
}

// ============================================================================
// SEASON STATS QUERIES
// ============================================================================

export interface GetSeasonStatsResult {
  success: boolean;
  data?: BaseballPlayerSeasonStats[];
  error?: string;
}

export async function getTeamSeasonStats(
  teamId: string,
  seasonYear?: number
): Promise<GetSeasonStatsResult> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { coach, supabase } = authResult;

  const hasAccess = await verifyTeamAccess(supabase, coach.id, teamId);
  if (!hasAccess) return { success: false, error: 'Access denied' };

  const year = seasonYear ?? new Date().getFullYear();

  const { data, error } = await (supabase as any)
    .from('baseball_player_season_stats')
    .select(`
      *,
      player:baseball_players!player_id(first_name, last_name, primary_position)
    `)
    .eq('team_id', teamId)
    .eq('season_year', year);

  if (error) return { success: false, error: sanitizeDbError(error, 'games') };

  return { success: true, data: data as BaseballPlayerSeasonStats[] };
}

export interface GetPlayerSeasonStatsResult {
  success: boolean;
  data?: BaseballPlayerSeasonStats;
  gameLog?: Array<BaseballBoxScoreBatting & { game: Partial<BaseballGame> }>;
  pitchingLog?: Array<BaseballBoxScorePitching & { game: Partial<BaseballGame> }>;
  error?: string;
}

export async function getPlayerSeasonStats(
  playerId: string,
  teamId: string,
  seasonYear?: number
): Promise<GetPlayerSeasonStatsResult> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { coach, supabase } = authResult;

  const hasAccess = await verifyTeamAccess(supabase, coach.id, teamId);
  if (!hasAccess) return { success: false, error: 'Access denied' };

  const year = seasonYear ?? new Date().getFullYear();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [statsResult, battingLogResult, pitchingLogResult] = await Promise.all([
    db
      .from('baseball_player_season_stats')
      .select('*')
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .eq('season_year', year)
      .single(),
    db
      .from('baseball_box_score_batting')
      .select(`
        *,
        game:baseball_games!game_id(id, game_date, game_type, opponent_name, our_score, opponent_score, status)
      `)
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false }),
    db
      .from('baseball_box_score_pitching')
      .select(`
        *,
        game:baseball_games!game_id(id, game_date, game_type, opponent_name, our_score, opponent_score, status)
      `)
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false }),
  ]);

  return {
    success: true,
    data: statsResult.data as BaseballPlayerSeasonStats | undefined,
    gameLog: (battingLogResult.data ?? []) as Array<BaseballBoxScoreBatting & { game: Partial<BaseballGame> }>,
    pitchingLog: (pitchingLogResult.data ?? []) as Array<BaseballBoxScorePitching & { game: Partial<BaseballGame> }>,
  };
}

// Player self-service — get own season stats
export async function getMySeasonStats(
  seasonYear?: number
): Promise<{ success: boolean; data?: BaseballPlayerSeasonStats; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: player } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) return { success: false, error: 'Player not found' };

  const year = seasonYear ?? new Date().getFullYear();

  const { data, error } = await (supabase as any)
    .from('baseball_player_season_stats')
    .select('*')
    .eq('player_id', player.id)
    .eq('season_year', year)
    .maybeSingle();

  if (error) return { success: false, error: sanitizeDbError(error, 'games') };

  return { success: true, data: data as BaseballPlayerSeasonStats | undefined };
}

export async function recalculateAllSeasonStats(
  teamId: string,
  seasonYear?: number
): Promise<{ success: boolean; error?: string }> {
  const authResult = await requireCoachAuth();
  if ('error' in authResult) return { success: false, error: authResult.error };
  const { coach, supabase } = authResult;

  const hasAccess = await verifyTeamAccess(supabase, coach.id, teamId);
  if (!hasAccess) return { success: false, error: 'Access denied' };

  const year = seasonYear ?? new Date().getFullYear();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('recalculate_team_baseball_season_stats', {
    p_team_id: teamId,
    p_season_year: year,
  });

  if (error) return { success: false, error: sanitizeDbError(error, 'games') };

  revalidateStatsPaths();
  return { success: true };
}

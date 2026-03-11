'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

// ============================================
// TYPES
// ============================================

export interface TracerPlayerSummary {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  total_rounds: number;
  completed_rounds: number;
  in_progress_rounds: number;
  draft_rounds: number;
  last_activity: string | null;
}

export interface TracerRoundDetail {
  round_id: string;
  player_id: string;
  status: string;
  course_name: string | null;
  round_date: string | null;
  expected_holes: number;
  total_score: number | null;
  score_to_par: number | null;
  created_at: string | null;
  updated_at: string | null;
  // Data integrity checks
  actual_holes: number;
  total_shots: number;
  putt_details_count: number;
  approach_details_count: number;
  stats_cached: boolean;
  has_strokes_gained: boolean;
  has_putts: boolean;
  has_fairways: boolean;
  has_gir: boolean;
  errors: TracerErrorLog[];
}

export interface TracerStatsAccuracy {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  cached_rounds: number;
  live_rounds: number;
  cached_scoring_avg: number | null;
  live_scoring_avg: number | null;
  cached_putts_per_round: number | null;
  live_putts_per_round: number | null;
  cached_fairway_pct: number | null;
  live_fairway_pct: number | null;
  cached_gir_pct: number | null;
  live_gir_pct: number | null;
  is_stale: boolean;
  cache_updated_at: string | null;
}

export interface TracerErrorLog {
  id: string;
  message: string;
  severity: string | null;
  context: Record<string, unknown> | null;
  created_at: string | null;
}

export interface TracerActivityEvent {
  type: 'round_started' | 'round_completed' | 'round_error' | 'detail_warning';
  player_name: string;
  player_id: string;
  round_id: string | null;
  course_name: string | null;
  score: number | null;
  score_to_par: number | null;
  error_message: string | null;
  timestamp: string;
}

export interface TracerData {
  playerSummaries: TracerPlayerSummary[];
  roundDetails: Record<string, TracerRoundDetail[]>;
  statsAccuracy: TracerStatsAccuracy[];
  recentErrors: TracerErrorLog[];
  activityFeed: TracerActivityEvent[];
  errorStats: {
    total7d: number;
    critical7d: number;
    warnings7d: number;
  };
  /** Per-round integrity data from hole-level aggregation */
  roundIntegrity?: Record<string, {
    round_id: string;
    hole_count: number;
    holes_sum_score: number | null;
    holes_sum_putts: number | null;
    holes_sum_fairways_hit: number;
    holes_sum_fairways_total: number;
    holes_sum_gir: number;
    holes_sum_gir_total: number;
    null_score_count: number;
    null_putts_count: number;
    max_hole_score: number | null;
  }>;
}

// ============================================
// MAIN DATA FETCHER
// ============================================

export async function getTracerData(): Promise<TracerData> {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userData?.role !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();
  const ago7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Batch 1: Core data
  const [allPlayersResult, allRoundsResult, statsAccuracyResult] = await Promise.all([
    adminDb.from('golf_players').select('id, first_name, last_name'),
    adminDb
      .from('golf_rounds')
      .select(`
        id,
        player_id,
        status,
        course_name,
        round_date,
        holes_played,
        total_score,
        score_to_par,
        total_putts,
        total_fairways_hit,
        total_fairways,
        total_gir,
        total_gir_possible,
        strokes_gained_total,
        created_at,
        updated_at
      `)
      .order('updated_at', { ascending: false }),
    adminDb
      .from('golf_player_stats_cache')
      .select(`
        player_id,
        rounds_played,
        scoring_average,
        putts_per_round,
        driving_accuracy_percentage,
        gir_percentage,
        is_stale,
        updated_at
      `),
  ]);

  // Build player map
  const playerMap = new Map<string, TracerPlayerSummary>();
  const playerNameMap = new Map<string, string>();
  for (const p of allPlayersResult.data || []) {
    const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown';
    playerNameMap.set(p.id, fullName);
    playerMap.set(p.id, {
      player_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      total_rounds: 0,
      completed_rounds: 0,
      in_progress_rounds: 0,
      draft_rounds: 0,
      last_activity: null,
    });
  }

  // Aggregate rounds per player + build activity feed
  const roundsByPlayer: Record<string, TracerRoundDetail[]> = {};
  const activityFeed: TracerActivityEvent[] = [];

  for (const r of allRoundsResult.data || []) {
    const summary = playerMap.get(r.player_id);
    const playerName = playerNameMap.get(r.player_id) || 'Unknown';
    if (summary) {
      summary.total_rounds++;
      if (r.status === 'completed') summary.completed_rounds++;
      else if (r.status === 'in_progress') summary.in_progress_rounds++;
      else if (r.status === 'draft') summary.draft_rounds++;
      if (r.updated_at && (!summary.last_activity || r.updated_at > summary.last_activity)) {
        summary.last_activity = r.updated_at;
      }
    }

    if (!roundsByPlayer[r.player_id]) roundsByPlayer[r.player_id] = [];
    roundsByPlayer[r.player_id]!.push({
      round_id: r.id,
      player_id: r.player_id,
      status: r.status as string,
      course_name: r.course_name,
      round_date: r.round_date,
      expected_holes: r.holes_played || 18,
      total_score: r.total_score,
      score_to_par: r.score_to_par,
      created_at: r.created_at,
      updated_at: r.updated_at,
      actual_holes: 0,
      total_shots: 0,
      putt_details_count: 0,
      approach_details_count: 0,
      stats_cached: false,
      has_strokes_gained: r.strokes_gained_total != null,
      has_putts: r.total_putts != null && r.total_putts > 0,
      has_fairways: r.total_fairways != null && r.total_fairways > 0,
      has_gir: r.total_gir_possible != null && r.total_gir_possible > 0,
      errors: [],
    });

    // Activity: round started
    if (r.created_at) {
      activityFeed.push({
        type: 'round_started',
        player_name: playerName,
        player_id: r.player_id,
        round_id: r.id,
        course_name: r.course_name,
        score: null,
        score_to_par: null,
        error_message: null,
        timestamp: r.created_at,
      });
    }

    // Activity: round completed
    if (r.status === 'completed' && r.updated_at) {
      activityFeed.push({
        type: 'round_completed',
        player_name: playerName,
        player_id: r.player_id,
        round_id: r.id,
        course_name: r.course_name,
        score: r.total_score,
        score_to_par: r.score_to_par,
        error_message: null,
        timestamp: r.updated_at,
      });
    }
  }

  // Batch 2: Hole/shot/detail counts + stats cache + error logs
  const roundIds = (allRoundsResult.data || []).map((r) => r.id);
  const [
    holeCounts, shotCounts, puttDetailCounts, approachDetailCounts,
    statsCacheResult,
    recentErrorsResult, errorTotal7d, errorCritical7d, errorWarnings7d,
  ] = await Promise.all([
    roundIds.length > 0
      ? adminDb.from('golf_holes').select('round_id, score, putts, fairway_hit, gir, par').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    roundIds.length > 0
      ? adminDb.from('golf_shots').select('round_id').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    roundIds.length > 0
      ? adminDb.from('golf_shots').select('round_id, putt_details!inner(id)').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    roundIds.length > 0
      ? adminDb.from('golf_shots').select('round_id, approach_miss_details!inner(id)').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    // Stats cache check: which rounds have stats cached
    roundIds.length > 0
      ? adminDb.from('golf_round_stats_cache').select('round_id').in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    // Error logs
    adminDb
      .from('error_logs')
      .select('id, message, severity, context, created_at')
      .or(
        `context->>action.in.(submitGolfRoundComprehensive,savePartialRound),severity.eq.warning`
      )
      .order('created_at', { ascending: false })
      .limit(100),
    adminDb
      .from('error_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', ago7d)
      .or(
        `context->>action.in.(submitGolfRoundComprehensive,savePartialRound),severity.eq.warning`
      ),
    adminDb
      .from('error_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', ago7d)
      .eq('severity', 'critical')
      .or(
        `context->>action.in.(submitGolfRoundComprehensive,savePartialRound)`
      ),
    adminDb
      .from('error_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', ago7d)
      .eq('severity', 'warning'),
  ]);

  // Count per round
  const holeCountMap = new Map<string, number>();
  const shotCountMap = new Map<string, number>();
  const puttDetailMap = new Map<string, number>();
  const approachDetailMap = new Map<string, number>();
  const statsCachedSet = new Set<string>();

  for (const h of (holeCounts as { data: { round_id: string }[] | null }).data || []) {
    holeCountMap.set(h.round_id, (holeCountMap.get(h.round_id) || 0) + 1);
  }

  // Build round integrity map from raw hole data
  interface RoundIntegrityEntry {
    round_id: string;
    hole_count: number;
    holes_sum_score: number | null;
    holes_sum_putts: number | null;
    holes_sum_fairways_hit: number;
    holes_sum_fairways_total: number;
    holes_sum_gir: number;
    holes_sum_gir_total: number;
    null_score_count: number;
    null_putts_count: number;
    max_hole_score: number | null;
  }
  const roundIntegrity: Record<string, RoundIntegrityEntry> = {};
  type HoleRow = { round_id: string; score: number | null; putts: number | null; fairway_hit: boolean | null; gir: boolean | null; par: number | null };
  for (const h of (holeCounts as { data: HoleRow[] | null }).data || []) {
    if (!roundIntegrity[h.round_id]) {
      roundIntegrity[h.round_id] = {
        round_id: h.round_id,
        hole_count: 0,
        holes_sum_score: null,
        holes_sum_putts: null,
        holes_sum_fairways_hit: 0,
        holes_sum_fairways_total: 0,
        holes_sum_gir: 0,
        holes_sum_gir_total: 0,
        null_score_count: 0,
        null_putts_count: 0,
        max_hole_score: null,
      };
    }
    const ri = roundIntegrity[h.round_id]!;
    ri.hole_count++;
    if (h.score != null) {
      ri.holes_sum_score = (ri.holes_sum_score ?? 0) + h.score;
      if (ri.max_hole_score === null || h.score > ri.max_hole_score) {
        ri.max_hole_score = h.score;
      }
    } else {
      ri.null_score_count++;
    }
    if (h.putts != null) {
      ri.holes_sum_putts = (ri.holes_sum_putts ?? 0) + h.putts;
    } else {
      ri.null_putts_count++;
    }
    if (h.fairway_hit != null) {
      ri.holes_sum_fairways_total++;
      if (h.fairway_hit) ri.holes_sum_fairways_hit++;
    }
    if (h.gir != null) {
      ri.holes_sum_gir_total++;
      if (h.gir) ri.holes_sum_gir++;
    }
  }

  for (const s of (shotCounts as { data: { round_id: string }[] | null }).data || []) {
    shotCountMap.set(s.round_id, (shotCountMap.get(s.round_id) || 0) + 1);
  }
  for (const p of (puttDetailCounts as { data: { round_id: string }[] | null }).data || []) {
    puttDetailMap.set(p.round_id, (puttDetailMap.get(p.round_id) || 0) + 1);
  }
  for (const a of (approachDetailCounts as { data: { round_id: string }[] | null }).data || []) {
    approachDetailMap.set(a.round_id, (approachDetailMap.get(a.round_id) || 0) + 1);
  }
  for (const sc of (statsCacheResult as { data: { round_id: string }[] | null }).data || []) {
    statsCachedSet.add(sc.round_id);
  }

  // Map errors to rounds + build error activity events
  const errorsByRound = new Map<string, TracerErrorLog[]>();
  const errors = (recentErrorsResult.data || []) as TracerErrorLog[];
  for (const err of errors) {
    const ctx = err.context as Record<string, unknown> | null;
    const roundId = ctx?.roundId as string | undefined;
    const playerId = ctx?.playerId as string | undefined;
    if (roundId) {
      if (!errorsByRound.has(roundId)) errorsByRound.set(roundId, []);
      errorsByRound.get(roundId)!.push(err);
    }

    // Add to activity feed
    if (err.created_at) {
      activityFeed.push({
        type: err.severity === 'warning' ? 'detail_warning' : 'round_error',
        player_name: playerId ? (playerNameMap.get(playerId) || 'Unknown') : 'Unknown',
        player_id: playerId || '',
        round_id: roundId || null,
        course_name: null,
        score: null,
        score_to_par: null,
        error_message: err.message,
        timestamp: err.created_at,
      });
    }
  }

  // Apply counts + errors to round details
  for (const rounds of Object.values(roundsByPlayer)) {
    for (const rd of rounds) {
      rd.actual_holes = holeCountMap.get(rd.round_id) || 0;
      rd.total_shots = shotCountMap.get(rd.round_id) || 0;
      rd.putt_details_count = puttDetailMap.get(rd.round_id) || 0;
      rd.approach_details_count = approachDetailMap.get(rd.round_id) || 0;
      rd.stats_cached = statsCachedSet.has(rd.round_id);
      rd.errors = errorsByRound.get(rd.round_id) || [];
    }
  }

  // Build stats accuracy with full live computation
  const statsAccuracy: TracerStatsAccuracy[] = [];
  for (const cached of statsAccuracyResult.data || []) {
    const player = playerMap.get(cached.player_id);
    if (!player) continue;

    const completedRounds = (allRoundsResult.data || []).filter(
      (r) => r.player_id === cached.player_id && r.status === 'completed'
    );
    const liveRounds = completedRounds.length;
    const scores = completedRounds.map((r) => r.total_score).filter((s): s is number => s != null);
    const putts = completedRounds.map((r) => r.total_putts).filter((s): s is number => s != null);
    const totalFairwaysHit = completedRounds.reduce((sum, r) => sum + (r.total_fairways_hit || 0), 0);
    const totalFairways = completedRounds.reduce((sum, r) => sum + (r.total_fairways || 0), 0);
    const totalGir = completedRounds.reduce((sum, r) => sum + (r.total_gir || 0), 0);
    const totalGirPossible = completedRounds.reduce((sum, r) => sum + (r.total_gir_possible || 0), 0);

    statsAccuracy.push({
      player_id: cached.player_id,
      first_name: player.first_name,
      last_name: player.last_name,
      cached_rounds: cached.rounds_played || 0,
      live_rounds: liveRounds,
      cached_scoring_avg: cached.scoring_average ? Number(cached.scoring_average) : null,
      live_scoring_avg: scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null,
      cached_putts_per_round: cached.putts_per_round ? Number(cached.putts_per_round) : null,
      live_putts_per_round: putts.length > 0
        ? Math.round((putts.reduce((a, b) => a + b, 0) / putts.length) * 10) / 10
        : null,
      cached_fairway_pct: cached.driving_accuracy_percentage ? Number(cached.driving_accuracy_percentage) : null,
      live_fairway_pct: totalFairways > 0
        ? Math.round((totalFairwaysHit / totalFairways * 100) * 10) / 10
        : null,
      cached_gir_pct: cached.gir_percentage ? Number(cached.gir_percentage) : null,
      live_gir_pct: totalGirPossible > 0
        ? Math.round((totalGir / totalGirPossible * 100) * 10) / 10
        : null,
      is_stale: cached.is_stale || false,
      cache_updated_at: cached.updated_at || '',
    });
  }

  // Sort activity feed by timestamp (newest first)
  activityFeed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Sort player summaries: most rounds first, then by name
  const playerSummaries = Array.from(playerMap.values())
    .filter((p) => p.total_rounds > 0)
    .sort((a, b) => b.total_rounds - a.total_rounds || (a.last_name ?? '').localeCompare(b.last_name ?? ''));

  return {
    playerSummaries,
    roundDetails: roundsByPlayer,
    statsAccuracy: statsAccuracy.sort((a, b) => b.cached_rounds - a.cached_rounds),
    recentErrors: errors,
    activityFeed: activityFeed.slice(0, 50),
    errorStats: {
      total7d: errorTotal7d.count || 0,
      critical7d: errorCritical7d.count || 0,
      warnings7d: errorWarnings7d.count || 0,
    },
    roundIntegrity,
  };
}

// ============================================
// ENRICHED DATA (sparklines, trends, stuck rounds)
// ============================================

export interface TracerEnrichedData {
  dailyRoundCounts: { date: string; count: number }[];
  dailyErrorCounts: { date: string; count: number }[];
  stuckRounds: {
    round_id: string;
    player_id: string;
    player_name: string;
    course_name: string | null;
    updated_at: string;
    hours_stuck: number;
  }[];
}

export async function getTracerEnrichedData(): Promise<TracerEnrichedData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userData?.role !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();
  const ago30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const [roundsResult, errorsResult, stuckResult] = await Promise.all([
    // Daily round counts (last 30 days)
    adminDb
      .from('golf_rounds')
      .select('created_at')
      .gte('created_at', ago30d)
      .order('created_at', { ascending: true }),

    // Daily error counts (last 30 days)
    adminDb
      .from('error_logs')
      .select('created_at')
      .gte('created_at', ago30d)
      .or('context->>action.in.(submitGolfRoundComprehensive,savePartialRound),severity.eq.warning')
      .order('created_at', { ascending: true }),

    // Stuck rounds (in_progress with updated_at > 2 hours ago)
    adminDb
      .from('golf_rounds')
      .select('id, player_id, course_name, updated_at')
      .eq('status', 'in_progress')
      .lt('updated_at', twoHoursAgo),
  ]);

  // Aggregate into daily counts
  function toDailyCounts(rows: { created_at: string | null }[] | null): { date: string; count: number }[] {
    const map = new Map<string, number>();
    // Pre-fill last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      map.set(key, 0);
    }
    for (const row of rows || []) {
      if (!row.created_at) continue;
      const key = row.created_at.slice(0, 10);
      if (map.has(key)) {
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }

  // Resolve player names for stuck rounds
  const stuckData = stuckResult.data || [];
  const stuckPlayerIds = [...new Set(stuckData.map((r) => r.player_id))];
  let playerNameMap = new Map<string, string>();
  if (stuckPlayerIds.length > 0) {
    const { data: players } = await adminDb
      .from('golf_players')
      .select('id, first_name, last_name')
      .in('id', stuckPlayerIds);
    for (const p of players || []) {
      playerNameMap.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown');
    }
  }

  const stuckRounds = stuckData
    .filter((r): r is typeof r & { updated_at: string } => r.updated_at != null)
    .map((r) => ({
      round_id: r.id,
      player_id: r.player_id,
      player_name: playerNameMap.get(r.player_id) || 'Unknown',
      course_name: r.course_name,
      updated_at: r.updated_at,
      hours_stuck: (Date.now() - new Date(r.updated_at).getTime()) / (1000 * 60 * 60),
    }));

  return {
    dailyRoundCounts: toDailyCounts(roundsResult.data),
    dailyErrorCounts: toDailyCounts(errorsResult.data),
    stuckRounds,
  };
}

// ============================================
// ROUND DIAGNOSTIC (lazy-loaded for drill-down modal)
// ============================================

export interface TracerHoleDiagnostic {
  hole_number: number;
  par: number | null;
  score: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  gir: boolean | null;
}

export interface TracerShotDiagnostic {
  shot_number: number;
  hole_number: number;
  club: string | null;
  shot_type: string | null;
  distance: number | null;
}

export interface TracerRoundDiagnosticData {
  holes: TracerHoleDiagnostic[];
  shots: TracerShotDiagnostic[];
  errors: TracerErrorLog[];
  playerName: string;
}

export async function getTracerRoundDiagnostic(roundId: string): Promise<TracerRoundDiagnosticData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userData?.role !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();

  // Get round info to resolve player name
  const { data: round } = await adminDb
    .from('golf_rounds')
    .select('player_id')
    .eq('id', roundId)
    .single();

  let playerName = 'Unknown';
  if (round?.player_id) {
    const { data: player } = await adminDb
      .from('golf_players')
      .select('first_name, last_name')
      .eq('id', round.player_id)
      .single();
    if (player) {
      playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown';
    }
  }

  const [holesResult, shotsResult, errorsResult] = await Promise.all([
    adminDb
      .from('golf_holes')
      .select('hole_number, par, score, putts, fairway_hit, gir')
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true }),

    adminDb
      .from('golf_shots')
      .select('shot_number, hole_number, club_used, shot_type, shot_distance')
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true })
      .order('shot_number', { ascending: true }),

    adminDb
      .from('error_logs')
      .select('id, message, severity, context, created_at')
      .eq('context->>roundId', roundId)
      .order('created_at', { ascending: false }),
  ]);

  const holes: TracerHoleDiagnostic[] = (holesResult.data || []).map((h) => ({
    hole_number: h.hole_number,
    par: h.par,
    score: h.score,
    putts: h.putts,
    fairway_hit: h.fairway_hit,
    gir: h.gir,
  }));

  const shots: TracerShotDiagnostic[] = (shotsResult.data || []).map((s) => ({
    shot_number: s.shot_number,
    hole_number: s.hole_number,
    club: s.club_used,
    shot_type: s.shot_type,
    distance: s.shot_distance != null ? Number(s.shot_distance) : null,
  }));

  return {
    holes,
    shots,
    errors: (errorsResult.data || []) as TracerErrorLog[],
    playerName,
  };
}

// ============================================
// AUTO-FIX ACTIONS (admin only)
// ============================================

export async function fixRoundData(
  roundId: string,
  fixType: 'recalculate_round_totals' | 'recalculate_round_gir' | 'refresh_player_stats_cache' | 'recalculate_strokes_gained',
  playerId?: string
): Promise<{
  success: boolean;
  fix_type: string;
  round_id: string | null;
  player_id: string | null;
  message: string;
  changes?: Record<string, { before: string | number | null; after: string | number | null }>;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userData?.role !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();

  switch (fixType) {
    case 'recalculate_round_totals': {
      const { data: round } = await adminDb
        .from('golf_rounds')
        .select('total_score, score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, player_id')
        .eq('id', roundId)
        .single();
      if (!round) return { success: false, fix_type: fixType, round_id: roundId, player_id: null, message: 'Round not found' };

      const { data: holes } = await adminDb
        .from('golf_holes')
        .select('score, putts, fairway_hit, gir, par')
        .eq('round_id', roundId);

      if (!holes || holes.length === 0) {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: round.player_id, message: 'No hole data found for this round' };
      }

      // Refuse to recalculate if any holes have null scores — would produce garbage totals
      const holesWithNullScore = holes.filter(h => h.score == null);
      if (holesWithNullScore.length > 0) {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: round.player_id, message: `Cannot recalculate: ${holesWithNullScore.length} of ${holes.length} holes have null scores` };
      }

      const newTotalScore = holes.reduce((sum, h) => sum + h.score!, 0);
      const newScoreToPar = holes.reduce((sum, h) => sum + (h.score! - (h.par || 0)), 0);
      const newTotalPutts = holes.reduce((sum, h) => sum + (h.putts || 0), 0);
      const newFairwaysHit = holes.filter(h => h.fairway_hit === true).length;
      const newFairwaysTotal = holes.filter(h => h.fairway_hit != null).length;
      const newGir = holes.filter(h => h.gir === true).length;
      const newGirTotal = holes.filter(h => h.gir != null).length;

      const { error } = await adminDb
        .from('golf_rounds')
        .update({
          total_score: newTotalScore,
          score_to_par: newScoreToPar,
          total_putts: newTotalPutts,
          total_fairways_hit: newFairwaysHit,
          total_fairways: newFairwaysTotal,
          total_gir: newGir,
          total_gir_possible: newGirTotal,
        })
        .eq('id', roundId);

      if (error) return { success: false, fix_type: fixType, round_id: roundId, player_id: round.player_id, message: `DB update failed: ${error.message}` };

      revalidatePath('/golf/admin');
      return {
        success: true,
        fix_type: fixType,
        round_id: roundId,
        player_id: round.player_id,
        message: 'Round totals recalculated from hole data',
        changes: {
          total_score: { before: round.total_score, after: newTotalScore },
          total_putts: { before: round.total_putts, after: newTotalPutts },
          total_fairways_hit: { before: round.total_fairways_hit, after: newFairwaysHit },
          total_gir: { before: round.total_gir, after: newGir },
        },
      };
    }

    case 'recalculate_round_gir': {
      const { data: holes } = await adminDb
        .from('golf_holes')
        .select('id, score, putts, par, gir')
        .eq('round_id', roundId);

      if (!holes || holes.length === 0) {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: playerId || null, message: 'No hole data found' };
      }

      // Batch GIR updates to avoid N+1 sequential writes
      const toTrue: string[] = [];
      const toFalse: string[] = [];
      for (const hole of holes) {
        if (hole.score == null || hole.putts == null || hole.par == null) continue;
        const correctGir = (hole.score - hole.putts) <= (hole.par - 2);
        if (hole.gir !== correctGir) {
          (correctGir ? toTrue : toFalse).push(hole.id);
        }
      }
      if (toTrue.length > 0) {
        await adminDb.from('golf_holes').update({ gir: true }).in('id', toTrue);
      }
      if (toFalse.length > 0) {
        await adminDb.from('golf_holes').update({ gir: false }).in('id', toFalse);
      }
      const fixedCount = toTrue.length + toFalse.length;

      const { data: updatedHoles } = await adminDb
        .from('golf_holes')
        .select('gir')
        .eq('round_id', roundId);
      const newGir = (updatedHoles || []).filter(h => h.gir === true).length;
      const newGirTotal = (updatedHoles || []).filter(h => h.gir != null).length;
      await adminDb
        .from('golf_rounds')
        .update({ total_gir: newGir, total_gir_possible: newGirTotal })
        .eq('id', roundId);

      revalidatePath('/golf/admin');
      return {
        success: true,
        fix_type: fixType,
        round_id: roundId,
        player_id: playerId || null,
        message: `Recalculated GIR for ${holes.length} holes, fixed ${fixedCount}`,
        changes: { gir_holes_fixed: { before: null, after: fixedCount } },
      };
    }

    case 'refresh_player_stats_cache': {
      if (!playerId) return { success: false, fix_type: fixType, round_id: null, player_id: null, message: 'playerId required' };

      const { error } = await adminDb.rpc('refresh_player_stats_cache', { p_player_id: playerId });

      if (error) return { success: false, fix_type: fixType, round_id: null, player_id: playerId, message: `Cache refresh failed: ${error.message}` };

      revalidatePath('/golf/admin');
      return {
        success: true,
        fix_type: fixType,
        round_id: null,
        player_id: playerId,
        message: 'Stats cache refreshed successfully',
      };
    }

    case 'recalculate_strokes_gained': {
      const { error } = await adminDb.rpc('recalculate_round_strokes_gained', { p_round_id: roundId });

      if (error) return { success: false, fix_type: fixType, round_id: roundId, player_id: playerId || null, message: `SG recalc failed: ${error.message}` };

      revalidatePath('/golf/admin');
      return {
        success: true,
        fix_type: fixType,
        round_id: roundId,
        player_id: playerId || null,
        message: 'Strokes gained recalculated for round',
      };
    }

    default:
      return { success: false, fix_type: fixType, round_id: roundId, player_id: playerId || null, message: `Unknown fix type: ${fixType}` };
  }
}

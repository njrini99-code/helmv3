import type {
  TracerData,
  TracerRoundDetail,
  TracerErrorLog,
  FlatRound,
  ErrorGroup,
  AffectedPlayer,
  Outlier,
  PlayerCompleteness,
  CompletenessCategory,
  TracerAlert,
  StuckRound,
} from './tracer-types';

// ============================================================================
// HEALTH SCORE (composite: completion + data quality + error rate)
// ============================================================================

export function computeHealthScore(data: TracerData): {
  score: number;
  completionScore: number;
  qualityScore: number;
  errorScore: number;
} {
  const totalRounds = data.playerSummaries.reduce((s, p) => s + p.total_rounds, 0);
  const completedRounds = data.playerSummaries.reduce((s, p) => s + p.completed_rounds, 0);
  const completionRate = totalRounds > 0 ? completedRounds / totalRounds : 1;
  const completionScore = Math.round(completionRate * 100);

  // Data quality: percentage of stats that are in sync
  const totalStats = data.statsAccuracy.length;
  const mismatchCount = data.statsAccuracy.filter((s) => {
    if (s.cached_scoring_avg != null && s.live_scoring_avg != null) {
      return Math.abs(s.cached_scoring_avg - s.live_scoring_avg) > 0.5;
    }
    return s.cached_rounds !== s.live_rounds;
  }).length;
  const qualityScore = totalStats > 0
    ? Math.round(((totalStats - mismatchCount) / totalStats) * 100)
    : 100;

  // Error rate: inverse of errors per round
  const errorRate = totalRounds > 0
    ? Math.min(data.errorStats.total7d / totalRounds, 1)
    : 0;
  const errorScore = Math.round((1 - errorRate) * 100);

  // Weighted average
  const score = Math.round(
    completionScore * 0.4 + qualityScore * 0.3 + errorScore * 0.3
  );

  return { score, completionScore, qualityScore, errorScore };
}

// ============================================================================
// FLATTEN ROUNDS (for Round Inspector - flat searchable list)
// ============================================================================

export function flattenRounds(data: TracerData): FlatRound[] {
  const rounds: FlatRound[] = [];

  for (const player of data.playerSummaries) {
    const playerRounds = data.roundDetails[player.player_id] || [];
    const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown';

    for (const round of playerRounds) {
      rounds.push({
        ...round,
        player_id: player.player_id,
        player_name: playerName,
      });
    }
  }

  // Sort by most recent first
  rounds.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  return rounds;
}

// ============================================================================
// IS STUCK ROUND (in_progress for > 2 hours)
// ============================================================================

export function isStuckRound(round: TracerRoundDetail): boolean {
  if (round.status !== 'in_progress') return false;
  if (!round.updated_at) return false;
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  return new Date(round.updated_at).getTime() < twoHoursAgo;
}

// ============================================================================
// GROUP ERRORS (cluster similar errors)
// ============================================================================

export function groupErrors(errors: TracerErrorLog[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();

  for (const err of errors) {
    // Normalize message by removing UUIDs and specific IDs for grouping
    const normalizedMsg = err.message
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[ID]')
      .replace(/\b\d{4,}\b/g, '[NUM]');

    const key = `${err.severity || 'error'}:${normalizedMsg}`;
    const ctx = err.context as Record<string, unknown> | null;
    const playerId = (ctx?.playerId as string) || '';

    if (groups.has(key)) {
      const group = groups.get(key)!;
      group.count++;
      if (err.created_at && err.created_at > group.lastSeen) {
        group.lastSeen = err.created_at;
      }
      if (err.created_at && err.created_at < group.firstSeen) {
        group.firstSeen = err.created_at;
      }
      if (playerId && !group.affectedPlayers.includes(playerId)) {
        group.affectedPlayers.push(playerId);
      }
    } else {
      groups.set(key, {
        key,
        message: err.message,
        count: 1,
        severity: err.severity || 'error',
        firstSeen: err.created_at || '',
        lastSeen: err.created_at || '',
        affectedPlayers: playerId ? [playerId] : [],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

// ============================================================================
// MOST AFFECTED PLAYERS (for Error Analytics)
// ============================================================================

export function getMostAffectedPlayers(
  errors: TracerErrorLog[],
  data: TracerData
): AffectedPlayer[] {
  const counts = new Map<string, number>();

  for (const err of errors) {
    const ctx = err.context as Record<string, unknown> | null;
    const playerId = ctx?.playerId as string | undefined;
    if (playerId) {
      counts.set(playerId, (counts.get(playerId) || 0) + 1);
    }
  }

  const playerNameMap = new Map<string, string>();
  for (const p of data.playerSummaries) {
    playerNameMap.set(
      p.player_id,
      `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown'
    );
  }

  return Array.from(counts.entries())
    .map(([player_id, errorCount]) => ({
      player_id,
      player_name: playerNameMap.get(player_id) || 'Unknown',
      errorCount,
    }))
    .sort((a, b) => b.errorCount - a.errorCount);
}

// ============================================================================
// OUTLIER DETECTION (for Data Quality)
// ============================================================================

const OUTLIER_THRESHOLDS = {
  total_score: { max: 120, label: 'Score > 120' },
  total_shots: { max: 150, label: 'Shots > 150' },
} as const;

export function detectOutliers(data: TracerData): Outlier[] {
  const outliers: Outlier[] = [];

  for (const player of data.playerSummaries) {
    const playerRounds = data.roundDetails[player.player_id] || [];
    const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown';

    for (const round of playerRounds) {
      if (round.status !== 'completed') continue;

      if (round.total_score != null && round.total_score > OUTLIER_THRESHOLDS.total_score.max) {
        outliers.push({
          player_id: player.player_id,
          player_name: playerName,
          round_id: round.round_id,
          field: OUTLIER_THRESHOLDS.total_score.label,
          value: round.total_score,
          threshold: OUTLIER_THRESHOLDS.total_score.max,
          course_name: round.course_name,
        });
      }

      if (round.total_shots > OUTLIER_THRESHOLDS.total_shots.max) {
        outliers.push({
          player_id: player.player_id,
          player_name: playerName,
          round_id: round.round_id,
          field: OUTLIER_THRESHOLDS.total_shots.label,
          value: round.total_shots,
          threshold: OUTLIER_THRESHOLDS.total_shots.max,
          course_name: round.course_name,
        });
      }
    }
  }

  return outliers;
}

// ============================================================================
// COMPLETENESS GRID (for Data Quality heatmap)
// ============================================================================

export function computeCompleteness(data: TracerData): PlayerCompleteness[] {
  return data.playerSummaries.map((player) => {
    const rounds = data.roundDetails[player.player_id] || [];
    const completedRounds = rounds.filter((r) => r.status === 'completed');
    const total = completedRounds.length;
    const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown';

    if (total === 0) {
      const emptyCategories: Record<CompletenessCategory, number> = {
        Putts: 0, FW: 0, GIR: 0, Details: 0, SG: 0, Cache: 0,
      };
      return { player_id: player.player_id, player_name: playerName, categories: emptyCategories };
    }

    const pct = (count: number) => Math.round((count / total) * 100);

    const categories: Record<CompletenessCategory, number> = {
      Putts: pct(completedRounds.filter((r) => r.has_putts).length),
      FW: pct(completedRounds.filter((r) => r.has_fairways).length),
      GIR: pct(completedRounds.filter((r) => r.has_gir).length),
      Details: pct(completedRounds.filter((r) => r.putt_details_count > 0 || r.approach_details_count > 0).length),
      SG: pct(completedRounds.filter((r) => r.has_strokes_gained).length),
      Cache: pct(completedRounds.filter((r) => r.stats_cached).length),
    };

    return { player_id: player.player_id, player_name: playerName, categories };
  });
}

// ============================================================================
// GENERATE ALERTS (for Health Overview)
// ============================================================================

export function generateAlerts(
  data: TracerData,
  stuckRounds: StuckRound[]
): TracerAlert[] {
  const alerts: TracerAlert[] = [];

  // Stuck rounds
  for (const stuck of stuckRounds) {
    alerts.push({
      id: `stuck-${stuck.round_id}`,
      severity: 'warning',
      title: 'Stuck round',
      detail: `${stuck.player_name} at ${stuck.course_name || 'unknown course'} — ${Math.round(stuck.hours_stuck)}h in progress`,
      navigateTo: 'rounds',
      roundId: stuck.round_id,
    });
  }

  // Critical errors
  if (data.errorStats.critical7d > 0) {
    alerts.push({
      id: 'critical-errors',
      severity: 'critical',
      title: `${data.errorStats.critical7d} critical error${data.errorStats.critical7d !== 1 ? 's' : ''} (7d)`,
      detail: 'Review error details for resolution',
      navigateTo: 'errors',
    });
  }

  // Stale caches
  const staleCaches = data.statsAccuracy.filter((s) => s.is_stale);
  if (staleCaches.length > 0) {
    alerts.push({
      id: 'stale-caches',
      severity: 'info',
      title: `${staleCaches.length} stale cache${staleCaches.length !== 1 ? 's' : ''}`,
      detail: 'Player stats caches need refreshing',
      navigateTo: 'quality',
    });
  }

  // Stats mismatches
  const mismatches = data.statsAccuracy.filter((s) => {
    if (s.cached_scoring_avg != null && s.live_scoring_avg != null) {
      return Math.abs(s.cached_scoring_avg - s.live_scoring_avg) > 0.5;
    }
    return s.cached_rounds !== s.live_rounds;
  });
  if (mismatches.length > 0) {
    alerts.push({
      id: 'stats-mismatches',
      severity: 'warning',
      title: `${mismatches.length} stats mismatch${mismatches.length !== 1 ? 'es' : ''}`,
      detail: 'Cached vs live stats diverge significantly',
      navigateTo: 'quality',
    });
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

  return alerts;
}

// ============================================================================
// KPI HELPERS
// ============================================================================

export function computeKPIs(data: TracerData) {
  const totalRounds = data.playerSummaries.reduce((sum, p) => sum + p.total_rounds, 0);
  const completedRounds = data.playerSummaries.reduce((sum, p) => sum + p.completed_rounds, 0);
  const completionRate = totalRounds > 0 ? Math.round((completedRounds / totalRounds) * 100) : 0;
  const statsMismatches = data.statsAccuracy.filter((s) => {
    if (s.cached_scoring_avg != null && s.live_scoring_avg != null) {
      return Math.abs(s.cached_scoring_avg - s.live_scoring_avg) > 0.5;
    }
    return s.cached_rounds !== s.live_rounds;
  }).length;

  return { totalRounds, completedRounds, completionRate, statsMismatches };
}

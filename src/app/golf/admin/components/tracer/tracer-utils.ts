import type {
  TracerData,
  TracerRoundDetail,
  TracerIncident,
  TracerPlayerSummary,
  FlatRound,
  ErrorGroup,
  AffectedPlayer,
  Outlier,
  PlayerCompleteness,
  CompletenessCategory,
  TracerAlert,
  StuckRound,
  DataQualityIssue,
  IssueSeverity,
  IssueCategory,
  FixType,
  PlayerQualityScore,
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
  const twoHoursAgo = Date.now() - STUCK_ROUND_WARNING_HOURS * 60 * 60 * 1000;
  return new Date(round.updated_at).getTime() < twoHoursAgo;
}

// ============================================================================
// GROUP ERRORS (cluster similar errors)
// ============================================================================

export function groupErrors(errors: TracerIncident[]): ErrorGroup[] {
  return [...errors]
    .map((incident) => ({
      key: incident.id,
      message: incident.title,
      count: incident.occurrences,
      severity: incident.severity,
      firstSeen: incident.firstSeen,
      lastSeen: incident.lastSeen,
      affectedPlayers: incident.playerIds,
    }))
    .sort((a, b) => b.count - a.count);
}

// ============================================================================
// MOST AFFECTED PLAYERS (for Error Analytics)
// ============================================================================

export function getMostAffectedPlayers(
  errors: TracerIncident[],
  data: TracerData
): AffectedPlayer[] {
  const counts = new Map<string, number>();

  for (const incident of errors) {
    const weight = incident.status === 'open'
      ? Math.max(incident.openOccurrences, 1)
      : Math.max(incident.occurrences, 1);
    for (const playerId of incident.playerIds) {
      if (playerId) {
        counts.set(playerId, (counts.get(playerId) || 0) + weight);
      }
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
// 9-HOLE / 18-HOLE THRESHOLDS
// ============================================================================

const THRESHOLDS = {
  18: { maxScore: 120, maxShots: 150, maxPutts: 45, minScore: 55, minPutts: 18, expectedHoles: 18 },
  9: { maxScore: 65, maxShots: 80, maxPutts: 27, minScore: 28, minPutts: 9, expectedHoles: 9 },
} as const;
const STUCK_ROUND_WARNING_HOURS = 2;
const STUCK_ROUND_FIXABLE_HOURS = 24;

function getThresholds(holesPlayed: number) {
  return holesPlayed === 9 ? THRESHOLDS[9] : THRESHOLDS[18];
}

// ============================================================================
// DATA QUALITY DIAGNOSTIC ENGINE — 25 checks
// ============================================================================

export function detectDataQualityIssues(data: TracerData): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  function issue(
    checkId: string,
    title: string,
    description: string,
    severity: IssueSeverity,
    category: IssueCategory,
    playerId: string,
    playerName: string,
    roundId: string | null,
    courseName: string | null,
    roundDate: string | null,
    actualValue: string | number | null,
    expectedValue: string | number | null,
    fixable: boolean,
    fixType: FixType | null
  ): DataQualityIssue {
    return {
      id: `${checkId}-${roundId || playerId}`,
      checkId,
      title,
      description,
      severity,
      category,
      player_id: playerId,
      player_name: playerName,
      round_id: roundId,
      course_name: courseName,
      round_date: roundDate,
      actual_value: actualValue,
      expected_value: expectedValue,
      fixable,
      fix_type: fixType,
    };
  }

  for (const player of data.playerSummaries) {
    const playerRounds = data.roundDetails[player.player_id] || [];
    const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown';
    const completedRounds = playerRounds.filter(r => r.status === 'completed');

    for (const round of completedRounds) {
      const ri = data.roundIntegrity?.[round.round_id];
      const th = getThresholds(round.expected_holes);
      const rId = round.round_id;
      const cName = round.course_name;
      const rDate = round.round_date;

      // ---- CATEGORY: missing_data ----

      // Check 1: Missing putts
      if (!round.has_putts) {
        issues.push(issue(
          'missing-putts', 'Missing Putts Data',
          `Completed round has no putts recorded (total_putts is null or 0)`,
          'critical', 'missing_data', player.player_id, playerName, rId, cName, rDate,
          round.total_score != null ? `Score: ${round.total_score}, Putts: none` : 'No putts',
          'Putts data required', true, 'recalculate_round_totals'
        ));
      }

      // Check 2: Missing fairways
      if (!round.has_fairways) {
        issues.push(issue(
          'missing-fairways', 'Missing Fairway Data',
          `Completed round has no fairway data recorded`,
          'critical', 'missing_data', player.player_id, playerName, rId, cName, rDate,
          'No fairway data', 'Fairway data required', true, 'recalculate_round_totals'
        ));
      }

      // Check 3: Missing GIR
      if (!round.has_gir) {
        issues.push(issue(
          'missing-gir', 'Missing GIR Data',
          `Completed round has no greens in regulation data`,
          'critical', 'missing_data', player.player_id, playerName, rId, cName, rDate,
          'No GIR data', 'GIR data required', true, 'recalculate_round_totals'
        ));
      }

      // Check 4: Missing strokes gained
      if (!round.has_strokes_gained) {
        issues.push(issue(
          'missing-sg', 'Missing Strokes Gained',
          `Completed round has no strokes gained data`,
          'warning', 'missing_data', player.player_id, playerName, rId, cName, rDate,
          'No SG data', 'Strokes gained required', true, 'recalculate_strokes_gained'
        ));
      }

      // Check 5: Missing total score
      if (round.total_score == null) {
        issues.push(issue(
          'missing-score', 'Missing Total Score',
          `Completed round has no total score`,
          'critical', 'missing_data', player.player_id, playerName, rId, cName, rDate,
          null, 'Score required', true, 'recalculate_round_totals'
        ));
      }

      // ---- CATEGORY: outlier ----

      // Check 6: Score too high
      if (round.total_score != null && round.total_score > th.maxScore) {
        issues.push(issue(
          'outlier-score-high', 'Unusually High Score',
          `Score of ${round.total_score} exceeds ${th.maxScore} threshold for ${round.expected_holes}-hole round`,
          'warning', 'outlier', player.player_id, playerName, rId, cName, rDate,
          round.total_score, th.maxScore, false, null
        ));
      }

      // Check 7: Shots too high
      if (round.total_shots > th.maxShots) {
        issues.push(issue(
          'outlier-shots-high', 'Unusually High Shot Count',
          `${round.total_shots} shots exceeds ${th.maxShots} threshold`,
          'warning', 'outlier', player.player_id, playerName, rId, cName, rDate,
          round.total_shots, th.maxShots, false, null
        ));
      }

      // Check 8: Putts too high
      if (round.has_putts && round.total_score != null) {
        // Extract total_putts from round data - use integrity data if available
        const totalPutts = ri?.holes_sum_putts;
        if (totalPutts != null && totalPutts > th.maxPutts) {
          issues.push(issue(
            'outlier-putts-high', 'Unusually High Putts',
            `${totalPutts} putts exceeds ${th.maxPutts} threshold`,
            'warning', 'outlier', player.player_id, playerName, rId, cName, rDate,
            totalPutts, th.maxPutts, false, null
          ));
        }
      }

      // Check 9: Score suspiciously low
      if (round.total_score != null && round.total_score > 0 && round.total_score < th.minScore) {
        issues.push(issue(
          'outlier-score-low', 'Suspiciously Low Score',
          `Score of ${round.total_score} is below ${th.minScore} for ${round.expected_holes}-hole round`,
          'warning', 'outlier', player.player_id, playerName, rId, cName, rDate,
          round.total_score, th.minScore, false, null
        ));
      }

      // Check 10: Putts suspiciously low
      if (ri?.holes_sum_putts != null && ri.holes_sum_putts > 0 && ri.holes_sum_putts < th.minPutts) {
        issues.push(issue(
          'outlier-putts-low', 'Suspiciously Low Putts',
          `${ri.holes_sum_putts} putts is below ${th.minPutts} for ${round.expected_holes}-hole round`,
          'info', 'outlier', player.player_id, playerName, rId, cName, rDate,
          ri.holes_sum_putts, th.minPutts, false, null
        ));
      }

      // Check 11: Extreme hole score
      if (ri?.max_hole_score != null && ri.max_hole_score > 12) {
        issues.push(issue(
          'outlier-hole-max', 'Extreme Hole Score',
          `At least one hole had a score of ${ri.max_hole_score}`,
          'info', 'outlier', player.player_id, playerName, rId, cName, rDate,
          ri.max_hole_score, 12, false, null
        ));
      }

      // ---- CATEGORY: integrity (requires roundIntegrity data) ----
      if (ri) {
        // Check 12: Score mismatch
        if (round.total_score != null && ri.holes_sum_score != null && round.total_score !== ri.holes_sum_score) {
          issues.push(issue(
            'integrity-score', 'Score Mismatch (Holes vs Round)',
            `Round total_score (${round.total_score}) ≠ sum of hole scores (${ri.holes_sum_score}). Difference: ${round.total_score - ri.holes_sum_score}`,
            'critical', 'integrity', player.player_id, playerName, rId, cName, rDate,
            `Round: ${round.total_score}, Holes: ${ri.holes_sum_score}`,
            'Values should match', true, 'recalculate_round_totals'
          ));
        }

        // Check 13: Putts mismatch
        if (round.has_putts && ri.holes_sum_putts != null) {
          // We need to derive round-level putts — use the integrity data's sum
          // If we have hole-level putts but round total_putts is different from hole sum
          // We can check if null_putts_count > 0 indicating some holes missing putts
          if (ri.null_putts_count > 0) {
            issues.push(issue(
              'integrity-putts-null-holes', 'Holes Missing Putts',
              `${ri.null_putts_count} of ${ri.hole_count} holes have null putts data`,
              'warning', 'integrity', player.player_id, playerName, rId, cName, rDate,
              `${ri.null_putts_count} null holes`, '0 null holes', true, 'recalculate_round_totals'
            ));
          }
        }

        // Check 14: Fairway count mismatch (only if round has fairway data)
        if (round.has_fairways && ri.holes_sum_fairways_total > 0) {
          // Can't easily compare because round stores total_fairways_hit vs total_fairways
          // But we can flag if the hole-level count differs significantly
          // The round.has_fairways flag means total_fairways > 0, so we have data
        }

        // Check 15: GIR mismatch
        if (round.has_gir && ri.holes_sum_gir_total > 0) {
          // Similar to fairways - we'd need the round-level GIR count to compare
        }

        // Check 16: Null scores on holes
        if (ri.null_score_count > 0) {
          issues.push(issue(
            'integrity-null-scores', 'Holes Missing Scores',
            `${ri.null_score_count} of ${ri.hole_count} holes have null scores`,
            'critical', 'integrity', player.player_id, playerName, rId, cName, rDate,
            `${ri.null_score_count} null scores`, '0 null scores', false, null
          ));
        }
      }

      // ---- CATEGORY: completeness ----

      // Check 17: No hole data at all
      if (round.actual_holes === 0) {
        issues.push(issue(
          'completeness-no-holes', 'No Hole Data',
          `Completed round has 0 hole records`,
          'critical', 'completeness', player.player_id, playerName, rId, cName, rDate,
          0, th.expectedHoles, false, null
        ));
      }
      // Check 18: Partial holes
      else if (round.actual_holes < round.expected_holes) {
        issues.push(issue(
          'completeness-partial', 'Partial Hole Data',
          `Only ${round.actual_holes} of ${round.expected_holes} holes recorded`,
          'warning', 'completeness', player.player_id, playerName, rId, cName, rDate,
          round.actual_holes, round.expected_holes, false, null
        ));
      }
    }

    // ---- CATEGORY: stuck_round ----
    for (const round of playerRounds.filter(r => r.status === 'in_progress')) {
      if (round.updated_at) {
        const hoursStuck = (Date.now() - new Date(round.updated_at).getTime()) / (1000 * 60 * 60);
        if (hoursStuck >= STUCK_ROUND_WARNING_HOURS) {
          const canAutoResolve = hoursStuck >= STUCK_ROUND_FIXABLE_HOURS;
          issues.push(issue(
            'stuck-round', 'Stuck Round',
            `In-progress for ${Math.round(hoursStuck)} hours`,
            'warning', 'stuck_round', player.player_id, playerName, round.round_id, round.course_name, round.round_date,
            `${Math.round(hoursStuck)}h`, `< ${STUCK_ROUND_WARNING_HOURS}h`, canAutoResolve, canAutoResolve ? 'resolve_stuck_round' : null
          ));
        }
      }
    }

    // ---- CATEGORY: cache_divergence ----
    const statsRow = data.statsAccuracy.find(s => s.player_id === player.player_id);
    if (statsRow) {
      if (statsRow.cached_scoring_avg != null && statsRow.live_scoring_avg != null &&
          Math.abs(statsRow.cached_scoring_avg - statsRow.live_scoring_avg) > 0.5) {
        issues.push(issue(
          'cache-scoring', 'Cache Scoring Mismatch',
          `Cached avg (${statsRow.cached_scoring_avg}) vs live avg (${statsRow.live_scoring_avg}) — diff: ${Math.abs(statsRow.cached_scoring_avg - statsRow.live_scoring_avg).toFixed(1)}`,
          'warning', 'cache_divergence', player.player_id, playerName, null, null, null,
          statsRow.cached_scoring_avg, statsRow.live_scoring_avg, true, 'refresh_player_stats_cache'
        ));
      }

      if (statsRow.cached_putts_per_round != null && statsRow.live_putts_per_round != null &&
          Math.abs(statsRow.cached_putts_per_round - statsRow.live_putts_per_round) > 0.5) {
        issues.push(issue(
          'cache-putts', 'Cache Putts Mismatch',
          `Cached putts/rnd (${statsRow.cached_putts_per_round}) vs live (${statsRow.live_putts_per_round})`,
          'warning', 'cache_divergence', player.player_id, playerName, null, null, null,
          statsRow.cached_putts_per_round, statsRow.live_putts_per_round, true, 'refresh_player_stats_cache'
        ));
      }

      if (statsRow.cached_fairway_pct != null && statsRow.live_fairway_pct != null &&
          Math.abs(statsRow.cached_fairway_pct - statsRow.live_fairway_pct) > 1) {
        issues.push(issue(
          'cache-fw', 'Cache Fairway % Mismatch',
          `Cached FW% (${statsRow.cached_fairway_pct}%) vs live (${statsRow.live_fairway_pct}%)`,
          'warning', 'cache_divergence', player.player_id, playerName, null, null, null,
          `${statsRow.cached_fairway_pct}%`, `${statsRow.live_fairway_pct}%`, true, 'refresh_player_stats_cache'
        ));
      }

      if (statsRow.cached_gir_pct != null && statsRow.live_gir_pct != null &&
          Math.abs(statsRow.cached_gir_pct - statsRow.live_gir_pct) > 1) {
        issues.push(issue(
          'cache-gir', 'Cache GIR % Mismatch',
          `Cached GIR% (${statsRow.cached_gir_pct}%) vs live (${statsRow.live_gir_pct}%)`,
          'warning', 'cache_divergence', player.player_id, playerName, null, null, null,
          `${statsRow.cached_gir_pct}%`, `${statsRow.live_gir_pct}%`, true, 'refresh_player_stats_cache'
        ));
      }

      if (statsRow.cached_rounds !== statsRow.live_rounds) {
        issues.push(issue(
          'cache-rounds', 'Cache Round Count Mismatch',
          `Cache has ${statsRow.cached_rounds} rounds, live has ${statsRow.live_rounds}`,
          'info', 'cache_divergence', player.player_id, playerName, null, null, null,
          statsRow.cached_rounds, statsRow.live_rounds, true, 'refresh_player_stats_cache'
        ));
      }

      if (statsRow.is_stale) {
        issues.push(issue(
          'cache-stale', 'Stale Stats Cache',
          `Cache is marked stale and needs refreshing`,
          'info', 'cache_divergence', player.player_id, playerName, null, null, null,
          'stale', 'fresh', true, 'refresh_player_stats_cache'
        ));
      }
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

  return issues;
}

// ============================================================================
// BACKWARD-COMPATIBLE detectOutliers() wrapper
// ============================================================================

export function detectOutliers(data: TracerData): Outlier[] {
  const issues = detectDataQualityIssues(data);
  return issues
    .filter(i => i.category === 'outlier')
    .map(i => ({
      player_id: i.player_id,
      player_name: i.player_name,
      round_id: i.round_id || '',
      field: i.title,
      value: typeof i.actual_value === 'number' ? i.actual_value : 0,
      threshold: typeof i.expected_value === 'number' ? i.expected_value : 0,
      course_name: i.course_name,
    }));
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
// PLAYER QUALITY SCORES (per-player health)
// ============================================================================

export function computePlayerQualityScores(
  issues: DataQualityIssue[],
  players: TracerPlayerSummary[]
): PlayerQualityScore[] {
  const scores: PlayerQualityScore[] = [];

  for (const player of players) {
    const playerIssues = issues.filter(i => i.player_id === player.player_id);
    const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown';

    const criticalCount = playerIssues.filter(i => i.severity === 'critical').length;
    const warningCount = playerIssues.filter(i => i.severity === 'warning').length;
    const infoCount = playerIssues.filter(i => i.severity === 'info').length;

    // Penalty-based scoring
    const criticalPenalty = Math.min(criticalCount * 15, 60);
    const warningPenalty = Math.min(warningCount * 5, 30);
    const infoPenalty = Math.min(infoCount * 1, 10);
    const overallScore = Math.max(0, 100 - criticalPenalty - warningPenalty - infoPenalty);

    const categoryScores = {} as Record<IssueCategory, number>;
    const categories: IssueCategory[] = ['missing_data', 'outlier', 'integrity', 'cache_divergence', 'completeness', 'stuck_round'];
    const totalRounds = Math.max(player.completed_rounds, 1);
    for (const cat of categories) {
      const catIssues = playerIssues.filter(i => i.category === cat);
      const ratio = catIssues.length / totalRounds;
      categoryScores[cat] = Math.max(0, Math.round(100 - ratio * 100));
    }

    scores.push({
      player_id: player.player_id,
      player_name: playerName,
      overall_score: overallScore,
      category_scores: categoryScores,
      critical_count: criticalCount,
      warning_count: warningCount,
      info_count: infoCount,
      total_issues: playerIssues.length,
      fixable_count: playerIssues.filter(i => i.fixable).length,
    });
  }

  return scores.sort((a, b) => a.overall_score - b.overall_score);
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

/**
 * Team-Level Pattern Generator
 *
 * Generates MinedPattern[] by analyzing the full team's stats cache
 * and round data. Unlike per-player PatternMiner (which requires 10+ rounds),
 * this works with any amount of data by comparing players against each
 * other and against college benchmarks.
 */

import type { MinedPattern, PatternType, PatternTrend } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface StatsRow {
  player_id: string;
  rounds_in_calculation: number | null;
  scoring_average: number | null;
  scoring_average_vs_par: number | null;
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
  gir_percentage: number | null;
  driving_accuracy_percentage: number | null;
  scrambling_percentage: number | null;
  putts_per_round: number | null;
  approach_proximity_average: number | null;
  three_putt_percentage: number | null;
  penalty_strokes_per_round: number | null;
  putt_make_pct_5_10ft: number | null;
  putt_make_pct_10_15ft: number | null;
  putt_make_pct_15_25ft: number | null;
  approach_miss_left_pct: number | null;
  approach_miss_right_pct: number | null;
  approach_miss_short_pct: number | null;
  approach_miss_long_pct: number | null;
  par3_average: number | null;
  par4_average: number | null;
  par5_average: number | null;
  last_5_average: number | null;
  improvement_trend: number | null;
  trend_direction: string | null;
  best_round: number | null;
  worst_round: number | null;
}

export interface RoundRow {
  player_id: string;
  total_score: number | null;
  score_to_par: number | null;
  round_date: string | null;
  round_type: string | null;
  created_at: string | null;
}

interface PlayerInfo {
  id: string;
  first_name: string;
  last_name: string;
  graduation_year?: number | null;
}

// College golf benchmarks
const BENCHMARKS = {
  sgTotal: 0,
  sgTee: 0,
  sgApproach: 0,
  sgAroundGreen: 0,
  sgPutting: 0,
  girPct: 60,
  fairwayPct: 60,
  scramblingPct: 55,
  threePuttPct: 5, // ~5% three-putt rate is solid
  penaltiesPerRound: 0.5,
  qualifyingVsPractice: 1.5,
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export function generateTeamPatterns(
  players: PlayerInfo[],
  statsCache: StatsRow[],
  rounds: RoundRow[]
): MinedPattern[] {
  if (players.length === 0 || statsCache.length === 0) return [];

  const playerMap = new Map(players.map(p => [p.id, p]));
  const statsMap = new Map(statsCache.map(s => [s.player_id, s]));

  const patterns: MinedPattern[] = [];
  const now = new Date().toISOString();

  // Run all detectors
  patterns.push(...detectShortGameWeakness(playerMap, statsMap, now));
  patterns.push(...detectScoringComposition(playerMap, statsMap, now));
  patterns.push(...detectMissDirectionPatterns(playerMap, statsMap, now));
  patterns.push(...detectPressureDifferential(playerMap, statsMap, rounds, now));
  patterns.push(...detectPuttingDistancePatterns(playerMap, statsMap, now));
  patterns.push(...detectScramblingPatterns(playerMap, statsMap, now));
  patterns.push(...detectClassYearTrends(playerMap, statsMap, now));
  patterns.push(...detectPenaltyPatterns(playerMap, statsMap, now));
  patterns.push(...detectThreePuttPatterns(playerMap, statsMap, now));
  patterns.push(...detectTrendDivergence(playerMap, statsMap, now));

  return patterns;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function playerName(player: PlayerInfo): string {
  return `${player.first_name} ${player.last_name}`.trim();
}

function teamAvg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function buildPattern(
  overrides: Partial<MinedPattern> & Pick<MinedPattern, 'id' | 'playerId' | 'description' | 'recommendation' | 'strokeImpact'>
): MinedPattern {
  return {
    patternType: 'contextual' as PatternType,
    conditions: [],
    outcome: { metric: 'scoring_average', direction: 'decrease', comparison: 'vs_baseline' },
    support: 0.7,
    confidence: 0.75,
    lift: 1.2,
    conviction: 1.5,
    actionability: 0.8,
    sampleSize: 3,
    firstDetected: new Date().toISOString(),
    lastOccurrence: new Date().toISOString(),
    occurrenceCount: 1,
    trend: 'new' as PatternTrend,
    isActive: true,
    ...overrides,
  };
}

// ============================================================================
// PATTERN DETECTORS
// ============================================================================

/**
 * 1. Short Game Weakness — Players where SG:Around Green is well below team avg
 */
function detectShortGameWeakness(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>,
  now: string
): MinedPattern[] {
  const patterns: MinedPattern[] = [];
  const sgArgValues: Array<{ id: string; val: number }> = [];

  for (const [id, stats] of statsMap) {
    if (stats.strokes_gained_around_green !== null) {
      sgArgValues.push({ id, val: stats.strokes_gained_around_green });
    }
  }

  if (sgArgValues.length < 2) return patterns;
  const avg = teamAvg(sgArgValues.map(v => v.val));

  for (const { id, val } of sgArgValues) {
    const gap = avg - val;
    if (gap > 0.8) {
      const player = playerMap.get(id);
      if (!player) continue;
      patterns.push(buildPattern({
        id: `pattern-sg-arg-weakness-${id}`,
        playerId: id,
        patternType: 'anomaly',
        conditions: [
          { field: 'strokes_gained_around_green', operator: 'lt', value: avg - 0.5, label: 'SG: Around Green below team average' },
        ],
        outcome: { metric: 'strokes_gained_around_green', direction: 'decrease', magnitude: gap, comparison: 'vs_baseline' },
        strokeImpact: gap,
        confidence: Math.min(0.9, 0.6 + (statsMap.get(id)?.rounds_in_calculation ?? 0) * 0.02),
        sampleSize: statsMap.get(id)?.rounds_in_calculation ?? 1,
        description: `${playerName(player)}'s short game (${val.toFixed(1)} SG:ARG) is ${gap.toFixed(1)} strokes below team average (${avg.toFixed(1)})`,
        recommendation: `Focus ${playerName(player)}'s practice on chipping, pitching, and bunker play. Short game drills 3x/week could recover ${(gap * 0.5).toFixed(1)}+ strokes per round.`,
        actionability: 0.9,
        lastOccurrence: now,
      }));
    }
  }

  return patterns.slice(0, 3);
}

/**
 * 2. Scoring Composition — Players whose SG breakdown is unusual compared to team
 */
function detectScoringComposition(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>,
  now: string
): MinedPattern[] {
  const patterns: MinedPattern[] = [];

  const categories = [
    { key: 'strokes_gained_putting', label: 'Putting' },
    { key: 'strokes_gained_tee', label: 'Off the Tee' },
    { key: 'strokes_gained_approach', label: 'Approach' },
  ] as const;

  for (const cat of categories) {
    const values: Array<{ id: string; sgCat: number; sgTotal: number }> = [];
    for (const [id, stats] of statsMap) {
      const catVal = stats[cat.key];
      const total = stats.strokes_gained_total;
      if (catVal !== null && total !== null && total !== 0) {
        values.push({ id, sgCat: catVal, sgTotal: total });
      }
    }

    if (values.length < 2) continue;

    // Find players where one category dominates (>60% of their total SG)
    for (const { id, sgCat, sgTotal } of values) {
      if (sgTotal === 0) continue;
      const proportion = Math.abs(sgCat) / (Math.abs(sgTotal) || 1);
      if (proportion > 0.55 && Math.abs(sgCat) > 0.5) {
        const player = playerMap.get(id);
        if (!player) continue;
        const isStrength = sgCat > 0;
        patterns.push(buildPattern({
          id: `pattern-composition-${cat.key}-${id}`,
          playerId: id,
          patternType: 'regression',
          conditions: [
            { field: cat.key, operator: isStrength ? 'gt' : 'lt', value: 0, label: `${cat.label} is ${isStrength ? 'strongest' : 'weakest'} area` },
          ],
          outcome: { metric: 'scoring_composition', direction: isStrength ? 'increase' : 'decrease', comparison: 'vs_baseline' },
          strokeImpact: Math.abs(sgCat),
          description: `${playerName(player)}'s scoring is ${isStrength ? 'driven by' : 'held back by'} ${cat.label} (${sgCat > 0 ? '+' : ''}${sgCat.toFixed(1)} SG) — accounts for ${(proportion * 100).toFixed(0)}% of total strokes gained`,
          recommendation: isStrength
            ? `${cat.label} is ${playerName(player)}'s strength. Maintain through targeted practice while developing weaker areas.`
            : `${cat.label} is ${playerName(player)}'s biggest area for improvement. Dedicated ${cat.label.toLowerCase()} work could unlock significant scoring drops.`,
          lastOccurrence: now,
        }));
      }
    }
  }

  return patterns.slice(0, 3);
}

/**
 * 3. Miss Direction — Players with strong left/right miss tendencies
 */
function detectMissDirectionPatterns(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>,
  now: string
): MinedPattern[] {
  const patterns: MinedPattern[] = [];

  for (const [id, stats] of statsMap) {
    const left = stats.approach_miss_left_pct;
    const right = stats.approach_miss_right_pct;
    const short = stats.approach_miss_short_pct;
    const long = stats.approach_miss_long_pct;

    if (left === null || right === null) continue;
    const player = playerMap.get(id);
    if (!player) continue;

    // Check for dominant miss direction (>55% one way)
    if (left > 55) {
      patterns.push(buildPattern({
        id: `pattern-miss-left-${id}`,
        playerId: id,
        patternType: 'conditional',
        conditions: [
          { field: 'approach_miss_left_pct', operator: 'gt', value: 55, label: 'Dominant left miss' },
        ],
        outcome: { metric: 'miss_pattern', direction: 'specific', comparison: 'absolute' },
        strokeImpact: 0.3,
        description: `${playerName(player)} misses left ${left.toFixed(0)}% of the time on approach — suggests a consistent swing path issue`,
        recommendation: `Aim slightly right of target to play the natural miss. Work with a swing coach on face/path relationship to reduce left misses.`,
        actionability: 0.85,
        lastOccurrence: now,
      }));
    } else if (right > 55) {
      patterns.push(buildPattern({
        id: `pattern-miss-right-${id}`,
        playerId: id,
        patternType: 'conditional',
        conditions: [
          { field: 'approach_miss_right_pct', operator: 'gt', value: 55, label: 'Dominant right miss' },
        ],
        outcome: { metric: 'miss_pattern', direction: 'specific', comparison: 'absolute' },
        strokeImpact: 0.3,
        description: `${playerName(player)} misses right ${right.toFixed(0)}% of the time on approach — suggests consistent path/face issue`,
        recommendation: `Play the miss by aiming slightly left. Address the root cause with swing path or grip adjustments.`,
        actionability: 0.85,
        lastOccurrence: now,
      }));
    }

    // Short/long pattern (distance control)
    if (short !== null && long !== null) {
      if (short > 55) {
        patterns.push(buildPattern({
          id: `pattern-miss-short-${id}`,
          playerId: id,
          patternType: 'conditional',
          conditions: [
            { field: 'approach_miss_short_pct', operator: 'gt', value: 55, label: 'Consistent short misses' },
          ],
          outcome: { metric: 'miss_pattern', direction: 'specific', comparison: 'absolute' },
          strokeImpact: 0.2,
          description: `${playerName(player)} misses short ${short.toFixed(0)}% of the time — distance control or club selection issue`,
          recommendation: `Club up one more often. Work on distance control with stock yardages and partial shots.`,
          lastOccurrence: now,
        }));
      }
    }
  }

  return patterns.slice(0, 3);
}

/**
 * 4. Pressure Differential — Players who score differently in qualifying vs practice
 */
function detectPressureDifferential(
  playerMap: Map<string, PlayerInfo>,
  _statsMap: Map<string, StatsRow>,
  rounds: RoundRow[],
  now: string
): MinedPattern[] {
  const patterns: MinedPattern[] = [];

  // Group rounds by player and type
  const playerRounds = new Map<string, { qualifying: number[]; practice: number[] }>();
  for (const round of rounds) {
    if (!round.total_score || !round.player_id) continue;
    if (!playerRounds.has(round.player_id)) {
      playerRounds.set(round.player_id, { qualifying: [], practice: [] });
    }
    const bucket = playerRounds.get(round.player_id)!;
    if (round.round_type === 'qualifier' || round.round_type === 'tournament') {
      bucket.qualifying.push(round.total_score);
    } else {
      bucket.practice.push(round.total_score);
    }
  }

  for (const [id, data] of playerRounds) {
    if (data.qualifying.length < 1 || data.practice.length < 1) continue;
    const player = playerMap.get(id);
    if (!player) continue;

    const qualAvg = teamAvg(data.qualifying);
    const pracAvg = teamAvg(data.practice);
    const gap = qualAvg - pracAvg;

    if (gap > BENCHMARKS.qualifyingVsPractice) {
      patterns.push(buildPattern({
        id: `pattern-pressure-gap-${id}`,
        playerId: id,
        patternType: 'contextual',
        conditions: [
          { field: 'qualifying_vs_practice_gap', operator: 'gt', value: BENCHMARKS.qualifyingVsPractice, label: 'Qualifying score higher than practice' },
        ],
        outcome: { metric: 'pressure_performance', direction: 'decrease', magnitude: gap, comparison: 'vs_baseline' },
        strokeImpact: gap - BENCHMARKS.qualifyingVsPractice,
        confidence: Math.min(0.85, 0.5 + (data.qualifying.length + data.practice.length) * 0.05),
        sampleSize: data.qualifying.length + data.practice.length,
        description: `${playerName(player)} scores ${gap.toFixed(1)} strokes higher in qualifying/tournament rounds (${qualAvg.toFixed(1)}) vs practice (${pracAvg.toFixed(1)})`,
        recommendation: `Simulate pressure in practice — use consequences for bad shots, play practice rounds with scoring stakes. Mental game work (pre-shot routines, breathing) will help.`,
        actionability: 0.85,
        lastOccurrence: now,
      }));
    }
  }

  return patterns.slice(0, 3);
}

/**
 * 5. Putting Distance Patterns — Players with putting strengths/weaknesses at specific ranges
 */
function detectPuttingDistancePatterns(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>,
  now: string
): MinedPattern[] {
  const patterns: MinedPattern[] = [];

  // Benchmarks are D1 averages from golf_pga_standards (div1_avg_value) — the
  // appropriate comparison point for college players. PGA Tour values
  // (62.2 / 35.7 / 15.4) would flag an average D1 putter as a weakness.
  const puttBenchmarks = {
    putt_make_pct_5_10ft: 50,
    putt_make_pct_10_15ft: 25,
    putt_make_pct_15_25ft: 12,
  };

  const puttLabels: Record<string, string> = {
    putt_make_pct_5_10ft: '5-10 feet',
    putt_make_pct_10_15ft: '10-15 feet',
    putt_make_pct_15_25ft: '15-25 feet',
  };

  for (const [id, stats] of statsMap) {
    const player = playerMap.get(id);
    if (!player) continue;

    for (const [key, benchmark] of Object.entries(puttBenchmarks)) {
      const val = stats[key as keyof StatsRow] as number | null;
      if (val === null) continue;

      const gap = benchmark - val;
      if (gap > 12) {
        // Significant weakness
        patterns.push(buildPattern({
          id: `pattern-putt-weak-${key}-${id}`,
          playerId: id,
          patternType: 'conditional',
          conditions: [
            { field: key, operator: 'lt', value: benchmark - 10, label: `Putting below benchmark from ${puttLabels[key]}` },
          ],
          outcome: { metric: 'putting_efficiency', direction: 'decrease', comparison: 'vs_baseline' },
          strokeImpact: gap * 0.02, // rough estimate: each % below converts to ~0.02 strokes
          description: `${playerName(player)} makes only ${val.toFixed(0)}% from ${puttLabels[key]} (benchmark: ${benchmark}%) — a key distance for scoring`,
          recommendation: `Dedicated putting drills from ${puttLabels[key]}. Focus on speed control and green reading at this range.`,
          lastOccurrence: now,
        }));
      } else if (val > benchmark + 15) {
        // Significant strength
        patterns.push(buildPattern({
          id: `pattern-putt-strong-${key}-${id}`,
          playerId: id,
          patternType: 'conditional',
          conditions: [
            { field: key, operator: 'gt', value: benchmark + 10, label: `Elite putting from ${puttLabels[key]}` },
          ],
          outcome: { metric: 'putting_efficiency', direction: 'increase', comparison: 'vs_baseline' },
          strokeImpact: (val - benchmark) * 0.02,
          description: `${playerName(player)} is elite from ${puttLabels[key]} — making ${val.toFixed(0)}% (${(val - benchmark).toFixed(0)}% above benchmark)`,
          recommendation: `Maintain this strength. Study ${playerName(player)}'s green-reading and stroke mechanics from this distance to share with teammates.`,
          lastOccurrence: now,
        }));
      }
    }
  }

  return patterns.slice(0, 3);
}

/**
 * 6. Scrambling Patterns — Team-level scrambling insights
 */
function detectScramblingPatterns(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>,
  now: string
): MinedPattern[] {
  const patterns: MinedPattern[] = [];

  const scramblingValues: Array<{ id: string; val: number }> = [];
  for (const [id, stats] of statsMap) {
    if (stats.scrambling_percentage !== null) {
      scramblingValues.push({ id, val: stats.scrambling_percentage });
    }
  }

  if (scramblingValues.length < 2) return patterns;
  const avg = teamAvg(scramblingValues.map(v => v.val));

  // Team-level pattern if overall scrambling is weak
  if (avg < BENCHMARKS.scramblingPct - 8) {
    patterns.push(buildPattern({
      id: 'pattern-team-scrambling-weak',
      playerId: 'team',
      patternType: 'cluster',
      conditions: [
        { field: 'team_scrambling_avg', operator: 'lt', value: BENCHMARKS.scramblingPct, label: 'Team scrambling below benchmark' },
      ],
      outcome: { metric: 'scrambling_percentage', direction: 'decrease', comparison: 'vs_baseline' },
      strokeImpact: (BENCHMARKS.scramblingPct - avg) * 0.03,
      description: `Team scrambling average is ${avg.toFixed(0)}% (benchmark: ${BENCHMARKS.scramblingPct}%) — the team is leaving strokes around the green`,
      recommendation: `Dedicate 30% of practice time to up-and-down situations from various lies. Run scrambling competitions to build pressure resilience.`,
      actionability: 0.9,
      lastOccurrence: now,
    }));
  }

  // Individual outliers
  for (const { id, val } of scramblingValues) {
    const gap = avg - val;
    if (gap > 12) {
      const player = playerMap.get(id);
      if (!player) continue;
      patterns.push(buildPattern({
        id: `pattern-scramble-weak-${id}`,
        playerId: id,
        patternType: 'anomaly',
        conditions: [
          { field: 'scrambling_percentage', operator: 'lt', value: avg - 8, label: 'Scrambling well below team average' },
        ],
        outcome: { metric: 'scrambling_percentage', direction: 'decrease', comparison: 'vs_baseline' },
        strokeImpact: gap * 0.03,
        description: `${playerName(player)}'s scrambling (${val.toFixed(0)}%) is ${gap.toFixed(0)}% below team average (${avg.toFixed(0)}%)`,
        recommendation: `${playerName(player)} needs focused short game work — chipping, pitching from various lies, and bunker saves.`,
        lastOccurrence: now,
      }));
    }
  }

  return patterns.slice(0, 3);
}

/**
 * 7. Class Year Trends — Freshmen vs upperclassmen gaps
 */
function detectClassYearTrends(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>,
  now: string
): MinedPattern[] {
  const patterns: MinedPattern[] = [];

  const currentYear = new Date().getFullYear();
  const freshmen: number[] = [];
  const upperclassmen: number[] = [];

  for (const [id, stats] of statsMap) {
    if (stats.scoring_average === null) continue;
    const player = playerMap.get(id);
    if (!player?.graduation_year) continue;

    const yearsLeft = player.graduation_year - currentYear;
    if (yearsLeft >= 3) {
      freshmen.push(stats.scoring_average);
    } else if (yearsLeft <= 1) {
      upperclassmen.push(stats.scoring_average);
    }
  }

  if (freshmen.length >= 1 && upperclassmen.length >= 1) {
    const freshAvg = teamAvg(freshmen);
    const upperAvg = teamAvg(upperclassmen);
    const gap = freshAvg - upperAvg;

    if (gap > 2) {
      patterns.push(buildPattern({
        id: 'pattern-class-year-gap',
        playerId: 'team',
        patternType: 'cluster',
        conditions: [
          { field: 'class_year_gap', operator: 'gt', value: 2, label: 'Freshmen scoring higher than upperclassmen' },
        ],
        outcome: { metric: 'scoring_average', direction: 'decrease', comparison: 'vs_baseline' },
        strokeImpact: gap,
        description: `Freshmen average ${freshAvg.toFixed(1)} vs upperclassmen ${upperAvg.toFixed(1)} — a ${gap.toFixed(1)} stroke gap that narrows with experience`,
        recommendation: `Pair freshmen with upperclassmen mentors for course management tips. Freshmen often have the talent but lack competitive experience.`,
        lastOccurrence: now,
      }));
    }
  }

  return patterns;
}

/**
 * 8. Penalty Patterns — Players with recurring penalty stroke issues
 */
function detectPenaltyPatterns(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>,
  now: string
): MinedPattern[] {
  const patterns: MinedPattern[] = [];

  const penaltyValues: Array<{ id: string; val: number }> = [];
  for (const [id, stats] of statsMap) {
    if (stats.penalty_strokes_per_round !== null) {
      penaltyValues.push({ id, val: stats.penalty_strokes_per_round });
    }
  }

  if (penaltyValues.length === 0) return patterns;
  const avg = teamAvg(penaltyValues.map(v => v.val));

  for (const { id, val } of penaltyValues) {
    if (val > BENCHMARKS.penaltiesPerRound * 2 || (val > avg + 0.5 && val > 1.0)) {
      const player = playerMap.get(id);
      if (!player) continue;
      patterns.push(buildPattern({
        id: `pattern-penalties-${id}`,
        playerId: id,
        patternType: 'anomaly',
        conditions: [
          { field: 'penalty_strokes_per_round', operator: 'gt', value: BENCHMARKS.penaltiesPerRound, label: 'High penalty frequency' },
        ],
        outcome: { metric: 'penalty_strokes_per_round', direction: 'decrease', comparison: 'vs_baseline' },
        strokeImpact: val - BENCHMARKS.penaltiesPerRound,
        description: `${playerName(player)} averages ${val.toFixed(1)} penalty strokes per round (team avg: ${avg.toFixed(1)}, benchmark: ${BENCHMARKS.penaltiesPerRound})`,
        recommendation: `Penalty strokes are free strokes to the field. Focus on course management — play safer off the tee on penalty-prone holes. Smarter is better than heroic.`,
        actionability: 0.9,
        lastOccurrence: now,
      }));
    }
  }

  return patterns.slice(0, 2);
}

/**
 * 9. Three-Putt Patterns — Frequency analysis
 */
function detectThreePuttPatterns(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>,
  now: string
): MinedPattern[] {
  const patterns: MinedPattern[] = [];

  const threePuttValues: Array<{ id: string; val: number }> = [];
  for (const [id, stats] of statsMap) {
    if (stats.three_putt_percentage !== null) {
      threePuttValues.push({ id, val: stats.three_putt_percentage });
    }
  }

  if (threePuttValues.length === 0) return patterns;
  const avg = teamAvg(threePuttValues.map(v => v.val));

  // Team-level three putt issue
  if (avg > BENCHMARKS.threePuttPct + 4) {
    patterns.push(buildPattern({
      id: 'pattern-team-three-putts',
      playerId: 'team',
      patternType: 'cluster',
      conditions: [
        { field: 'three_putt_percentage', operator: 'gt', value: BENCHMARKS.threePuttPct, label: 'Team three-putt rate elevated' },
      ],
      outcome: { metric: 'three_putt_percentage', direction: 'decrease', comparison: 'vs_baseline' },
      strokeImpact: (avg - BENCHMARKS.threePuttPct) * 0.18, // ~18 greens/round
      description: `Team three-putt rate is ${avg.toFixed(1)}% (benchmark: ${BENCHMARKS.threePuttPct}%) — this is costing the team strokes on the green`,
      recommendation: `Speed control is the #1 factor in avoiding three-putts. Run lag putting drills from 30+ feet, and practice pace on both uphill and downhill putts.`,
      lastOccurrence: now,
    }));
  }

  // Individual high three-putters
  for (const { id, val } of threePuttValues) {
    if (val > avg + 5 && val > BENCHMARKS.threePuttPct + 3) {
      const player = playerMap.get(id);
      if (!player) continue;
      patterns.push(buildPattern({
        id: `pattern-three-putts-${id}`,
        playerId: id,
        patternType: 'conditional',
        conditions: [
          { field: 'three_putt_percentage', operator: 'gt', value: avg + 3, label: 'Three-putt rate above team average' },
        ],
        outcome: { metric: 'three_putt_percentage', direction: 'decrease', comparison: 'vs_baseline' },
        strokeImpact: (val - BENCHMARKS.threePuttPct) * 0.18,
        description: `${playerName(player)}'s three-putt rate (${val.toFixed(1)}%) is well above team average (${avg.toFixed(1)}%) — speed control issue`,
        recommendation: `Focus on lag putting from 25+ feet. The goal isn't to make it — it's to leave every putt inside 3 feet.`,
        lastOccurrence: now,
      }));
    }
  }

  return patterns.slice(0, 3);
}

/**
 * 10. Trend Divergence — Players trending opposite to team direction
 */
function detectTrendDivergence(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>,
  now: string
): MinedPattern[] {
  const patterns: MinedPattern[] = [];

  const trendValues: Array<{ id: string; trend: number; direction: string | null }> = [];
  for (const [id, stats] of statsMap) {
    if (stats.improvement_trend !== null) {
      trendValues.push({ id, trend: stats.improvement_trend, direction: stats.trend_direction });
    }
  }

  if (trendValues.length < 2) return patterns;
  const avgTrend = teamAvg(trendValues.map(v => v.trend));

  for (const { id, trend } of trendValues) {
    const player = playerMap.get(id);
    if (!player) continue;

    // Team improving (negative trend = lower scores) but player declining
    if (avgTrend < -0.5 && trend > 1.0) {
      patterns.push(buildPattern({
        id: `pattern-trend-diverge-decline-${id}`,
        playerId: id,
        patternType: 'temporal',
        conditions: [
          { field: 'improvement_trend', operator: 'gt', value: 0.5, label: 'Scores trending upward while team improves' },
        ],
        outcome: { metric: 'scoring_trend', direction: 'decrease', comparison: 'vs_baseline' },
        strokeImpact: trend - avgTrend,
        confidence: 0.7,
        description: `While team scores are improving (${avgTrend.toFixed(1)} trend), ${playerName(player)}'s are rising by ${trend.toFixed(1)} strokes — diverging from team trajectory`,
        recommendation: `Check in with ${playerName(player)} about any changes in routine, confidence, or mechanics. Early intervention can reverse a declining trend.`,
        actionability: 0.85,
        lastOccurrence: now,
      }));
    }

    // Team declining but player improving — highlight as positive
    if (avgTrend > 0.5 && trend < -1.0) {
      patterns.push(buildPattern({
        id: `pattern-trend-diverge-improve-${id}`,
        playerId: id,
        patternType: 'temporal',
        conditions: [
          { field: 'improvement_trend', operator: 'lt', value: -0.5, label: 'Scores trending down while team struggles' },
        ],
        outcome: { metric: 'scoring_trend', direction: 'increase', comparison: 'vs_baseline' },
        strokeImpact: Math.abs(trend),
        confidence: 0.7,
        description: `${playerName(player)} is bucking the team trend — improving by ${Math.abs(trend).toFixed(1)} strokes while the team average is rising`,
        recommendation: `Study what ${playerName(player)} is doing differently. Their approach may contain lessons for teammates who are struggling.`,
        lastOccurrence: now,
      }));
    }
  }

  return patterns.slice(0, 2);
}

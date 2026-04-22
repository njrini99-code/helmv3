/**
 * Stats-Based Insight Generator
 *
 * Analyzes comprehensive golf statistics (100+ metrics) to generate
 * actionable insights focused on where players can cut strokes.
 *
 * Key analysis areas:
 * - Strokes Gained breakdown (where strokes are lost)
 * - Putting efficiency by distance
 * - Approach play and GIR patterns
 * - Scrambling and short game
 * - Pressure performance gaps
 * - Miss pattern tendencies
 */

import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { PlayerBaseline, BaselineMetric } from '../stats/baselines';
import type { MinedPattern, PatternType, PatternTrend } from '../types';

/** Minimum sample size for a per-player baseline to override the static benchmark. */
const MIN_BASELINE_SAMPLE_SIZE = 5;

/**
 * Compare a single metric's current value against the best available
 * reference — the per-player EWMA baseline when it has enough sample
 * size, otherwise the static D2/D3 benchmark.
 *
 * Task B12: prior code unconditionally compared against the static
 * benchmark table even when a strong per-player baseline existed, so
 * insights said "below D2 avg" when the player was actually above
 * their own moving average.
 */
export function compareAgainstBaseline(args: {
  currentValue: number;
  baseline?: Pick<BaselineMetric, 'ewma' | 'stdDev' | 'sampleSize'>;
  staticBenchmark: number;
}): {
  comparedTo: 'player_baseline' | 'static_benchmark';
  referenceValue: number;
  direction: 'above' | 'below' | 'at';
  deviation: number;
} {
  const hasGoodBaseline =
    args.baseline !== undefined && args.baseline.sampleSize >= MIN_BASELINE_SAMPLE_SIZE;

  const reference = hasGoodBaseline ? (args.baseline as BaselineMetric).ewma : args.staticBenchmark;
  const epsilon = hasGoodBaseline
    ? Math.max(0.01, (args.baseline as BaselineMetric).stdDev / 4)
    : 0.001;

  let direction: 'above' | 'below' | 'at' = 'at';
  if (args.currentValue > reference + epsilon) direction = 'above';
  else if (args.currentValue < reference - epsilon) direction = 'below';

  return {
    comparedTo: hasGoodBaseline ? 'player_baseline' : 'static_benchmark',
    referenceValue: reference,
    direction,
    deviation: args.currentValue - reference,
  };
}

// TODO: Replace with dynamic baselines from stats/baselines.ts
// These are D2/D3 college golf averages used as fallback when player baselines aren't available
const BENCHMARKS = {
  // Strokes Gained per round (vs scratch/par)
  sgTotal: 0,           // Even with par (baseline)
  sgTee: 0,
  sgApproach: 0,
  sgAroundGreen: 0,
  sgPutting: 0,

  // Putting make percentages (D2/D3 college level)
  puttMake0_3: 95,      // Inside 3 feet (was 98 — slightly lower)
  puttMake3_5: 60,      // 3-5 feet (was 75 — PGA level)
  puttMake5_10: 30,     // 5-10 feet (was 45 — PGA level)
  puttMake10_15: 18,    // 10-15 feet (was 25)
  puttMake15_20: 12,    // 15-20 feet (was 15)

  // GIR targets (D2/D3 level)
  girPct: 42,           // Overall (was 60 — PGA level)
  girPctPar3: 35,
  girPctPar4: 38,
  girPctPar5: 55,

  // GIR by distance
  girPct100_125: 55,    // 100-125 yards (was 70)
  girPct125_150: 45,    // 125-150 yards (was 60)
  girPct150_175: 35,    // 150-175 yards (was 50)
  girPct175_200: 25,    // 175-200 yards (was 40)

  // Driving
  fairwayPct: 58,       // was 60 (slight adjust)

  // Scrambling (D2/D3 level)
  scramblingPct: 42,    // was 55 (PGA level)
  sandSavePct: 30,      // was 45

  // Putting efficiency (strokes to hole out)
  puttEff5_10: 1.5,     // Under 1.5 is good
  puttEff10_15: 1.8,
  puttEff15_20: 2.0,
  puttEff20_25: 2.1,

  // Three putts
  threePuttsPerRound: 1.2,  // was 0.8

  // Penalties
  penaltiesPerRound: 0.6,   // was 0.5

  // Scoring differentials
  qualifyingVsPractice: 1.5, // Max acceptable difference
};

/**
 * Trend analysis data for stats insights
 */
export interface TrendAnalysis {
  direction: 'improving' | 'declining' | 'stable';
  magnitude: number;           // Absolute change
  percentChange: number;       // Relative change
  periodDays: number;          // Period being compared
  baselineValue: number;       // Value at start of period
  currentValue: number;        // Current value
  significance: 'significant' | 'moderate' | 'minimal';
  projectedValue?: number;     // Where trend is heading
}

/**
 * Team comparison data for benchmarking
 */
export interface TeamComparison {
  teamAvg: number;
  teamBest: number;
  teamWorst: number;
  playerRank: number;          // 1 = best on team
  teamSize: number;
  percentile: number;          // 0-100, where player stands
}

/**
 * Stats-based insight with stroke impact quantification
 */
export interface StatsInsight {
  id: string;
  playerId: string;
  category: 'strokes_gained' | 'putting' | 'approach' | 'driving' | 'scrambling' | 'pressure' | 'scoring';
  headline: string;
  body: string;
  strokeImpact: number;      // Estimated strokes per round impact
  recommendation: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  evidenceMetrics: EvidenceMetric[];
  comparisonToBenchmark?: {
    playerValue: number;
    benchmark: number;
    unit: string;
    delta: number;
  };
  // V2 Enhancements
  trend?: TrendAnalysis;
  teamComparison?: TeamComparison;
  timeScope?: 'all_time' | 'season' | 'last_30_days' | 'last_7_days';
  correlatedInsights?: string[];  // IDs of related insights
}

interface EvidenceMetric {
  label: string;
  value: number | string;
  benchmark?: number;
  trend?: 'improving' | 'declining' | 'stable';
}

/**
 * Historical stats snapshot for trend analysis
 */
interface HistoricalStats {
  periodStart: Date;
  periodEnd: Date;
  stats: Partial<GolfStats>;
}

/**
 * Team stats aggregation for comparison
 */
interface TeamStatsAggregate {
  teamId: string;
  playerStats: Map<string, Partial<GolfStats>>;
  aggregates: {
    avgScoringAvg: number;
    avgSgTotal: number;
    avgGirPct: number;
    avgFairwayPct: number;
    avgPuttsPerRound: number;
    avgScramblingPct: number;
    avgThreePuttsPerRound: number;
  };
}

/**
 * Stats Insight Generator
 * Analyzes player stats to find stroke-saving opportunities
 */
export class StatsInsightGenerator {
  private playerId: string;
  private historicalStats?: HistoricalStats;
  private teamStats?: TeamStatsAggregate;
  private playerBaseline?: PlayerBaseline;
  private timeScope: 'all_time' | 'season' | 'last_30_days' | 'last_7_days' = 'all_time';

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /**
   * Set historical stats for trend analysis
   */
  setHistoricalStats(historical: HistoricalStats): void {
    this.historicalStats = historical;
  }

  /**
   * Set team stats for comparison benchmarking
   */
  setTeamStats(teamStats: TeamStatsAggregate): void {
    this.teamStats = teamStats;
  }

  /**
   * Set per-player baseline (EWMA moving averages from round history).
   *
   * Task B12: when present with ≥ MIN_BASELINE_SAMPLE_SIZE rounds, this
   * baseline is preferred over the static D2/D3 benchmark table — so
   * insights reflect the player's own recent form rather than a static
   * peer group.
   */
  setPlayerBaseline(baseline: PlayerBaseline): void {
    this.playerBaseline = baseline;
  }

  /** Expose the baseline for the helper; used via test harness. */
  getPlayerBaseline(): PlayerBaseline | undefined {
    return this.playerBaseline;
  }

  /**
   * Set time scope for insights
   */
  setTimeScope(scope: 'all_time' | 'season' | 'last_30_days' | 'last_7_days'): void {
    this.timeScope = scope;
  }

  /**
   * Get average holes per round (handles 9-hole rounds correctly).
   * Falls back to 18 only when no data is available.
   */
  private getHolesPerRound(stats: GolfStats): number {
    if (stats.roundsPlayed > 0 && stats.holesPlayed > 0) {
      return stats.holesPlayed / stats.roundsPlayed;
    }
    return 18;
  }

  /**
   * Analyze trend for a specific metric
   */
  private analyzeTrend(
    currentValue: number | null,
    historicalValue: number | null | undefined,
    higherIsBetter: boolean = false
  ): TrendAnalysis | undefined {
    if (currentValue === null || historicalValue === null || historicalValue === undefined) {
      return undefined;
    }

    const change = currentValue - historicalValue;
    const percentChange = historicalValue !== 0 ? (change / Math.abs(historicalValue)) * 100 : 0;

    // Determine if this is improvement
    const isImproving = higherIsBetter ? change > 0 : change < 0;
    const isDeclining = higherIsBetter ? change < 0 : change > 0;

    // Determine significance (based on percentage change and golf context)
    let significance: 'significant' | 'moderate' | 'minimal' = 'minimal';
    const absPercent = Math.abs(percentChange);
    if (absPercent > 15) significance = 'significant';
    else if (absPercent > 5) significance = 'moderate';

    return {
      direction: isImproving ? 'improving' : isDeclining ? 'declining' : 'stable',
      magnitude: Math.abs(change),
      percentChange,
      periodDays: this.historicalStats
        ? Math.round((new Date().getTime() - this.historicalStats.periodStart.getTime()) / (1000 * 60 * 60 * 24))
        : 30,
      baselineValue: historicalValue,
      currentValue,
      significance,
    };
  }

  /**
   * Get team comparison for a specific metric
   */
  private getTeamComparison(
    playerValue: number | null,
    metricKey: keyof TeamStatsAggregate['aggregates']
  ): TeamComparison | undefined {
    if (!this.teamStats || playerValue === null) {
      return undefined;
    }

    const teamAvg = this.teamStats.aggregates[metricKey];
    if (teamAvg === undefined) return undefined;

    // Calculate team best/worst and player rank
    const allValues: number[] = [];
    this.teamStats.playerStats.forEach((stats) => {
      const val = this.getStatValue(stats, metricKey);
      if (val !== null) allValues.push(val);
    });

    if (allValues.length === 0) return undefined;

    allValues.sort((a, b) => a - b);

    // For scoring/strokes metrics, lower is better
    const lowerIsBetter = ['avgScoringAvg', 'avgThreePuttsPerRound', 'avgPuttsPerRound'].includes(metricKey);
    const teamBest = lowerIsBetter ? Math.min(...allValues) : Math.max(...allValues);
    const teamWorst = lowerIsBetter ? Math.max(...allValues) : Math.min(...allValues);

    // Calculate rank (1 = best)
    const sortedForRank = lowerIsBetter
      ? [...allValues].sort((a, b) => a - b)
      : [...allValues].sort((a, b) => b - a);
    const playerRank = sortedForRank.findIndex(v => Math.abs(v - playerValue) < 0.001) + 1;

    // Calculate percentile
    const percentile = ((sortedForRank.length - playerRank) / (sortedForRank.length - 1)) * 100;

    return {
      teamAvg,
      teamBest,
      teamWorst,
      playerRank: playerRank || allValues.length,
      teamSize: allValues.length,
      percentile: Math.round(percentile),
    };
  }

  private getStatValue(stats: Partial<GolfStats>, metricKey: string): number | null {
    const mappings: Record<string, keyof GolfStats> = {
      avgScoringAvg: 'scoringAverage',
      avgSgTotal: 'sgTotalPerRound',
      avgGirPct: 'girPercentage',
      avgFairwayPct: 'fairwayPercentage',
      avgPuttsPerRound: 'puttsPerRound',
      avgScramblingPct: 'scramblingPercentage',
      avgThreePuttsPerRound: 'threePuttsPerRound',
    };
    const key = mappings[metricKey];
    if (!key) return null;
    const val = stats[key];
    return typeof val === 'number' ? val : null;
  }

  /**
   * Generate comprehensive stats-based insights
   */
  async generateInsights(stats: GolfStats): Promise<StatsInsight[]> {
    const insights: StatsInsight[] = [];

    // Only generate insights if we have enough data
    if (stats.roundsPlayed < 3) {
      return [];
    }

    // 1. Strokes Gained Analysis (highest priority)
    insights.push(...this.analyzeStrokesGained(stats));

    // 2. Putting Analysis
    insights.push(...this.analyzePutting(stats));

    // 3. Approach/Iron Play Analysis
    insights.push(...this.analyzeApproach(stats));

    // 4. Driving Analysis
    insights.push(...this.analyzeDriving(stats));

    // 5. Scrambling/Short Game Analysis
    insights.push(...this.analyzeScrambling(stats));

    // 6. Pressure Performance Analysis
    insights.push(...this.analyzePressurePerformance(stats));

    // 7. Scoring Pattern Analysis
    insights.push(...this.analyzeScoringPatterns(stats));

    // 8. Root Cause Chain Analysis (cross-referencing related stats)
    insights.push(...this.analyzeRootCauseChains(stats));

    // 9. Putting Break Weakness Analysis (break-type specific)
    insights.push(...this.analyzePuttingBreakWeakness(stats));

    // 10. Par Type Profiling (why specific par types cost strokes)
    insights.push(...this.analyzeParTypeProfile(stats));

    // 11. Approach by Lie + Distance (pinpoint exact weakness zone)
    insights.push(...this.analyzeApproachByLieAndDistance(stats));

    // 12. Stroke Leakage ROI (ranked practice priorities)
    insights.push(...this.analyzeStrokeLeakageROI(stats));

    // 13. Trend-based insights (if historical data available)
    if (this.historicalStats) {
      insights.push(...this.analyzeTrends(stats));
    }

    // 14. Team comparison insights (if team data available)
    if (this.teamStats) {
      insights.push(...this.analyzeTeamComparison(stats));
    }

    // Add time scope and team comparisons to all insights
    insights.forEach(insight => {
      insight.timeScope = this.timeScope;
      // Add team comparison data to relevant insights
      if (this.teamStats && insight.comparisonToBenchmark) {
        const metricMap: Record<string, keyof TeamStatsAggregate['aggregates']> = {
          'strokes_gained': 'avgSgTotal',
          'putting': 'avgPuttsPerRound',
          'approach': 'avgGirPct',
          'driving': 'avgFairwayPct',
          'scrambling': 'avgScramblingPct',
          'scoring': 'avgScoringAvg',
        };
        const teamMetric = metricMap[insight.category];
        if (teamMetric) {
          insight.teamComparison = this.getTeamComparison(insight.comparisonToBenchmark.playerValue, teamMetric);
        }
      }
    });

    // Sort by stroke impact (highest first)
    return insights
      .sort((a, b) => b.strokeImpact - a.strokeImpact)
      .slice(0, 10); // Return top 10 most impactful insights
  }

  /**
   * Generate team comparison insights
   */
  private analyzeTeamComparison(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];
    if (!this.teamStats) return insights;

    // Scoring comparison
    const scoringComparison = this.getTeamComparison(stats.scoringAverage, 'avgScoringAvg');
    if (scoringComparison && stats.scoringAverage) {
      const isTopHalf = scoringComparison.percentile >= 50;
      const gapToAvg = stats.scoringAverage - scoringComparison.teamAvg;

      if (Math.abs(gapToAvg) > 1) {
        insights.push({
          id: 'team-scoring-comparison',
          playerId: this.playerId,
          category: 'scoring',
          headline: isTopHalf
            ? `Scoring: Top ${100 - scoringComparison.percentile}% on Team`
            : `Scoring: ${Math.abs(gapToAvg).toFixed(1)} Strokes Above Team Average`,
          body: isTopHalf
            ? `Your ${stats.scoringAverage.toFixed(1)} scoring average ranks #${scoringComparison.playerRank} of ${scoringComparison.teamSize} on the team (team avg: ${scoringComparison.teamAvg.toFixed(1)}).`
            : `Your ${stats.scoringAverage.toFixed(1)} scoring average is ${Math.abs(gapToAvg).toFixed(1)} strokes higher than the team average of ${scoringComparison.teamAvg.toFixed(1)}. Team best: ${scoringComparison.teamBest.toFixed(1)}.`,
          strokeImpact: isTopHalf ? 0 : Math.abs(gapToAvg),
          recommendation: isTopHalf
            ? 'You\'re among the team leaders in scoring. Share what\'s working with teammates.'
            : 'Focus on the areas where you differ most from top performers on the team.',
          priority: isTopHalf ? 'low' : gapToAvg > 3 ? 'high' : 'medium',
          confidence: 0.9,
          evidenceMetrics: [
            { label: 'Your Average', value: stats.scoringAverage.toFixed(1) },
            { label: 'Team Average', value: scoringComparison.teamAvg.toFixed(1) },
            { label: 'Team Best', value: scoringComparison.teamBest.toFixed(1) },
            { label: 'Your Rank', value: `#${scoringComparison.playerRank} of ${scoringComparison.teamSize}` },
          ],
          teamComparison: scoringComparison,
          timeScope: this.timeScope,
        });
      }
    }

    // GIR comparison
    const girComparison = this.getTeamComparison(stats.girPercentage, 'avgGirPct');
    if (girComparison && stats.girPercentage) {
      const gapToAvg = stats.girPercentage - girComparison.teamAvg;

      if (Math.abs(gapToAvg) > 5) {
        const isAboveAvg = gapToAvg > 0;
        insights.push({
          id: 'team-gir-comparison',
          playerId: this.playerId,
          category: 'approach',
          headline: isAboveAvg
            ? `GIR: ${gapToAvg.toFixed(0)}% Above Team Average`
            : `GIR: ${Math.abs(gapToAvg).toFixed(0)}% Below Team Average`,
          body: isAboveAvg
            ? `Your ${stats.girPercentage.toFixed(0)}% GIR leads the team (avg: ${girComparison.teamAvg.toFixed(0)}%). Strong iron play is a competitive advantage.`
            : `Your ${stats.girPercentage.toFixed(0)}% GIR is below the team average of ${girComparison.teamAvg.toFixed(0)}%. Focus on approach consistency.`,
          strokeImpact: isAboveAvg ? 0 : Math.abs(gapToAvg) / 100 * this.getHolesPerRound(stats) * 0.3,
          recommendation: isAboveAvg
            ? 'Your approach shots are a strength. Consider helping teammates with iron play.'
            : 'Study what top team performers do on approaches. Focus on distance control.',
          priority: isAboveAvg ? 'low' : 'medium',
          confidence: 0.85,
          evidenceMetrics: [
            { label: 'Your GIR%', value: `${stats.girPercentage.toFixed(0)}%` },
            { label: 'Team GIR%', value: `${girComparison.teamAvg.toFixed(0)}%` },
          ],
          teamComparison: girComparison,
          timeScope: this.timeScope,
        });
      }
    }

    return insights;
  }

  /**
   * Generate trend-based insights comparing current to baseline
   */
  private analyzeTrends(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];
    const historical = this.historicalStats?.stats;
    if (!historical) return insights;

    // Scoring trend
    const scoringTrend = this.analyzeTrend(
      stats.scoringAverage,
      historical.scoringAverage,
      false // lower is better
    );

    if (scoringTrend && scoringTrend.significance !== 'minimal') {
      const isImproving = scoringTrend.direction === 'improving';
      insights.push({
        id: 'trend-scoring',
        playerId: this.playerId,
        category: 'scoring',
        headline: isImproving
          ? `Scoring Average Improving: ${scoringTrend.magnitude.toFixed(1)} Strokes`
          : `Scoring Average Declining: +${scoringTrend.magnitude.toFixed(1)} Strokes`,
        body: isImproving
          ? `Your scoring average has improved from ${scoringTrend.baselineValue.toFixed(1)} to ${scoringTrend.currentValue.toFixed(1)} over the past ${scoringTrend.periodDays} days. This is a ${Math.abs(scoringTrend.percentChange).toFixed(0)}% improvement.`
          : `Your scoring average has increased from ${scoringTrend.baselineValue.toFixed(1)} to ${scoringTrend.currentValue.toFixed(1)} over the past ${scoringTrend.periodDays} days. Review recent patterns to identify the cause.`,
        strokeImpact: scoringTrend.magnitude,
        recommendation: isImproving
          ? 'Continue current practice and playing patterns. Document what\'s working.'
          : 'Analyze recent rounds to identify what changed. Focus on the area showing the biggest decline.',
        priority: scoringTrend.significance === 'significant' ? 'high' : 'medium',
        confidence: 0.85,
        evidenceMetrics: [
          { label: 'Previous Avg', value: scoringTrend.baselineValue.toFixed(1), trend: 'stable' },
          { label: 'Current Avg', value: scoringTrend.currentValue.toFixed(1), trend: scoringTrend.direction },
          { label: 'Change', value: `${isImproving ? '-' : '+'}${scoringTrend.magnitude.toFixed(1)}` },
        ],
        trend: scoringTrend,
        timeScope: this.timeScope,
      });
    }

    // GIR trend
    const girTrend = this.analyzeTrend(
      stats.girPercentage,
      historical.girPercentage,
      true // higher is better
    );

    if (girTrend && girTrend.significance !== 'minimal') {
      const isImproving = girTrend.direction === 'improving';
      insights.push({
        id: 'trend-gir',
        playerId: this.playerId,
        category: 'approach',
        headline: isImproving
          ? `GIR% Trending Up: +${girTrend.magnitude.toFixed(0)}%`
          : `GIR% Declining: -${girTrend.magnitude.toFixed(0)}%`,
        body: isImproving
          ? `Your greens in regulation improved from ${girTrend.baselineValue.toFixed(0)}% to ${girTrend.currentValue.toFixed(0)}%. Better approach shots lead to more birdie opportunities.`
          : `Your greens in regulation dropped from ${girTrend.baselineValue.toFixed(0)}% to ${girTrend.currentValue.toFixed(0)}%. This puts more pressure on your short game.`,
        strokeImpact: isImproving ? 0 : Math.abs(girTrend.magnitude) / 100 * this.getHolesPerRound(stats) * 0.3,
        recommendation: isImproving
          ? 'Your iron play is improving. Keep working on distance control.'
          : 'Focus on approach shot consistency. Consider club selection and commit to your targets.',
        priority: girTrend.significance === 'significant' ? 'high' : 'medium',
        confidence: 0.8,
        evidenceMetrics: [
          { label: 'Previous GIR%', value: `${girTrend.baselineValue.toFixed(0)}%`, trend: 'stable' },
          { label: 'Current GIR%', value: `${girTrend.currentValue.toFixed(0)}%`, trend: girTrend.direction },
        ],
        trend: girTrend,
        timeScope: this.timeScope,
      });
    }

    // Putting trend (3-putts)
    const threePuttTrend = this.analyzeTrend(
      stats.threePuttsPerRound,
      historical.threePuttsPerRound,
      false // lower is better
    );

    if (threePuttTrend && threePuttTrend.significance !== 'minimal') {
      const isImproving = threePuttTrend.direction === 'improving';
      insights.push({
        id: 'trend-three-putts',
        playerId: this.playerId,
        category: 'putting',
        headline: isImproving
          ? `3-Putt Rate Improving`
          : `3-Putt Rate Increasing`,
        body: isImproving
          ? `3-putts per round improved from ${threePuttTrend.baselineValue.toFixed(1)} to ${threePuttTrend.currentValue.toFixed(1)}. Better lag putting is paying off.`
          : `3-putts per round increased from ${threePuttTrend.baselineValue.toFixed(1)} to ${threePuttTrend.currentValue.toFixed(1)}. Focus on speed control from long range.`,
        strokeImpact: Math.abs(threePuttTrend.magnitude),
        recommendation: isImproving
          ? 'Continue lag putting practice. Your distance control is improving.'
          : 'Dedicate practice to putts from 25+ feet. Focus on leaving the ball within 3 feet.',
        priority: threePuttTrend.significance === 'significant' ? 'high' : 'medium',
        confidence: 0.85,
        evidenceMetrics: [
          { label: 'Previous 3-Putts/Round', value: threePuttTrend.baselineValue.toFixed(1), trend: 'stable' },
          { label: 'Current 3-Putts/Round', value: threePuttTrend.currentValue.toFixed(1), trend: threePuttTrend.direction },
        ],
        trend: threePuttTrend,
        timeScope: this.timeScope,
      });
    }

    return insights;
  }

  /**
   * Convert insights to MinedPattern format for orchestrator compatibility
   */
  toMinedPatterns(insights: StatsInsight[]): MinedPattern[] {
    return insights.map((insight) => ({
      id: insight.id,
      playerId: this.playerId,
      patternType: 'regression' as PatternType,
      conditions: [{
        field: insight.category,
        operator: 'eq' as const,
        value: insight.headline,
        label: insight.category.replace(/_/g, ' '),
      }],
      outcome: {
        metric: 'score',
        direction: 'decrease' as const,
        magnitude: insight.strokeImpact,
        comparison: 'vs_baseline' as const,
      },
      support: 0.8,
      confidence: insight.confidence,
      lift: 1 + insight.strokeImpact / 5,
      conviction: insight.confidence * (1 + insight.strokeImpact / 3),
      strokeImpact: insight.strokeImpact,
      actionability: insight.priority === 'critical' ? 0.9 : insight.priority === 'high' ? 0.75 : 0.6,
      sampleSize: 0, // Will be set from stats.roundsPlayed
      firstDetected: new Date().toISOString(),
      lastOccurrence: new Date().toISOString(),
      occurrenceCount: 1,
      trend: 'new' as PatternTrend,
      isActive: true,
      description: insight.body,
      recommendation: insight.recommendation,
    }));
  }

  // ============================================================================
  // STROKES GAINED ANALYSIS
  // ============================================================================

  private analyzeStrokesGained(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    // Only analyze if we have SG data
    if (stats.sgTotalPerRound === null) {
      return insights;
    }

    // Find biggest stroke loss area
    const sgCategories = [
      { name: 'Tee', value: stats.sgTeePerRound, benchmark: BENCHMARKS.sgTee },
      { name: 'Approach', value: stats.sgApproachPerRound, benchmark: BENCHMARKS.sgApproach },
      { name: 'Around Green', value: stats.sgAroundGreenPerRound, benchmark: BENCHMARKS.sgAroundGreen },
      { name: 'Putting', value: stats.sgPuttingPerRound, benchmark: BENCHMARKS.sgPutting },
    ].filter((c) => c.value !== null) as Array<{ name: string; value: number; benchmark: number }>;

    if (sgCategories.length === 0) return insights;

    // Sort by loss (most negative first)
    sgCategories.sort((a, b) => a.value - b.value);

    const worstArea = sgCategories[0]!;  // Safe - we checked length > 0
    const bestArea = sgCategories[sgCategories.length - 1]!;  // Safe - we checked length > 0

    // Insight: Biggest stroke loss area
    if (worstArea.value < -0.3) {
      const strokesLost = Math.abs(worstArea.value).toFixed(1);
      insights.push({
        id: `sg-loss-${worstArea.name.toLowerCase().replace(' ', '_')}`,
        playerId: this.playerId,
        category: 'strokes_gained',
        headline: `SG ${worstArea.name}: Primary Stroke Sink`,
        body: `You're losing ${strokesLost} strokes per round in ${worstArea.name.toLowerCase()}. This is your biggest area for improvement and represents the best opportunity to lower your scores.`,
        strokeImpact: Math.abs(worstArea.value),
        recommendation: this.getSGRecommendation(worstArea.name, worstArea.value),
        priority: Math.abs(worstArea.value) > 1 ? 'critical' : 'high',
        confidence: stats.roundsPlayed <= 5 ? 0.55 : stats.roundsPlayed <= 10 ? 0.70 : stats.roundsPlayed <= 20 ? 0.85 : 0.95,
        evidenceMetrics: [
          { label: `SG ${worstArea.name}`, value: worstArea.value.toFixed(2), benchmark: 0 },
          { label: 'Rounds Analyzed', value: stats.roundsPlayed },
        ],
        comparisonToBenchmark: {
          playerValue: worstArea.value,
          benchmark: 0,
          unit: 'strokes/round',
          delta: worstArea.value,
        },
      });
    }

    // Insight: Highlight strength area (if significantly positive)
    if (bestArea.value > 0.3) {
      insights.push({
        id: `sg-strength-${bestArea.name.toLowerCase().replace(' ', '_')}`,
        playerId: this.playerId,
        category: 'strokes_gained',
        headline: `SG ${bestArea.name}: Competitive Advantage`,
        body: `You're gaining ${bestArea.value.toFixed(1)} strokes per round in ${bestArea.name.toLowerCase()}. This is a strength that sets you apart. Consider building your game strategy around this advantage.`,
        strokeImpact: 0, // Positive contribution
        recommendation: `Maintain your ${bestArea.name.toLowerCase()} advantage while addressing weaker areas.`,
        priority: 'low',
        confidence: stats.roundsPlayed <= 5 ? 0.55 : stats.roundsPlayed <= 10 ? 0.70 : stats.roundsPlayed <= 20 ? 0.85 : 0.95,
        evidenceMetrics: [
          { label: `SG ${bestArea.name}`, value: `+${bestArea.value.toFixed(2)}`, benchmark: 0 },
        ],
      });
    }

    // Insight: SG imbalance (one area dragging down good areas)
    if (worstArea.value < -0.5 && bestArea.value > 0.3) {
      const gap = bestArea.value - worstArea.value;
      insights.push({
        id: 'sg-imbalance',
        playerId: this.playerId,
        category: 'strokes_gained',
        headline: 'Significant Game Imbalance',
        body: `Your ${bestArea.name.toLowerCase()} is strong (+${bestArea.value.toFixed(1)}) but ${worstArea.name.toLowerCase()} is costing you ${Math.abs(worstArea.value).toFixed(1)} strokes. The ${gap.toFixed(1)}-stroke gap between your best and worst areas suggests focused practice on ${worstArea.name.toLowerCase()} could significantly lower scores.`,
        strokeImpact: Math.abs(worstArea.value) * 0.5, // Realistic improvement target
        recommendation: `Allocate 60% of practice time to ${worstArea.name.toLowerCase()} to close the gap.`,
        priority: 'high',
        confidence: 0.85,
        evidenceMetrics: [
          { label: `SG ${bestArea.name}`, value: `+${bestArea.value.toFixed(2)}` },
          { label: `SG ${worstArea.name}`, value: worstArea.value.toFixed(2) },
          { label: 'Gap', value: `${gap.toFixed(1)} strokes` },
        ],
      });
    }

    return insights;
  }

  private getSGRecommendation(area: string, value: number): string {
    const severity = Math.abs(value);

    switch (area) {
      case 'Tee':
        if (severity > 1) {
          return 'Priority: Improve driving accuracy. Focus on hitting fairways over distance. Consider working with a coach on swing path and face control.';
        }
        return 'Work on consistent contact and fairway percentage. Consider course management to avoid penalty situations.';

      case 'Approach':
        if (severity > 1) {
          return 'Priority: Iron play distance control. Focus on specific yardages and dial in your approach distances. Practice from 100-175 yards.';
        }
        return 'Improve proximity to hole on approach shots. Work on distance control and consistent strike patterns.';

      case 'Around Green':
        if (severity > 1) {
          return 'Priority: Short game fundamentals. Dedicate significant practice to chipping and pitching. Focus on up-and-down percentage.';
        }
        return 'Work on chip shot distance control and landing spot selection. Practice from various lies.';

      case 'Putting':
        if (severity > 1) {
          return 'Priority: Putting practice. Focus on lag putting to reduce 3-putts and make percentage inside 10 feet. Consider a putting coach.';
        }
        return 'Work on speed control and read accuracy. Practice from 5-15 feet range for best score impact.';

      default:
        return 'Focus practice time on this area to improve overall scoring.';
    }
  }

  // ============================================================================
  // PUTTING ANALYSIS
  // ============================================================================

  private analyzePutting(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    // Three-putt analysis
    if (stats.threePuttsPerRound !== null && stats.threePuttsPerRound > BENCHMARKS.threePuttsPerRound) {
      const excessThreePutts = stats.threePuttsPerRound - BENCHMARKS.threePuttsPerRound;
      insights.push({
        id: 'putting-three-putts',
        playerId: this.playerId,
        category: 'putting',
        headline: '3-Putt Rate Costing Strokes',
        body: `You're averaging ${stats.threePuttsPerRound.toFixed(1)} three-putts per round (target: <${BENCHMARKS.threePuttsPerRound}). Each three-putt costs a stroke. Reducing to benchmark would save ${excessThreePutts.toFixed(1)} strokes per round.`,
        strokeImpact: excessThreePutts,
        recommendation: 'Focus on lag putting. From 25+ feet, prioritize leaving the ball within 3 feet. Practice pace control drills.',
        priority: excessThreePutts > 0.5 ? 'high' : 'medium',
        confidence: stats.roundsPlayed <= 5 ? 0.55 : stats.roundsPlayed <= 10 ? 0.70 : stats.roundsPlayed <= 20 ? 0.85 : 0.95,
        evidenceMetrics: [
          { label: '3-Putts/Round', value: stats.threePuttsPerRound.toFixed(1), benchmark: BENCHMARKS.threePuttsPerRound },
          { label: 'Total 3-Putts', value: stats.threePuttsTotal },
        ],
        comparisonToBenchmark: {
          playerValue: stats.threePuttsPerRound,
          benchmark: BENCHMARKS.threePuttsPerRound,
          unit: 'per round',
          delta: excessThreePutts,
        },
      });
    }

    // Inside 3 feet make percentage — require minimum 10 first putts in this bucket
    // to avoid misleading insights from tiny samples (e.g., only 3 putts)
    if (stats.puttMakePct0_3 !== null && stats.puttMakeCount0_3 >= 10 && stats.puttMakePct0_3 < BENCHMARKS.puttMake0_3) {
      const missedShortPutts = (BENCHMARKS.puttMake0_3 - stats.puttMakePct0_3) / 100 * 10; // Assume ~10 short putts/round
      insights.push({
        id: 'putting-short-misses',
        playerId: this.playerId,
        category: 'putting',
        headline: 'Short Putt Conversion Issue',
        body: `Making ${stats.puttMakePct0_3.toFixed(0)}% inside 3 feet (tour level: ${BENCHMARKS.puttMake0_3}%). These are expected makes that are costing strokes.`,
        strokeImpact: missedShortPutts,
        recommendation: 'Focus on routine consistency. These putts are mental/routine issues more than technique. Work on pre-putt routine and visualization.',
        priority: 'high',
        confidence: 0.85,
        evidenceMetrics: [
          { label: 'Make % (0-3 ft)', value: `${stats.puttMakePct0_3.toFixed(0)}%`, benchmark: BENCHMARKS.puttMake0_3 },
        ],
        comparisonToBenchmark: {
          playerValue: stats.puttMakePct0_3,
          benchmark: BENCHMARKS.puttMake0_3,
          unit: '%',
          delta: stats.puttMakePct0_3 - BENCHMARKS.puttMake0_3,
        },
      });
    }

    // 5-10 foot make percentage (stroke-saver range)
    if (stats.puttMakePct5_10 !== null && stats.puttMakePct5_10 < BENCHMARKS.puttMake5_10 - 10) {
      const delta = BENCHMARKS.puttMake5_10 - stats.puttMakePct5_10;
      // Estimate stroke impact: ~3-4 birdie putts per round in this range
      const strokesLost = delta / 100 * 3.5;
      insights.push({
        id: 'putting-5-10ft',
        playerId: this.playerId,
        category: 'putting',
        headline: '5-10ft Putts: Scoring Zone Weakness',
        body: `Making ${stats.puttMakePct5_10.toFixed(0)}% from 5-10 feet (benchmark: ${BENCHMARKS.puttMake5_10}%). This is the "scoring zone" where birdies are made. Improving here directly converts to lower scores.`,
        strokeImpact: strokesLost,
        recommendation: 'Dedicate practice to 5-10 foot range. Focus on consistent start line and speed control. Track make percentage to measure improvement.',
        priority: strokesLost > 0.5 ? 'high' : 'medium',
        confidence: 0.8,
        evidenceMetrics: [
          { label: 'Make % (5-10 ft)', value: `${stats.puttMakePct5_10.toFixed(0)}%`, benchmark: BENCHMARKS.puttMake5_10 },
        ],
        comparisonToBenchmark: {
          playerValue: stats.puttMakePct5_10,
          benchmark: BENCHMARKS.puttMake5_10,
          unit: '%',
          delta: -delta,
        },
      });
    }

    // Putting miss direction analysis
    if (stats.puttMissShortPct !== null && stats.puttMissShortPct > 50) {
      insights.push({
        id: 'putting-miss-short',
        playerId: this.playerId,
        category: 'putting',
        headline: 'Leaving Putts Short',
        body: `${stats.puttMissShortPct.toFixed(0)}% of missed putts are short. The saying "never up, never in" applies - short putts have 0% chance. More aggressive speed on make-able distances would convert more putts.`,
        strokeImpact: 0.3,
        recommendation: 'Practice with the intention of having putts finish 12-18 inches past the hole. Focus on committing to your line with confidence.',
        priority: 'medium',
        confidence: 0.75,
        evidenceMetrics: [
          { label: 'Misses Short', value: `${stats.puttMissShortPct.toFixed(0)}%` },
          { label: 'Misses Long', value: `${stats.puttMissLongPct?.toFixed(0) ?? 'N/A'}%` },
        ],
      });
    }

    // Putting efficiency by distance
    if (stats.puttEff20_25 !== null && stats.puttEff20_25 > BENCHMARKS.puttEff20_25 + 0.3) {
      insights.push({
        id: 'putting-lag-efficiency',
        playerId: this.playerId,
        category: 'putting',
        headline: 'Lag Putting Inefficiency',
        body: `Taking ${stats.puttEff20_25.toFixed(2)} strokes to hole out from 20-25 feet (target: ${BENCHMARKS.puttEff20_25}). This suggests first putts are leaving longer second putts.`,
        strokeImpact: stats.puttEff20_25 - BENCHMARKS.puttEff20_25,
        recommendation: 'Focus on lag putting distance control. The goal from 20+ feet is to leave the ball within 3 feet, not to make it.',
        priority: 'medium',
        confidence: 0.8,
        evidenceMetrics: [
          { label: 'Strokes to Hole (20-25ft)', value: stats.puttEff20_25.toFixed(2), benchmark: BENCHMARKS.puttEff20_25 },
        ],
      });
    }

    return insights;
  }

  // ============================================================================
  // APPROACH/IRON PLAY ANALYSIS
  // ============================================================================

  private analyzeApproach(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    // Overall GIR
    if (stats.girPercentage !== null && stats.girPercentage < BENCHMARKS.girPct - 10) {
      const girDeficit = BENCHMARKS.girPct - stats.girPercentage;
      // Conservative: only count the extra misses, with lower per-miss cost
      const extraMisses = (girDeficit / 100) * this.getHolesPerRound(stats);
      const strokesLost = extraMisses * 0.25; // 0.25 strokes per extra miss, not 0.5

      insights.push({
        id: 'approach-gir-overall',
        playerId: this.playerId,
        category: 'approach',
        headline: 'GIR% Below Target',
        body: `Hitting ${stats.girPercentage.toFixed(0)}% greens in regulation (target: ${BENCHMARKS.girPct}%). Missing greens puts pressure on your short game and reduces birdie opportunities.`,
        strokeImpact: strokesLost,
        recommendation: 'Focus on approach shot consistency. Consider club selection - taking one more club often improves GIR without sacrificing much proximity.',
        priority: strokesLost > 1 ? 'high' : 'medium',
        confidence: stats.roundsPlayed <= 5 ? 0.55 : stats.roundsPlayed <= 10 ? 0.70 : stats.roundsPlayed <= 20 ? 0.85 : 0.95,
        evidenceMetrics: [
          { label: 'GIR %', value: `${stats.girPercentage.toFixed(0)}%`, benchmark: BENCHMARKS.girPct },
          { label: 'GIR/Round', value: stats.girPerRound?.toFixed(1) ?? 'N/A' },
        ],
        comparisonToBenchmark: {
          playerValue: stats.girPercentage,
          benchmark: BENCHMARKS.girPct,
          unit: '%',
          delta: -girDeficit,
        },
      });
    }

    // GIR by distance - find weak zones
    const girByDistance = [
      { range: '100-125 yds', pct: stats.girPct100_125, benchmark: BENCHMARKS.girPct100_125 },
      { range: '125-150 yds', pct: stats.girPct125_150, benchmark: BENCHMARKS.girPct125_150 },
      { range: '150-175 yds', pct: stats.girPct150_175, benchmark: BENCHMARKS.girPct150_175 },
      { range: '175-200 yds', pct: stats.girPct175_200, benchmark: BENCHMARKS.girPct175_200 },
    ].filter((d) => d.pct !== null) as Array<{ range: string; pct: number; benchmark: number }>;

    for (const zone of girByDistance) {
      const deficit = zone.benchmark - zone.pct;
      if (deficit > 15) {
        insights.push({
          id: `approach-gir-${zone.range.replace(/[^0-9]/g, '-')}`,
          playerId: this.playerId,
          category: 'approach',
          headline: `${zone.range} Approach Weakness`,
          body: `GIR from ${zone.range}: ${zone.pct.toFixed(0)}% (target: ${zone.benchmark}%). This distance band is significantly below expectations and worth focused practice.`,
          strokeImpact: deficit / 100 * 3 * 0.5, // ~3 approaches/round in each zone
          recommendation: `Dial in your ${zone.range} club. Practice this specific distance with target focus, not just swing thoughts.`,
          priority: 'medium',
          confidence: 0.75,
          evidenceMetrics: [
            { label: `GIR ${zone.range}`, value: `${zone.pct.toFixed(0)}%`, benchmark: zone.benchmark },
          ],
          comparisonToBenchmark: {
            playerValue: zone.pct,
            benchmark: zone.benchmark,
            unit: '%',
            delta: -deficit,
          },
        });
      }
    }

    // GIR from fairway vs rough — require minimum 20 approach attempts from each lie
    if (stats.girPctFromFairway !== null && stats.girPctFromRough !== null &&
        stats.girCountFromFairway >= 20 && stats.girCountFromRough >= 20) {
      const fwRoughGap = stats.girPctFromFairway - stats.girPctFromRough;
      if (fwRoughGap > 25) {
        insights.push({
          id: 'approach-fairway-vs-rough',
          playerId: this.playerId,
          category: 'approach',
          headline: 'Large Fairway vs Rough GIR Gap',
          body: `GIR from fairway: ${stats.girPctFromFairway.toFixed(0)}%, from rough: ${stats.girPctFromRough.toFixed(0)}% (${fwRoughGap.toFixed(0)}% gap). Your iron play suffers significantly from the rough.`,
          strokeImpact: fwRoughGap / 100 * 6 * 0.2, // conservative multiplier
          recommendation: 'Practice from rough lies. Focus on ball-first contact and consider club adjustment (take one more club) from rough.',
          priority: 'medium',
          confidence: 0.8,
          evidenceMetrics: [
            { label: 'GIR from Fairway', value: `${stats.girPctFromFairway.toFixed(0)}%` },
            { label: 'GIR from Rough', value: `${stats.girPctFromRough.toFixed(0)}%` },
            { label: 'Gap', value: `${fwRoughGap.toFixed(0)}%` },
          ],
        });
      }
    }

    // Approach miss direction
    if (stats.approachMissTotal > 30) {
      const missDirections = [
        { dir: 'Short', pct: stats.approachMissShortPct },
        { dir: 'Long', pct: stats.approachMissLongPct },
        { dir: 'Left', pct: stats.approachMissLeftPct },
        { dir: 'Right', pct: stats.approachMissRightPct },
      ].filter((d) => d.pct !== null) as Array<{ dir: string; pct: number }>;

      const dominantMiss = missDirections.sort((a, b) => b.pct - a.pct)[0];
      if (dominantMiss && dominantMiss.pct > 35) {
        insights.push({
          id: `approach-miss-${dominantMiss.dir.toLowerCase()}`,
          playerId: this.playerId,
          category: 'approach',
          headline: `Approach Shots Miss ${dominantMiss.dir}`,
          body: `${dominantMiss.pct.toFixed(0)}% of approach misses are ${dominantMiss.dir.toLowerCase()}. This is a consistent pattern that can be addressed with swing or strategy adjustments.`,
          strokeImpact: 0.3,
          recommendation: this.getApproachMissRecommendation(dominantMiss.dir),
          priority: 'medium',
          confidence: 0.7,
          evidenceMetrics: [
            { label: `Miss ${dominantMiss.dir}`, value: `${dominantMiss.pct.toFixed(0)}%` },
            { label: 'Total Misses Analyzed', value: stats.approachMissTotal },
          ],
        });
      }
    }

    return insights;
  }

  private getApproachMissRecommendation(direction: string): string {
    switch (direction) {
      case 'Short':
        return 'You\'re likely decelerating or mis-hitting. Take one more club and make a smooth, committed swing. "Club up and choke down" is a good mantra.';
      case 'Long':
        return 'Check if you\'re playing courses at elevation or with favorable conditions. Consider taking one less club when conditions are helping.';
      case 'Left':
        return 'Consistent left misses suggest an over-draw or pull. Check grip, ball position, and swing path. Aim slightly right to play the miss.';
      case 'Right':
        return 'Consistent right misses suggest a block or fade pattern. Check grip pressure and release through impact. Aim slightly left to work with the pattern.';
      default:
        return 'Work on consistent strike and aim pattern with your approach clubs.';
    }
  }

  // ============================================================================
  // DRIVING ANALYSIS
  // ============================================================================

  private analyzeDriving(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    // Fairway percentage
    if (stats.fairwayPercentage !== null && stats.fairwayPercentage < BENCHMARKS.fairwayPct - 10) {
      const deficit = BENCHMARKS.fairwayPct - stats.fairwayPercentage;
      // Each missed fairway costs ~0.3-0.5 strokes based on GIR differential
      const strokesLost = deficit / 100 * 14 * 0.4;

      insights.push({
        id: 'driving-fairway-pct',
        playerId: this.playerId,
        category: 'driving',
        headline: 'Fairway Accuracy Issue',
        body: `Hitting ${stats.fairwayPercentage.toFixed(0)}% fairways (target: ${BENCHMARKS.fairwayPct}%). Missed fairways lead to harder approach shots and reduced GIR.`,
        strokeImpact: strokesLost,
        recommendation: 'Consider accuracy over distance from the tee. Hitting more fairways sets up easier approaches and more birdie chances.',
        priority: strokesLost > 0.8 ? 'high' : 'medium',
        confidence: 0.8,
        evidenceMetrics: [
          { label: 'Fairway %', value: `${stats.fairwayPercentage.toFixed(0)}%`, benchmark: BENCHMARKS.fairwayPct },
          { label: 'Fairways/Round', value: stats.fairwaysHitPerRound?.toFixed(1) ?? 'N/A' },
        ],
        comparisonToBenchmark: {
          playerValue: stats.fairwayPercentage,
          benchmark: BENCHMARKS.fairwayPct,
          unit: '%',
          delta: -deficit,
        },
      });
    }

    // Miss direction pattern
    if (stats.missLeftPct !== null && stats.missRightPct !== null) {
      const totalMisses = stats.missLeftCount + stats.missRightCount;
      if (totalMisses >= 15) {
        const dominantMiss = stats.missLeftPct > stats.missRightPct ? 'left' : 'right';
        const dominantPct = Math.max(stats.missLeftPct, stats.missRightPct);

        if (dominantPct > 60) {
          insights.push({
            id: `driving-miss-${dominantMiss}`,
            playerId: this.playerId,
            category: 'driving',
            headline: `Dominant Miss ${dominantMiss === 'left' ? 'Left' : 'Right'} off Tee`,
            body: `${dominantPct.toFixed(0)}% of your tee shot misses go ${dominantMiss}. A predictable miss can be managed through course strategy, but fixing the root cause would be more valuable.`,
            strokeImpact: 0.3,
            recommendation: dominantMiss === 'left'
              ? 'Check your grip (may be too strong), alignment, and swing path. Left misses often come from over-the-top moves or closed face.'
              : 'Check for an open club face at impact or an in-to-out swing path. Right misses often indicate a block or push-fade.',
            priority: 'medium',
            confidence: 0.7,
            evidenceMetrics: [
              { label: `Miss ${dominantMiss === 'left' ? 'Left' : 'Right'}`, value: `${dominantPct.toFixed(0)}%` },
              { label: 'Total Misses Analyzed', value: totalMisses },
            ],
          });
        }
      }
    }

    // Penalties per round
    if (stats.penaltiesPerRound !== null && stats.penaltiesPerRound > BENCHMARKS.penaltiesPerRound + 0.3) {
      const excessPenalties = stats.penaltiesPerRound - BENCHMARKS.penaltiesPerRound;
      insights.push({
        id: 'driving-penalties',
        playerId: this.playerId,
        category: 'driving',
        headline: 'Penalty Strokes Adding Up',
        body: `Averaging ${stats.penaltiesPerRound.toFixed(1)} penalties per round. Each penalty is a free stroke to the field. Reducing penalties is the fastest way to lower scores.`,
        strokeImpact: excessPenalties,
        recommendation: 'Analyze where penalties occur. Consider safer club selection or aim in penalty-prone situations. Course management > heroic shots.',
        priority: excessPenalties > 0.5 ? 'high' : 'medium',
        confidence: 0.9,
        evidenceMetrics: [
          { label: 'Penalties/Round', value: stats.penaltiesPerRound.toFixed(1), benchmark: BENCHMARKS.penaltiesPerRound },
          { label: 'Total Penalties', value: stats.totalPenalties },
        ],
        comparisonToBenchmark: {
          playerValue: stats.penaltiesPerRound,
          benchmark: BENCHMARKS.penaltiesPerRound,
          unit: 'per round',
          delta: excessPenalties,
        },
      });
    }

    return insights;
  }

  // ============================================================================
  // SCRAMBLING ANALYSIS
  // ============================================================================

  private analyzeScrambling(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    // Overall scrambling
    if (stats.scramblingPercentage !== null && stats.scramblingPercentage < BENCHMARKS.scramblingPct - 10) {
      const deficit = BENCHMARKS.scramblingPct - stats.scramblingPercentage;
      // Average ~6 scramble opportunities per round
      const strokesLost = deficit / 100 * 6;

      insights.push({
        id: 'scrambling-overall',
        playerId: this.playerId,
        category: 'scrambling',
        headline: 'Scrambling Below Target',
        body: `Scrambling at ${stats.scramblingPercentage.toFixed(0)}% (target: ${BENCHMARKS.scramblingPct}%). When you miss greens, you need to save par to limit damage. Improving scrambling is critical for scoring.`,
        strokeImpact: strokesLost,
        recommendation: 'Focus on up-and-down practice. The key is getting the chip/pitch close enough to eliminate the second putt pressure.',
        priority: strokesLost > 0.5 ? 'high' : 'medium',
        confidence: 0.85,
        evidenceMetrics: [
          { label: 'Scrambling %', value: `${stats.scramblingPercentage.toFixed(0)}%`, benchmark: BENCHMARKS.scramblingPct },
          { label: 'Scrambles Made', value: `${stats.scramblesMade}/${stats.scrambleAttempts}` },
        ],
        comparisonToBenchmark: {
          playerValue: stats.scramblingPercentage,
          benchmark: BENCHMARKS.scramblingPct,
          unit: '%',
          delta: -deficit,
        },
      });
    }

    // Sand save percentage
    if (stats.sandSavePercentage !== null && stats.sandSavePercentage < BENCHMARKS.sandSavePct - 10 && stats.sandSaveAttempts >= 5) {
      const deficit = BENCHMARKS.sandSavePct - stats.sandSavePercentage;
      insights.push({
        id: 'scrambling-sand',
        playerId: this.playerId,
        category: 'scrambling',
        headline: 'Sand Saves Need Work',
        body: `Sand save rate: ${stats.sandSavePercentage.toFixed(0)}% (target: ${BENCHMARKS.sandSavePct}%). Greenside bunkers are scoring killers when you can't get up and down.`,
        strokeImpact: deficit / 100 * (stats.sandSaveAttempts / stats.roundsPlayed),
        recommendation: 'Dedicate practice to greenside bunker play. Focus on consistent technique: open face, accelerate through sand, follow through.',
        priority: 'medium',
        confidence: 0.75,
        evidenceMetrics: [
          { label: 'Sand Save %', value: `${stats.sandSavePercentage.toFixed(0)}%`, benchmark: BENCHMARKS.sandSavePct },
          { label: 'Sand Saves', value: `${stats.sandSavesMade}/${stats.sandSaveAttempts}` },
        ],
        comparisonToBenchmark: {
          playerValue: stats.sandSavePercentage,
          benchmark: BENCHMARKS.sandSavePct,
          unit: '%',
          delta: -deficit,
        },
      });
    }

    // Scrambling by lie
    if (stats.scramblingPctRough !== null && stats.scramblingPctFairway !== null) {
      const roughDeficit = stats.scramblingPctFairway - stats.scramblingPctRough;
      if (roughDeficit > 20 && stats.scramblingPctRough < 40) {
        insights.push({
          id: 'scrambling-rough',
          playerId: this.playerId,
          category: 'scrambling',
          headline: 'Scrambling from Rough',
          body: `Scrambling from rough: ${stats.scramblingPctRough.toFixed(0)}% vs from fairway-lie: ${stats.scramblingPctFairway.toFixed(0)}%. Rough lies are significantly harder for you to get up and down.`,
          strokeImpact: roughDeficit / 100 * 3, // Estimate 3 rough scrambles/round
          recommendation: 'Practice chip shots from rough. Adjust technique: ball back in stance, steeper swing, commit to acceleration through the grass.',
          priority: 'medium',
          confidence: 0.7,
          evidenceMetrics: [
            { label: 'Scrambling from Rough', value: `${stats.scramblingPctRough.toFixed(0)}%` },
            { label: 'Scrambling from Fairway', value: `${stats.scramblingPctFairway.toFixed(0)}%` },
          ],
        });
      }
    }

    return insights;
  }

  // ============================================================================
  // PRESSURE PERFORMANCE ANALYSIS
  // ============================================================================

  private analyzePressurePerformance(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    // Qualifying vs Practice scoring differential
    if (stats.qualifyingScoringAvg !== null && stats.practiceScoringAvg !== null &&
        stats.qualifyingRounds >= 2 && stats.practiceRounds >= 2) {
      const differential = stats.qualifyingScoringAvg - stats.practiceScoringAvg;

      if (differential > BENCHMARKS.qualifyingVsPractice) {
        insights.push({
          id: 'pressure-qualifying-gap',
          playerId: this.playerId,
          category: 'pressure',
          headline: 'Qualifying Round Performance Gap',
          body: `You score ${differential.toFixed(1)} strokes higher in qualifying (${stats.qualifyingScoringAvg.toFixed(1)}) than practice (${stats.practiceScoringAvg.toFixed(1)}). This suggests pressure affects your performance.`,
          strokeImpact: differential - BENCHMARKS.qualifyingVsPractice,
          recommendation: 'Work on mental game and pre-shot routine consistency. Consider simulating pressure in practice (consequences for missed shots).',
          priority: differential > 3 ? 'high' : 'medium',
          confidence: Math.min(0.85, 0.5 + (stats.qualifyingRounds + stats.practiceRounds) * 0.03),
          evidenceMetrics: [
            { label: 'Qualifying Avg', value: stats.qualifyingScoringAvg.toFixed(1) },
            { label: 'Practice Avg', value: stats.practiceScoringAvg.toFixed(1) },
            { label: 'Gap', value: `+${differential.toFixed(1)} strokes` },
            { label: 'Qualifying Rounds', value: stats.qualifyingRounds },
          ],
        });
      }
    }

    // Tournament vs Practice (if tournament data exists)
    if (stats.tournamentScoringAvg !== null && stats.practiceScoringAvg !== null &&
        stats.tournamentRounds >= 2 && stats.practiceRounds >= 2) {
      const differential = stats.tournamentScoringAvg - stats.practiceScoringAvg;

      if (differential > BENCHMARKS.qualifyingVsPractice + 0.5) {
        insights.push({
          id: 'pressure-tournament-gap',
          playerId: this.playerId,
          category: 'pressure',
          headline: 'Tournament Performance Gap',
          body: `Tournament scoring (${stats.tournamentScoringAvg.toFixed(1)}) is ${differential.toFixed(1)} strokes higher than practice (${stats.practiceScoringAvg.toFixed(1)}). Competition nerves may be a factor.`,
          strokeImpact: differential - (BENCHMARKS.qualifyingVsPractice + 0.5),
          recommendation: 'Build tournament experience and mental routines. Focus on process over outcomes. Consider sports psychology support.',
          priority: differential > 3.5 ? 'high' : 'medium',
          confidence: Math.min(0.85, 0.5 + (stats.tournamentRounds + stats.practiceRounds) * 0.03),
          evidenceMetrics: [
            { label: 'Tournament Avg', value: stats.tournamentScoringAvg.toFixed(1) },
            { label: 'Practice Avg', value: stats.practiceScoringAvg.toFixed(1) },
            { label: 'Gap', value: `+${differential.toFixed(1)} strokes` },
            { label: 'Tournament Rounds', value: stats.tournamentRounds },
          ],
        });
      }
    }

    return insights;
  }

  // ============================================================================
  // SCORING PATTERN ANALYSIS
  // ============================================================================

  private analyzeScoringPatterns(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    // Double bogey or worse rate
    if (stats.doublePlusPerRound !== null && stats.doublePlusPerRound > 1.5) {
      insights.push({
        id: 'scoring-big-numbers',
        playerId: this.playerId,
        category: 'scoring',
        headline: 'Big Numbers Hurting Scores',
        body: `Averaging ${stats.doublePlusPerRound.toFixed(1)} doubles or worse per round. Eliminating "blow-up" holes is the fastest path to lower scores. One less double saves a full stroke.`,
        strokeImpact: Math.max(0, stats.doublePlusPerRound - 1), // 1 double/round is acceptable
        recommendation: 'When in trouble, take your medicine. Play the highest percentage shot to limit damage rather than attempting hero shots.',
        priority: stats.doublePlusPerRound > 2 ? 'high' : 'medium',
        confidence: 0.9,
        evidenceMetrics: [
          { label: 'Doubles+/Round', value: stats.doublePlusPerRound.toFixed(1) },
          { label: 'Total Doubles+', value: stats.totalDoublePlus },
        ],
      });
    }

    // Birdie rate
    if (stats.birdiesPerRound !== null && stats.birdiesPerRound < 2 && stats.roundsPlayed >= 3) {
      insights.push({
        id: 'scoring-birdie-rate',
        playerId: this.playerId,
        category: 'scoring',
        headline: 'Birdie Opportunities',
        body: `Averaging ${stats.birdiesPerRound.toFixed(1)} birdies per round. Increasing birdie rate requires both better approach shots (closer to the hole) and improved putting inside 10 feet.`,
        strokeImpact: Math.max(0, 2 - stats.birdiesPerRound),
        recommendation: 'Focus on par 5 birdie conversion - these are the best birdie chances. Also work on 5-10 foot make percentage for more converted birdie putts.',
        priority: 'medium',
        confidence: 0.75,
        evidenceMetrics: [
          { label: 'Birdies/Round', value: stats.birdiesPerRound.toFixed(1) },
          { label: 'Eagles/Round', value: stats.eaglesPerRound?.toFixed(2) ?? '0' },
          { label: 'Total Birdies', value: stats.totalBirdies },
        ],
      });
    }

    // Par 5 scoring (should be under par on average)
    if (stats.girPctPar5 !== null && stats.girPctPar5 < BENCHMARKS.girPctPar5 - 15) {
      insights.push({
        id: 'scoring-par5-gir',
        playerId: this.playerId,
        category: 'scoring',
        headline: 'Par 5 GIR Opportunity',
        body: `Par 5 GIR: ${stats.girPctPar5.toFixed(0)}% (target: ${BENCHMARKS.girPctPar5}%). Par 5s should be your best birdie opportunities. Missing greens here turns birdies into pars or worse.`,
        strokeImpact: (BENCHMARKS.girPctPar5 - stats.girPctPar5) / 100 * 4 * 0.3, // 4 par 5s, 0.3 strokes each
        recommendation: 'On par 5s, play strategically for GIR in 2 or 3. Avoid hero shots that lead to trouble. Layup to your best yardage when needed.',
        priority: 'medium',
        confidence: 0.8,
        evidenceMetrics: [
          { label: 'Par 5 GIR', value: `${stats.girPctPar5.toFixed(0)}%`, benchmark: BENCHMARKS.girPctPar5 },
        ],
      });
    }

    return insights;
  }

  // ============================================================================
  // ROOT CAUSE CHAIN ANALYSIS
  // Cross-references related stats to find the actual root cause instead of
  // reporting 4 separate symptoms. Answers: "WHY is this metric bad?"
  // ============================================================================

  private analyzeRootCauseChains(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    // Chain 1: Driving → Approach → Scrambling → Big Numbers
    // If fairway% is low AND GIR-from-rough is much worse than GIR-from-fairway,
    // the root cause of poor scoring is driving, not iron play.
    if (
      stats.fairwayPercentage !== null &&
      stats.girPctFromFairway !== null &&
      stats.girPctFromRough !== null &&
      stats.girCountFromFairway >= 20 && stats.girCountFromRough >= 15 &&
      stats.scramblingPercentage !== null
    ) {
      const fwPct = stats.fairwayPercentage;
      const girGap = stats.girPctFromFairway - stats.girPctFromRough;
      const missedFairwayRate = 100 - fwPct;

      // Only trigger when driving is genuinely causing a cascade
      if (fwPct < 55 && girGap > 20) {
        // Calculate cascade: missed fairways → rough approaches → missed GIR → scramble attempts
        const roughApproachesPerRound = (missedFairwayRate / 100) * 14; // ~14 fairway holes
        const extraGirMissesFromRough = roughApproachesPerRound * (girGap / 100);
        const scrambleFailRate = stats.scramblingPercentage < 50
          ? (100 - stats.scramblingPercentage) / 100
          : 0.45;
        const strokeCostFromChain = extraGirMissesFromRough * scrambleFailRate;

        if (strokeCostFromChain > 0.5) {
          const chainSteps: string[] = [];
          chainSteps.push(`Hitting ${fwPct.toFixed(0)}% fairways (${missedFairwayRate.toFixed(0)}% miss rate)`);
          chainSteps.push(`GIR from rough is ${stats.girPctFromRough.toFixed(0)}% vs ${stats.girPctFromFairway.toFixed(0)}% from fairway (${girGap.toFixed(0)}% gap)`);
          chainSteps.push(`This creates ~${extraGirMissesFromRough.toFixed(1)} extra missed greens per round`);
          if (stats.scramblingPercentage < 50) {
            chainSteps.push(`Scrambling at only ${stats.scramblingPercentage.toFixed(0)}% means most of these become bogey or worse`);
          }

          insights.push({
            id: 'root-cause-driving-cascade',
            playerId: this.playerId,
            category: 'driving',
            headline: 'Likely Root Cause: Driving Accuracy Impact',
            body: `Data suggests your scoring issues likely trace back to the tee. ${chainSteps.join('. ')}. Estimated cascade cost: ~${strokeCostFromChain.toFixed(1)} strokes per round. Improving fairway accuracy would likely improve your approach play, reduce scrambling pressure, and cut big numbers.`,
            strokeImpact: strokeCostFromChain,
            recommendation: `Priority #1 is hitting more fairways. Consider: (1) Hitting 3-wood on tight holes — fairway from 260 yards beats rough from 285. (2) Aim for the wide side of fairways, not the center. (3) Work on consistent tee shot shape rather than chasing distance.`,
            priority: strokeCostFromChain > 1 ? 'critical' : 'high',
            confidence: 0.88,
            evidenceMetrics: [
              { label: 'Fairway %', value: `${fwPct.toFixed(0)}%`, benchmark: BENCHMARKS.fairwayPct },
              { label: 'GIR from Fairway', value: `${stats.girPctFromFairway.toFixed(0)}%` },
              { label: 'GIR from Rough', value: `${stats.girPctFromRough.toFixed(0)}%` },
              { label: 'Cascade Cost', value: `${strokeCostFromChain.toFixed(1)} strokes/round` },
            ],
          });
        }
      }
    }

    // Chain 2: Good approach but bad putting = leaving birdies on the table
    // If GIR is solid but putts-per-GIR is high, the approach game is being
    // wasted by poor putting conversion.
    if (
      stats.girPercentage !== null &&
      stats.puttsPerGir !== null &&
      stats.puttMakePct5_10 !== null &&
      stats.birdiesPerRound !== null
    ) {
      const girSolid = stats.girPercentage >= BENCHMARKS.girPct - 5;
      const puttingWeak = stats.puttsPerGir > 1.85; // 1.75 is good, 1.85+ is costing strokes

      if (girSolid && puttingWeak) {
        const excessPuttsPerGir = stats.puttsPerGir - 1.75;
        const girsPerRound = stats.girPerRound ?? (stats.girPercentage / 100 * this.getHolesPerRound(stats));
        const strokesWasted = excessPuttsPerGir * girsPerRound;

        const bodyParts: string[] = [];
        bodyParts.push(`Your approach game is solid — ${stats.girPercentage.toFixed(0)}% GIR gives you plenty of birdie looks.`);
        bodyParts.push(`But you're taking ${stats.puttsPerGir.toFixed(2)} putts per GIR (target: 1.75).`);
        if (stats.puttMakePct5_10 < BENCHMARKS.puttMake5_10 - 5) {
          bodyParts.push(`Key issue: only making ${stats.puttMakePct5_10.toFixed(0)}% from 5-10 feet (benchmark: ${BENCHMARKS.puttMake5_10}%) — these are your birdie putts.`);
        }
        bodyParts.push(`Based on your data, you're likely leaving ~${strokesWasted.toFixed(1)} strokes per round on the table by not converting the opportunities your iron play creates.`);

        insights.push({
          id: 'root-cause-wasted-approach',
          playerId: this.playerId,
          category: 'putting',
          headline: 'Likely Root Cause: Putting Conversion Limiting Iron Play',
          body: bodyParts.join(' '),
          strokeImpact: strokesWasted,
          recommendation: `Your approach game is a strength — don't change it. Focus ALL practice improvement on putting: (1) 5-10 foot make rate is your biggest ROI zone. (2) Work on start line consistency with gate drills. (3) Speed control: practice leaving every putt 6-12 inches past the cup.`,
          priority: strokesWasted > 0.8 ? 'high' : 'medium',
          confidence: 0.85,
          evidenceMetrics: [
            { label: 'GIR %', value: `${stats.girPercentage.toFixed(0)}%` },
            { label: 'Putts per GIR', value: stats.puttsPerGir.toFixed(2), benchmark: 1.75 },
            { label: 'Make % (5-10ft)', value: `${stats.puttMakePct5_10?.toFixed(0) ?? 'N/A'}%`, benchmark: BENCHMARKS.puttMake5_10 },
            { label: 'Strokes Wasted', value: `${strokesWasted.toFixed(1)}/round` },
          ],
        });
      }
    }

    // Chain 3: Approach miss direction + club selection = systematic error
    // If approach misses are predominantly short AND from a specific distance zone,
    // it's a club selection issue, not a swing issue.
    if (
      stats.approachMissShortPct !== null &&
      stats.approachMissTotal > 30
    ) {
      const shortMissPct = stats.approachMissShortPct;
      // Combine short-left and short-right with short
      const totalShortMissPct = shortMissPct +
        (stats.approachMissShortLeftPct ?? 0) +
        (stats.approachMissShortRightPct ?? 0);

      if (totalShortMissPct > 45) {
        // Find which distance zones are worst
        const weakZones: string[] = [];
        const girByDist = [
          { range: '125-150', pct: stats.girPct125_150, bench: BENCHMARKS.girPct125_150 },
          { range: '150-175', pct: stats.girPct150_175, bench: BENCHMARKS.girPct150_175 },
          { range: '175-200', pct: stats.girPct175_200, bench: BENCHMARKS.girPct175_200 },
        ];
        for (const zone of girByDist) {
          if (zone.pct !== null && zone.pct < zone.bench - 10) {
            weakZones.push(`${zone.range} yards (${zone.pct.toFixed(0)}% GIR)`);
          }
        }

        const body = weakZones.length > 0
          ? `${totalShortMissPct.toFixed(0)}% of approach misses are short (including short-left/right). Worst distance zones: ${weakZones.join(', ')}. This pattern strongly suggests under-clubbing — you're consistently taking one club too little. From rough, the problem compounds because grass grabs the clubface and reduces distance further.`
          : `${totalShortMissPct.toFixed(0)}% of approach misses are short. This is the #1 sign of under-clubbing. The average amateur/college golfer takes 1 club too few on approach shots. Factor in: (1) shots rarely come out as pure as on the range, (2) rough reduces carry 5-10%, (3) the front of greens is always harder to hold.`;

        insights.push({
          id: 'root-cause-club-selection',
          playerId: this.playerId,
          category: 'approach',
          headline: 'Likely Root Cause: Club Selection Pattern',
          body,
          strokeImpact: totalShortMissPct / 100 * (stats.approachMissTotal / stats.roundsPlayed) * 0.4,
          recommendation: `Rule of thumb: when between clubs, ALWAYS take more club and swing smooth. Specific drills: (1) On the range, note your AVERAGE carry, not your best carry — that's your real number. (2) From rough, add 1 full club. (3) Front pin = aim middle of green. Back pin = aim at pin. Never short-side yourself.`,
          priority: 'high',
          confidence: 0.82,
          evidenceMetrics: [
            { label: 'Short Miss %', value: `${totalShortMissPct.toFixed(0)}%` },
            { label: 'Total Misses', value: stats.approachMissTotal },
            ...(weakZones.length > 0
              ? [{ label: 'Weakest Zones', value: weakZones[0] ?? '' }]
              : []),
          ],
        });
      }
    }

    return insights;
  }

  // ============================================================================
  // PUTTING BREAK WEAKNESS ANALYSIS
  // Uses puttingByBreak data to find specific break types that are costing strokes
  // ============================================================================

  private analyzePuttingBreakWeakness(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    const breakTypes = [
      { name: 'Left-to-Right', key: 'left_to_right' as const, data: stats.puttingByBreak.left_to_right },
      { name: 'Right-to-Left', key: 'right_to_left' as const, data: stats.puttingByBreak.right_to_left },
      { name: 'Straight', key: 'straight' as const, data: stats.puttingByBreak.straight },
    ];

    // Need enough putting data to be meaningful
    const totalAnalyzed = breakTypes.reduce((sum, bt) => sum + bt.data.totalPutts, 0);
    if (totalAnalyzed < 30) return insights;

    // Find the weakest break type in the scoring zone (5-10 feet)
    // Require at least 15 total putts per break type AND at least 8 putts
    // specifically in the 5-10ft range to produce a meaningful comparison
    const scoringZoneStats = breakTypes
      .filter(bt => {
        if (bt.data.makePct5_10 === null || bt.data.totalPutts < 15) return false;
        // Require minimum 8 putts in the 5-10ft range for this break type
        if (bt.data.count5_10 < 8) return false;
        return true;
      })
      .map(bt => ({
        ...bt,
        makePct5_10: bt.data.makePct5_10!,
      }));

    if (scoringZoneStats.length < 2) return insights;

    // Sort by worst make percentage
    scoringZoneStats.sort((a, b) => a.makePct5_10 - b.makePct5_10);
    const worst = scoringZoneStats[0]!;
    const best = scoringZoneStats[scoringZoneStats.length - 1]!;
    const gap = best.makePct5_10 - worst.makePct5_10;

    // Only report if there's a meaningful gap between break types
    if (gap > 12 && worst.makePct5_10 < 35) {
      const bodyParts: string[] = [];
      bodyParts.push(`From 5-10 feet, you make ${worst.makePct5_10.toFixed(0)}% of ${worst.name.toLowerCase()} breaking putts but ${best.makePct5_10.toFixed(0)}% of ${best.name.toLowerCase()} putts.`);

      // Diagnose WHY using miss data
      if (worst.data.missLowPct !== null && worst.data.missLowPct > 55) {
        bodyParts.push(`You're missing low (under-reading the break) ${worst.data.missLowPct.toFixed(0)}% of the time. You're not playing enough break on ${worst.name.toLowerCase()} putts.`);
      } else if (worst.data.missHighPct !== null && worst.data.missHighPct > 55) {
        bodyParts.push(`You're missing high (over-reading the break) ${worst.data.missHighPct.toFixed(0)}% of the time. You're playing too much break on ${worst.name.toLowerCase()} putts.`);
      } else if (worst.data.missShortPct !== null && worst.data.missShortPct > 50) {
        bodyParts.push(`${worst.data.missShortPct.toFixed(0)}% of these misses are short — you're decelerating on this break type, likely because you're unsure of the read.`);
      }

      // Estimate stroke impact: ~2-3 putts of this break type per round in scoring range
      const strokeImpact = gap / 100 * 2.5;

      let recommendation: string;
      if (worst.data.missLowPct !== null && worst.data.missLowPct > 55) {
        recommendation = `On ${worst.name.toLowerCase()} putts, play 20-30% more break than your first read. Drill: place a tee 2 inches outside the high side of the cup — putt to the tee, not the hole. Train your eyes to see more break.`;
      } else if (worst.data.missHighPct !== null && worst.data.missHighPct > 55) {
        recommendation = `On ${worst.name.toLowerCase()} putts, trust your initial read more — you're overcorrecting. Drill: read the putt, commit, and don't add extra break at the last second. Focus on speed control to let the ball die into the hole.`;
      } else {
        recommendation = `Practice ${worst.name.toLowerCase()} breaking putts from 5-10 feet specifically. Set up 10 balls at this distance and track your make rate. Goal: match your ${best.name.toLowerCase()} putt performance of ${best.makePct5_10.toFixed(0)}%.`;
      }

      insights.push({
        id: `putting-break-weakness-${worst.key}`,
        playerId: this.playerId,
        category: 'putting',
        headline: `Putting Weakness: ${worst.name} Breaking Putts`,
        body: bodyParts.join(' '),
        strokeImpact,
        recommendation,
        priority: strokeImpact > 0.5 ? 'high' : 'medium',
        confidence: 0.80,
        evidenceMetrics: [
          { label: `${worst.name} Make % (5-10ft)`, value: `${worst.makePct5_10.toFixed(0)}%` },
          { label: `${best.name} Make % (5-10ft)`, value: `${best.makePct5_10.toFixed(0)}%` },
          { label: 'Gap', value: `${gap.toFixed(0)}%` },
          ...(worst.data.missLowPct !== null && worst.data.missLowPct > 50
            ? [{ label: 'Under-Read Rate', value: `${worst.data.missLowPct.toFixed(0)}%` }]
            : []),
        ],
      });
    }

    return insights;
  }

  // ============================================================================
  // PAR TYPE PROFILING
  // Analyzes par-3/4/5 scoring with cross-referenced stats to explain WHY
  // ============================================================================

  private analyzeParTypeProfile(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    // Par 5 analysis: should be scoring opportunities
    if (stats.girPctPar5 !== null && stats.fairwayPctPar5 !== null) {
      const par5Gir = stats.girPctPar5;
      const par5Fw = stats.fairwayPctPar5;

      // Cross-reference: low par 5 GIR + low par 5 fairway = tee-to-green breakdown
      if (par5Gir < BENCHMARKS.girPctPar5 - 10 || par5Fw < 50) {
        // Estimate stroke leak: competitive golfers should GIR ~65-70% on par 5s
        const girGap = Math.max(0, BENCHMARKS.girPctPar5 - par5Gir);
        const strokesLeak = (girGap / 100) * 4 * 0.4; // ~4 par 5s/round, each missed GIR costs ~0.4 strokes

        const bodyParts: string[] = [];
        bodyParts.push(`Par 5s should be your best birdie chances, but you're hitting only ${par5Gir.toFixed(0)}% GIR (target: ${BENCHMARKS.girPctPar5}%).`);

        if (par5Fw < 50) {
          bodyParts.push(`The problem starts on the tee: only ${par5Fw.toFixed(0)}% fairways on par 5s. Missing the fairway on par 5s turns birdie opportunities into bogey risks because your second shot is compromised.`);
        } else if (par5Gir < 55) {
          bodyParts.push(`You're finding fairways (${par5Fw.toFixed(0)}%) but not converting to greens (${par5Gir.toFixed(0)}% GIR). This points to poor second-shot distance or club selection on par 5 approaches.`);
        }

        insights.push({
          id: 'par-type-par5-scoring',
          playerId: this.playerId,
          category: 'scoring',
          headline: 'Par 5s: Turning Birdie Holes into Bogey Holes',
          body: bodyParts.join(' '),
          strokeImpact: strokesLeak,
          recommendation: `Par 5 strategy: (1) Hit fairway first — 3-wood is fine if driver isn't reliable. (2) If you can't reach in 2, lay up to YOUR best wedge distance, not just "short of the green." (3) Par 5 birdies come from wedge proximity, not heroic second shots. A 100-yard wedge from the fairway > 220-yard wood from the rough.`,
          priority: strokesLeak > 0.5 ? 'high' : 'medium',
          confidence: 0.85,
          evidenceMetrics: [
            { label: 'Par 5 FW%', value: `${par5Fw.toFixed(0)}%`, benchmark: 60 },
            { label: 'Par 5 GIR%', value: `${par5Gir.toFixed(0)}%`, benchmark: BENCHMARKS.girPctPar5 },
          ],
        });
      }
    }

    // Par 3 analysis: pure iron play test
    if (stats.girPctPar3 !== null) {
      const par3Gir = stats.girPctPar3;

      if (par3Gir < BENCHMARKS.girPctPar3 - 10) {
        // Estimate stroke leak from poor par 3 play
        const girGap = BENCHMARKS.girPctPar3 - par3Gir;
        const strokesLeak = (girGap / 100) * 4 * 0.45; // ~4 par 3s/round, missed GIR on par 3 ~0.45 strokes

        const bodyParts: string[] = [];
        bodyParts.push(`Only ${par3Gir.toFixed(0)}% GIR on par 3s (benchmark: ${BENCHMARKS.girPctPar3}%).`);
        bodyParts.push(`Par 3s are a pure test of iron play — no driving variable. Low GIR here points to distance control or club selection issues with mid/long irons.`);

        // Check if approach miss direction gives a clue
        if (stats.approachMissShortPct !== null && stats.approachMissShortPct > 40) {
          bodyParts.push(`Your general approach miss tendency is short (${stats.approachMissShortPct.toFixed(0)}%) — on par 3s this likely means under-clubbing.`);
        }

        // Cross-reference approach proximity on par 3s
        if (stats.approachProximityPar3 !== null && stats.approachProximityPar3 > 30) {
          bodyParts.push(`Average proximity on par 3 tee shots is ${stats.approachProximityPar3.toFixed(0)} feet — that's too far to have realistic birdie putts.`);
        }

        insights.push({
          id: 'par-type-par3-scoring',
          playerId: this.playerId,
          category: 'approach',
          headline: 'Par 3s: Iron Play Costing Strokes',
          body: bodyParts.join(' '),
          strokeImpact: strokesLeak,
          recommendation: `Par 3 improvement: (1) Know your EXACT carry distances for every iron. (2) On par 3s, always aim center of green — chasing pins on par 3s creates short-sided misses. (3) Most par 3 GIR misses come from taking too little club — when in doubt, club up.`,
          priority: strokesLeak > 0.4 ? 'high' : 'medium',
          confidence: 0.80,
          evidenceMetrics: [
            { label: 'Par 3 GIR%', value: `${par3Gir.toFixed(0)}%`, benchmark: BENCHMARKS.girPctPar3 },
            ...(stats.approachProximityPar3 !== null ? [{ label: 'Par 3 Proximity', value: `${stats.approachProximityPar3.toFixed(0)} ft` }] : []),
          ],
        });
      }
    }

    return insights;
  }

  // ============================================================================
  // APPROACH BY LIE AND DISTANCE
  // Pinpoints the EXACT lie + distance combination where strokes are lost
  // ============================================================================

  private analyzeApproachByLieAndDistance(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    // Build a matrix of approach efficiency by distance + lie
    const distanceZones = [
      { range: '100-125', label: '100-125 yards', eff: stats.approachEff100_125, girPct: stats.girPct100_125, girBench: BENCHMARKS.girPct100_125 },
      { range: '125-150', label: '125-150 yards', eff: stats.approachEff125_150, girPct: stats.girPct125_150, girBench: BENCHMARKS.girPct125_150 },
      { range: '150-175', label: '150-175 yards', eff: stats.approachEff150_175, girPct: stats.girPct150_175, girBench: BENCHMARKS.girPct150_175 },
      { range: '175-200', label: '175-200 yards', eff: stats.approachEff175_200, girPct: stats.girPct175_200, girBench: BENCHMARKS.girPct175_200 },
    ];

    // Find zones where rough approach efficiency is dramatically worse than fairway
    for (const zone of distanceZones) {
      if (!zone.eff || zone.eff.fairway === null || zone.eff.rough === null) continue;

      const roughPenalty = zone.eff.rough - zone.eff.fairway;

      // A rough penalty of 0.5+ strokes means this player really struggles from rough at this distance
      if (roughPenalty > 0.5 && zone.eff.rough > 3.2) {
        insights.push({
          id: `approach-lie-distance-${zone.range}`,
          playerId: this.playerId,
          category: 'approach',
          headline: `Scoring Leak: Rough at ${zone.label}`,
          body: `From ${zone.label} in the rough, it takes an average of ${zone.eff.rough.toFixed(1)} strokes to hole out vs ${zone.eff.fairway.toFixed(1)} from the fairway — a ${roughPenalty.toFixed(1)} stroke penalty per occurrence. ${zone.girPct !== null ? `GIR from this zone is only ${zone.girPct.toFixed(0)}% (target: ${zone.girBench}%).` : ''} This specific distance+lie combination is one of your biggest stroke sinks.`,
          strokeImpact: roughPenalty * 1.5, // Estimate ~1.5 occurrences per round for a given zone
          recommendation: `Specific practice: hit approach shots from rough at ${zone.label}. Focus on: (1) Ball position — move it slightly back in stance for cleaner contact. (2) Take one more club — rough reduces carry 5-15 yards. (3) Accept center of green as the target from rough — don't chase pins.`,
          priority: roughPenalty > 0.7 ? 'high' : 'medium',
          confidence: 0.78,
          evidenceMetrics: [
            { label: 'From Fairway', value: `${zone.eff.fairway.toFixed(1)} strokes to hole out` },
            { label: 'From Rough', value: `${zone.eff.rough.toFixed(1)} strokes to hole out` },
            { label: 'Rough Penalty', value: `+${roughPenalty.toFixed(1)} strokes` },
          ],
        });
      }
    }

    // Find the single worst approach efficiency zone (regardless of lie)
    const allZoneEfficiencies = distanceZones
      .filter(z => z.girPct !== null && z.girBench !== undefined)
      .map(z => ({
        ...z,
        girDeficit: z.girBench - (z.girPct ?? 0),
      }))
      .filter(z => z.girDeficit > 15);

    if (allZoneEfficiencies.length > 0) {
      // Sort by GIR deficit (worst first)
      allZoneEfficiencies.sort((a, b) => b.girDeficit - a.girDeficit);
      const worstZone = allZoneEfficiencies[0]!;

      // Check if this zone has a specific lie problem or is universally bad
      const hasLieData = worstZone.eff &&
        worstZone.eff.fairway !== null &&
        worstZone.eff.rough !== null;

      let specificCause = '';
      if (hasLieData && worstZone.eff) {
        if (worstZone.eff.fairway !== null && worstZone.eff.fairway > 3.0) {
          specificCause = ` Even from the fairway at this distance, you take ${worstZone.eff.fairway.toFixed(1)} strokes to hole out — this suggests a club fitting or distance gapping issue at this yardage.`;
        } else if (worstZone.eff.rough !== null && worstZone.eff.rough > 3.5 && worstZone.eff.fairway !== null && worstZone.eff.fairway < 3.0) {
          specificCause = ` Your fairway efficiency is acceptable (${worstZone.eff.fairway.toFixed(1)}) but rough efficiency is poor (${worstZone.eff.rough.toFixed(1)}) — the problem is lie-specific, not distance-specific.`;
        }
      }

      insights.push({
        id: `approach-worst-zone-${worstZone.range}`,
        playerId: this.playerId,
        category: 'approach',
        headline: `Biggest Approach Weakness: ${worstZone.label}`,
        body: `GIR at ${worstZone.label}: ${worstZone.girPct?.toFixed(0)}% (benchmark: ${worstZone.girBench}%). This ${worstZone.girDeficit.toFixed(0)}% deficit is your worst distance zone.${specificCause} Focus your range sessions on this exact distance.`,
        strokeImpact: worstZone.girDeficit / 100 * 3 * 0.5,
        recommendation: `Dedicated practice: hit 20 balls to a target at ${worstZone.label} distance. Track how many land on a green-sized circle. Identify if it's a distance control issue (long/short) or direction issue (left/right). Also check: do you have a clear club for this distance, or does it fall in a gap between clubs?`,
        priority: 'high',
        confidence: 0.82,
        evidenceMetrics: [
          { label: `GIR ${worstZone.label}`, value: `${worstZone.girPct?.toFixed(0) ?? 'N/A'}%`, benchmark: worstZone.girBench },
          { label: 'Deficit', value: `${worstZone.girDeficit.toFixed(0)}% below benchmark` },
        ],
      });
    }

    return insights;
  }

  // ============================================================================
  // STROKE LEAKAGE ROI
  // Ranks ALL problems by projected strokes saved if improved to benchmark.
  // Answers: "If you could only work on ONE thing, what saves the most strokes?"
  // ============================================================================

  private analyzeStrokeLeakageROI(stats: GolfStats): StatsInsight[] {
    const insights: StatsInsight[] = [];

    // Build a leakage table: metric → strokes lost per round
    interface LeakageItem {
      area: string;
      category: StatsInsight['category'];
      currentValue: number;
      benchmark: number;
      unit: string;
      strokesLostPerRound: number;
      fixDescription: string;
      practiceAction: string;
    }

    const leakages: LeakageItem[] = [];

    // Putting: 3-putts
    if (stats.threePuttsPerRound !== null && stats.threePuttsPerRound > BENCHMARKS.threePuttsPerRound) {
      leakages.push({
        area: '3-Putt Elimination',
        category: 'putting',
        currentValue: stats.threePuttsPerRound,
        benchmark: BENCHMARKS.threePuttsPerRound,
        unit: 'per round',
        strokesLostPerRound: stats.threePuttsPerRound - BENCHMARKS.threePuttsPerRound,
        fixDescription: `Reduce 3-putts from ${stats.threePuttsPerRound.toFixed(1)} to ${BENCHMARKS.threePuttsPerRound}`,
        practiceAction: 'Lag putting from 30+ feet — leave everything inside 3 feet',
      });
    }

    // Putting: 5-10ft make rate
    if (stats.puttMakePct5_10 !== null && stats.puttMakePct5_10 < BENCHMARKS.puttMake5_10) {
      const delta = BENCHMARKS.puttMake5_10 - stats.puttMakePct5_10;
      leakages.push({
        area: '5-10ft Putt Conversion',
        category: 'putting',
        currentValue: stats.puttMakePct5_10,
        benchmark: BENCHMARKS.puttMake5_10,
        unit: '%',
        strokesLostPerRound: delta / 100 * 3.5,
        fixDescription: `Improve 5-10ft make rate from ${stats.puttMakePct5_10.toFixed(0)}% to ${BENCHMARKS.puttMake5_10}%`,
        practiceAction: '5-10 foot make drills — 10 balls, track percentage daily',
      });
    }

    // Short putts — require minimum 10 first putts in this bucket
    if (stats.puttMakePct0_3 !== null && stats.puttMakeCount0_3 >= 10 && stats.puttMakePct0_3 < BENCHMARKS.puttMake0_3) {
      const delta = BENCHMARKS.puttMake0_3 - stats.puttMakePct0_3;
      leakages.push({
        area: 'Short Putt Conversion (0-3ft)',
        category: 'putting',
        currentValue: stats.puttMakePct0_3,
        benchmark: BENCHMARKS.puttMake0_3,
        unit: '%',
        strokesLostPerRound: delta / 100 * 10,
        fixDescription: `Improve inside-3ft from ${stats.puttMakePct0_3.toFixed(0)}% to ${BENCHMARKS.puttMake0_3}%`,
        practiceAction: 'Pre-putt routine consistency — these are mental, not mechanical',
      });
    }

    // GIR
    if (stats.girPercentage !== null && stats.girPercentage < BENCHMARKS.girPct) {
      const deficit = BENCHMARKS.girPct - stats.girPercentage;
      leakages.push({
        area: 'Greens in Regulation',
        category: 'approach',
        currentValue: stats.girPercentage,
        benchmark: BENCHMARKS.girPct,
        unit: '%',
        strokesLostPerRound: deficit / 100 * this.getHolesPerRound(stats) * 0.5,
        fixDescription: `Improve GIR from ${stats.girPercentage.toFixed(0)}% to ${BENCHMARKS.girPct}%`,
        practiceAction: 'Approach shot distance control — know your exact carry numbers',
      });
    }

    // Fairway accuracy
    if (stats.fairwayPercentage !== null && stats.fairwayPercentage < BENCHMARKS.fairwayPct) {
      const deficit = BENCHMARKS.fairwayPct - stats.fairwayPercentage;
      leakages.push({
        area: 'Fairway Accuracy',
        category: 'driving',
        currentValue: stats.fairwayPercentage,
        benchmark: BENCHMARKS.fairwayPct,
        unit: '%',
        strokesLostPerRound: deficit / 100 * 14 * 0.4,
        fixDescription: `Improve fairways from ${stats.fairwayPercentage.toFixed(0)}% to ${BENCHMARKS.fairwayPct}%`,
        practiceAction: 'Tee shot accuracy — consider 3-wood on tight holes',
      });
    }

    // Scrambling
    if (stats.scramblingPercentage !== null && stats.scramblingPercentage < BENCHMARKS.scramblingPct) {
      const deficit = BENCHMARKS.scramblingPct - stats.scramblingPercentage;
      leakages.push({
        area: 'Scrambling',
        category: 'scrambling',
        currentValue: stats.scramblingPercentage,
        benchmark: BENCHMARKS.scramblingPct,
        unit: '%',
        strokesLostPerRound: deficit / 100 * 6,
        fixDescription: `Improve scrambling from ${stats.scramblingPercentage.toFixed(0)}% to ${BENCHMARKS.scramblingPct}%`,
        practiceAction: 'Up-and-down practice from various lies around the green',
      });
    }

    // Sand saves
    if (stats.sandSavePercentage !== null && stats.sandSavePercentage < BENCHMARKS.sandSavePct && stats.sandSaveAttempts >= 5) {
      const deficit = BENCHMARKS.sandSavePct - stats.sandSavePercentage;
      leakages.push({
        area: 'Sand Saves',
        category: 'scrambling',
        currentValue: stats.sandSavePercentage,
        benchmark: BENCHMARKS.sandSavePct,
        unit: '%',
        strokesLostPerRound: deficit / 100 * (stats.sandSaveAttempts / stats.roundsPlayed),
        fixDescription: `Improve sand saves from ${stats.sandSavePercentage.toFixed(0)}% to ${BENCHMARKS.sandSavePct}%`,
        practiceAction: 'Greenside bunker technique — open face, accelerate through',
      });
    }

    // Penalties
    if (stats.penaltiesPerRound !== null && stats.penaltiesPerRound > BENCHMARKS.penaltiesPerRound) {
      leakages.push({
        area: 'Penalty Reduction',
        category: 'driving',
        currentValue: stats.penaltiesPerRound,
        benchmark: BENCHMARKS.penaltiesPerRound,
        unit: 'per round',
        strokesLostPerRound: stats.penaltiesPerRound - BENCHMARKS.penaltiesPerRound,
        fixDescription: `Reduce penalties from ${stats.penaltiesPerRound.toFixed(1)} to ${BENCHMARKS.penaltiesPerRound}`,
        practiceAction: 'Course management — safer club/target selection in danger zones',
      });
    }

    // Big numbers (doubles+)
    if (stats.doublePlusPerRound !== null && stats.doublePlusPerRound > 1.0) {
      leakages.push({
        area: 'Big Number Elimination',
        category: 'scoring',
        currentValue: stats.doublePlusPerRound,
        benchmark: 1.0,
        unit: 'per round',
        strokesLostPerRound: (stats.doublePlusPerRound - 1.0) * 1.0, // each excess double = ~1 stroke
        fixDescription: `Reduce doubles+ from ${stats.doublePlusPerRound.toFixed(1)} to 1.0`,
        practiceAction: 'Course management — take medicine from trouble, avoid hero shots',
      });
    }

    // Pressure gap
    if (stats.qualifyingScoringAvg !== null && stats.practiceScoringAvg !== null &&
        stats.qualifyingRounds >= 2 && stats.practiceRounds >= 2) {
      const gap = stats.qualifyingScoringAvg - stats.practiceScoringAvg;
      if (gap > BENCHMARKS.qualifyingVsPractice) {
        leakages.push({
          area: 'Pressure Performance',
          category: 'pressure',
          currentValue: gap,
          benchmark: BENCHMARKS.qualifyingVsPractice,
          unit: 'stroke gap',
          strokesLostPerRound: gap - BENCHMARKS.qualifyingVsPractice,
          fixDescription: `Close qualifying gap from +${gap.toFixed(1)} to +${BENCHMARKS.qualifyingVsPractice}`,
          practiceAction: 'Mental game — pre-shot routine, simulated pressure in practice',
        });
      }
    }

    // Sort by stroke impact (highest first)
    leakages.sort((a, b) => b.strokesLostPerRound - a.strokesLostPerRound);

    // Only generate the ROI ranking if we have at least 3 leakage areas
    if (leakages.length >= 3) {
      const top3 = leakages.slice(0, 3);
      const totalRecoverable = leakages.reduce((sum, l) => sum + l.strokesLostPerRound, 0);

      const rankingLines = top3.map((leak, i) => {
        const pctOfTotal = (leak.strokesLostPerRound / totalRecoverable * 100).toFixed(0);
        return `#${i + 1}: ${leak.area} — save ${leak.strokesLostPerRound.toFixed(1)} strokes/round (${pctOfTotal}% of total leakage). Action: ${leak.practiceAction}`;
      });

      insights.push({
        id: 'roi-practice-priorities',
        playerId: this.playerId,
        category: 'scoring',
        headline: 'Practice Priorities: Where to Invest Your Time',
        body: `Total recoverable strokes: ${totalRecoverable.toFixed(1)} per round. Here's where your practice time gets the best return:\n\n${rankingLines.join('\n\n')}`,
        strokeImpact: top3[0]!.strokesLostPerRound, // Use #1 priority's impact for sorting
        recommendation: `Focus 50% of practice on "${top3[0]!.area}" — it's your single biggest scoring opportunity at ${top3[0]!.strokesLostPerRound.toFixed(1)} strokes per round. ${top3[0]!.practiceAction}.`,
        priority: 'critical',
        confidence: 0.90,
        evidenceMetrics: [
          { label: '#1 Priority', value: `${top3[0]!.area}: ${top3[0]!.strokesLostPerRound.toFixed(1)} strokes` },
          { label: '#2 Priority', value: `${top3[1]!.area}: ${top3[1]!.strokesLostPerRound.toFixed(1)} strokes` },
          { label: '#3 Priority', value: `${top3[2]!.area}: ${top3[2]!.strokesLostPerRound.toFixed(1)} strokes` },
          { label: 'Total Recoverable', value: `${totalRecoverable.toFixed(1)} strokes/round` },
        ],
      });
    }

    return insights;
  }
}

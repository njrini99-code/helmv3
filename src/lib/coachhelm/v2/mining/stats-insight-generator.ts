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
import type { MinedPattern, PatternType, PatternTrend } from '../types';

// Benchmarks for college/competitive golf
const BENCHMARKS = {
  // Strokes Gained per round (vs scratch/par)
  sgTotal: 0,           // Even with par
  sgTee: 0,
  sgApproach: 0,
  sgAroundGreen: 0,
  sgPutting: 0,

  // Putting make percentages (college level)
  puttMake0_3: 98,      // Inside 3 feet
  puttMake3_5: 75,      // 3-5 feet
  puttMake5_10: 45,     // 5-10 feet
  puttMake10_15: 25,    // 10-15 feet
  puttMake15_20: 15,    // 15-20 feet

  // GIR targets
  girPct: 60,           // Overall
  girPctPar3: 50,
  girPctPar4: 55,
  girPctPar5: 75,

  // GIR by distance
  girPct100_125: 70,    // 100-125 yards
  girPct125_150: 60,    // 125-150 yards
  girPct150_175: 50,    // 150-175 yards
  girPct175_200: 40,    // 175-200 yards

  // Driving
  fairwayPct: 60,

  // Scrambling
  scramblingPct: 55,
  sandSavePct: 45,

  // Putting efficiency (strokes to hole out)
  puttEff5_10: 1.5,     // Under 1.5 is good
  puttEff10_15: 1.8,
  puttEff15_20: 2.0,
  puttEff20_25: 2.1,

  // Three putts
  threePuttsPerRound: 0.8,

  // Penalties
  penaltiesPerRound: 0.5,

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
export interface HistoricalStats {
  periodStart: Date;
  periodEnd: Date;
  stats: Partial<GolfStats>;
}

/**
 * Team stats aggregation for comparison
 */
export interface TeamStatsAggregate {
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
   * Set time scope for insights
   */
  setTimeScope(scope: 'all_time' | 'season' | 'last_30_days' | 'last_7_days'): void {
    this.timeScope = scope;
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

    // 8. Trend-based insights (if historical data available)
    if (this.historicalStats) {
      insights.push(...this.analyzeTrends(stats));
    }

    // 9. Team comparison insights (if team data available)
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
          strokeImpact: isAboveAvg ? 0 : Math.abs(gapToAvg) / 100 * 18 * 0.3,
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
        strokeImpact: isImproving ? 0 : Math.abs(girTrend.magnitude) / 100 * 18 * 0.3,
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
        confidence: Math.min(0.9, 0.5 + stats.roundsPlayed * 0.04),
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
        confidence: Math.min(0.9, 0.5 + stats.roundsPlayed * 0.04),
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
        confidence: Math.min(0.9, 0.5 + stats.roundsPlayed * 0.04),
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

    // Inside 5 feet make percentage
    if (stats.puttMakePct0_3 !== null && stats.puttMakePct0_3 < BENCHMARKS.puttMake0_3) {
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
      // Each GIR miss typically costs ~0.5 strokes (scrambling vs 2-putt birdie chance)
      const strokesLost = (girDeficit / 100) * 18 * 0.5;

      insights.push({
        id: 'approach-gir-overall',
        playerId: this.playerId,
        category: 'approach',
        headline: 'GIR% Below Target',
        body: `Hitting ${stats.girPercentage.toFixed(0)}% greens in regulation (target: ${BENCHMARKS.girPct}%). Missing greens puts pressure on your short game and reduces birdie opportunities.`,
        strokeImpact: strokesLost,
        recommendation: 'Focus on approach shot consistency. Consider club selection - taking one more club often improves GIR without sacrificing much proximity.',
        priority: strokesLost > 1 ? 'high' : 'medium',
        confidence: Math.min(0.9, 0.5 + stats.roundsPlayed * 0.04),
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

    // GIR from fairway vs rough
    if (stats.girPctFromFairway !== null && stats.girPctFromRough !== null) {
      const fwRoughGap = stats.girPctFromFairway - stats.girPctFromRough;
      if (fwRoughGap > 25) {
        insights.push({
          id: 'approach-fairway-vs-rough',
          playerId: this.playerId,
          category: 'approach',
          headline: 'Large Fairway vs Rough GIR Gap',
          body: `GIR from fairway: ${stats.girPctFromFairway.toFixed(0)}%, from rough: ${stats.girPctFromRough.toFixed(0)}% (${fwRoughGap.toFixed(0)}% gap). Your iron play suffers significantly from the rough.`,
          strokeImpact: fwRoughGap / 100 * 6 * 0.5, // ~6 rough approaches/round
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
    if (stats.approachMissTotal > 20) {
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
      if (totalMisses >= 10) {
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
}

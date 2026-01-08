/**
 * Pattern Mining Engine
 *
 * Discovers non-obvious patterns from player data including:
 * - Conditional patterns (single condition → outcome)
 * - Compound patterns (multiple conditions → outcome)
 * - Anomaly patterns (unusual situations)
 * - Regression patterns (predictive correlations)
 */

import { createClient } from '@/lib/supabase/server';
import type {
  MinedPattern,
  PatternCondition,
  PatternOutcome,
  PatternType,
} from '../types';
import { extractAllFeatures } from '../features';

const THRESHOLDS = {
  minSupport: 0.1,
  minConfidence: 0.6,
  minLift: 1.5,
  minSampleSize: 10,
  minStrokeImpact: 0.3,
};

interface RoundData {
  id: string;
  total_to_par: number;
  round_date: string;
  round_type?: string | null;
  days_since_last?: number;
  putts?: number;
  fairways_hit?: number;
  greens_in_regulation?: number;
}

/**
 * Pattern Mining class for discovering patterns in player data
 */
export class PatternMiner {
  private playerId: string;
  private rounds: RoundData[] = [];

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /**
   * Main entry point - mines all pattern types for a player
   */
  async minePatterns(): Promise<MinedPattern[]> {
    const supabase = await createClient();

    // Load features (available for potential future use)
    await extractAllFeatures(this.playerId);

    // Load rounds with computed fields
    const { data: rounds, error } = await supabase
      .from('golf_rounds')
      .select('id, total_to_par, round_date, round_type, total_putts, fairways_hit, greens_in_regulation')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(100);

    if (error || !rounds || rounds.length < THRESHOLDS.minSampleSize) {
      return [];
    }

    // Compute days_since_last for each round
    this.rounds = this.computeDaysSinceLast(rounds.map(r => ({
      id: r.id,
      total_to_par: r.total_to_par ?? 0,
      round_date: r.round_date,
      round_type: r.round_type,
      putts: r.total_putts ?? undefined,
      fairways_hit: r.fairways_hit ?? undefined,
      greens_in_regulation: r.greens_in_regulation ?? undefined,
    })));

    // Mine different pattern types
    const [conditionalPatterns, compoundPatterns, anomalyPatterns] =
      await Promise.all([
        this.mineConditionalPatterns(),
        this.mineCompoundPatterns(),
        this.mineAnomalyPatterns(),
      ]);

    // Combine and deduplicate
    const allPatterns = [
      ...conditionalPatterns,
      ...compoundPatterns,
      ...anomalyPatterns,
    ];

    const deduplicatedPatterns = this.deduplicatePatterns(allPatterns);

    // Save patterns to database
    await this.savePatterns(deduplicatedPatterns);

    return deduplicatedPatterns;
  }

  /**
   * Computes days since last round for each round
   */
  private computeDaysSinceLast(rounds: RoundData[]): RoundData[] {
    const sorted = [...rounds].sort(
      (a, b) =>
        new Date(a.round_date).getTime() - new Date(b.round_date).getTime()
    );

    return sorted.map((round, index) => {
      if (index === 0) {
        return { ...round, days_since_last: 0 };
      }
      const prevRound = sorted[index - 1];
      if (!prevRound) {
        return { ...round, days_since_last: 0 };
      }
      const prevDate = new Date(prevRound.round_date);
      const currDate = new Date(round.round_date);
      const daysDiff = Math.floor(
        (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return { ...round, days_since_last: daysDiff };
    });
  }

  /**
   * Mines conditional patterns (single condition → outcome)
   */
  private async mineConditionalPatterns(): Promise<MinedPattern[]> {
    const patterns: MinedPattern[] = [];
    const baselineAvg = this.calculateBaseline();

    // Test various conditions
    const conditionsToTest: Array<{
      condition: PatternCondition;
      test: (r: RoundData) => boolean;
    }> = [
      // Rest/rust patterns
      {
        condition: {
          field: 'days_since_last',
          operator: 'gte',
          value: 7,
          label: 'After 7+ days off',
        },
        test: (r) => (r.days_since_last ?? 0) >= 7,
      },
      {
        condition: {
          field: 'days_since_last',
          operator: 'lte',
          value: 1,
          label: 'Back-to-back rounds',
        },
        test: (r) => (r.days_since_last ?? 0) <= 1,
      },
      // Round type patterns
      {
        condition: {
          field: 'round_type',
          operator: 'eq',
          value: 'tournament',
          label: 'In tournament',
        },
        test: (r) => r.round_type === 'tournament',
      },
      {
        condition: {
          field: 'round_type',
          operator: 'eq',
          value: 'qualifying',
          label: 'In qualifying',
        },
        test: (r) => r.round_type === 'qualifying',
      },
    ];

    for (const { condition, test } of conditionsToTest) {
      const matchingRounds = this.rounds.filter(test);

      if (matchingRounds.length < THRESHOLDS.minSampleSize) continue;

      const matchingAvg =
        matchingRounds.reduce((a, r) => a + r.total_to_par, 0) /
        matchingRounds.length;
      const strokeImpact = matchingAvg - baselineAvg;

      // Only include if significant impact
      if (Math.abs(strokeImpact) < THRESHOLDS.minStrokeImpact) continue;

      // Calculate statistical measures
      const support = matchingRounds.length / this.rounds.length;

      // Define "bad round" as +3 or worse
      const badThreshold = 3;
      const matchingBadRounds = matchingRounds.filter(
        (r) => r.total_to_par >= badThreshold
      ).length;
      const totalBadRounds = this.rounds.filter(
        (r) => r.total_to_par >= badThreshold
      ).length;

      const confidence =
        matchingRounds.length > 0
          ? matchingBadRounds / matchingRounds.length
          : 0;
      const expectedBad = totalBadRounds / this.rounds.length;
      const lift = expectedBad > 0 ? confidence / expectedBad : 1;

      if (
        support >= THRESHOLDS.minSupport &&
        confidence >= THRESHOLDS.minConfidence &&
        lift >= THRESHOLDS.minLift
      ) {
        patterns.push(
          this.createPattern(
            'conditional',
            [condition],
            {
              metric: 'total_to_par',
              direction: strokeImpact > 0 ? 'increase' : 'decrease',
              magnitude: Math.abs(strokeImpact),
              comparison: 'vs_baseline',
            },
            support,
            confidence,
            lift,
            strokeImpact,
            matchingRounds.length
          )
        );
      }
    }

    return patterns;
  }

  /**
   * Mines compound patterns (multiple conditions → outcome)
   */
  private async mineCompoundPatterns(): Promise<MinedPattern[]> {
    const patterns: MinedPattern[] = [];
    const baselineAvg = this.calculateBaseline();

    // Test combinations
    const compoundConditions: Array<{
      conditions: PatternCondition[];
      test: (r: RoundData) => boolean;
    }> = [
      // Rust + tournament pressure
      {
        conditions: [
          {
            field: 'days_since_last',
            operator: 'gte',
            value: 5,
            label: 'After 5+ days off',
          },
          {
            field: 'round_type',
            operator: 'eq',
            value: 'tournament',
            label: 'In tournament',
          },
        ],
        test: (r) =>
          (r.days_since_last ?? 0) >= 5 && r.round_type === 'tournament',
      },
      // High GIR but high putts (not capitalizing on greens)
      {
        conditions: [
          {
            field: 'greens_in_regulation',
            operator: 'gte',
            value: 12,
            label: 'GIR ≥12',
          },
          {
            field: 'putts',
            operator: 'gte',
            value: 34,
            label: 'Putts ≥34',
          },
        ],
        test: (r) =>
          (r.greens_in_regulation ?? 0) >= 12 && (r.putts ?? 0) >= 34,
      },
    ];

    for (const { conditions, test } of compoundConditions) {
      const matchingRounds = this.rounds.filter(test);

      if (matchingRounds.length < Math.max(5, THRESHOLDS.minSampleSize / 2))
        continue;

      const matchingAvg =
        matchingRounds.reduce((a, r) => a + r.total_to_par, 0) /
        matchingRounds.length;
      const strokeImpact = matchingAvg - baselineAvg;

      if (Math.abs(strokeImpact) < THRESHOLDS.minStrokeImpact) continue;

      const support = matchingRounds.length / this.rounds.length;
      const badThreshold = 3;
      const matchingBadRounds = matchingRounds.filter(
        (r) => r.total_to_par >= badThreshold
      ).length;
      const totalBadRounds = this.rounds.filter(
        (r) => r.total_to_par >= badThreshold
      ).length;

      const confidence =
        matchingRounds.length > 0
          ? matchingBadRounds / matchingRounds.length
          : 0;
      const expectedBad = totalBadRounds / this.rounds.length;
      const lift = expectedBad > 0 ? confidence / expectedBad : 1;

      // Lower thresholds for compound patterns
      if (support >= 0.05 && confidence >= 0.5 && lift >= 1.3) {
        patterns.push(
          this.createPattern(
            'compound',
            conditions,
            {
              metric: 'total_to_par',
              direction: strokeImpact > 0 ? 'increase' : 'decrease',
              magnitude: Math.abs(strokeImpact),
              comparison: 'vs_baseline',
            },
            support,
            confidence,
            lift,
            strokeImpact,
            matchingRounds.length
          )
        );
      }
    }

    return patterns;
  }

  /**
   * Mines anomaly patterns (unusual situations with unusual outcomes)
   */
  private async mineAnomalyPatterns(): Promise<MinedPattern[]> {
    const patterns: MinedPattern[] = [];
    const baselineAvg = this.calculateBaseline();
    const stdDev = this.calculateStdDev();

    // Find rounds that are statistical outliers
    const outlierThreshold = 2 * stdDev;

    for (const round of this.rounds) {
      const deviation = Math.abs(round.total_to_par - baselineAvg);

      if (deviation > outlierThreshold) {
        // This is an outlier - look for what made it unusual
        const anomalyConditions: PatternCondition[] = [];

        if ((round.days_since_last ?? 0) >= 14) {
          anomalyConditions.push({
            field: 'days_since_last',
            operator: 'gte',
            value: 14,
            label: 'Extended break (14+ days)',
          });
        }

        if ((round.putts ?? 30) > 36) {
          anomalyConditions.push({
            field: 'putts',
            operator: 'gte',
            value: 36,
            label: 'High putts (36+)',
          });
        }

        if (anomalyConditions.length > 0) {
          // Find similar anomalous rounds
          const similarRounds = this.rounds.filter((r) => {
            const rDeviation = Math.abs(r.total_to_par - baselineAvg);
            return rDeviation > outlierThreshold;
          });

          if (similarRounds.length >= 3) {
            patterns.push(
              this.createPattern(
                'anomaly',
                anomalyConditions,
                {
                  metric: 'total_to_par',
                  direction: round.total_to_par > baselineAvg ? 'increase' : 'decrease',
                  magnitude: deviation,
                  comparison: 'vs_baseline',
                },
                similarRounds.length / this.rounds.length,
                1, // Anomalies are by definition 100% correlated with themselves
                1,
                round.total_to_par - baselineAvg,
                similarRounds.length
              )
            );
          }
        }
      }
    }

    return patterns;
  }

  /**
   * Calculates baseline scoring average
   */
  private calculateBaseline(): number {
    if (this.rounds.length === 0) return 0;
    return (
      this.rounds.reduce((a, r) => a + r.total_to_par, 0) / this.rounds.length
    );
  }

  /**
   * Calculates standard deviation of scores
   */
  private calculateStdDev(): number {
    if (this.rounds.length < 2) return 0;
    const mean = this.calculateBaseline();
    const squaredDiffs = this.rounds.map((r) =>
      Math.pow(r.total_to_par - mean, 2)
    );
    const variance =
      squaredDiffs.reduce((a, b) => a + b, 0) / this.rounds.length;
    return Math.sqrt(variance);
  }

  /**
   * Creates a MinedPattern object
   */
  private createPattern(
    type: PatternType,
    conditions: PatternCondition[],
    outcome: PatternOutcome,
    support: number,
    confidence: number,
    lift: number,
    strokeImpact: number,
    sampleSize: number
  ): MinedPattern {
    // Calculate conviction
    const conviction =
      confidence < 1
        ? ((1 - support) * confidence) / (1 - confidence)
        : Infinity;

    // Calculate actionability
    const actionability = this.calculateActionability(conditions, strokeImpact);

    return {
      id: crypto.randomUUID(),
      playerId: this.playerId,
      patternType: type,
      conditions,
      outcome,
      support,
      confidence,
      lift,
      conviction: Math.min(conviction, 10), // Cap for readability
      strokeImpact,
      actionability,
      sampleSize,
      firstDetected: new Date().toISOString(),
      lastOccurrence: new Date().toISOString(),
      occurrenceCount: sampleSize,
      trend: 'new',
      isActive: true,
      description: this.generateDescription(conditions, outcome, strokeImpact),
      recommendation: this.generateRecommendation(conditions, outcome),
    };
  }

  /**
   * Calculates how actionable a pattern is
   */
  private calculateActionability(
    conditions: PatternCondition[],
    strokeImpact: number
  ): number {
    let actionability = 0.5;

    // Higher impact = more actionable
    actionability += Math.min(0.3, Math.abs(strokeImpact) / 10);

    // Some conditions are more controllable than others
    for (const condition of conditions) {
      if (condition.field === 'days_since_last') {
        // Rest is somewhat controllable
        actionability += 0.1;
      }
      if (condition.field === 'round_type') {
        // Can choose which events to enter
        actionability += 0.05;
      }
    }

    return Math.min(1, actionability);
  }

  /**
   * Generates human-readable description
   */
  private generateDescription(
    conditions: PatternCondition[],
    _outcome: PatternOutcome,
    strokeImpact: number
  ): string {
    const conditionText = conditions
      .map((c) => c.label || `${c.field} ${c.operator} ${c.value}`)
      .join(' and ');

    const direction = strokeImpact > 0 ? 'worse' : 'better';
    const impact = Math.abs(strokeImpact).toFixed(1);

    return `When ${conditionText}, you tend to score ${impact} strokes ${direction} than average.`;
  }

  /**
   * Generates recommendation based on pattern
   */
  private generateRecommendation(
    conditions: PatternCondition[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _outcome: PatternOutcome
  ): string {
    // Simple rule-based recommendations
    for (const condition of conditions) {
      if (condition.field === 'days_since_last' && condition.operator === 'gte') {
        if ((condition.value as number) >= 7) {
          return 'Consider a practice round before important events after extended breaks.';
        }
      }
      if (condition.field === 'putts' && condition.operator === 'gte') {
        return 'Focus on converting GIR opportunities with improved putting practice.';
      }
    }

    return 'Monitor this pattern and discuss with your coach.';
  }

  /**
   * Deduplicates patterns based on similarity
   */
  private deduplicatePatterns(patterns: MinedPattern[]): MinedPattern[] {
    const unique: MinedPattern[] = [];

    for (const pattern of patterns) {
      const isDuplicate = unique.some((existing) =>
        this.areSimilarPatterns(pattern, existing)
      );

      if (!isDuplicate) {
        unique.push(pattern);
      }
    }

    return unique;
  }

  /**
   * Checks if two patterns are similar enough to be duplicates
   */
  private areSimilarPatterns(a: MinedPattern, b: MinedPattern): boolean {
    if (a.patternType !== b.patternType) return false;
    if (a.conditions.length !== b.conditions.length) return false;

    // Check if all conditions are the same
    for (const condA of a.conditions) {
      const hasMatch = b.conditions.some(
        (condB) =>
          condA.field === condB.field &&
          condA.operator === condB.operator &&
          condA.value === condB.value
      );
      if (!hasMatch) return false;
    }

    return true;
  }

  /**
   * Saves patterns to database
   */
  private async savePatterns(patterns: MinedPattern[]): Promise<void> {
    if (patterns.length === 0) return;

    const supabase = await createClient();

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from('golf_patterns_v2' as any) as any;

    for (const pattern of patterns) {
      await table.upsert(
        {
          id: pattern.id,
          player_id: pattern.playerId,
          pattern_type: pattern.patternType,
          conditions: pattern.conditions,
          outcome: pattern.outcome,
          support: pattern.support,
          confidence: pattern.confidence,
          lift: pattern.lift,
          conviction: pattern.conviction,
          stroke_impact: pattern.strokeImpact,
          actionability: pattern.actionability,
          sample_size: pattern.sampleSize,
          first_detected: pattern.firstDetected,
          last_occurrence: pattern.lastOccurrence,
          occurrence_count: pattern.occurrenceCount,
          trend: pattern.trend,
          is_active: pattern.isActive,
          metadata: {
            description: pattern.description,
            recommendation: pattern.recommendation,
          },
        },
        { onConflict: 'id' }
      );
    }
  }
}

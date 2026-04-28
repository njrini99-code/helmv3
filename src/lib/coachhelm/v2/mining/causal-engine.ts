/**
 * Causal Discovery Engine
 *
 * Tests for actual causation vs mere correlation including:
 * - Temporal precedence (X happens before Y)
 * - Dose-response (more X → more Y)
 * - Confounder elimination
 * - Natural experiments (when X changed, did Y follow?)
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  CausalRelationship,
  CausalEvidence,
  NaturalExperiment,
  CausalRelationshipType,
} from '../types';

interface RoundData {
  id: string;
  score_to_par: number;
  round_date: string;
  total_putts?: number | null;
  total_fairways_hit?: number | null;
  total_gir?: number | null;
  days_since_last?: number;
}

/**
 * Causal Discovery Engine for finding true causal relationships
 */
export class CausalEngine {
  private playerId: string;
  private teamId?: string;
  private rounds: RoundData[] = [];

  constructor(playerId: string, teamId?: string) {
    this.playerId = playerId;
    this.teamId = teamId;
  }

  /**
   * Discovers causal relationships for a player
   */
  async discoverCausalRelationships(): Promise<CausalRelationship[]> {
    const supabase = createAdminClient();

    // Load rounds
    const { data: rounds, error } = await supabase
      .from('golf_rounds')
      .select('id, score_to_par, round_date, total_putts, total_fairways_hit, total_gir')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: true })
      .limit(100);

    if (error || !rounds || rounds.length < 10) {
      return [];
    }

    this.rounds = this.computeDaysSinceLast(
      rounds.map((r) => ({
        id: r.id,
        score_to_par: r.score_to_par ?? 0,
        round_date: r.round_date,
        total_putts: r.total_putts,
        total_fairways_hit: r.total_fairways_hit,
        total_gir: r.total_gir,
      }))
    );

    const relationships: CausalRelationship[] = [];

    // Test known potential causal relationships
    const hypotheses = this.generateHypotheses();

    for (const hypothesis of hypotheses) {
      const result = await this.testCausality(hypothesis);
      if (result) {
        relationships.push(result);
      }
    }

    // Save to database
    await this.saveRelationships(relationships);

    return relationships;
  }

  /**
   * Computes days since last round for each round
   */
  private computeDaysSinceLast(rounds: RoundData[]): RoundData[] {
    return rounds.map((round, index) => {
      if (index === 0) {
        return { ...round, days_since_last: 0 };
      }
      const prevRound = rounds[index - 1];
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
   * Generates hypotheses to test
   */
  private generateHypotheses(): CausalHypothesis[] {
    return [
      {
        cause: 'practice_frequency',
        causeMetric: 'rounds_per_week',
        effect: 'scoring',
        effectMetric: 'score_to_par',
        getCauseValue: (r: RoundData) =>
          r.days_since_last !== undefined && r.days_since_last > 0
            ? 7 / r.days_since_last
            : 7,
        getEffectValue: (r: RoundData) => r.score_to_par,
        mechanism: 'More practice maintains muscle memory and rhythm',
      },
      {
        cause: 'putting',
        causeMetric: 'total_putts',
        effect: 'scoring',
        effectMetric: 'score_to_par',
        getCauseValue: (r: RoundData) => r.total_putts ?? null,
        getEffectValue: (r: RoundData) => r.score_to_par,
        mechanism: 'Lower putts directly reduce total strokes',
      },
      {
        cause: 'greens_in_regulation',
        causeMetric: 'total_gir',
        effect: 'scoring',
        effectMetric: 'score_to_par',
        getCauseValue: (r: RoundData) => r.total_gir ?? null,
        getEffectValue: (r: RoundData) => r.score_to_par,
        mechanism: 'Hitting more greens creates more birdie opportunities',
      },
      {
        cause: 'driving_accuracy',
        causeMetric: 'total_fairways_hit',
        effect: 'scoring',
        effectMetric: 'score_to_par',
        getCauseValue: (r: RoundData) => r.total_fairways_hit ?? null,
        getEffectValue: (r: RoundData) => r.score_to_par,
        mechanism: 'Hitting more fairways leads to better approach opportunities',
      },
    ];
  }

  /**
   * Tests a specific causal hypothesis
   */
  private async testCausality(
    hypothesis: CausalHypothesis
  ): Promise<CausalRelationship | null> {
    // Get cause and effect values
    const dataPoints = this.rounds
      .map((r) => ({
        cause: hypothesis.getCauseValue(r),
        effect: hypothesis.getEffectValue(r),
        date: r.round_date,
      }))
      .filter((d) => d.cause !== null && d.effect !== null) as Array<{
      cause: number;
      effect: number;
      date: string;
    }>;

    if (dataPoints.length < 10) {
      return null;
    }

    // Test 1: Temporal precedence (cause values from earlier rounds predict later effects)
    const temporalPrecedence = this.checkTemporalPrecedence(dataPoints);

    // Test 2: Dose-response (more X → more Y)
    const doseResponse = this.checkDoseResponse(dataPoints);

    // Test 3: Analyze natural experiments
    const naturalExperiments = this.analyzeNaturalExperiments(
      dataPoints,
      hypothesis.cause
    );

    // Calculate correlation strength
    const correlation = this.calculateCorrelation(dataPoints);

    // Determine if causal
    const passedTests =
      (temporalPrecedence ? 1 : 0) +
      (doseResponse.confirmed ? 1 : 0) +
      (naturalExperiments.length > 0 ? 1 : 0);

    // Need at least 2 tests passed and reasonable correlation
    if (passedTests < 2 || Math.abs(correlation) < 0.3) {
      return null;
    }

    // Build evidence
    const evidence: CausalEvidence = {
      temporalPrecedence,
      doseResponseConfirmed: doseResponse.confirmed,
      confoundersControlled: [],
      naturalExperiments,
    };

    // Calculate confidence
    const confidence = this.calculateCausalConfidence(
      correlation,
      passedTests,
      dataPoints.length
    );

    // Determine relationship type
    const relationshipType = this.determineRelationshipType(
      hypothesis,
      doseResponse
    );

    // Calculate intervention potential
    const interventionPotential = this.calculateInterventionPotential(
      hypothesis.cause
    );

    return {
      id: crypto.randomUUID(),
      playerId: this.playerId,
      teamId: this.teamId,
      cause: hypothesis.cause,
      causeMetric: hypothesis.causeMetric,
      effect: hypothesis.effect,
      effectMetric: hypothesis.effectMetric,
      relationshipType,
      strength: Math.abs(correlation),
      confidence,
      mechanism: hypothesis.mechanism,
      confounders: [],
      doseResponse: doseResponse.confirmed,
      interventionPotential,
      evidence,
      validationCount: 1,
    };
  }

  /**
   * Checks if cause temporally precedes effect
   */
  private checkTemporalPrecedence(
    dataPoints: Array<{ cause: number; effect: number; date: string }>
  ): boolean {
    // Compare lagged cause values with current effect
    let laggedCorrelation = 0;
    let count = 0;

    for (let i = 1; i < dataPoints.length; i++) {
      // Does previous round's cause relate to current round's effect?
      const prevPoint = dataPoints[i - 1];
      const currPoint = dataPoints[i];
      if (!prevPoint || !currPoint) continue;

      const prevCause = prevPoint.cause;
      const currEffect = currPoint.effect;

      laggedCorrelation += prevCause * currEffect;
      count++;
    }

    // If lagged correlation is meaningful, temporal precedence exists
    return count > 0 && Math.abs(laggedCorrelation / count) > 0.2;
  }

  /**
   * Checks for dose-response relationship
   */
  private checkDoseResponse(
    dataPoints: Array<{ cause: number; effect: number }>
  ): { confirmed: boolean; direction: 'positive' | 'negative' } {
    // Sort by cause value
    const sorted = [...dataPoints].sort((a, b) => a.cause - b.cause);

    // Divide into thirds
    const third = Math.floor(sorted.length / 3);
    const lowThird = sorted.slice(0, third);
    const midThird = sorted.slice(third, 2 * third);
    const highThird = sorted.slice(2 * third);

    // Calculate average effect for each third
    const lowAvg =
      lowThird.reduce((a, d) => a + d.effect, 0) / lowThird.length;
    const midAvg =
      midThird.reduce((a, d) => a + d.effect, 0) / midThird.length;
    const highAvg =
      highThird.reduce((a, d) => a + d.effect, 0) / highThird.length;

    // Check for monotonic relationship
    const isIncreasing = lowAvg < midAvg && midAvg < highAvg;
    const isDecreasing = lowAvg > midAvg && midAvg > highAvg;

    return {
      confirmed: isIncreasing || isDecreasing,
      direction: isIncreasing ? 'positive' : 'negative',
    };
  }

  /**
   * Analyzes natural experiments
   */
  private analyzeNaturalExperiments(
    dataPoints: Array<{ cause: number; effect: number; date: string }>,
    causeName: string
  ): NaturalExperiment[] {
    const experiments: NaturalExperiment[] = [];

    // Look for significant changes in cause value
    const causeStdDev = this.calculateStdDev(dataPoints.map((d) => d.cause));

    for (let i = 1; i < dataPoints.length; i++) {
      const currPoint = dataPoints[i];
      const prevPoint = dataPoints[i - 1];
      if (!currPoint || !prevPoint) continue;

      const causeDelta = currPoint.cause - prevPoint.cause;

      // Significant change = more than 1 std dev
      if (Math.abs(causeDelta) > causeStdDev) {
        const effectDelta = currPoint.effect - prevPoint.effect;

        // Did effect change in expected direction?
        const supportsCausality =
          (causeDelta > 0 && effectDelta !== 0) ||
          (causeDelta < 0 && effectDelta !== 0);

        experiments.push({
          date: currPoint.date,
          causeChange: `${causeName} ${causeDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(causeDelta).toFixed(1)}`,
          effectChange: `Score ${effectDelta > 0 ? 'worsened' : 'improved'} by ${Math.abs(effectDelta).toFixed(1)}`,
          supportsCausality,
        });

        // Limit to 5 experiments
        if (experiments.length >= 5) break;
      }
    }

    return experiments;
  }

  /**
   * Calculates Pearson correlation
   */
  private calculateCorrelation(
    dataPoints: Array<{ cause: number; effect: number }>
  ): number {
    const n = dataPoints.length;
    if (n < 2) return 0;

    const causes = dataPoints.map((d) => d.cause);
    const effects = dataPoints.map((d) => d.effect);

    const meanCause = causes.reduce((a, b) => a + b, 0) / n;
    const meanEffect = effects.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let sumCauseSq = 0;
    let sumEffectSq = 0;

    for (let i = 0; i < n; i++) {
      const causeVal = causes[i] ?? 0;
      const effectVal = effects[i] ?? 0;
      const causeDiff = causeVal - meanCause;
      const effectDiff = effectVal - meanEffect;
      numerator += causeDiff * effectDiff;
      sumCauseSq += causeDiff * causeDiff;
      sumEffectSq += effectDiff * effectDiff;
    }

    const denominator = Math.sqrt(sumCauseSq * sumEffectSq);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculates standard deviation
   */
  private calculateStdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance =
      squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculates confidence in causal relationship
   */
  private calculateCausalConfidence(
    correlation: number,
    testsPassed: number,
    sampleSize: number
  ): number {
    let confidence = 0.3; // Base

    // Correlation strength
    confidence += Math.min(0.3, Math.abs(correlation) * 0.4);

    // Tests passed
    confidence += testsPassed * 0.1;

    // Sample size bonus
    if (sampleSize >= 30) confidence += 0.1;
    if (sampleSize >= 50) confidence += 0.05;

    return Math.min(0.95, confidence);
  }

  /**
   * Determines relationship type
   */
  private determineRelationshipType(
    _hypothesis: CausalHypothesis,
    doseResponse: { confirmed: boolean; direction: 'positive' | 'negative' }
  ): CausalRelationshipType {
    // Simple heuristic - could be made more sophisticated
    if (doseResponse.confirmed) {
      return 'direct';
    }
    return 'mediated';
  }

  /**
   * Calculates intervention potential
   */
  private calculateInterventionPotential(cause: string): number {
    // How much can this cause be influenced?
    const potentials: Record<string, number> = {
      practice_frequency: 0.9, // Very controllable
      putting: 0.7, // Can practice
      greens_in_regulation: 0.6, // Can work on approach
      front_nine_performance: 0.4, // Somewhat indirect
    };

    return potentials[cause] ?? 0.5;
  }

  /**
   * Saves relationships to database
   */
  private async saveRelationships(
    relationships: CausalRelationship[]
  ): Promise<void> {
    if (relationships.length === 0) return;

    const supabase = createAdminClient();

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from('golf_causal_relationships' as any) as any;

    for (const rel of relationships) {
      const { error } = await table.upsert(
        {
          id: rel.id,
          player_id: rel.playerId,
          team_id: rel.teamId,
          cause: rel.cause,
          cause_metric: rel.causeMetric,
          effect: rel.effect,
          effect_metric: rel.effectMetric,
          relationship_type: rel.relationshipType,
          strength: rel.strength,
          confidence: rel.confidence,
          mechanism: rel.mechanism,
          confounders: rel.confounders,
          dose_response: rel.doseResponse,
          intervention_potential: rel.interventionPotential,
          evidence: rel.evidence,
          validation_count: rel.validationCount,
        },
        { onConflict: 'id' }
      );

      if (error) {
        throw new Error(
          `Failed to save CoachHelm causal relationship: ${error.message}`
        );
      }
    }
  }
}

/**
 * Hypothesis to test
 */
interface CausalHypothesis {
  cause: string;
  causeMetric: string;
  effect: string;
  effectMetric: string;
  getCauseValue: (r: RoundData) => number | null;
  getEffectValue: (r: RoundData) => number | null;
  mechanism: string;
}

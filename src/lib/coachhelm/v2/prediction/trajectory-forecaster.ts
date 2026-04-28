/**
 * Trajectory Forecaster
 *
 * Forecasts long-term player trajectories including:
 * - Multi-model projections (linear, seasonal, pattern-based, ensemble)
 * - Scenario analysis (best/likely/conservative/worst)
 * - Milestone predictions
 * - Risk and opportunity identification
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  TrajectoryForecast,
  TrajectoryPoint,
  TrajectoryScenario,
  TrajectoryMilestone,
  TrajectoryRisk,
  TrajectoryOpportunity,
  ExtractedFeatures,
} from '../types';
import { extractAllFeatures } from '../features';

interface HistoricalPoint {
  date: string;
  scoreToPar: number;
  cumulative: number;
}

/**
 * Trajectory Forecaster class for long-term predictions
 */
export class TrajectoryForecaster {
  private playerId: string;
  private features: ExtractedFeatures | null = null;
  private history: HistoricalPoint[] = [];
  private currentAvg: number = 0;

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /**
   * Forecasts trajectory over a given horizon
   *
   * @param horizonDays - Number of days to forecast
   */
  async forecastTrajectory(
    horizonDays: number = 90
  ): Promise<TrajectoryForecast | null> {
    const supabase = createAdminClient();

    // Load features
    this.features = await extractAllFeatures(this.playerId);

    // Load historical data
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('id, score_to_par, round_date')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: true })
      .limit(100);

    if (!rounds || rounds.length < 10) {
      return null;
    }

    // Build history with running average - map to expected format
    const formattedRounds = rounds.map(r => ({
      score_to_par: r.score_to_par ?? 0,
      round_date: r.round_date
    }));
    this.buildHistory(formattedRounds);

    // Get projections from different models
    const linearProjection = this.linearProjection(horizonDays);
    const seasonalProjection = this.seasonalProjection(horizonDays);
    const patternBasedProjection = this.patternBasedProjection(horizonDays);

    // Ensemble combines all models
    const ensembleProjection = this.ensembleProjection(
      linearProjection,
      seasonalProjection,
      patternBasedProjection
    );

    // Generate scenarios
    const scenarios = this.generateScenarios(
      ensembleProjection,
      linearProjection,
      horizonDays
    );

    // Identify milestones
    const milestones = this.identifyMilestones(ensembleProjection);

    // Identify risks and opportunities
    const risks = this.identifyRisks();
    const opportunities = this.identifyOpportunities();

    // Determine primary model
    const primaryModel = this.determinePrimaryModel();

    // Calculate model confidence
    const modelConfidence = this.calculateModelConfidence(rounds.length);

    return {
      playerId: this.playerId,
      horizonDays,
      projections: ensembleProjection,
      scenarios,
      milestones,
      risks,
      opportunities,
      modelConfidence,
      primaryModel,
    };
  }

  /**
   * Builds historical data with running average
   */
  private buildHistory(
    rounds: Array<{ score_to_par: number; round_date: string }>
  ): void {
    let cumulative = 0;
    this.history = rounds.map((r, i) => {
      cumulative += r.score_to_par;
      return {
        date: r.round_date,
        scoreToPar: r.score_to_par,
        cumulative: cumulative / (i + 1),
      };
    });

    // Current average (last 10 rounds)
    const recent = rounds.slice(-10);
    this.currentAvg =
      recent.reduce((a, r) => a + r.score_to_par, 0) / recent.length;
  }

  /**
   * Simple linear projection based on trend
   */
  private linearProjection(horizonDays: number): TrajectoryPoint[] {
    if (this.history.length < 5) return [];

    // Calculate trend from last 30 days of data
    const recent = this.history.slice(-30);
    const n = recent.length;

    // Simple linear regression
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const point = recent[i];
      if (!point) continue;
      sumX += i;
      sumY += point.cumulative;
      sumXY += i * point.cumulative;
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Project forward
    const points: TrajectoryPoint[] = [];
    const startDate = new Date();
    const intervalsPerWeek = 2;
    const weeksToForecast = Math.ceil(horizonDays / 7);

    for (let week = 0; week <= weeksToForecast; week++) {
      const futureDate = new Date(startDate);
      futureDate.setDate(futureDate.getDate() + week * 7);

      // Project the cumulative average
      const projectedIndex = n + week * intervalsPerWeek;
      const projectedValue = slope * projectedIndex + intercept;

      // Uncertainty grows with time
      const uncertainty = 0.5 + week * 0.15;

      points.push({
        date: futureDate.toISOString().split('T')[0] ?? '',
        metric: 'scoring_average',
        value: projectedValue,
        rangeLow: projectedValue - uncertainty,
        rangeHigh: projectedValue + uncertainty,
        confidence: Math.max(0.5, 0.9 - week * 0.03),
      });
    }

    return points;
  }

  /**
   * Seasonal projection (accounts for seasonal patterns)
   */
  private seasonalProjection(horizonDays: number): TrajectoryPoint[] {
    // For golf, consider:
    // - Spring/Summer typically better (more practice)
    // - Fall/Winter typically worse (less play)

    const points = this.linearProjection(horizonDays);

    return points.map((point) => {
      const pointDate = new Date(point.date);
      const month = pointDate.getMonth();

      // Seasonal adjustment
      let seasonalAdj = 0;
      if (month >= 4 && month <= 8) {
        // May-Sept: peak season
        seasonalAdj = -0.3;
      } else if (month >= 10 || month <= 2) {
        // Nov-Mar: off season
        seasonalAdj = 0.4;
      }

      return {
        ...point,
        value: point.value + seasonalAdj,
        rangeLow: point.rangeLow + seasonalAdj,
        rangeHigh: point.rangeHigh + seasonalAdj,
      };
    });
  }

  /**
   * Pattern-based projection (adjusts for active patterns)
   */
  private patternBasedProjection(horizonDays: number): TrajectoryPoint[] {
    const points = this.linearProjection(horizonDays);

    if (!this.features) return points;

    // Adjust based on form cycle
    let formAdj = 0;
    switch (this.features.contextual.formCycle) {
      case 'peak':
        formAdj = 0.3; // Expect regression
        break;
      case 'rising':
        formAdj = -0.2; // Continue improving
        break;
      case 'declining':
        formAdj = 0.2; // Continue declining
        break;
      case 'trough':
        formAdj = -0.2; // Expect rebound
        break;
    }

    return points.map((point, i) => {
      // Form adjustment diminishes over time
      const adjustedFormAdj = formAdj * Math.max(0, 1 - i * 0.1);

      return {
        ...point,
        value: point.value + adjustedFormAdj,
        rangeLow: point.rangeLow + adjustedFormAdj,
        rangeHigh: point.rangeHigh + adjustedFormAdj,
      };
    });
  }

  /**
   * Ensemble projection (weighted combination)
   */
  private ensembleProjection(
    linear: TrajectoryPoint[],
    seasonal: TrajectoryPoint[],
    patternBased: TrajectoryPoint[]
  ): TrajectoryPoint[] {
    if (linear.length === 0) return [];

    // Weights
    const linearWeight = 0.4;
    const seasonalWeight = 0.3;
    const patternWeight = 0.3;

    return linear.map((point, i) => {
      const linearVal = point.value;
      const seasonalVal = seasonal[i]?.value ?? linearVal;
      const patternVal = patternBased[i]?.value ?? linearVal;

      const ensembleValue =
        linearVal * linearWeight +
        seasonalVal * seasonalWeight +
        patternVal * patternWeight;

      // Take the widest confidence interval
      const rangeLow = Math.min(
        point.rangeLow,
        seasonal[i]?.rangeLow ?? point.rangeLow,
        patternBased[i]?.rangeLow ?? point.rangeLow
      );

      const rangeHigh = Math.max(
        point.rangeHigh,
        seasonal[i]?.rangeHigh ?? point.rangeHigh,
        patternBased[i]?.rangeHigh ?? point.rangeHigh
      );

      return {
        date: point.date,
        metric: 'scoring_average',
        value: ensembleValue,
        rangeLow,
        rangeHigh,
        confidence: point.confidence * 0.95, // Slight uncertainty from ensemble
      };
    });
  }

  /**
   * Generates scenarios
   */
  private generateScenarios(
    ensemble: TrajectoryPoint[],
     
    _linear: TrajectoryPoint[],
     
    _horizonDays: number
  ): TrajectoryScenario[] {
    if (ensemble.length === 0) return [];

    const scenarios: TrajectoryScenario[] = [];

    // Best case: everything goes right
    scenarios.push({
      name: 'best',
      probability: 0.15,
      trajectory: ensemble.map((p) => ({
        ...p,
        value: p.rangeLow,
        rangeLow: p.rangeLow - 0.5,
        rangeHigh: p.rangeLow + 0.5,
      })),
      assumptions: [
        'Continued consistent practice',
        'No injuries or setbacks',
        'Mental game remains strong',
      ],
    });

    // Likely case: ensemble projection
    scenarios.push({
      name: 'likely',
      probability: 0.5,
      trajectory: ensemble,
      assumptions: [
        'Current practice habits continue',
        'Normal variation in performance',
      ],
    });

    // Conservative case: slower improvement
    scenarios.push({
      name: 'conservative',
      probability: 0.25,
      trajectory: ensemble.map((p) => ({
        ...p,
        value: (p.value + p.rangeHigh) / 2,
        rangeLow: p.value,
        rangeHigh: p.rangeHigh,
      })),
      assumptions: [
        'Some setbacks or inconsistency',
        'Limited practice time',
      ],
    });

    // Worst case: regression
    scenarios.push({
      name: 'worst',
      probability: 0.1,
      trajectory: ensemble.map((p) => ({
        ...p,
        value: p.rangeHigh,
        rangeLow: p.rangeHigh - 0.5,
        rangeHigh: p.rangeHigh + 1,
      })),
      assumptions: [
        'Injury or extended break',
        'Mental struggles',
        'External distractions',
      ],
    });

    return scenarios;
  }

  /**
   * Identifies potential milestones
   */
  private identifyMilestones(
    projection: TrajectoryPoint[]
  ): TrajectoryMilestone[] {
    const milestones: TrajectoryMilestone[] = [];

    if (projection.length === 0) return milestones;

    // Target milestones based on current average
    const targets = [
      { value: Math.floor(this.currentAvg) - 1, label: 'Improve by 1 stroke' },
      { value: 5, label: 'Single-digit scorer (+5)' },
      { value: 3, label: 'Low handicap territory (+3)' },
      { value: 0, label: 'Even par average' },
      { value: -1, label: 'Under par average' },
    ];

    for (const target of targets) {
      // Only include if it's an improvement
      if (target.value >= this.currentAvg) continue;

      // Find when trajectory crosses this value
      const crossingPoint = projection.find((p) => p.value <= target.value);

      if (crossingPoint) {
        // Estimate probability based on confidence interval
        const probability =
          crossingPoint.value <= target.value
            ? Math.min(0.9, crossingPoint.confidence)
            : 0.3;

        milestones.push({
          description: target.label,
          targetValue: target.value,
          estimatedDate: crossingPoint.date,
          probability,
        });
      }
    }

    return milestones.slice(0, 3); // Top 3 milestones
  }

  /**
   * Identifies risks
   */
  private identifyRisks(): TrajectoryRisk[] {
    const risks: TrajectoryRisk[] = [];

    if (!this.features) return risks;

    // Risk 1: Volatility
    if (this.features.temporal.volatility30Day > 4) {
      risks.push({
        description: 'High scoring volatility',
        probability: 0.6,
        impact: 2,
        mitigation: 'Focus on consistency in practice. Work on mental game.',
      });
    }

    // Risk 2: Back nine struggles
    if (
      this.features.sequence.frontBackDiff > 2 &&
      this.features.sequence.backNineAvg > 3
    ) {
      risks.push({
        description: 'Back nine scoring problems',
        probability: 0.7,
        impact: 1.5,
        mitigation:
          'Practice finishing strong. Simulate back nine pressure.',
      });
    }

    // Risk 3: Form declining
    if (this.features.contextual.formCycle === 'declining') {
      risks.push({
        description: 'Form currently declining',
        probability: 0.5,
        impact: 1,
        mitigation: 'Review fundamentals. Consider lessons or video analysis.',
      });
    }

    return risks;
  }

  /**
   * Identifies opportunities
   */
  private identifyOpportunities(): TrajectoryOpportunity[] {
    const opportunities: TrajectoryOpportunity[] = [];

    if (!this.features) return opportunities;

    // Opportunity 1: Rising form
    if (this.features.contextual.formCycle === 'rising') {
      opportunities.push({
        description: 'Current form is rising',
        probability: 0.7,
        potentialGain: 1.5,
        action: 'Maintain current practice routine. Consider entering tournaments.',
      });
    }

    // Opportunity 2: Good bounce-back
    if (this.features.sequence.bogeyFollowUpPar > 0.5) {
      opportunities.push({
        description: 'Strong mental resilience after bogeys',
        probability: 0.8,
        potentialGain: 0.5,
        action: 'Leverage this strength in competitive situations.',
      });
    }

    // Opportunity 3: Low volatility
    if (this.features.temporal.volatility7Day < 2) {
      opportunities.push({
        description: 'Consistent recent scoring',
        probability: 0.75,
        potentialGain: 1,
        action: 'Focus on shaving strokes from specific areas.',
      });
    }

    return opportunities;
  }

  /**
   * Determines the primary model driving the forecast
   */
  private determinePrimaryModel(): 'linear' | 'seasonal' | 'pattern_based' | 'ensemble' {
    // Use ensemble as default
    return 'ensemble';
  }

  /**
   * Calculates overall model confidence
   */
  private calculateModelConfidence(sampleSize: number): number {
    let confidence = 0.5;

    // More data = more confidence
    if (sampleSize >= 50) confidence += 0.2;
    else if (sampleSize >= 30) confidence += 0.15;
    else if (sampleSize >= 15) confidence += 0.1;

    // Low volatility = more confidence
    if (this.features) {
      if (this.features.temporal.volatility30Day < 3) {
        confidence += 0.1;
      } else if (this.features.temporal.volatility30Day > 6) {
        confidence -= 0.1;
      }
    }

    return Math.min(0.85, confidence);
  }
}

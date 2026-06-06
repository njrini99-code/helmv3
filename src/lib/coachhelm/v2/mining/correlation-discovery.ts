/**
 * Cross-Metric Correlation Discovery Engine
 *
 * Discovers correlations between golf metrics that reveal deeper patterns:
 * - Putting performance vs round type (practice vs tournament)
 * - GIR % correlation with final score
 * - Fairway % impact on scoring by par type
 * - Three-putt rate correlation with pressure situations
 * - Penalty frequency correlation with recent form
 *
 * Unlike the general CorrelationEngine, this focuses on cross-metric
 * correlations that span different data sources and contexts.
 */

import { createAdminClient } from '@/lib/supabase/admin';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Represents a discovered correlation between two metrics
 */
export interface MetricCorrelation {
  id: string;
  metricA: string;
  metricB: string;
  correlation: number;  // -1 to 1 (Pearson coefficient)
  significance: 'high' | 'medium' | 'low';
  insight: string;      // Natural language explanation
  strokeImpact: number; // Estimated strokes per round impact
  sampleSize: number;
  context?: string;     // Optional context (e.g., "par 4 holes only")
  recommendation?: string;
}

/**
 * Result of correlation discovery analysis
 */
interface CorrelationDiscoveryResult {
  playerId: string;
  analyzedAt: string;
  correlations: MetricCorrelation[];
  topInsight: string | null;
  totalRoundsAnalyzed: number;
}

/**
 * Raw round data for correlation analysis
 */
interface RoundCorrelationData {
  id: string;
  round_date: string;
  round_type: 'practice' | 'qualifier' | 'tournament' | null;
  score_to_par: number;
  total_putts: number | null;
  total_gir: number | null;
  total_fairways_hit: number | null;
  penalty_count: number; // Computed from shots
}

/**
 * Shot-level data for detailed correlations
 */
interface ShotCorrelationData {
  round_id: string;
  hole_number: number;
  shot_type: string | null;
  lie_before: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  putt_distance_feet: number | null;
  putt_made: boolean | null;
  is_penalty: boolean | null;
}

/**
 * Hole-level data for par-specific correlations
 */
interface HoleCorrelationData {
  round_id: string;
  hole_number: number;
  par: number;
  strokes: number;
  putts: number;
  gir: boolean;
  fairway_hit: boolean | null;
}

// ============================================================================
// MAIN CLASS
// ============================================================================

/**
 * Cross-Metric Correlation Discovery Engine
 *
 * Finds correlations between metrics that reveal deeper patterns in player performance.
 */
export class CorrelationDiscovery {
  private playerId: string;
  private rounds: RoundCorrelationData[] = [];
  private shots: ShotCorrelationData[] = [];
  private holes: HoleCorrelationData[] = [];

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /**
   * Main entry point: Discovers all meaningful metric correlations for a player
   */
  async discoverMetricCorrelations(): Promise<MetricCorrelation[]> {
    // Load all required data
    await this.loadData();

    if (this.rounds.length < 5) {
      return []; // Not enough data for meaningful correlations
    }

    const correlations: MetricCorrelation[] = [];

    // 1. Pressure context correlations (practice vs tournament/qualifier)
    correlations.push(...this.analyzePressureCorrelations());

    // 2. GIR to scoring correlations
    correlations.push(...this.analyzeGirScoringCorrelations());

    // 3. Fairway impact on scoring by par type
    correlations.push(...this.analyzeFairwayScoringCorrelations());

    // 4. Three-putt pressure correlations
    correlations.push(...this.analyzeThreePuttPressureCorrelations());

    // 5. Penalty and form correlations
    correlations.push(...this.analyzePenaltyFormCorrelations());

    // 6. Putting efficiency correlations (putts per GIR)
    correlations.push(...this.analyzePuttingEfficiencyCorrelations());

    // Filter out weak correlations and sort by significance
    const significantCorrelations = correlations
      .filter(c => Math.abs(c.correlation) >= 0.25 || c.significance === 'high')
      .sort((a, b) => {
        // Sort by significance first, then by absolute correlation
        const sigOrder = { high: 0, medium: 1, low: 2 };
        if (sigOrder[a.significance] !== sigOrder[b.significance]) {
          return sigOrder[a.significance] - sigOrder[b.significance];
        }
        return Math.abs(b.correlation) - Math.abs(a.correlation);
      });

    return significantCorrelations;
  }

  /**
   * Returns a full discovery result with metadata
   */
  async discoverCorrelations(): Promise<CorrelationDiscoveryResult> {
    const correlations = await this.discoverMetricCorrelations();

    // Determine top insight
    let topInsight: string | null = null;
    if (correlations.length > 0) {
      const top = correlations[0];
      if (top) {
        topInsight = top.insight;
      }
    }

    return {
      playerId: this.playerId,
      analyzedAt: new Date().toISOString(),
      correlations,
      topInsight,
      totalRoundsAnalyzed: this.rounds.length,
    };
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  private async loadData(): Promise<void> {
    const supabase = createAdminClient();

    // Load rounds with aggregated stats
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        round_date,
        round_type,
        score_to_par,
        total_putts,
        total_gir,
        total_fairways_hit
      `)
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: true })
      .limit(100);

    // Load shot-level data for detailed correlations (including penalties)
    const roundIds = rounds?.map(r => r.id) ?? [];

    if (roundIds.length > 0) {
      const { data: shots } = await supabase
        .from('golf_shots')
        .select(`
          round_id,
          hole_number,
          shot_type,
          lie_before,
          distance_to_hole_before,
          distance_unit_before,
          putt_distance_feet,
          putt_made,
          is_penalty
        `)
        .in('round_id', roundIds)
        .limit(50000); // lift PostgREST 1000-row default cap

      if (shots) {
        this.shots = shots;
      }

      // Count penalties per round from shots
      const penaltiesByRound = new Map<string, number>();
      for (const shot of this.shots) {
        if (shot.is_penalty) {
          penaltiesByRound.set(
            shot.round_id,
            (penaltiesByRound.get(shot.round_id) ?? 0) + 1
          );
        }
      }

      // Map rounds with penalty counts
      if (rounds) {
        this.rounds = rounds.map(r => ({
          id: r.id,
          round_date: r.round_date,
          round_type: this.normalizeRoundType(r.round_type),
          score_to_par: r.score_to_par ?? 0,
          total_putts: r.total_putts,
          total_gir: r.total_gir,
          total_fairways_hit: r.total_fairways_hit,
          penalty_count: penaltiesByRound.get(r.id) ?? 0,
        }));
      }

      // Load hole-level data from golf_holes table
      const { data: holes } = await supabase
        .from('golf_holes')
        .select(`
          round_id,
          hole_number,
          par,
          score,
          putts,
          gir,
          fairway_hit
        `)
        .in('round_id', roundIds)
        .limit(50000); // lift PostgREST 1000-row default cap

      if (holes) {
        this.holes = holes.map(h => ({
          round_id: h.round_id,
          hole_number: h.hole_number,
          par: h.par ?? 4,
          strokes: h.score ?? 0, // Map 'score' column to 'strokes' field
          putts: h.putts ?? 0,
          gir: h.gir ?? false,
          fairway_hit: h.fairway_hit ?? null,
        }));
      }
    }
  }

  private normalizeRoundType(roundType: string | null): 'practice' | 'qualifier' | 'tournament' | null {
    if (!roundType) return null;
    if (roundType === 'qualifying') return 'qualifier';
    if (roundType === 'practice' || roundType === 'qualifier' || roundType === 'tournament') {
      return roundType;
    }
    return null;
  }

  // ============================================================================
  // CORRELATION ANALYSIS METHODS
  // ============================================================================

  /**
   * Analyzes putting performance in practice vs tournament/qualifier rounds
   */
  private analyzePressureCorrelations(): MetricCorrelation[] {
    const correlations: MetricCorrelation[] = [];

    const practiceRounds = this.rounds.filter(r => r.round_type === 'practice');
    const pressureRounds = this.rounds.filter(r => r.round_type === 'tournament' || r.round_type === 'qualifier');

    if (practiceRounds.length < 3 || pressureRounds.length < 3) {
      return correlations;
    }

    // Calculate putts per GIR for each round type
    const practicePuttStats = this.calculatePuttsPerGir(practiceRounds);
    const pressurePuttStats = this.calculatePuttsPerGir(pressureRounds);

    if (practicePuttStats && pressurePuttStats) {
      const puttDiff = pressurePuttStats.avgPuttsPerGir - practicePuttStats.avgPuttsPerGir;
      const strokeImpact = puttDiff * 12; // Assume ~12 GIRs per round

      if (Math.abs(puttDiff) >= 0.05) {
        correlations.push({
          id: `pressure-putting-${this.playerId}`,
          metricA: 'putts_per_gir',
          metricB: 'round_type_pressure',
          correlation: puttDiff > 0 ? 0.6 : -0.6, // Positive = worse under pressure
          significance: Math.abs(puttDiff) >= 0.15 ? 'high' : Math.abs(puttDiff) >= 0.08 ? 'medium' : 'low',
          insight: puttDiff > 0
            ? `Your putting efficiency drops under pressure: ${practicePuttStats.avgPuttsPerGir.toFixed(2)} putts/GIR in practice vs ${pressurePuttStats.avgPuttsPerGir.toFixed(2)} in competition (${Math.abs(strokeImpact).toFixed(1)} strokes/round impact)`
            : `You putt better under pressure: ${pressurePuttStats.avgPuttsPerGir.toFixed(2)} putts/GIR in competition vs ${practicePuttStats.avgPuttsPerGir.toFixed(2)} in practice`,
          strokeImpact: Math.abs(strokeImpact),
          sampleSize: practiceRounds.length + pressureRounds.length,
          context: 'practice vs tournament/qualifier',
          recommendation: puttDiff > 0
            ? 'Practice putting with consequences/pressure to simulate competition conditions'
            : 'Your competitive putting is a strength - maintain your pre-putt routine under pressure',
        });
      }
    }

    // Analyze short putt (3-5 ft) make rate under pressure
    const practiceShortPuttRate = this.calculateShortPuttRate(practiceRounds.map(r => r.id));
    const pressureShortPuttRate = this.calculateShortPuttRate(pressureRounds.map(r => r.id));

    if (practiceShortPuttRate !== null && pressureShortPuttRate !== null) {
      const rateDiff = pressureShortPuttRate - practiceShortPuttRate;

      if (Math.abs(rateDiff) >= 5) { // 5% difference is meaningful
        const strokeImpact = Math.abs(rateDiff) / 100 * 4; // ~4 short putts per round

        correlations.push({
          id: `pressure-short-putts-${this.playerId}`,
          metricA: 'short_putt_make_rate_3_5ft',
          metricB: 'round_type_pressure',
          correlation: rateDiff < 0 ? 0.7 : -0.7,
          significance: Math.abs(rateDiff) >= 10 ? 'high' : 'medium',
          insight: rateDiff < 0
            ? `Your putting makes ${practiceShortPuttRate.toFixed(0)}% from 3-5ft in practice but only ${pressureShortPuttRate.toFixed(0)}% in tournaments - pressure affects short putts`
            : `You make ${pressureShortPuttRate.toFixed(0)}% of 3-5ft putts under pressure vs ${practiceShortPuttRate.toFixed(0)}% in practice - you thrive under pressure`,
          strokeImpact,
          sampleSize: practiceRounds.length + pressureRounds.length,
          context: '3-5 foot putts',
          recommendation: rateDiff < 0
            ? 'Build a consistent pre-putt routine for short putts; practice with consequences'
            : 'Your short-putt confidence under pressure is excellent - maintain your routine',
        });
      }
    }

    // Three-putt rate by round type
    const practiceThreePuttRate = this.calculateThreePuttRate(practiceRounds);
    const pressureThreePuttRate = this.calculateThreePuttRate(pressureRounds);

    if (practiceThreePuttRate !== null && pressureThreePuttRate !== null) {
      const rateDiff = pressureThreePuttRate - practiceThreePuttRate;

      if (Math.abs(rateDiff) >= 0.3) { // 0.3 three-putts/round difference
        correlations.push({
          id: `pressure-three-putts-${this.playerId}`,
          metricA: 'three_putt_count',
          metricB: 'round_type_pressure',
          correlation: rateDiff > 0 ? 0.65 : -0.65,
          significance: Math.abs(rateDiff) >= 0.6 ? 'high' : 'medium',
          insight: rateDiff > 0
            ? `Three-putt rate jumps from ${practiceThreePuttRate.toFixed(1)}/round in practice to ${pressureThreePuttRate.toFixed(1)}/round in competition`
            : `Three-putt rate is lower in competition (${pressureThreePuttRate.toFixed(1)}) than practice (${practiceThreePuttRate.toFixed(1)})`,
          strokeImpact: Math.abs(rateDiff),
          sampleSize: practiceRounds.length + pressureRounds.length,
          context: 'three-putt frequency',
          recommendation: rateDiff > 0
            ? 'Focus on lag putting under pressure; prioritize leaving first putt within 3 feet'
            : 'Your lag putting focus improves in competition - a strong mental skill',
        });
      }
    }

    return correlations;
  }

  /**
   * Analyzes how GIR percentage correlates with scoring
   */
  private analyzeGirScoringCorrelations(): MetricCorrelation[] {
    const correlations: MetricCorrelation[] = [];

    // Need rounds with both GIR and score data
    const validRounds = this.rounds.filter(r => r.total_gir !== null);
    if (validRounds.length < 5) return correlations;

    const girValues = validRounds.map(r => (r.total_gir ?? 0) / 18 * 100); // Convert to percentage
    const scoreValues = validRounds.map(r => r.score_to_par);

    const correlation = this.calculatePearsonCorrelation(girValues, scoreValues);

    if (Math.abs(correlation) >= 0.4) {
      // Calculate stroke impact: for each 10% GIR improvement, how much does score change?
      const avgGir = girValues.reduce((a, b) => a + b, 0) / girValues.length;
      const avgScore = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;

      // Linear regression for stroke impact estimate
      const slope = this.calculateSlope(girValues, scoreValues);
      const strokeImpactPer10Pct = Math.abs(slope * 10);

      correlations.push({
        id: `gir-scoring-${this.playerId}`,
        metricA: 'gir_percentage',
        metricB: 'total_score',
        correlation,
        significance: Math.abs(correlation) >= 0.7 ? 'high' : Math.abs(correlation) >= 0.5 ? 'medium' : 'low',
        insight: `GIR is ${Math.abs(correlation) >= 0.7 ? 'your strongest' : 'a strong'} predictor of good rounds (r=${correlation.toFixed(2)}). Currently at ${avgGir.toFixed(0)}% GIR, averaging ${avgScore > 0 ? '+' : ''}${avgScore.toFixed(1)} to par.`,
        strokeImpact: strokeImpactPer10Pct,
        sampleSize: validRounds.length,
        recommendation: correlation < 0 // Negative correlation = more GIR = lower score (good)
          ? `Each 10% GIR improvement saves ~${strokeImpactPer10Pct.toFixed(1)} strokes. Focus on approach shot consistency.`
          : 'Unusual pattern: higher GIR correlates with higher scores. Check scrambling and putting when on the green.',
      });
    }

    return correlations;
  }

  /**
   * Analyzes fairway percentage impact on scoring, especially by par type
   */
  private analyzeFairwayScoringCorrelations(): MetricCorrelation[] {
    const correlations: MetricCorrelation[] = [];

    // Overall fairway to scoring correlation
    // Filter rounds with fairway data
    // Standard assumption: 14 fairway opportunities per 18-hole round (par 4s + par 5s)
    const STANDARD_FAIRWAY_OPPORTUNITIES = 14;

    const validRounds = this.rounds.filter(r => r.total_fairways_hit !== null);

    if (validRounds.length < 5) return correlations;

    const fairwayPcts = validRounds.map(r =>
      ((r.total_fairways_hit ?? 0) / STANDARD_FAIRWAY_OPPORTUNITIES) * 100
    );
    const scoreValues = validRounds.map(r => r.score_to_par);

    const correlation = this.calculatePearsonCorrelation(fairwayPcts, scoreValues);

    if (Math.abs(correlation) >= 0.3) {
      const avgFwPct = fairwayPcts.reduce((a, b) => a + b, 0) / fairwayPcts.length;

      // Find threshold impact: rounds below 50% fairways vs above
      const lowFwRounds = validRounds.filter((_, i) => (fairwayPcts[i] ?? 0) < 50);
      const highFwRounds = validRounds.filter((_, i) => (fairwayPcts[i] ?? 0) >= 50);

      let thresholdInsight = '';
      let strokeDiff = 0;
      if (lowFwRounds.length >= 3 && highFwRounds.length >= 3) {
        const lowFwAvgScore = lowFwRounds.reduce((a, r) => a + r.score_to_par, 0) / lowFwRounds.length;
        const highFwAvgScore = highFwRounds.reduce((a, r) => a + r.score_to_par, 0) / highFwRounds.length;
        strokeDiff = lowFwAvgScore - highFwAvgScore;

        if (strokeDiff > 2) {
          thresholdInsight = ` When fairways drop below 50%, your scoring averages ${strokeDiff.toFixed(1)} strokes worse.`;
        }
      }

      correlations.push({
        id: `fairway-scoring-${this.playerId}`,
        metricA: 'fairway_percentage',
        metricB: 'scoring_average',
        correlation,
        significance: Math.abs(correlation) >= 0.5 ? 'high' : Math.abs(correlation) >= 0.35 ? 'medium' : 'low',
        insight: `Fairway accuracy (${avgFwPct.toFixed(0)}% avg) correlates with scoring (r=${correlation.toFixed(2)}).${thresholdInsight}`,
        strokeImpact: Math.abs(strokeDiff) || Math.abs(correlation) * 3, // Rough estimate
        sampleSize: validRounds.length,
        recommendation: correlation < 0
          ? 'Prioritize finding fairways over maximum distance off the tee'
          : 'Consider course management strategies when driving accuracy is low',
      });
    }

    // Par-specific fairway impact (from hole-level data)
    if (this.holes.length > 0) {
      const par4Holes = this.holes.filter(h => h.par === 4);
      const par5Holes = this.holes.filter(h => h.par === 5);

      // Par 4 fairway impact
      if (par4Holes.length >= 20) {
        const par4FwHit = par4Holes.filter(h => h.fairway_hit === true);
        const par4FwMiss = par4Holes.filter(h => h.fairway_hit === false);

        if (par4FwHit.length >= 10 && par4FwMiss.length >= 10) {
          const avgScoreFwHit = par4FwHit.reduce((a, h) => a + h.strokes, 0) / par4FwHit.length;
          const avgScoreFwMiss = par4FwMiss.reduce((a, h) => a + h.strokes, 0) / par4FwMiss.length;
          const strokeDiff = avgScoreFwMiss - avgScoreFwHit;

          if (strokeDiff >= 0.15) {
            correlations.push({
              id: `fairway-par4-scoring-${this.playerId}`,
              metricA: 'fairway_hit_par4',
              metricB: 'par4_scoring',
              correlation: -0.5 * Math.min(strokeDiff, 1), // Estimate based on impact
              significance: strokeDiff >= 0.4 ? 'high' : strokeDiff >= 0.25 ? 'medium' : 'low',
              insight: `On par 4s: You average ${avgScoreFwHit.toFixed(2)} from fairway vs ${avgScoreFwMiss.toFixed(2)} from rough (${strokeDiff.toFixed(2)} stroke difference per hole)`,
              strokeImpact: strokeDiff * 10, // ~10 par 4s per round
              sampleSize: par4Holes.length,
              context: 'par 4 holes only',
              recommendation: 'Par 4 fairway accuracy has significant scoring impact - prioritize accuracy over distance',
            });
          }
        }
      }

      // Par 5 fairway impact
      if (par5Holes.length >= 10) {
        const par5FwHit = par5Holes.filter(h => h.fairway_hit === true);
        const par5FwMiss = par5Holes.filter(h => h.fairway_hit === false);

        if (par5FwHit.length >= 5 && par5FwMiss.length >= 5) {
          const avgScoreFwHit = par5FwHit.reduce((a, h) => a + h.strokes, 0) / par5FwHit.length;
          const avgScoreFwMiss = par5FwMiss.reduce((a, h) => a + h.strokes, 0) / par5FwMiss.length;
          const strokeDiff = avgScoreFwMiss - avgScoreFwHit;

          if (strokeDiff >= 0.2) {
            correlations.push({
              id: `fairway-par5-scoring-${this.playerId}`,
              metricA: 'fairway_hit_par5',
              metricB: 'par5_scoring',
              correlation: -0.5 * Math.min(strokeDiff, 1),
              significance: strokeDiff >= 0.5 ? 'high' : strokeDiff >= 0.3 ? 'medium' : 'low',
              insight: `On par 5s: Fairway drives lead to ${avgScoreFwHit.toFixed(2)} avg vs ${avgScoreFwMiss.toFixed(2)} from rough (${strokeDiff.toFixed(2)} difference)`,
              strokeImpact: strokeDiff * 4, // ~4 par 5s per round
              sampleSize: par5Holes.length,
              context: 'par 5 holes only',
              recommendation: 'Consider laying up or using a more accurate club on par 5 tee shots',
            });
          }
        }
      }
    }

    return correlations;
  }

  /**
   * Analyzes three-putt correlation with pressure situations
   */
  private analyzeThreePuttPressureCorrelations(): MetricCorrelation[] {
    const correlations: MetricCorrelation[] = [];

    if (this.holes.length < 50) return correlations;

    // Group holes by round type
    const roundTypeMap = new Map<string, 'practice' | 'qualifier' | 'tournament' | null>();
    this.rounds.forEach(r => roundTypeMap.set(r.id, r.round_type));

    const practiceHoles = this.holes.filter(h => roundTypeMap.get(h.round_id) === 'practice');
    const pressureHoles = this.holes.filter(h => {
      const type = roundTypeMap.get(h.round_id);
      return type === 'tournament' || type === 'qualifier';
    });

    if (practiceHoles.length < 30 || pressureHoles.length < 30) return correlations;

    // Count three-putts (holes where putts >= 3)
    const practiceThreePutts = practiceHoles.filter(h => h.putts >= 3).length;
    const pressureThreePutts = pressureHoles.filter(h => h.putts >= 3).length;

    const practiceRate = practiceThreePutts / practiceHoles.length * 18; // Per round
    const pressureRate = pressureThreePutts / pressureHoles.length * 18;

    const rateDiff = pressureRate - practiceRate;

    if (Math.abs(rateDiff) >= 0.3) {
      correlations.push({
        id: `three-putt-pressure-holes-${this.playerId}`,
        metricA: 'three_putt_rate',
        metricB: 'round_type_pressure',
        correlation: rateDiff > 0 ? 0.55 : -0.55,
        significance: Math.abs(rateDiff) >= 0.6 ? 'high' : 'medium',
        insight: rateDiff > 0
          ? `Three-putt frequency increases under pressure: ${practiceRate.toFixed(1)}/round in practice vs ${pressureRate.toFixed(1)}/round in competition`
          : `Three-putt rate actually decreases under pressure: ${pressureRate.toFixed(1)}/round vs ${practiceRate.toFixed(1)}/round in practice`,
        strokeImpact: Math.abs(rateDiff),
        sampleSize: practiceHoles.length + pressureHoles.length,
        recommendation: rateDiff > 0
          ? 'Practice lag putting under simulated pressure conditions'
          : 'Your focus improves under pressure - maintain that competitive intensity',
      });
    }

    return correlations;
  }

  /**
   * Analyzes penalty frequency correlation with recent form/trends
   */
  private analyzePenaltyFormCorrelations(): MetricCorrelation[] {
    const correlations: MetricCorrelation[] = [];

    // Need sequential rounds to analyze form trends
    const sortedRounds = [...this.rounds]
      .sort((a, b) => new Date(a.round_date).getTime() - new Date(b.round_date).getTime());

    if (sortedRounds.length < 10) return correlations;

    // Calculate 3-round rolling average score (form indicator)
    const formScores: number[] = [];
    const penaltyCounts: number[] = [];

    for (let i = 2; i < sortedRounds.length; i++) {
      const round0 = sortedRounds[i - 2];
      const round1 = sortedRounds[i - 1];
      const round2 = sortedRounds[i];

      if (!round0 || !round1 || !round2) continue;

      const rollingAvg = (round0.score_to_par + round1.score_to_par + round2.score_to_par) / 3;
      formScores.push(rollingAvg);
      penaltyCounts.push(round2.penalty_count);
    }

    if (formScores.length < 5) return correlations;

    const correlation = this.calculatePearsonCorrelation(formScores, penaltyCounts);

    if (Math.abs(correlation) >= 0.3) {
      const avgPenalties = penaltyCounts.reduce((a, b) => a + b, 0) / penaltyCounts.length;

      correlations.push({
        id: `penalty-form-${this.playerId}`,
        metricA: 'penalty_strokes',
        metricB: 'recent_form_trend',
        correlation,
        significance: Math.abs(correlation) >= 0.5 ? 'high' : 'medium',
        insight: correlation > 0
          ? `Penalty frequency correlates with poor form: when your 3-round average worsens, penalties increase (r=${correlation.toFixed(2)}, avg ${avgPenalties.toFixed(1)} penalties/round)`
          : `Interesting pattern: penalties decrease during rough stretches (r=${correlation.toFixed(2)})`,
        strokeImpact: avgPenalties * 1.5, // Each penalty ~1.5 strokes on average
        sampleSize: formScores.length,
        recommendation: correlation > 0
          ? 'During scoring slumps, play more conservatively - penalties compound frustration'
          : 'Your course management improves when scores are higher - maintain that discipline always',
      });
    }

    // Direct penalty to score correlation
    if (this.rounds.length >= 10) {
      const penalties = this.rounds.map(r => r.penalty_count);
      const scores = this.rounds.map(r => r.score_to_par);

      const penaltyScoreCorr = this.calculatePearsonCorrelation(penalties, scores);

      if (penaltyScoreCorr >= 0.4) {
        const avgPenalties = penalties.reduce((a, b) => a + b, 0) / penalties.length;
        const slope = this.calculateSlope(penalties, scores);

        correlations.push({
          id: `penalty-scoring-direct-${this.playerId}`,
          metricA: 'penalty_count',
          metricB: 'round_score',
          correlation: penaltyScoreCorr,
          significance: penaltyScoreCorr >= 0.6 ? 'high' : 'medium',
          insight: `Each penalty adds ~${slope.toFixed(1)} strokes to your round (r=${penaltyScoreCorr.toFixed(2)}). You average ${avgPenalties.toFixed(1)} penalties/round.`,
          strokeImpact: avgPenalties * slope,
          sampleSize: this.rounds.length,
          recommendation: avgPenalties > 1
            ? 'Penalty avoidance should be a primary focus - consider playing safer from trouble spots'
            : 'Your penalty avoidance is solid - maintain course management discipline',
        });
      }
    }

    return correlations;
  }

  /**
   * Analyzes putting efficiency (putts per GIR) correlations
   */
  private analyzePuttingEfficiencyCorrelations(): MetricCorrelation[] {
    const correlations: MetricCorrelation[] = [];

    // Calculate putts per GIR for each round and correlate with score
    const validRounds = this.rounds.filter(r =>
      r.total_gir !== null &&
      r.total_gir > 0 &&
      r.total_putts !== null
    );

    if (validRounds.length < 8) return correlations;

    // Estimate putts per GIR (using hole data if available)
    const puttsPerGirData: { ppg: number; score: number }[] = [];

    for (const round of validRounds) {
      const roundHoles = this.holes.filter(h => h.round_id === round.id);
      const girHoles = roundHoles.filter(h => h.gir);

      if (girHoles.length >= 5) {
        const puttsOnGir = girHoles.reduce((a, h) => a + h.putts, 0);
        const ppg = puttsOnGir / girHoles.length;
        puttsPerGirData.push({ ppg, score: round.score_to_par });
      }
    }

    if (puttsPerGirData.length >= 5) {
      const ppgValues = puttsPerGirData.map(d => d.ppg);
      const scoreValues = puttsPerGirData.map(d => d.score);

      const correlation = this.calculatePearsonCorrelation(ppgValues, scoreValues);
      const avgPpg = ppgValues.reduce((a, b) => a + b, 0) / ppgValues.length;

      if (correlation >= 0.35) {
        const slope = this.calculateSlope(ppgValues, scoreValues);

        correlations.push({
          id: `putts-per-gir-scoring-${this.playerId}`,
          metricA: 'putts_per_gir',
          metricB: 'round_score',
          correlation,
          significance: correlation >= 0.6 ? 'high' : correlation >= 0.45 ? 'medium' : 'low',
          insight: `Putting efficiency on GIR holes strongly predicts scoring (r=${correlation.toFixed(2)}). At ${avgPpg.toFixed(2)} putts/GIR, each 0.1 improvement saves ~${Math.abs(slope * 0.1 * 12).toFixed(1)} strokes/round.`,
          strokeImpact: Math.abs(slope * 0.1 * 12),
          sampleSize: puttsPerGirData.length,
          recommendation: avgPpg > 1.85
            ? 'Focus on first putt proximity when hitting greens - leave yourself inside 6 feet'
            : 'Your GIR putting efficiency is solid - maintain approach shot focus on good angles',
        });
      }
    }

    return correlations;
  }

  // ============================================================================
  // STATISTICAL HELPER METHODS
  // ============================================================================

  /**
   * Calculates Pearson correlation coefficient between two arrays
   */
  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 3) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * (y[i] ?? 0), 0);
    const sumX2 = x.reduce((a, b) => a + b * b, 0);
    const sumY2 = y.reduce((a, b) => a + b * b, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));

    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  /**
   * Calculates slope of linear regression (y on x)
   */
  private calculateSlope(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * (y[i] ?? 0), 0);
    const sumX2 = x.reduce((a, b) => a + b * b, 0);

    const denominator = n * sumX2 - sumX ** 2;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Calculates putts per GIR for a set of rounds
   */
  private calculatePuttsPerGir(rounds: RoundCorrelationData[]): { avgPuttsPerGir: number; totalGirs: number } | null {
    let totalPuttsOnGir = 0;
    let totalGirHoles = 0;

    for (const round of rounds) {
      const roundHoles = this.holes.filter(h => h.round_id === round.id);
      const girHoles = roundHoles.filter(h => h.gir);

      if (girHoles.length > 0) {
        totalPuttsOnGir += girHoles.reduce((a, h) => a + h.putts, 0);
        totalGirHoles += girHoles.length;
      }
    }

    if (totalGirHoles < 10) return null;

    return {
      avgPuttsPerGir: totalPuttsOnGir / totalGirHoles,
      totalGirs: totalGirHoles,
    };
  }

  /**
   * Calculates short putt (3-5 ft) make rate for specified rounds
   */
  private calculateShortPuttRate(roundIds: string[]): number | null {
    const shortPutts = this.shots.filter(s =>
      roundIds.includes(s.round_id) &&
      s.shot_type === 'putting' &&
      s.putt_distance_feet !== null &&
      s.putt_distance_feet >= 3 &&
      s.putt_distance_feet <= 5
    );

    if (shortPutts.length < 10) return null;

    const made = shortPutts.filter(s => s.putt_made === true).length;
    return (made / shortPutts.length) * 100;
  }

  /**
   * Calculates three-putt rate (per round) for a set of rounds
   */
  private calculateThreePuttRate(rounds: RoundCorrelationData[]): number | null {
    if (rounds.length < 3) return null;

    let totalThreePutts = 0;
    let validRounds = 0;

    for (const round of rounds) {
      const roundHoles = this.holes.filter(h => h.round_id === round.id);
      if (roundHoles.length >= 9) {
        totalThreePutts += roundHoles.filter(h => h.putts >= 3).length;
        validRounds++;
      }
    }

    if (validRounds < 3) return null;
    return totalThreePutts / validRounds;
  }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================


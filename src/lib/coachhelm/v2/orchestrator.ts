/**
 * CoachHelm V2 Intelligence Orchestrator
 *
 * Main entry point that coordinates all V2 intelligence components:
 * - Feature extraction
 * - Pattern mining
 * - Causal discovery
 * - Prediction
 * - Learning
 * - Reasoning
 * - NLG
 */

import { extractAllFeatures } from './features';
import { PatternMiner, CausalEngine, ShotPatternMiner, StatsInsightGenerator } from './mining';
import type { StatsInsight } from './mining';
import { PerformancePredictor, TrajectoryForecaster } from './prediction';
import { BehaviorLearner, OutcomeValidator, CrossLearner } from './learning';
import { ReasoningEngine, ConfidenceCalibrator } from './reasoning';
import { InsightComposer } from './nlg';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

import type {
  AnalysisOptions,
  PlayerAnalysis,
  IntelligentRoundReview,
  ComposedInsight,
  UserInteraction,
  ExtractedFeatures,
  MinedPattern,
  CausalRelationship,
  PerformancePrediction,
  TrajectoryForecast,
  InsightContext,
  ShotPatternAnalysis,
  ShotPattern,
  ReasoningResult,
} from './types';

/**
 * Main CoachHelm Intelligence class that orchestrates all V2 components
 */
export class CoachHelmIntelligence {
  private reasoningEngine: ReasoningEngine;
  private confidenceCalibrator: ConfidenceCalibrator;
  private insightComposer: InsightComposer;
  private outcomeValidator: OutcomeValidator;

  constructor() {
    this.reasoningEngine = new ReasoningEngine();
    this.confidenceCalibrator = new ConfidenceCalibrator();
    this.insightComposer = new InsightComposer();
    this.outcomeValidator = new OutcomeValidator();
  }

  /**
   * Performs full player analysis
   *
   * @param playerId - The player's UUID
   * @param options - Analysis options
   */
  async analyzePlayer(
    playerId: string,
    options: AnalysisOptions = {}
  ): Promise<PlayerAnalysis | null> {
    const {
      includePatterns = true,
      includeCausal = true,
      includePredictions = true,
      includeTrajectory = false,
      includeShotPatterns = true,
      depth = 'standard',
    } = options;

    // Extract features
    const features = await extractAllFeatures(playerId);
    if (!features) {
      return null;
    }

    // Mine patterns
    let patterns: MinedPattern[] = [];
    if (includePatterns) {
      const miner = new PatternMiner(playerId);
      patterns = await miner.minePatterns();
    }

    // Mine shot-level patterns
    let shotPatterns: ShotPatternAnalysis | undefined;
    if (includeShotPatterns || depth === 'deep') {
      const shotMiner = new ShotPatternMiner(playerId);
      shotPatterns = (await shotMiner.analyzeShotPatterns()) ?? undefined;
    }

    // Discover causal relationships
    let causalRelationships: CausalRelationship[] = [];
    if (includeCausal) {
      const causalEngine = new CausalEngine(playerId);
      causalRelationships = await causalEngine.discoverCausalRelationships();
    }

    // Generate predictions
    const predictions: PerformancePrediction[] = [];
    if (includePredictions) {
      const predictor = new PerformancePredictor(playerId);
      const prediction = await predictor.predictPerformance();
      if (prediction) {
        // Calibrate confidence
        prediction.calibratedConfidence = await this.confidenceCalibrator.calibrate(
          prediction.confidence
        );
        predictions.push(prediction);
      }
    }

    // Generate trajectory
    let trajectory: TrajectoryForecast | undefined;
    if (includeTrajectory || depth === 'deep') {
      const forecaster = new TrajectoryForecaster(playerId);
      trajectory = (await forecaster.forecastTrajectory()) ?? undefined;
    }

    // Fetch comprehensive stats for stats-based insights
    const stats = await this.fetchPlayerStats(playerId);

    // Generate insights (including shot patterns and stats-based)
    const insights = await this.generateInsights(
      playerId,
      features,
      patterns,
      causalRelationships,
      predictions,
      shotPatterns,
      stats
    );

    // Determine alert level
    const alertLevel = this.determineAlertLevel(patterns, predictions, features);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      patterns,
      causalRelationships,
      features
    );

    // Get primary insight
    const primaryInsight = insights.length > 0
      ? insights.reduce((a, b) => (a.confidence > b.confidence ? a : b))
      : {
          headline: 'Analysis Complete',
          body: 'No significant insights at this time.',
          tone: 'neutral' as const,
          confidence: 0.5,
        };

    return {
      playerId,
      analyzedAt: new Date().toISOString(),
      features,
      patterns,
      causalRelationships,
      predictions,
      trajectory,
      shotPatterns,
      insights,
      primaryInsight,
      recommendations,
      alertLevel,
    };
  }

  /**
   * Generates enhanced round review with V2 intelligence
   *
   * @param roundId - The round's UUID
   * @param playerId - The player's UUID
   */
  async generateRoundReview(
    roundId: string,
    playerId: string
  ): Promise<IntelligentRoundReview | null> {
    // Get features
    const features = await extractAllFeatures(playerId);
    if (!features) {
      return null;
    }

    // Get patterns
    const miner = new PatternMiner(playerId);
    const patterns = await miner.minePatterns();

    // Get causal relationships
    const causalEngine = new CausalEngine(playerId);
    const causalInsights = await causalEngine.discoverCausalRelationships();

    // Get prediction
    const predictor = new PerformancePredictor(playerId);
    const prediction = await predictor.predictPerformance();

    if (!prediction) {
      return null;
    }

    // Apply reasoning
    const reasoning = this.reasoningEngine.reason(
      {
        type: 'performance_change',
        description: 'Round performance analysis',
        data: { roundId },
      },
      {
        features,
        patterns,
        causalRelationships: causalInsights,
      }
    );

    // Calibrate confidence
    reasoning.calibratedConfidence = await this.confidenceCalibrator.calibrate(
      reasoning.confidence
    );

    // Compose review
    const context: InsightContext = {
      playerId,
      isForCoach: false,
      verbosity: 'balanced',
      playerState: this.inferPlayerState(features),
      recentPerformance: this.inferRecentPerformance(features),
    };

    const composedReview = this.insightComposer.compose(
      {
        type: 'pattern',
        data: patterns[0] ?? {},
        reasoning,
        features,
      },
      context
    );

    // Generate focus areas
    const focusAreas = this.identifyFocusAreas(patterns, causalInsights);

    // Determine practice priority
    const practicePriority = this.determinePracticePriority(
      patterns,
      causalInsights
    );

    return {
      roundId,
      playerId,
      summary: composedReview.body,
      primaryTakeaway: composedReview.headline,
      patternsApplied: patterns.filter((p) => p.isActive).slice(0, 3),
      causalInsights: causalInsights.slice(0, 2),
      prediction,
      reasoning,
      composedReview,
      focusAreas,
      practicePriority,
    };
  }

  /**
   * Generates alerts for a coach's team
   *
   * @param coachId - The coach's UUID
   * @param teamId - The team's UUID
   */
  async generateAlerts(
    coachId: string,
    teamId: string
  ): Promise<ComposedInsight[]> {
    const alerts: ComposedInsight[] = [];

    // Initialize behavior learner for coach preferences (available for future alert filtering)
    const behaviorLearner = new BehaviorLearner(coachId, 'coach');
    await behaviorLearner.getLearnedPreferences();

    // Get team patterns via cross-learner
    const crossLearner = new CrossLearner(teamId);
    await crossLearner.buildGlobalPatternLibrary();

    // Validate past predictions
    await this.outcomeValidator.validatePredictions();

    // Update calibration
    await this.confidenceCalibrator.updateCalibrationCurve();

    // Generate team-level alerts based on global patterns
    // This would typically query the team's players and analyze each

    return alerts;
  }

  /**
   * Records an interaction for learning
   *
   * @param interaction - The user interaction
   */
  async learn(interaction: UserInteraction): Promise<void> {
    const learner = new BehaviorLearner(
      interaction.entityId,
      interaction.entityType
    );
    await learner.learnFromInteraction(interaction);
  }

  /**
   * Generates composed insights from analysis
   */
  private async generateInsights(
    playerId: string,
    features: ExtractedFeatures,
    patterns: MinedPattern[],
    causal: CausalRelationship[],
    predictions: PerformancePrediction[],
    shotPatterns?: ShotPatternAnalysis,
    stats?: GolfStats
  ): Promise<ComposedInsight[]> {
    const insights: ComposedInsight[] = [];

    const context: InsightContext = {
      playerId,
      isForCoach: false,
      verbosity: 'balanced',
      playerState: this.inferPlayerState(features),
      recentPerformance: this.inferRecentPerformance(features),
    };

    // Stats-based insights (highest priority - directly tied to stroke savings)
    if (stats && stats.roundsPlayed >= 3) {
      const statsInsights = await this.generateStatsInsights(playerId, stats);
      insights.push(...statsInsights);
    }

    // Pattern insights
    for (const pattern of patterns.filter((p) => p.isActive).slice(0, 3)) {
      const reasoning = this.reasoningEngine.reason(
        {
          type: 'pattern_detected',
          description: pattern.description || 'Pattern detected',
          data: pattern as unknown as Record<string, unknown>,
        },
        { features, patterns, causalRelationships: causal }
      );

      reasoning.calibratedConfidence = await this.confidenceCalibrator.calibrate(
        reasoning.confidence
      );

      insights.push(
        this.insightComposer.compose(
          {
            type: 'pattern',
            data: pattern as unknown as Record<string, unknown>,
            reasoning,
            features,
          },
          context
        )
      );
    }

    // Shot pattern insights (critical patterns only)
    if (shotPatterns?.criticalPatterns) {
      for (const shotPattern of shotPatterns.criticalPatterns.slice(0, 2)) {
        // Create shot-specific reasoning chain based on the actual pattern data
        // NOT the generic player state reasoning
        const shotReasoning = this.buildShotPatternReasoning(shotPattern);

        const calibratedConfidence = await this.confidenceCalibrator.calibrate(
          shotPattern.confidence
        );

        insights.push({
          headline: `Shot Pattern: ${shotPattern.situation.distanceRange.label}`,
          body: shotPattern.insight,
          callToAction: shotPattern.recommendation,
          tone: shotPattern.dispersionPattern.startsWith('one_way') ? 'cautionary' : 'neutral',
          confidence: shotPattern.confidence,
          reasoning: {
            ...shotReasoning,
            calibratedConfidence,
          },
        });
      }
    }

    // Prediction insights
    for (const prediction of predictions) {
      const reasoning = this.reasoningEngine.reason(
        {
          type: 'performance_change',
          description: 'Performance forecast',
          data: prediction as unknown as Record<string, unknown>,
        },
        { features, patterns }
      );

      reasoning.calibratedConfidence = await this.confidenceCalibrator.calibrate(
        reasoning.confidence
      );

      insights.push(
        this.insightComposer.compose(
          {
            type: 'prediction',
            data: prediction as unknown as Record<string, unknown>,
            reasoning,
            features,
          },
          context
        )
      );
    }

    return insights;
  }

  /**
   * Determines overall alert level
   */
  private determineAlertLevel(
    patterns: MinedPattern[],
    predictions: PerformancePrediction[],
    features: ExtractedFeatures
  ): 'none' | 'info' | 'warning' | 'critical' {
    // Check for critical patterns
    const criticalPatterns = patterns.filter(
      (p) => p.strokeImpact > 2 && p.confidence > 0.7
    );
    if (criticalPatterns.length > 0) {
      return 'critical';
    }

    // Check for warning patterns
    const warningPatterns = patterns.filter(
      (p) => p.strokeImpact > 1 && p.confidence > 0.6
    );
    if (warningPatterns.length > 0) {
      return 'warning';
    }

    // Check predictions
    for (const pred of predictions) {
      if (pred.predictedValue > 5) {
        return 'warning';
      }
    }

    // Check features
    if (features.contextual.formCycle === 'declining') {
      return 'info';
    }

    return 'none';
  }

  /**
   * Generates recommendations
   */
  private generateRecommendations(
    patterns: MinedPattern[],
    causal: CausalRelationship[],
    features: ExtractedFeatures
  ): string[] {
    const recommendations: string[] = [];

    // From patterns
    for (const pattern of patterns.filter((p) => p.isActive && p.recommendation)) {
      recommendations.push(pattern.recommendation!);
    }

    // From causal
    for (const rel of causal.filter((c) => c.interventionPotential > 0.7)) {
      recommendations.push(
        `Consider addressing ${rel.cause} to improve ${rel.effect}.`
      );
    }

    // From features
    if (features.temporal.daysSinceLastRound > 7) {
      recommendations.push(
        'Consider a practice round before competitive play after extended break.'
      );
    }

    if (features.contextual.formCycle === 'declining') {
      recommendations.push(
        'Review fundamentals and consider focused practice sessions.'
      );
    }

    return recommendations.slice(0, 5);
  }

  /**
   * Infers player state from features
   */
  private inferPlayerState(
    features: ExtractedFeatures
  ): 'improving' | 'stable' | 'struggling' | 'unknown' {
    if (features.temporal.recentFormScore > 0.3) {
      return 'improving';
    }
    if (features.temporal.recentFormScore < -0.3) {
      return 'struggling';
    }
    if (Math.abs(features.temporal.scoringTrend7Day) < 0.2) {
      return 'stable';
    }
    return 'unknown';
  }

  /**
   * Infers recent performance from features
   */
  private inferRecentPerformance(
    features: ExtractedFeatures
  ): 'good' | 'average' | 'poor' {
    const formCycle = features.contextual.formCycle;
    if (formCycle === 'peak' || formCycle === 'rising') {
      return 'good';
    }
    if (formCycle === 'declining' || formCycle === 'trough') {
      return 'poor';
    }
    return 'average';
  }

  /**
   * Identifies focus areas from analysis
   */
  private identifyFocusAreas(
    patterns: MinedPattern[],
    causal: CausalRelationship[]
  ): string[] {
    const areas: string[] = [];

    // From patterns with negative impact
    for (const pattern of patterns.filter((p) => p.strokeImpact > 0.5)) {
      const condition = pattern.conditions[0];
      if (condition) {
        areas.push(condition.label || condition.field);
      }
    }

    // From causal with high intervention potential
    for (const rel of causal.filter((c) => c.interventionPotential > 0.6)) {
      areas.push(rel.cause);
    }

    return Array.from(new Set(areas)).slice(0, 3);
  }

  /**
   * Determines practice priority
   */
  private determinePracticePriority(
    patterns: MinedPattern[],
    causal: CausalRelationship[]
  ): string {
    // Find highest impact actionable pattern
    const actionablePatterns = patterns
      .filter((p) => p.actionability > 0.5 && p.strokeImpact > 0.3)
      .sort((a, b) => b.strokeImpact * b.actionability - a.strokeImpact * a.actionability);

    const top = actionablePatterns[0];
    if (top) {
      return top.recommendation || 'Address top pattern through focused practice.';
    }

    // Fall back to causal
    const topCausal = causal
      .filter((c) => c.interventionPotential > 0.5)
      .sort((a, b) => b.strength - a.strength)[0];

    if (topCausal) {
      return `Focus on improving ${topCausal.cause} to enhance ${topCausal.effect}.`;
    }

    return 'Continue current practice routine.';
  }

  /**
   * Builds shot-specific reasoning for shot pattern insights
   * Instead of using generic player state reasoning, this creates reasoning
   * that directly relates to the shot pattern data
   */
  private buildShotPatternReasoning(pattern: ShotPattern): Omit<ReasoningResult, 'calibratedConfidence'> {
    const reasoningChain = [];
    let stepNumber = 1;

    // Step 1: Analyze the data sample
    reasoningChain.push({
      stepNumber: stepNumber++,
      type: 'inductive' as const,
      premise: `Analyzed ${pattern.sampleSize} shots from ${pattern.situation.distanceRange.label} distance`,
      inference: `Sample size of ${pattern.sampleSize} provides ${pattern.confidence > 0.8 ? 'high' : pattern.confidence > 0.6 ? 'moderate' : 'limited'} statistical confidence`,
      conclusion: `Pattern is ${pattern.confidence > 0.7 ? 'statistically significant' : 'worth monitoring'}`,
      confidence: pattern.confidence,
      evidence: [
        `${pattern.sampleSize} shots analyzed`,
        `${Math.round(pattern.confidence * 100)}% confidence level`,
      ],
    });

    // Step 2: Analyze primary miss tendency
    const topTendency = pattern.tendencies[0];
    if (topTendency) {
      const pct = Math.round(topTendency.frequency * 100);
      reasoningChain.push({
        stepNumber: stepNumber++,
        type: 'inductive' as const,
        premise: `When missing from this distance, ${pct}% of misses are ${this.formatMissDirection(topTendency.direction)}`,
        inference: pct > 50
          ? 'This is a dominant miss pattern requiring attention'
          : pct > 35
            ? 'This is a notable tendency that can be addressed'
            : 'This is a minor tendency to be aware of',
        conclusion: `Primary miss direction is ${this.formatMissDirection(topTendency.direction)} at ${pct}%`,
        confidence: topTendency.frequency,
        evidence: [
          `${pct}% frequency for ${topTendency.direction}`,
          `Consistency score: ${Math.round(topTendency.consistency * 100)}%`,
        ],
      });
    }

    // Step 3: Analyze dispersion pattern
    reasoningChain.push({
      stepNumber: stepNumber++,
      type: 'deductive' as const,
      premise: `Dispersion pattern is classified as "${pattern.dispersionPattern.replace(/_/g, ' ')}"`,
      inference: this.getDispersionImplication(pattern.dispersionPattern),
      conclusion: this.getDispersionConclusion(pattern.dispersionPattern),
      confidence: 0.85,
      evidence: [
        `Distance control score: ${Math.round(pattern.distanceControlScore * 100)}%`,
        `Average proximity: ${pattern.avgProximity.toFixed(1)} yards`,
      ],
    });

    // Build overall conclusion
    const conclusion = this.buildShotPatternConclusion(pattern);

    return {
      conclusion,
      confidence: pattern.confidence,
      reasoningChain,
      alternatives: [
        {
          explanation: 'Equipment or ball flight characteristics',
          probability: 0.15,
          whyLessLikely: 'Pattern is consistent across multiple rounds',
        },
        {
          explanation: 'Course conditions or wind patterns',
          probability: 0.1,
          whyLessLikely: 'Pattern appears in varying conditions',
        },
      ],
      sensitivities: [
        {
          assumption: 'Miss direction data is accurately recorded',
          ifChanged: 'If recording is inconsistent',
          impactOnConclusion: 'Pattern reliability would decrease',
        },
      ],
    };
  }

  /**
   * Formats miss direction for readable output
   */
  private formatMissDirection(direction: string): string {
    const mapping: Record<string, string> = {
      short: 'short',
      long: 'long',
      left: 'left',
      right: 'right',
      short_left: 'short-left',
      short_right: 'short-right',
      long_left: 'long-left',
      long_right: 'long-right',
    };
    return mapping[direction.toLowerCase()] ?? direction;
  }

  /**
   * Gets the implication of a dispersion pattern
   */
  private getDispersionImplication(dispersion: string): string {
    const implications: Record<string, string> = {
      one_way_right: 'Ball flight or swing path creates consistent right-side misses',
      one_way_left: 'Ball flight or swing path creates consistent left-side misses',
      one_way_short: 'Club selection or swing commitment leads to distance shortfall',
      one_way_long: 'Club selection or swing aggression leads to overshoot',
      scattered: 'Multiple factors are affecting shot consistency',
      tight: 'Shot dispersion is well controlled for this distance',
    };
    return implications[dispersion] ?? 'Analyzing dispersion characteristics';
  }

  /**
   * Gets the conclusion for a dispersion pattern
   */
  private getDispersionConclusion(dispersion: string): string {
    const conclusions: Record<string, string> = {
      one_way_right: 'A predictable miss pattern that can be used for course management',
      one_way_left: 'A predictable miss pattern that can be used for course management',
      one_way_short: 'Distance control requires attention - consider club selection adjustment',
      one_way_long: 'Distance control requires attention - consider club selection adjustment',
      scattered: 'Consistency work needed to tighten shot dispersion',
      tight: 'Distance is well controlled - maintain current approach',
    };
    return conclusions[dispersion] ?? 'Continue monitoring this pattern';
  }

  /**
   * Builds the overall conclusion for a shot pattern
   */
  private buildShotPatternConclusion(pattern: ShotPattern): string {
    const topTendency = pattern.tendencies[0];
    if (!topTendency) {
      return `From ${pattern.situation.distanceRange.label}, your shots show good distribution with no dominant miss pattern.`;
    }

    const pct = Math.round(topTendency.frequency * 100);
    const dir = this.formatMissDirection(topTendency.direction);

    if (pattern.dispersionPattern.startsWith('one_way')) {
      return `From ${pattern.situation.distanceRange.label}, you have a consistent ${dir} miss at ${pct}%. This is a predictable pattern that can be accounted for in course management.`;
    }

    return `From ${pattern.situation.distanceRange.label}, your primary miss is ${dir} at ${pct}%. Focus on swing path and face angle to address this tendency.`;
  }

  /**
   * Fetches comprehensive player stats for insight generation
   * Uses the server action pattern to get detailed shot-level stats
   */
  private async fetchPlayerStats(playerId: string): Promise<GolfStats | undefined> {
    try {
      // Dynamic import to avoid client/server import issues
      const { getDetailedStats } = await import('@/app/golf/actions/stats-data');
      const stats = await getDetailedStats(playerId, 'overall');
      return stats;
    } catch (error) {
      console.error('[CoachHelm] Error fetching player stats:', error);
      return undefined;
    }
  }

  /**
   * Generates stats-based insights from comprehensive golf statistics
   * These insights are directly tied to stroke savings and are high priority
   */
  private async generateStatsInsights(
    playerId: string,
    stats: GolfStats
  ): Promise<ComposedInsight[]> {
    const generator = new StatsInsightGenerator(playerId);
    const statsInsights = await generator.generateInsights(stats);

    // Convert stats insights to composed insights format
    return statsInsights.map((insight) => this.convertStatsInsightToComposed(insight));
  }

  /**
   * Converts a StatsInsight to the ComposedInsight format used by the orchestrator
   */
  private convertStatsInsightToComposed(insight: StatsInsight): ComposedInsight {
    // Map priority to tone
    const toneMap: Record<string, ComposedInsight['tone']> = {
      critical: 'urgent',
      high: 'cautionary',
      medium: 'neutral',
      low: 'encouraging',
    };

    // Build reasoning chain from evidence metrics
    type ReasoningType = 'inductive' | 'deductive' | 'abductive';
    const reasoningChain: Array<{
      stepNumber: number;
      type: ReasoningType;
      premise: string;
      inference: string;
      conclusion: string;
      confidence: number;
      evidence: string[];
    }> = insight.evidenceMetrics.map((metric, i) => ({
      stepNumber: i + 1,
      type: 'inductive' as ReasoningType,
      premise: `${metric.label}: ${metric.value}`,
      inference: metric.benchmark
        ? `Compared to benchmark of ${metric.benchmark}`
        : 'Observed from shot data analysis',
      conclusion: metric.trend
        ? `Trend is ${metric.trend}`
        : 'Statistical pattern identified',
      confidence: insight.confidence,
      evidence: [`${metric.label}: ${metric.value}`],
    }));

    // Add stroke impact reasoning step
    if (insight.strokeImpact > 0) {
      reasoningChain.push({
        stepNumber: reasoningChain.length + 1,
        type: 'deductive' as ReasoningType,
        premise: `This pattern has an estimated stroke impact of ${insight.strokeImpact.toFixed(1)} strokes per round`,
        inference: insight.strokeImpact > 0.5
          ? 'This is a significant area for improvement'
          : 'Addressing this would provide incremental gains',
        conclusion: `Potential improvement: ${insight.strokeImpact.toFixed(1)} strokes/round`,
        confidence: insight.confidence,
        evidence: [`Stroke impact: ${insight.strokeImpact.toFixed(2)}`],
      });
    }

    return {
      headline: insight.headline,
      body: insight.body,
      callToAction: insight.recommendation,
      tone: toneMap[insight.priority] ?? 'neutral',
      confidence: insight.confidence,
      reasoning: {
        conclusion: `${insight.headline}: ${insight.body}`,
        confidence: insight.confidence,
        calibratedConfidence: insight.confidence, // Will be calibrated later if needed
        reasoningChain,
        alternatives: [],
        sensitivities: [],
      },
    };
  }
}

/**
 * Singleton instance of CoachHelmIntelligence
 */
export const coachHelmIntelligence = new CoachHelmIntelligence();

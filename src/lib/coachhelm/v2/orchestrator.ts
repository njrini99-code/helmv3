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
import { PatternMiner, CausalEngine, ShotPatternMiner } from './mining';
import { PerformancePredictor, TrajectoryForecaster } from './prediction';
import { BehaviorLearner, OutcomeValidator, CrossLearner } from './learning';
import { ReasoningEngine, ConfidenceCalibrator } from './reasoning';
import { InsightComposer } from './nlg';

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
    let predictions: PerformancePrediction[] = [];
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

    // Generate insights (including shot patterns)
    const insights = await this.generateInsights(
      playerId,
      features,
      patterns,
      causalRelationships,
      predictions,
      shotPatterns
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
    shotPatterns?: ShotPatternAnalysis
  ): Promise<ComposedInsight[]> {
    const insights: ComposedInsight[] = [];

    const context: InsightContext = {
      playerId,
      isForCoach: false,
      verbosity: 'balanced',
      playerState: this.inferPlayerState(features),
      recentPerformance: this.inferRecentPerformance(features),
    };

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
        const reasoning = this.reasoningEngine.reason(
          {
            type: 'pattern_detected',
            description: shotPattern.insight,
            data: shotPattern as unknown as Record<string, unknown>,
          },
          { features, patterns }
        );

        reasoning.calibratedConfidence = await this.confidenceCalibrator.calibrate(
          shotPattern.confidence
        );

        insights.push({
          headline: `Shot Pattern: ${shotPattern.situation.distanceRange.label}`,
          body: shotPattern.insight,
          callToAction: shotPattern.recommendation,
          tone: shotPattern.dispersionPattern.startsWith('one_way') ? 'cautionary' : 'neutral',
          confidence: shotPattern.confidence,
          reasoning,
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

    return [...new Set(areas)].slice(0, 3);
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
}

/**
 * Singleton instance of CoachHelmIntelligence
 */
export const coachHelmIntelligence = new CoachHelmIntelligence();

/**
 * Reasoning Engine
 *
 * Provides multi-type reasoning including:
 * - Deductive reasoning (if rules met, then conclusion)
 * - Inductive reasoning (pattern-based inference)
 * - Abductive reasoning (best explanation for observation)
 */

import type {
  ReasoningResult,
  ReasoningStep,
  AlternativeExplanation,
  Sensitivity,
  MinedPattern,
  ExtractedFeatures,
  CausalRelationship,
} from '../types';

/**
 * Reasoning Engine class for multi-type reasoning
 */
export class ReasoningEngine {
  /**
   * Main reasoning entry point
   *
   * @param observation - What we observed
   * @param context - Available context (features, patterns, causal)
   */
  reason(
    observation: {
      type: 'performance_change' | 'pattern_detected' | 'anomaly' | 'milestone';
      description: string;
      data: Record<string, unknown>;
    },
    context: {
      features?: ExtractedFeatures;
      patterns?: MinedPattern[];
      causalRelationships?: CausalRelationship[];
    }
  ): ReasoningResult {
    const reasoningChain: ReasoningStep[] = [];
    let stepNumber = 1;

    // Step 1: Deductive reasoning (what rules apply?)
    const deductiveSteps = this.reasonDeductively(observation, context);
    for (const step of deductiveSteps) {
      reasoningChain.push({ ...step, stepNumber: stepNumber++ });
    }

    // Step 2: Inductive reasoning (what patterns suggest?)
    const inductiveSteps = this.reasonInductively(observation, context);
    for (const step of inductiveSteps) {
      reasoningChain.push({ ...step, stepNumber: stepNumber++ });
    }

    // Step 3: Abductive reasoning (what's the best explanation?)
    const abductiveSteps = this.reasonAbductively(observation, context);
    for (const step of abductiveSteps) {
      reasoningChain.push({ ...step, stepNumber: stepNumber++ });
    }

    // Synthesize conclusion
    const conclusion = this.synthesizeConclusion(reasoningChain);

    // Generate alternatives
    const alternatives = this.generateAlternatives(observation, context);

    // Calculate sensitivities
    const sensitivities = this.calculateSensitivities(reasoningChain);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(reasoningChain);

    return {
      conclusion,
      confidence,
      calibratedConfidence: confidence, // Will be adjusted by calibrator
      reasoningChain,
      alternatives,
      sensitivities,
    };
  }

  /**
   * Deductive reasoning - applies known rules
   */
  private reasonDeductively(
    _observation: { type: string; data: Record<string, unknown> },
    context: {
      features?: ExtractedFeatures;
      causalRelationships?: CausalRelationship[];
    }
  ): Omit<ReasoningStep, 'stepNumber'>[] {
    const steps: Omit<ReasoningStep, 'stepNumber'>[] = [];

    // Rule: Extended break leads to rust
    if (context.features && context.features.temporal.daysSinceLastRound >= 7) {
      steps.push({
        type: 'deductive',
        premise: 'Extended breaks (7+ days) typically lead to scoring decline',
        inference: `Player had ${context.features.temporal.daysSinceLastRound} days since last round`,
        conclusion: 'Some rust effect is expected',
        confidence: 0.75,
        evidence: ['Research on skill decay', 'Historical pattern analysis'],
      });
    }

    // Rule: Low volatility indicates consistency
    if (context.features && context.features.temporal.volatility7Day < 2) {
      steps.push({
        type: 'deductive',
        premise: 'Low scoring volatility indicates consistent performance',
        inference: `Player's 7-day volatility is ${context.features.temporal.volatility7Day.toFixed(1)}`,
        conclusion: 'Player is performing consistently',
        confidence: 0.8,
      });
    }

    // Rule: Causal relationships
    if (context.causalRelationships) {
      for (const rel of context.causalRelationships) {
        if (rel.confidence > 0.7) {
          steps.push({
            type: 'deductive',
            premise: `${rel.cause} has a causal effect on ${rel.effect}`,
            inference: `Mechanism: ${rel.mechanism}`,
            conclusion: `Changes in ${rel.cause} will affect ${rel.effect}`,
            confidence: rel.confidence,
            evidence: [
              `Strength: ${(rel.strength * 100).toFixed(0)}%`,
              `Dose-response: ${rel.doseResponse ? 'confirmed' : 'not confirmed'}`,
            ],
          });
        }
      }
    }

    return steps;
  }

  /**
   * Inductive reasoning - infers from patterns
   */
  private reasonInductively(
    _observation: { type: string; data: Record<string, unknown> },
    context: { patterns?: MinedPattern[] }
  ): Omit<ReasoningStep, 'stepNumber'>[] {
    const steps: Omit<ReasoningStep, 'stepNumber'>[] = [];

    if (!context.patterns) return steps;

    // Find relevant active patterns
    const relevantPatterns = context.patterns.filter(
      (p) => p.isActive && p.confidence >= 0.6
    );

    for (const pattern of relevantPatterns.slice(0, 3)) {
      const conditionText = pattern.conditions
        .map((c) => c.label || `${c.field} ${c.operator} ${c.value}`)
        .join(' and ');

      const confidence = Number.isFinite(pattern.confidence) ? pattern.confidence : 0;
      const support = Number.isFinite(pattern.support) ? pattern.support : 0;
      const lift = Number.isFinite(pattern.lift) ? pattern.lift : 1;
      const strokeImpact = Number.isFinite(pattern.strokeImpact) ? pattern.strokeImpact : 0;

      steps.push({
        type: 'inductive',
        premise: `Pattern observed: When ${conditionText}`,
        inference: `This pattern has occurred ${pattern.occurrenceCount ?? 0} times with ${(confidence * 100).toFixed(0)}% reliability`,
        conclusion: pattern.description || `Expect ${strokeImpact > 0 ? 'higher' : 'lower'} scores`,
        confidence,
        evidence: [
          `Support: ${(support * 100).toFixed(0)}%`,
          `Lift: ${lift.toFixed(2)}x`,
        ],
      });
    }

    return steps;
  }

  /**
   * Abductive reasoning - finds best explanation
   */
  private reasonAbductively(
    observation: { type: string; description: string; data: Record<string, unknown> },
    context: {
      features?: ExtractedFeatures;
      patterns?: MinedPattern[];
      causalRelationships?: CausalRelationship[];
    }
  ): Omit<ReasoningStep, 'stepNumber'>[] {
    const steps: Omit<ReasoningStep, 'stepNumber'>[] = [];

    // Generate hypotheses based on observation type
    if (observation.type === 'performance_change') {
      const hypotheses = this.generateHypotheses(observation, context);

      // Rank hypotheses
      const ranked = hypotheses.sort((a, b) => b.probability - a.probability);
      const topRanked = ranked[0];

      if (topRanked) {
        steps.push({
          type: 'abductive',
          premise: `Observation: ${observation.description}`,
          inference: 'Considering multiple possible explanations',
          conclusion: `Most likely explanation: ${topRanked.explanation}`,
          confidence: topRanked.probability,
          evidence: ranked.slice(0, 3).map((h) => h.explanation),
        });
      }
    }

    // Explain anomalies
    if (observation.type === 'anomaly') {
      steps.push({
        type: 'abductive',
        premise: `Anomaly detected: ${observation.description}`,
        inference: 'Looking for unusual circumstances',
        conclusion: 'This appears to be an outlier requiring further investigation',
        confidence: 0.6,
      });
    }

    return steps;
  }

  /**
   * Generates hypotheses for abductive reasoning
   */
  private generateHypotheses(
    _observation: { data: Record<string, unknown> },
    context: {
      features?: ExtractedFeatures;
      patterns?: MinedPattern[];
      causalRelationships?: CausalRelationship[];
    }
  ): Array<{ explanation: string; probability: number }> {
    const hypotheses: Array<{ explanation: string; probability: number }> = [];

    // Check features for explanations
    if (context.features) {
      const f = context.features;

      if (f.temporal.daysSinceLastRound >= 7) {
        hypotheses.push({
          explanation: 'Extended break causing rust',
          probability: 0.7,
        });
      }

      if (f.contextual.formCycle === 'declining') {
        hypotheses.push({
          explanation: 'Natural form cycle decline',
          probability: 0.6,
        });
      }

      if (f.contextual.confidenceLevel === 'low') {
        hypotheses.push({
          explanation: 'Confidence issues affecting performance',
          probability: 0.5,
        });
      }
    }

    // Check patterns for explanations
    if (context.patterns) {
      for (const pattern of context.patterns.filter((p) => p.isActive)) {
        if (pattern.strokeImpact > 1) {
          hypotheses.push({
            explanation: `Active pattern: ${pattern.description ?? pattern.patternType}`,
            probability: pattern.confidence * 0.8,
          });
        }
      }
    }

    // Check causal relationships
    if (context.causalRelationships) {
      for (const rel of context.causalRelationships) {
        hypotheses.push({
          explanation: `${rel.cause} is affecting ${rel.effect}: ${rel.mechanism}`,
          probability: rel.confidence * 0.7,
        });
      }
    }

    return hypotheses;
  }

  /**
   * Synthesizes final conclusion from reasoning chain
   */
  private synthesizeConclusion(chain: ReasoningStep[]): string {
    if (chain.length === 0) {
      return 'Insufficient information to draw conclusions.';
    }

    // Find the highest confidence conclusion
    const sorted = [...chain].sort((a, b) => b.confidence - a.confidence);
    const top = sorted[0];

    if (!top) {
      return 'Insufficient information to draw conclusions.';
    }

    // Build synthesis
    const deductiveConclusions = chain
      .filter((s) => s.type === 'deductive')
      .map((s) => s.conclusion);

    const inductiveConclusions = chain
      .filter((s) => s.type === 'inductive')
      .map((s) => s.conclusion);

    let synthesis = top.conclusion;

    if (deductiveConclusions.length > 0 && inductiveConclusions.length > 0) {
      synthesis = `Based on known principles and observed patterns: ${top.conclusion}`;
    }

    return synthesis;
  }

  /**
   * Generates alternative explanations
   */
  private generateAlternatives(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _observation: { data: Record<string, unknown> },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: {
      features?: ExtractedFeatures;
      patterns?: MinedPattern[];
    }
  ): AlternativeExplanation[] {
    const alternatives: AlternativeExplanation[] = [];

    // Always consider randomness
    alternatives.push({
      explanation: 'Natural variance in performance',
      probability: 0.2,
      whyLessLikely: 'Pattern consistency suggests systematic factors',
    });

    // External factors
    alternatives.push({
      explanation: 'External factors not captured in data',
      probability: 0.15,
      whyLessLikely: 'No obvious external disruptions detected',
    });

    // Measurement error
    alternatives.push({
      explanation: 'Data quality or recording issues',
      probability: 0.05,
      whyLessLikely: 'Consistent data quality across rounds',
    });

    return alternatives;
  }

  /**
   * Calculates sensitivities of the conclusion
   */
  private calculateSensitivities(chain: ReasoningStep[]): Sensitivity[] {
    const sensitivities: Sensitivity[] = [];

    // Key assumptions
    for (const step of chain) {
      if (step.type === 'deductive') {
        sensitivities.push({
          assumption: step.premise,
          ifChanged: `If this rule doesn't apply`,
          impactOnConclusion: 'Conclusion confidence would decrease significantly',
        });
      }
    }

    // Pattern reliability
    const patternSteps = chain.filter((s) => s.type === 'inductive');
    if (patternSteps.length > 0) {
      sensitivities.push({
        assumption: 'Historical patterns continue to hold',
        ifChanged: 'If player behavior has fundamentally changed',
        impactOnConclusion: 'Pattern-based inferences would be invalid',
      });
    }

    return sensitivities;
  }

  /**
   * Calculates overall confidence from reasoning chain
   */
  private calculateConfidence(chain: ReasoningStep[]): number {
    if (chain.length === 0) return 0;

    // Weighted average with diminishing returns for multiple sources
    let totalWeight = 0;
    let weightedConfidence = 0;

    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      if (!step) continue;
      const weight = 1 / (i + 1); // Diminishing weight for later steps
      totalWeight += weight;
      weightedConfidence += step.confidence * weight;
    }

    return totalWeight > 0 ? weightedConfidence / totalWeight : 0;
  }
}

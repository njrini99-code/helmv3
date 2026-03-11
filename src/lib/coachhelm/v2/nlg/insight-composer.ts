/**
 * Insight Composer
 *
 * Composes human-readable insights from analysis including:
 * - Tone-appropriate messaging
 * - Headline and body composition
 * - Call-to-action generation
 * - Verbosity adaptation
 */

import type {
  ComposedInsight,
  InsightTone,
  InsightContext,
  ReasoningResult,
  MinedPattern,
  PerformancePrediction,
  ExtractedFeatures,
} from '../types';

/** Strip NaN artifacts from generated text */
function sanitizeText(text: string): string {
  return text
    .replace(/This occurs in NaN% of rounds with NaN% reliability\.?\s*/gi, '')
    .replace(/\bNaN%/g, '—')
    .replace(/\bNaN\b/g, '—')
    .replace(/\s+—\s+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Insight Composer class for natural language generation
 */
export class InsightComposer {
  /**
   * Composes an insight from analysis data
   *
   * @param insight - The insight data to compose
   * @param context - Context for personalization
   */
  compose(
    insight: {
      type: 'pattern' | 'prediction' | 'causal' | 'milestone' | 'alert';
      data: MinedPattern | PerformancePrediction | Record<string, unknown>;
      reasoning?: ReasoningResult;
      features?: ExtractedFeatures;
    },
    context: InsightContext
  ): ComposedInsight {
    // Convert to internal format with explicit data typing
    const internalInsight = {
      type: insight.type,
      data: insight.data as Record<string, unknown>,
      reasoning: insight.reasoning,
      features: insight.features,
    };

    // Determine appropriate tone
    const tone = this.determineTone(internalInsight, context);

    // Compose headline
    const headline = this.composeHeadline(internalInsight, tone);

    // Compose body based on verbosity
    const body = this.composeBody(internalInsight, context.verbosity);

    // Generate call to action
    const callToAction = this.generateCallToAction(internalInsight, context);

    // Calculate confidence
    const confidence = this.extractConfidence(internalInsight);

    return {
      headline: sanitizeText(headline),
      body: sanitizeText(body),
      callToAction,
      tone,
      confidence,
      reasoning: insight.reasoning,
    };
  }

  /**
   * Determines appropriate tone based on context
   */
  private determineTone(
    insight: {
      type: string;
      data: Record<string, unknown>;
      features?: ExtractedFeatures;
    },
    context: InsightContext
  ): InsightTone {
    // Alert types
    if (insight.type === 'alert') {
      const severity = insight.data.severity as string;
      if (severity === 'critical') return 'urgent';
      if (severity === 'warning') return 'cautionary';
    }

    // Consider player state
    if (context.playerState === 'struggling') {
      return 'encouraging';
    }

    if (context.recentPerformance === 'good') {
      return 'celebratory';
    }

    // Pattern with negative impact
    if (insight.type === 'pattern') {
      const pattern = insight.data as unknown as MinedPattern;
      if (pattern.strokeImpact > 1) {
        return 'cautionary';
      }
      if (pattern.strokeImpact < -0.5) {
        return 'celebratory';
      }
    }

    // Prediction
    if (insight.type === 'prediction') {
      const pred = insight.data as unknown as PerformancePrediction;
      if (pred.predictedValue < 0) {
        return 'encouraging';
      }
    }

    return 'neutral';
  }

  /**
   * Composes data-driven headline from actual insight data.
   * Prefers extracting specifics from the pattern/prediction data over
   * generic templates so coaches can skim insights effectively.
   */
  private composeHeadline(
    insight: { type: string; data: Record<string, unknown> },
    tone: InsightTone
  ): string {
    // Try to build a data-driven headline first
    const specific = this.buildSpecificHeadline(insight, tone);
    if (specific) return specific;

    // Fallback: concise tone-aware labels (not random arrays)
    const fallbacks: Record<string, Record<InsightTone, string>> = {
      pattern: {
        neutral: 'Performance Pattern',
        encouraging: 'Positive Trend',
        cautionary: 'Area to Watch',
        celebratory: 'Standout Strength',
        urgent: 'Needs Attention',
      },
      prediction: {
        neutral: 'Next Round Outlook',
        encouraging: 'Strong Outlook Ahead',
        cautionary: 'Prepare for a Grind',
        celebratory: 'Peak Form Expected',
        urgent: 'Scoring Alert',
      },
      milestone: {
        neutral: 'Progress Update',
        encouraging: 'Getting Closer',
        cautionary: 'Milestone at Risk',
        celebratory: 'Milestone Reached',
        urgent: 'Season Goal at Stake',
      },
      alert: {
        neutral: 'Heads Up',
        encouraging: 'Good News',
        cautionary: 'Watch This',
        celebratory: 'Great News',
        urgent: 'Action Needed',
      },
      causal: {
        neutral: 'Root Cause Found',
        encouraging: 'Success Factor Identified',
        cautionary: 'Issue Source Found',
        celebratory: 'Key to Their Success',
        urgent: 'Critical Discovery',
      },
    };

    const typeFallbacks = fallbacks[insight.type] ?? fallbacks.alert!;
    return typeFallbacks[tone] ?? 'Update';
  }

  /**
   * Extracts specific, data-driven headline from insight data.
   * Returns null if data is insufficient for a specific headline.
   */
  private buildSpecificHeadline(
    insight: { type: string; data: Record<string, unknown> },
    tone: InsightTone
  ): string | null {
    if (insight.type === 'pattern') {
      const pattern = insight.data as unknown as MinedPattern;
      const condition = pattern.conditions?.[0];
      const impact = pattern.strokeImpact;

      // Build from condition label + outcome direction + stroke impact
      if (condition?.label && impact !== undefined) {
        const impactStr = Math.abs(impact) >= 0.3
          ? ` (${impact > 0 ? '+' : ''}${impact.toFixed(1)} strokes)`
          : '';

        if (tone === 'celebratory' || tone === 'encouraging') {
          return `${condition.label}: Scoring Improves${impactStr}`;
        }
        if (tone === 'urgent' || tone === 'cautionary') {
          return `${condition.label}: Scoring Suffers${impactStr}`;
        }
        return `${condition.label}${impactStr}`;
      }

      // Fall back to description if available
      if (pattern.description) {
        // Take the first sentence of description, capped at ~60 chars
        const firstSentence = pattern.description.split(/[.!]/)[0] ?? '';
        if (firstSentence.length > 0 && firstSentence.length <= 65) {
          return firstSentence;
        }
        if (firstSentence.length > 65) {
          return firstSentence.slice(0, 62) + '...';
        }
      }
    }

    if (insight.type === 'prediction') {
      const pred = insight.data as unknown as PerformancePrediction;
      if (Number.isFinite(pred.predictedValue)) {
        const score = pred.predictedValue >= 0
          ? `+${pred.predictedValue.toFixed(1)}`
          : pred.predictedValue.toFixed(1);
        if (tone === 'encouraging' || tone === 'celebratory') {
          return `Forecast: ${score} — Trending Up`;
        }
        if (tone === 'cautionary' || tone === 'urgent') {
          return `Forecast: ${score} — Watch Form`;
        }
        return `Next Round Forecast: ${score}`;
      }
    }

    if (insight.type === 'causal') {
      const data = insight.data as Record<string, unknown>;
      const cause = data.cause as string | undefined;
      const effect = data.effect as string | undefined;
      if (cause && effect) {
        return `${this.titleCase(cause)} → ${this.titleCase(effect)}`;
      }
    }

    return null;
  }

  /** Title-case a snake_case or lowercase string */
  private titleCase(str: string): string {
    return str
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace('Gir', 'GIR')
      .replace('Sg ', 'SG ');
  }

  /**
   * Composes body text based on verbosity
   */
  private composeBody(
    insight: { type: string; data: Record<string, unknown>; reasoning?: ReasoningResult },
    verbosity: 'brief' | 'balanced' | 'detailed'
  ): string {
    const parts: string[] = [];

    // Main insight
    if (insight.type === 'pattern') {
      const pattern = insight.data as unknown as MinedPattern;

      // Guard: only compose pattern text if pattern has valid data
      if (pattern.description && pattern.conditions && pattern.conditions.length > 0) {
        parts.push(pattern.description);

        const support = Number.isFinite(pattern.support) ? pattern.support : 0;
        const confidence = Number.isFinite(pattern.confidence) ? pattern.confidence : 0;

        if (verbosity !== 'brief' && support > 0) {
          parts.push(
            `This occurs in ${(support * 100).toFixed(0)}% of rounds with ${(confidence * 100).toFixed(0)}% reliability.`
          );
        }

        if (verbosity === 'detailed') {
          const strokeImpact = Number.isFinite(pattern.strokeImpact) ? pattern.strokeImpact : 0;
          if (Math.abs(strokeImpact) > 0) {
            parts.push(
              `Impact: ${strokeImpact > 0 ? '+' : ''}${strokeImpact.toFixed(1)} strokes per round.`
            );
          }
          if (pattern.recommendation) {
            parts.push(pattern.recommendation);
          }
        }
      }
    }

    if (insight.type === 'prediction') {
      const pred = insight.data as unknown as PerformancePrediction;
      const predictedValue = Number.isFinite(pred.predictedValue) ? pred.predictedValue : 0;
      const rangeLow = Number.isFinite(pred.predictedRangeLow) ? pred.predictedRangeLow : 0;
      const rangeHigh = Number.isFinite(pred.predictedRangeHigh) ? pred.predictedRangeHigh : 0;
      const score = predictedValue >= 0 ? `+${predictedValue.toFixed(1)}` : predictedValue.toFixed(1);

      parts.push(`Expected score: ${score} (range: ${rangeLow.toFixed(1)} to ${rangeHigh.toFixed(1)})`);

      if (verbosity !== 'brief' && pred.keyFactors && pred.keyFactors.length > 0) {
        const topFactor = pred.keyFactors[0];
        if (topFactor) {
          parts.push(`Key factor: ${topFactor.explanation}`);
        }
      }

      if (verbosity === 'detailed' && insight.reasoning) {
        const confPct = Number.isFinite(pred.confidence) ? pred.confidence : 0;
        parts.push(`Confidence: ${(confPct * 100).toFixed(0)}%`);
      }
    }

    // Join content — keep body focused on data, not filler wrappers
    const body = parts.join(' ');

    // Strip any NaN artifacts that leaked from upstream computations
    return sanitizeText(body);
  }

  /**
   * Generates call to action
   */
  private generateCallToAction(
    insight: { type: string; data: Record<string, unknown> },
    context: InsightContext
  ): string | undefined {
    if (insight.type === 'pattern') {
      const pattern = insight.data as unknown as MinedPattern;
      if (pattern.recommendation) {
        return pattern.recommendation;
      }

      const focusArea = pattern.conditions?.[0]?.label ?? pattern.conditions?.[0]?.field ?? 'this scoring pattern';
      const impact = Number.isFinite(pattern.strokeImpact)
        ? `${Math.abs(pattern.strokeImpact).toFixed(1)} strokes per round`
        : 'measurable scoring cost';

      if (pattern.strokeImpact > 0) {
        return `Build the next practice block around ${focusArea}; this pattern is costing about ${impact}.`;
      }

      return `Keep reinforcing ${focusArea}; it is currently helping scoring by about ${impact}.`;
    }

    if (insight.type === 'prediction') {
      const pred = insight.data as unknown as PerformancePrediction;
      const topFactors = (pred.keyFactors ?? [])
        .slice(0, 2)
        .map((factor) => factor.name.toLowerCase());
      const factorSummary = topFactors.length > 0
        ? ` with extra attention on ${topFactors.join(' and ')}`
        : '';

      if (pred.predictedValue > 0) {
        return `Prepare the next round around score containment${factorSummary}; practice and course strategy should aim to protect the high side of the forecast range.`;
      }

      return `Use this forecast to press your advantage${factorSummary}; keep the pre-round plan aligned with what is driving the current form.`;
    }

    if (insight.type === 'alert') {
      const recommendation =
        (insight.data.recommendation as string | undefined)
        ?? (insight.data.callToAction as string | undefined);
      if (recommendation) {
        return recommendation;
      }

      return context.isForCoach
        ? 'Move this into the next coach-player conversation and assign a concrete practice response.'
        : 'Turn this alert into a specific practice goal before the next round.';
    }

    if (insight.type === 'causal') {
      const cause = insight.data.cause as string | undefined;
      const effect = insight.data.effect as string | undefined;
      if (cause && effect) {
        return `Address ${cause} directly in practice because it is driving ${effect}.`;
      }

      return 'Treat this as a root-cause issue and change the practice plan at the source, not just the symptom.';
    }

    if (insight.type === 'milestone') {
      return context.isForCoach
        ? 'Acknowledge the progress, then set the next measurable target while momentum is strong.'
        : 'Bank the progress and set the next measurable target immediately.';
    }

    return undefined;
  }

  /**
   * Extracts confidence from insight data
   */
  private extractConfidence(insight: {
    type: string;
    data: Record<string, unknown>;
    reasoning?: ReasoningResult;
  }): number {
    let raw: number | undefined;

    if (insight.reasoning) {
      raw = insight.reasoning.calibratedConfidence;
    } else if (insight.type === 'pattern') {
      const pattern = insight.data as unknown as MinedPattern;
      raw = pattern.confidence;
    } else if (insight.type === 'prediction') {
      const pred = insight.data as unknown as PerformancePrediction;
      raw = pred.calibratedConfidence;
    }

    if (Number.isFinite(raw)) {
      return Math.max(0.35, Math.min(0.98, raw!));
    }

    const reasoningEvidence = insight.reasoning?.reasoningChain.length ?? 0;
    return Math.min(0.7, 0.5 + reasoningEvidence * 0.04);
  }

  /**
   * Composes multiple insights into a summary
   */
  composeSummary(
    insights: ComposedInsight[],
    context: InsightContext
  ): string {
    if (insights.length === 0) {
      return 'No significant insights at this time.';
    }

    const parts: string[] = [];

    // Lead with most important
    const topInsight = insights.reduce((a, b) =>
      a.confidence > b.confidence ? a : b
    );

    parts.push(topInsight.headline + ': ' + topInsight.body);

    // Add brief mentions of others
    if (insights.length > 1 && context.verbosity !== 'brief') {
      const others = insights
        .filter((i) => i !== topInsight)
        .slice(0, 2)
        .map((i) => i.headline);

      if (others.length > 0) {
        parts.push(`Also noteworthy: ${others.join(', ')}.`);
      }
    }

    return sanitizeText(parts.join(' '));
  }
}

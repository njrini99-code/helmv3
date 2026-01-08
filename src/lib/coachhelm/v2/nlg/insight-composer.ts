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
    const body = this.composeBody(internalInsight, context.verbosity, tone);

    // Generate call to action
    const callToAction = this.generateCallToAction(internalInsight, context);

    // Calculate confidence
    const confidence = this.extractConfidence(internalInsight);

    return {
      headline,
      body,
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
   * Composes attention-grabbing headline
   */
  private composeHeadline(
    insight: { type: string; data: Record<string, unknown> },
    tone: InsightTone
  ): string {
    const templates: Record<string, Record<InsightTone, string[]>> = {
      pattern: {
        neutral: [
          'Pattern Detected',
          'Scoring Pattern Identified',
          'Pattern Analysis',
        ],
        encouraging: [
          'Positive Pattern Emerging',
          'Strength Identified',
          'Something\'s Working',
        ],
        cautionary: [
          'Area to Watch',
          'Pattern Needs Attention',
          'Improvement Opportunity',
        ],
        celebratory: [
          'Great Pattern Found!',
          'This is Working!',
          'Keep This Going',
        ],
        urgent: [
          'Critical Pattern',
          'Immediate Attention Needed',
          'Important Finding',
        ],
      },
      prediction: {
        neutral: [
          'Performance Forecast',
          'Upcoming Round Outlook',
          'Score Prediction',
        ],
        encouraging: [
          'Strong Outlook Ahead',
          'Improvement Expected',
          'Positive Trajectory',
        ],
        cautionary: [
          'Challenging Round Ahead',
          'Prepare for Difficulty',
          'Tough Stretch Coming',
        ],
        celebratory: [
          'Peak Performance Expected!',
          'Great Round Coming!',
          'Breakthrough Potential',
        ],
        urgent: [
          'Critical Forecast',
          'Important Prediction',
          'Must-See Outlook',
        ],
      },
      milestone: {
        neutral: ['Milestone Update', 'Progress Report', 'Goal Tracking'],
        encouraging: [
          'Getting Closer!',
          'Progress Made',
          'Keep Going',
        ],
        cautionary: [
          'Milestone at Risk',
          'Off Track',
          'Adjustment Needed',
        ],
        celebratory: [
          'Milestone Reached! 🎉',
          'Goal Achieved!',
          'Celebration Time',
        ],
        urgent: [
          'Critical Milestone',
          'Deadline Approaching',
          'Time Sensitive',
        ],
      },
      alert: {
        neutral: ['Alert', 'Notification', 'Update'],
        encouraging: ['Positive Development', 'Good News', 'Looking Up'],
        cautionary: ['Heads Up', 'Watch This', 'Pay Attention'],
        celebratory: ['Great News!', 'Exciting Update!', 'Congrats!'],
        urgent: ['⚠️ Urgent Alert', '🚨 Immediate Action', 'Critical'],
      },
      causal: {
        neutral: ['Cause Found', 'Root Cause Analysis', 'Why This Happens'],
        encouraging: [
          'Success Factor Identified',
          'What\'s Working',
          'Keep Doing This',
        ],
        cautionary: [
          'Problem Source Found',
          'Root Cause Identified',
          'This Is Why',
        ],
        celebratory: ['Secret to Success!', 'This Is Key!', 'Winning Formula'],
        urgent: ['Critical Discovery', 'Must Address', 'Key Finding'],
      },
    };

    const typeTemplates = templates[insight.type] ?? templates.alert;
    const toneTemplates = typeTemplates?.[tone] ?? typeTemplates?.neutral ?? ['Update'];

    // Pick random template for variety
    return toneTemplates[Math.floor(Math.random() * toneTemplates.length)] ?? 'Update';
  }

  /**
   * Composes body text based on verbosity
   */
  private composeBody(
    insight: { type: string; data: Record<string, unknown>; reasoning?: ReasoningResult },
    verbosity: 'brief' | 'balanced' | 'detailed',
    tone: InsightTone
  ): string {
    const parts: string[] = [];

    // Main insight
    if (insight.type === 'pattern') {
      const pattern = insight.data as unknown as MinedPattern;
      parts.push(pattern.description || 'A notable pattern has been detected.');

      if (verbosity !== 'brief') {
        parts.push(
          `This occurs in ${(pattern.support * 100).toFixed(0)}% of rounds with ${(pattern.confidence * 100).toFixed(0)}% reliability.`
        );
      }

      if (verbosity === 'detailed') {
        parts.push(
          `Impact: ${pattern.strokeImpact > 0 ? '+' : ''}${pattern.strokeImpact.toFixed(1)} strokes per round.`
        );
        if (pattern.recommendation) {
          parts.push(pattern.recommendation);
        }
      }
    }

    if (insight.type === 'prediction') {
      const pred = insight.data as unknown as PerformancePrediction;
      const score = pred.predictedValue >= 0 ? `+${pred.predictedValue.toFixed(1)}` : pred.predictedValue.toFixed(1);

      parts.push(`Expected score: ${score} (range: ${pred.predictedRangeLow.toFixed(1)} to ${pred.predictedRangeHigh.toFixed(1)})`);

      if (verbosity !== 'brief' && pred.keyFactors && pred.keyFactors.length > 0) {
        const topFactor = pred.keyFactors[0];
        if (topFactor) {
          parts.push(`Key factor: ${topFactor.explanation}`);
        }
      }

      if (verbosity === 'detailed' && insight.reasoning) {
        parts.push(`Confidence: ${(pred.confidence * 100).toFixed(0)}%`);
      }
    }

    // Add tone-appropriate wrapper
    let body = parts.join(' ');

    if (tone === 'encouraging') {
      body = `Here's some positive news. ${body} Keep up the good work!`;
    } else if (tone === 'cautionary') {
      body = `Something to be aware of. ${body} But with focus, this can be addressed.`;
    } else if (tone === 'celebratory') {
      body = `This is great! ${body}`;
    } else if (tone === 'urgent') {
      body = `Important: ${body} This requires immediate attention.`;
    }

    return body;
  }

  /**
   * Generates call to action
   */
  private generateCallToAction(
    insight: { type: string; data: Record<string, unknown> },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: InsightContext
  ): string | undefined {
    if (insight.type === 'pattern') {
      const pattern = insight.data as unknown as MinedPattern;
      if (pattern.strokeImpact > 0) {
        return 'Review practice focus to address this pattern.';
      }
      return 'Discuss with coach to reinforce this positive pattern.';
    }

    if (insight.type === 'prediction') {
      return 'Check upcoming schedule and prepare accordingly.';
    }

    if (insight.type === 'alert') {
      return 'Review details and take appropriate action.';
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
    if (insight.reasoning) {
      return insight.reasoning.calibratedConfidence;
    }

    if (insight.type === 'pattern') {
      const pattern = insight.data as unknown as MinedPattern;
      return pattern.confidence;
    }

    if (insight.type === 'prediction') {
      const pred = insight.data as unknown as PerformancePrediction;
      return pred.calibratedConfidence;
    }

    return 0.7; // Default confidence
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

    return parts.join(' ');
  }
}

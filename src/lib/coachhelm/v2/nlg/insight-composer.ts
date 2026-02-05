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
          'Trend Spotted',
          'Data-Driven Finding',
          'Performance Pattern',
          'Statistical Pattern',
          'Recurring Tendency',
        ],
        encouraging: [
          'Positive Pattern Emerging',
          'Strength Identified',
          'Something\'s Working',
          'Momentum Building',
          'Consistent Strength',
          'Reliable Trend',
          'Solid Foundation Detected',
        ],
        cautionary: [
          'Area to Watch',
          'Pattern Needs Attention',
          'Improvement Opportunity',
          'Worth a Closer Look',
          'Room for Adjustment',
          'Coaching Opportunity',
          'Development Area Flagged',
        ],
        celebratory: [
          'Great Pattern Found!',
          'This is Working!',
          'Keep This Going',
          'Winning Trend!',
          'Stand-Out Pattern',
          'Elite-Level Consistency',
        ],
        urgent: [
          'Critical Pattern',
          'Immediate Attention Needed',
          'Important Finding',
          'High-Priority Pattern',
          'Action Required',
          'Significant Trend Change',
        ],
      },
      prediction: {
        neutral: [
          'Performance Forecast',
          'Upcoming Round Outlook',
          'Score Prediction',
          'Projection Update',
          'Expected Performance Range',
          'Scoring Outlook',
          'Next Round Forecast',
        ],
        encouraging: [
          'Strong Outlook Ahead',
          'Improvement Expected',
          'Positive Trajectory',
          'Upward Trend Projected',
          'Scoring Dip Likely Behind Them',
          'Good Things Coming',
          'Form is Trending Up',
        ],
        cautionary: [
          'Challenging Round Ahead',
          'Prepare for Difficulty',
          'Tough Stretch Coming',
          'Scoring May Regress',
          'Expect a Grind',
          'Conditions Favor Caution',
        ],
        celebratory: [
          'Peak Performance Expected!',
          'Great Round Coming!',
          'Breakthrough Potential',
          'Career-Best Territory',
          'Playing Their Best Golf',
          'Everything Is Clicking',
        ],
        urgent: [
          'Critical Forecast',
          'Important Prediction',
          'Must-See Outlook',
          'Scoring Alert',
          'Major Shift Expected',
        ],
      },
      milestone: {
        neutral: [
          'Milestone Update',
          'Progress Report',
          'Goal Tracking',
          'Development Checkpoint',
          'Progress Snapshot',
        ],
        encouraging: [
          'Getting Closer!',
          'Progress Made',
          'Keep Going',
          'On the Right Track',
          'Building Toward the Goal',
          'Steady Progress',
        ],
        cautionary: [
          'Milestone at Risk',
          'Off Track',
          'Adjustment Needed',
          'Falling Behind Target',
          'Goal Needs Recalibration',
        ],
        celebratory: [
          'Milestone Reached!',
          'Goal Achieved!',
          'Celebration Time',
          'Target Hit!',
          'New Personal Best',
          'Benchmark Surpassed',
        ],
        urgent: [
          'Critical Milestone',
          'Deadline Approaching',
          'Time Sensitive',
          'Season Goal at Stake',
          'Must-Address Target',
        ],
      },
      alert: {
        neutral: [
          'Alert',
          'Notification',
          'Update',
          'Heads-Up',
          'FYI',
          'Status Change',
        ],
        encouraging: [
          'Positive Development',
          'Good News',
          'Looking Up',
          'Encouraging Sign',
          'Silver Lining',
          'Bright Spot',
        ],
        cautionary: [
          'Heads Up',
          'Watch This',
          'Pay Attention',
          'Monitor Closely',
          'Keep an Eye On This',
          'Worth Watching',
        ],
        celebratory: [
          'Great News!',
          'Exciting Update!',
          'Congrats!',
          'Well Earned!',
          'Outstanding!',
        ],
        urgent: [
          'Urgent Alert',
          'Immediate Action',
          'Critical',
          'Needs Attention Now',
          'Priority Issue',
          'Time-Sensitive Alert',
        ],
      },
      causal: {
        neutral: [
          'Cause Found',
          'Root Cause Analysis',
          'Why This Happens',
          'Key Driver Identified',
          'Contributing Factor',
          'Connection Discovered',
        ],
        encouraging: [
          'Success Factor Identified',
          'What\'s Working',
          'Keep Doing This',
          'Winning Ingredient',
          'This Drives Success',
          'The Key to Their Improvement',
        ],
        cautionary: [
          'Problem Source Found',
          'Root Cause Identified',
          'This Is Why',
          'Here\'s the Issue',
          'Underlying Factor Found',
          'Cause of the Slump',
        ],
        celebratory: [
          'Secret to Success!',
          'This Is Key!',
          'Winning Formula',
          'Found the Edge!',
          'Breakthrough Factor',
        ],
        urgent: [
          'Critical Discovery',
          'Must Address',
          'Key Finding',
          'Root Cause is Clear',
          'Immediate Cause Found',
        ],
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

    // Add tone-appropriate wrapper (randomized for variety)
    let body = parts.join(' ');

    const encouragingOpeners = [
      'Here\'s some positive news.',
      'Good to see this.',
      'This is worth noting.',
      'A bright spot in the data.',
    ];
    const encouragingClosers = [
      'Keep up the good work!',
      'This is the right direction.',
      'Build on this momentum.',
      'Reinforce this with consistent practice.',
    ];
    const cautionaryOpeners = [
      'Something to be aware of.',
      'This deserves attention.',
      'Worth addressing soon.',
      'Keep this on the radar.',
    ];
    const cautionaryClosers = [
      'But with focus, this can be addressed.',
      'A targeted practice plan can turn this around.',
      'Small adjustments here can make a big difference.',
      'This is fixable with the right approach.',
    ];
    const celebratoryOpeners = [
      'This is great!',
      'Excellent work!',
      'Really impressive.',
      'This stands out.',
    ];
    const urgentOpeners = [
      'Important:',
      'Attention needed:',
      'Priority item:',
      'Act on this:',
    ];
    const urgentClosers = [
      'This requires immediate attention.',
      'Address this before the next competition.',
      'Don\'t let this go unaddressed.',
      'This should be the top practice priority.',
    ];

    const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)] ?? arr[0];

    if (tone === 'encouraging') {
      body = `${pick(encouragingOpeners)} ${body} ${pick(encouragingClosers)}`;
    } else if (tone === 'cautionary') {
      body = `${pick(cautionaryOpeners)} ${body} ${pick(cautionaryClosers)}`;
    } else if (tone === 'celebratory') {
      body = `${pick(celebratoryOpeners)} ${body}`;
    } else if (tone === 'urgent') {
      body = `${pick(urgentOpeners)} ${body} ${pick(urgentClosers)}`;
    }

    return body;
  }

  /**
   * Generates call to action
   */
  private generateCallToAction(
    insight: { type: string; data: Record<string, unknown> },
    context: InsightContext
  ): string | undefined {
    const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)] ?? arr[0];

    if (insight.type === 'pattern') {
      const pattern = insight.data as unknown as MinedPattern;
      if (pattern.strokeImpact > 0) {
        return pick([
          'Review practice focus to address this pattern.',
          'Design a drill targeting this weakness.',
          'Prioritize this in the next practice session.',
          'Build this into the weekly development plan.',
        ]);
      }
      return pick([
        'Discuss with coach to reinforce this positive pattern.',
        'Keep doing what\'s working here.',
        'Note this for the player\'s development report.',
        'Consider sharing this with the player as encouragement.',
      ]);
    }

    if (insight.type === 'prediction') {
      return pick([
        'Check upcoming schedule and prepare accordingly.',
        'Adjust practice plan to match the forecast.',
        'Use this to set realistic goals for the next round.',
        'Consider course management strategy based on this outlook.',
      ]);
    }

    if (insight.type === 'alert') {
      return pick([
        'Review details and take appropriate action.',
        'Check in with this player before the next event.',
        'Add this to your coaching conversation priorities.',
        'Monitor this over the next 2-3 rounds.',
      ]);
    }

    if (insight.type === 'causal') {
      return pick([
        'Use this knowledge to adjust the practice plan.',
        'Address the root cause for lasting improvement.',
        'Discuss this connection with the player.',
        'Factor this into development plan updates.',
      ]);
    }

    if (insight.type === 'milestone') {
      return context.isForCoach
        ? pick([
            'Acknowledge this progress with the player.',
            'Update the player\'s development goals.',
            'Set the next milestone target.',
          ])
        : pick([
            'Celebrate this achievement!',
            'Set your next target to keep the momentum.',
            'Share this progress with your coach.',
          ]);
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

// ============================================================================
// SUMMARY GENERATOR (V1 - DEPRECATED)
// ============================================================================
//
// @deprecated This is the V1 summary generator. Use V2 instead.
//
// For V2 usage, import from '@/lib/coachhelm/v2':
//   import { InsightComposer } from '@/lib/coachhelm/v2';
//   const composer = new InsightComposer();
//   const insight = composer.compose(input, context);
//
// V2 provides:
//   - Reasoning chains explaining conclusions
//   - Tone-appropriate language
//   - Confidence-calibrated statements
//   - Personalized based on learned preferences
//
// This file is kept for backwards compatibility during migration.
// It will be removed in a future release.
//
// ============================================================================

import {
  RoundStats,
  StrokesGainedBreakdown,
  Highlight,
  AreaToReview,
  Pattern,
  GoalImpact,
} from './types';

interface SummaryInput {
  round: unknown;
  roundStats: RoundStats;
  playerAverages: RoundStats;
  strokesGained: StrokesGainedBreakdown;
  highlights: Highlight[];
  areasToReview: AreaToReview[];
  newPatterns: Pattern[];
  recurringPatterns: Pattern[];
  goalImpacts: GoalImpact[];
}

interface SummaryOutput {
  summary: string;
  primaryTakeaway: string;
  nextPracticePriority: string | null;
}

export function generateSummary(input: SummaryInput): SummaryOutput {
  const {
    roundStats,
    playerAverages,
    strokesGained,
    highlights,
    areasToReview,
    recurringPatterns,
    newPatterns,
    goalImpacts,
  } = input;

  const paragraphs: string[] = [];

  // Paragraph 1: Overall assessment
  const scoreDiff = roundStats.scoreToPar;
  const avgDiff = roundStats.totalScore - playerAverages.totalScore;

  let opening = '';
  if (scoreDiff <= -2) {
    opening = `Excellent round! Shot ${roundStats.totalScore} (${formatScoreToPar(scoreDiff)}), which is ${Math.abs(avgDiff).toFixed(1)} strokes better than your season average.`;
  } else if (scoreDiff <= 0) {
    opening = `Solid round of ${roundStats.totalScore} (${formatScoreToPar(scoreDiff)}). `;
    if (avgDiff < 0) {
      opening += `This is ${Math.abs(avgDiff).toFixed(1)} strokes better than your average.`;
    } else if (avgDiff > 1) {
      opening += `Slightly above your ${playerAverages.totalScore.toFixed(1)} average, but still a good score.`;
    }
  } else if (scoreDiff <= 4) {
    opening = `Shot ${roundStats.totalScore} (${formatScoreToPar(scoreDiff)}). `;
    if (avgDiff > 0) {
      opening += `This is ${avgDiff.toFixed(1)} strokes above your average, so there's room to clean things up.`;
    }
  } else {
    opening = `Tough day with a ${roundStats.totalScore} (${formatScoreToPar(scoreDiff)}). Every golfer has these rounds — what matters is what you learn from it.`;
  }
  paragraphs.push(opening);

  // Paragraph 2: What went well + what needs work
  let analysis = '';

  // Find best SG category
  const sgCategories = [
    { name: 'off the tee', value: strokesGained.tee },
    { name: 'on approach', value: strokesGained.approach },
    { name: 'around the green', value: strokesGained.aroundGreen },
    { name: 'on the greens', value: strokesGained.putting },
  ];
  const bestCategory = sgCategories.reduce((best, curr) => curr.value > best.value ? curr : best);
  const worstCategory = sgCategories.reduce((worst, curr) => curr.value < worst.value ? curr : worst);

  if (bestCategory.value > 0.3) {
    analysis += `Your strength today was ${bestCategory.name}, where you gained ${bestCategory.value.toFixed(1)} strokes versus your baseline. `;
  }

  const firstHighlight = highlights[0];
  if (firstHighlight) {
    const highlightMention = firstHighlight.type === 'birdie_streak'
      ? firstHighlight.title.toLowerCase()
      : firstHighlight.type === 'eagle'
        ? 'the eagle'
        : `the ${firstHighlight.type.replace(/_/g, ' ')}`;
    analysis += `Highlights included ${highlightMention} on hole ${firstHighlight.holeNumber}. `;
  }

  if (worstCategory.value < -0.3) {
    analysis += `The area that cost you strokes was ${worstCategory.name} (${worstCategory.value.toFixed(1)} SG). `;
  }

  const mainIssue = areasToReview[0];
  if (mainIssue) {
    analysis += `The ${mainIssue.type.replace(/_/g, ' ')} on hole ${mainIssue.holeNumber} is worth reviewing.`;
  }

  if (analysis) {
    paragraphs.push(analysis);
  }

  // Paragraph 3: Patterns and next steps
  let nextSteps = '';

  const firstRecurringPattern = recurringPatterns[0];
  if (firstRecurringPattern) {
    nextSteps += `This round reinforced a pattern we've seen before: ${firstRecurringPattern.description.toLowerCase()}. This pattern appears in ${(firstRecurringPattern.frequency * 100).toFixed(0)}% of your rounds and costs approximately ${firstRecurringPattern.impactStrokes.toFixed(1)} strokes per round. `;
  }

  const firstNewPattern = newPatterns[0];
  if (firstNewPattern) {
    nextSteps += `Something new to watch: ${firstNewPattern.description.toLowerCase()}. `;
  }

  // Goal impact
  const positiveImpact = goalImpacts.find(g => g.direction === 'positive');
  if (positiveImpact) {
    nextSteps += `Good news for your goal to ${positiveImpact.goalLabel.toLowerCase()}: ${positiveImpact.message.toLowerCase()}.`;
  }

  if (nextSteps) {
    paragraphs.push(nextSteps);
  }

  // Primary takeaway
  let primaryTakeaway = '';
  if (worstCategory.value < -0.5) {
    primaryTakeaway = `Focus on ${worstCategory.name} — it cost you ${Math.abs(worstCategory.value).toFixed(1)} strokes today.`;
  } else if (firstRecurringPattern) {
    primaryTakeaway = firstRecurringPattern.description;
  } else if (firstHighlight && scoreDiff <= 0) {
    primaryTakeaway = `Strong round. ${firstHighlight.title} on hole ${firstHighlight.holeNumber} was a standout moment.`;
  } else {
    primaryTakeaway = `Keep working on consistency. Your ${bestCategory.name} showed promise today.`;
  }

  // Next practice priority
  let nextPracticePriority: string | null = null;
  if (mainIssue?.linkedFocusArea) {
    const focusAreaLabels: Record<string, string> = {
      putting_lag: 'Lag putting distance control',
      putting_short: 'Short putts inside 5 feet',
      short_game: 'Chipping and pitching',
      course_management: 'Course management decisions',
      approach_mid: 'Approach shots 125-175 yards',
    };
    nextPracticePriority = focusAreaLabels[mainIssue.linkedFocusArea] || mainIssue.linkedFocusArea;
  } else if (worstCategory.value < -0.3) {
    const practicePriorities: Record<string, string> = {
      'off the tee': 'Driving accuracy and distance control',
      'on approach': 'Iron play and approach shots',
      'around the green': 'Short game: chips, pitches, bunker shots',
      'on the greens': 'Putting: speed control and read accuracy',
    };
    nextPracticePriority = practicePriorities[worstCategory.name] ?? null;
  }

  return {
    summary: paragraphs.join('\n\n'),
    primaryTakeaway,
    nextPracticePriority,
  };
}

function formatScoreToPar(scoreToPar: number): string {
  if (scoreToPar === 0) return 'E';
  if (scoreToPar > 0) return `+${scoreToPar}`;
  return scoreToPar.toString();
}

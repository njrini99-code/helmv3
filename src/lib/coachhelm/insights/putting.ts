import type { PlayerPuttTendencies } from '@/lib/types/golf';

export interface PuttingInsight {
  type: 'warning' | 'trend' | 'strength';
  title: string;
  description: string;
  recommendation?: string;
  priority: number; // 1-5, higher = more important
}

export function generatePuttingInsights(
  tendencies: PlayerPuttTendencies
): PuttingInsight[] {
  const insights: PuttingInsight[] = [];
  const { percentages, missByType, totalMissedPutts, byDistance } = tendencies;

  // Need minimum sample size
  if (totalMissedPutts < 10) {
    return [{
      type: 'trend',
      title: 'Insufficient Data',
      description: 'Need at least 10 tracked missed putts to identify tendencies.',
      priority: 1
    }];
  }

  // Green Reading Analysis
  if (percentages.underReadTendency > 70) {
    insights.push({
      type: 'warning',
      title: 'Significant Under-Reading',
      description: `${percentages.underReadTendency}% of read-related misses are low. Player consistently under-estimates break.`,
      recommendation: 'Practice routine: pick a line, then consciously play 1-2 balls outside of it. Build confidence in more break.',
      priority: 5
    });
  } else if (percentages.underReadTendency < 30) {
    insights.push({
      type: 'warning',
      title: 'Significant Over-Reading',
      description: `Only ${percentages.underReadTendency}% low misses. Player over-estimates break and misses high.`,
      recommendation: 'Trust the read more. Practice straight putts to rebuild confidence in starting line.',
      priority: 5
    });
  }

  // Speed Control Analysis
  if (percentages.leaveShortTendency > 70) {
    insights.push({
      type: 'warning',
      title: 'Leaving Putts Short',
      description: `${percentages.leaveShortTendency}% of speed misses are short. "Never up, never in" applies here.`,
      recommendation: 'Gate drill: putt through a gate 2 feet past the hole. Build aggressive speed habits.',
      priority: 4
    });
  } else if (percentages.leaveShortTendency < 30) {
    insights.push({
      type: 'warning',
      title: 'Running Putts By',
      description: `Only ${percentages.leaveShortTendency}% short misses. Aggressive speed leading to 3-putts.`,
      recommendation: 'Lag putting focus: practice stopping ball within 2-foot circle, not holing out.',
      priority: 4
    });
  }

  // Stroke Path Issues
  const strokeMisses = missByType.pull + missByType.push;
  const strokeMissPct = (strokeMisses / totalMissedPutts) * 100;
  
  if (strokeMissPct > 30) {
    const isPullDominant = missByType.pull > missByType.push;
    insights.push({
      type: 'warning',
      title: isPullDominant ? 'Pull Tendency' : 'Push Tendency',
      description: `${Math.round(strokeMissPct)}% of misses are stroke-path related (${isPullDominant ? 'pulling left' : 'pushing right'}).`,
      recommendation: isPullDominant 
        ? 'Check grip pressure and release. Gate drill focusing on square face through impact.'
        : 'Ensure shoulders are square at address. Practice with alignment rod on target line.',
      priority: 3
    });
  }

  // Short Putt Concern
  if (byDistance.inside5ft.pct < 85) {
    insights.push({
      type: 'warning',
      title: 'Short Putt Conversion',
      description: `Only ${byDistance.inside5ft.pct}% inside 5 feet. Tour average is ~90%.`,
      recommendation: 'Pre-round: 20 putts from 3 feet, must make 18+ before leaving.',
      priority: 5
    });
  }

  // Strengths
  if (byDistance.outside10ft.pct > 20) {
    insights.push({
      type: 'strength',
      title: 'Strong Outside 10ft',
      description: `Making ${byDistance.outside10ft.pct}% outside 10 feet. Excellent lag putting.`,
      priority: 2
    });
  }

  // Sort by priority
  return insights.sort((a, b) => b.priority - a.priority);
}

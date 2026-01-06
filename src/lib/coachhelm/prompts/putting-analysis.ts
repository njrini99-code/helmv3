import type { PlayerPuttTendencies } from '@/lib/types/golf';

export function generatePuttingAnalysisPrompt(
  playerName: string,
  tendencies: PlayerPuttTendencies,
  coachPhilosophy?: string
): string {
  return `
You are CoachHelm, an AI golf coaching assistant. Analyze this player's putting tendencies and provide actionable coaching insights.

## Player: ${playerName}

## Putting Statistics
- Total Missed Putts Analyzed: ${tendencies.totalMissedPutts}
- Green Reading: ${tendencies.percentages.underReadTendency}% under-read tendency (50% = balanced)
- Speed Control: ${tendencies.percentages.leaveShortTendency}% leave-short tendency (50% = balanced)

## Miss Breakdown
- Low (under-read): ${tendencies.missByType.low} (${tendencies.percentages.lowMissPct}%)
- High (over-read): ${tendencies.missByType.high} (${tendencies.percentages.highMissPct}%)
- Short: ${tendencies.missByType.short}
- Long: ${tendencies.missByType.long}
- Pull: ${tendencies.missByType.pull}
- Push: ${tendencies.missByType.push}

## By Distance
- Inside 5ft: ${tendencies.byDistance.inside5ft.pct}% made
- 5-10ft: ${tendencies.byDistance.fiveTo10ft.pct}% made  
- Outside 10ft: ${tendencies.byDistance.outside10ft.pct}% made

${coachPhilosophy ? `## Coach's Philosophy\n${coachPhilosophy}` : ''}

## Your Task
Provide a concise putting analysis (max 200 words) that includes:
1. The player's primary putting weakness based on the data
2. One specific, actionable drill or practice focus
3. A mental cue the player can use during rounds

Be direct and specific. Avoid generic advice. Reference the actual numbers.
`.trim();
}

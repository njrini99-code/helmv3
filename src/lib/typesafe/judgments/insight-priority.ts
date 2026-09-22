/**
 * Semantic priority signals for a coach insight.
 *
 * `ranking/score.ts` orders insights by strokes impact × confidence × coach
 * weight × goal boost — all numeric. What it cannot see is whether the TEXT
 * of an insight gives a coach anything to do. These Scores are computed and
 * logged beside the rank so the numbers can be evaluated before anything
 * multiplies them into the order (audit-tracked ranking; see EC-1/FID-1/2).
 */

import { noul, score } from '@typesafe-ai/sdk';
import { askJev, type JevResult } from '../client';

export const INSIGHT_QUESTIONS = {
  actionability: score('How actionable is `insight` for a college golf coach?', [
    'Purely descriptive: reports a number or trend with nothing a coach could change',
    'Points at an area (e.g. "putting") but suggests no concrete change or drill',
    'Names a specific, practicable change, drill, or decision the coach can make this week',
  ]),
  specificity: score('How specific is `insight` about WHAT is happening?', [
    'Generic: could apply to almost any player',
    'Names a metric or situation but not the magnitude or context',
    'States the situation, magnitude, and context (distance band, lie, hole type, time window)',
  ]),
  safe_for_player: noul(
    'Could `insight` be shown to the player themself without being discouraging, blaming, or revealing coach-only judgement?',
  ),
  overclaims: noul(
    'Does `insight` draw a conclusion stronger than its `evidence` supports (for example a trend from two rounds, or a cause stated as fact)?',
  ),
} as const;

export type InsightAnswers = JevResult<typeof INSIGHT_QUESTIONS>['answers'];

export interface InsightForJudgment {
  id: string;
  title: string;
  content: string | null;
  category: string | null;
  insight_type: string;
  evidence: unknown;
}

export async function judgeInsight(insight: InsightForJudgment) {
  return askJev(
    {
      insight: { title: insight.title, body: insight.content ?? '', category: insight.category, type: insight.insight_type },
      evidence: (insight.evidence ?? null) as never,
    },
    INSIGHT_QUESTIONS,
    { purpose: 'insight_priority' },
  );
}

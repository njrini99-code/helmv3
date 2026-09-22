/**
 * Second opinion on the chat grounding audit.
 *
 * `auditNumericClaims` (provenance.ts) flags every number in an assistant turn
 * that no tool produced. It exempts only dates, clock times and integers ≤ 12,
 * so "18 holes", "par 72" and "150 yards" all read as fabricated stats. The
 * route's own comment forbids widening those exemptions without telemetry.
 *
 * This is that telemetry. For each flagged figure, Jev answers one Noul: is
 * this a *measured statistic about the player/team's data*, or a golf
 * constant / a figure the coach themself typed / a quantity that is not a
 * claim about data? The answer is recorded beside the regex verdict. It does
 * not change `grounded` — see the chat route.
 */

import { noul } from '@typesafe-ai/sdk';
import { askJev } from '../client';

export interface FlaggedClaim {
  /** Literal text as it appeared, e.g. '71%'. */
  text: string;
  value: number;
}

export interface ClaimJudgment extends FlaggedClaim {
  /** P(this figure asserts a measured statistic about the player/team's data). */
  statClaim: number;
  /** P(the coach's own question already contains this figure). */
  fromQuestion: number;
}

export interface ChatClaimsVerdict {
  model: string;
  latencyMs: number;
  claims: ClaimJudgment[];
}

/** Cap so a pathological turn cannot fan out into hundreds of questions. */
const MAX_CLAIMS = 12;

function questionsFor(claims: FlaggedClaim[]) {
  const questions: Record<string, ReturnType<typeof noul>> = {};
  claims.forEach((claim, i) => {
    questions[`stat_${i}`] = noul(
      {
        judge: `The figure "${claim.text}" as it is used in \`answer\``,
        question:
          'Does this figure assert a MEASURED STATISTIC about a specific player, team, or round drawn from their data?',
      },
      {
        true: 'A score, scoring average, percentage (fairways, greens, putting), strokes-gained value, count of rounds/shots/putts, ranking, or a difference between two such figures',
        false:
          'A fixed property of golf or a course (par, number of holes, yardage of a hole), a date, year, age, clock time, duration, a drill count or rep prescription, a number the coach already stated in `question`, or an illustrative/hypothetical figure',
      },
    );
    questions[`asked_${i}`] = noul(
      `Does the coach's \`question\` itself already contain the figure "${claim.text}" or state that value?`,
    );
  });
  return questions;
}

export async function judgeFlaggedClaims(input: {
  question: string;
  answer: string;
  claims: FlaggedClaim[];
}): Promise<ChatClaimsVerdict | null> {
  const claims = input.claims.slice(0, MAX_CLAIMS);
  if (claims.length === 0) return null;
  const result = await askJev(
    { question: input.question, answer: input.answer },
    questionsFor(claims),
    { purpose: 'chat_claims' },
  );
  if (!result) return null;
  const answers = result.answers as Record<string, { noul: number }>;
  return {
    model: result.model,
    latencyMs: result.latencyMs,
    claims: claims.map((c, i) => ({
      ...c,
      statClaim: answers[`stat_${i}`]?.noul ?? 0.5,
      fromQuestion: answers[`asked_${i}`]?.noul ?? 0,
    })),
  };
}

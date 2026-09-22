/**
 * Semantic check on a generated round recap.
 *
 * `verifyCitations` proves every NUMBER in the recap was in the evidence. It
 * cannot see that "finished under par" contradicts `score_to_par: +3`, or that
 * "a strong back nine" was invented when no back-nine figure was offered. These
 * Nouls read the recap against the same `facts` block the model was shown.
 *
 * Shadow-mode only: logged beside the regex verdict, never a veto. The eval
 * harness (scripts/typesafe/eval.ts) showed `verifyCitations` passing a
 * contradiction, an invented detail and a wrong name, while `invents_detail`
 * also fired on an honest "one 3-putt" — so the thresholds have to come from
 * real recaps before either check is allowed to discard one.
 */

import { noul } from '@typesafe-ai/sdk';
import { askJev, type JevResult } from '../client';

export const RECAP_QUESTIONS = {
  contradicts_facts: noul(
    'Does `recap` state anything that CONTRADICTS a value in `facts` (for example calling a round "under par" when the score to par is positive, or describing putting as strong when the putt count is high for the holes played)?',
    { true: 'At least one statement is inconsistent with the facts', false: 'Every statement is consistent with the facts' },
  ),
  invents_detail: noul(
    'Does `recap` assert a specific detail that is NOT derivable from `facts` — a particular hole, weather, an opponent, a streak, a stat that was not provided?',
    { true: 'Contains at least one specific claim the facts do not support', false: 'Only draws on the provided facts and reasonable general phrasing' },
  ),
  reads_as_editorial: noul(
    'Is `recap` written as calm, declarative sports-desk prose — no hype, no clichés, no exclamation, no first person?',
  ),
  names_correct_player: noul(
    'Does `recap` refer to the player only as `player_name` (third person) or as "you" — never by any other name or in the first person?',
  ),
} as const;

export type RecapAnswers = JevResult<typeof RECAP_QUESTIONS>['answers'];

export interface RecapSupportVerdict {
  model: string;
  latencyMs: number;
  answers: RecapAnswers;
  /**
   * 1 − max(contradicts, invents, wrong-name): one supported-ness number for
   * logs. A wrong name counts as unsupported — the harness showed a recap
   * addressed to the wrong player scoring 66% before the name was folded in,
   * and a misnamed recap persisted to `golf_rounds.ai_recap` is exactly the
   * defect round-recap.ts's `promptSafeName` history describes.
   */
  support: number;
}

export async function judgeRecapSupport(input: {
  facts: string[];
  recap: string;
  player_name: string;
}): Promise<RecapSupportVerdict | null> {
  const result = await askJev(input, RECAP_QUESTIONS, { purpose: 'recap_support' });
  if (!result) return null;
  const a = result.answers;
  return {
    model: result.model,
    latencyMs: result.latencyMs,
    answers: a,
    support: 1 - Math.max(a.contradicts_facts.noul, a.invents_detail.noul, 1 - a.names_correct_player.noul),
  };
}

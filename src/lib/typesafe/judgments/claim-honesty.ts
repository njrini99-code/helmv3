/**
 * Claim-honesty judgment for CoachHelm prose.
 *
 * The engine's contract (repair plan Package 2, 2026-09-12; see
 * memory/features/coachhelm-ai.md "Claim honesty"): prose states what was
 * measured, hands unmeasured causes to the coach as a check, frames the
 * action as a recommendation, and never presents an estimate as a
 * measurement. Today that is enforced by the hand-written builders in
 * `v3/engine/diagnosis.ts`, the composite rules and the round builders —
 * each one separately, by whoever last edited it.
 *
 * These Nouls read one generated insight against its own evidence row and
 * ask the contract's questions directly. Each is independent so a violation
 * can be named, not just scored. `scripts/typesafe/honesty-sweep.ts` runs
 * them over every pure generator with synthetic inputs; a shadow hook can
 * later run them on real rows. They never veto a write on their own.
 */

import { noul } from '@typesafe-ai/sdk';
import { askJev, type JevResult } from '../client';

export const CLAIM_HONESTY_QUESTIONS = {
  cites_unsupported_figure: noul(
    {
      question:
        'Does `text` (or `title`) state a MEASURED figure about the player that is neither present in `evidence` (including any `source_signals`) nor a direct rounding, percentage, or difference of values there?',
      ignore:
        'Counts inside a recommendation (reps, "the next ten approaches", drill sizes, a 10-ft target circle), reference values the text itself labels approximate or tour-typical, hole numbers, and distance bands that name a range rather than a result',
    },
    {
      true: 'At least one measured figure about the player has no source in the evidence',
      false: 'Every measured figure traces to the evidence (rounding and simple arithmetic allowed)',
    },
  ),
  cause_stated_as_fact: noul(
    'Does `text` assert a mechanical, technical, or mental CAUSE of the pattern (for example under-clubbing, deceleration, face control, nerves, fatigue, poor course management) as an established fact, rather than as one possibility for the coach to check?',
    {
      true: 'A cause is asserted; nothing in the evidence measures it',
      false: 'Causes are absent, or offered as things to check, or the evidence directly measures the stated cause',
    },
  ),
  overclaims_sample: noul(
    'Given `evidence.sample_n` and `evidence.window_days`, does `text` describe the pattern with more certainty or permanence than that sample supports (calling it a habit, a tendency, "always", "consistently", a trend, or a collapse)?',
    {
      true: 'The wording claims a settled pattern the sample cannot establish',
      false: 'The wording matches the sample size — small samples are hedged or simply reported',
    },
  ),
  contradicts_evidence: noul(
    {
      question:
        'Does `text` state something the `evidence` contradicts?',
      examples:
        'Describing the player as better than, or fine relative to, the comparison when `your_value` versus `comparison_value` (read with `polarity`, or with the ordinary sense of the metric: more 3-putts or doubles is worse, more sand saves is better) says they are worse; a magnitude that disagrees with `your_value`; a different metric than `metric_label` names',
    },
    {
      true: 'At least one statement is the opposite of what the evidence shows',
      false: 'The direction and magnitude of every statement agree with the evidence',
    },
  ),
  estimate_presented_as_measured: noul(
    {
      question:
        'Does `text` present an ESTIMATED figure as if it were measured?',
      estimated_means:
        '`evidence.strokes_impact_method` is `rough_estimate`, or the figure is a projected/derived stroke loss, or the comparison it is set against is labelled approximate (a "~" or "approx" in `comparison_label`)',
      not_estimated:
        'A value computed directly from the player\'s own shots or scores (`your_value`, a per-hole average, a make percentage, a tournament-vs-practice delta with `strokes_impact_method: peer_delta`) is a measurement and may be stated plainly',
    },
    {
      true: 'An estimated figure is stated as measured',
      false: 'Estimates are labelled as such, or no estimate is cited',
    },
  ),
  action_is_verdict: noul(
    'Is the action in `text` phrased as a verdict or an order about the player ("must", "has to", "needs to fix his ...") rather than as a recommendation or a next thing to look at?',
  ),
} as const;

export type ClaimHonestyAnswers = JevResult<typeof CLAIM_HONESTY_QUESTIONS>['answers'];

export interface ClaimHonestyInput {
  title: string;
  text: string;
  /** The evidence row as the insight carries it; passed through unchanged. */
  evidence: Record<string, unknown>;
}

export interface ClaimHonestyVerdict {
  model: string;
  latencyMs: number;
  answers: ClaimHonestyAnswers;
  /** Names of the questions whose P(yes) is at or above `threshold`. */
  violations: Array<keyof ClaimHonestyAnswers>;
  /** 1 − max(P(yes)) across the four hard-contract questions. */
  honesty: number;
}

/**
 * The four questions that are contract breaches outright. `action_is_verdict`
 * and `estimate_presented_as_measured` are style clauses reported beside them.
 */
const HARD: ReadonlyArray<keyof ClaimHonestyAnswers> = [
  'cites_unsupported_figure',
  'cause_stated_as_fact',
  'overclaims_sample',
  'contradicts_evidence',
];

export async function judgeClaimHonesty(
  input: ClaimHonestyInput,
  threshold = 0.7,
): Promise<ClaimHonestyVerdict | null> {
  const result = await askJev(
    { title: input.title, text: input.text, evidence: input.evidence as never },
    CLAIM_HONESTY_QUESTIONS,
    { purpose: 'claim_honesty' },
  );
  if (!result) return null;
  const answers = result.answers;
  const keys = Object.keys(CLAIM_HONESTY_QUESTIONS) as Array<keyof ClaimHonestyAnswers>;
  return {
    model: result.model,
    latencyMs: result.latencyMs,
    answers,
    violations: keys.filter((k) => answers[k].noul >= threshold),
    honesty: 1 - Math.max(...HARD.map((k) => answers[k].noul)),
  };
}

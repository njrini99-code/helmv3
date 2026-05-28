/**
 * v3 composeRoundReview() — LLM prose layer for the round-review page
 * (W30). Sits on top of the deterministic v2 RoundReviewContent: takes
 * the same evidence stats and asks Haiku to write a 100-150 word
 * narrative summary in the player's voice.
 *
 * Does NOT replace the existing summary field — caller chooses whether
 * to surface the LLM version, the template version, or both.
 *
 * Master plan Part XI.5 (amended 2026-05-25): Haiku-only for this task.
 */

import { compose } from './compose';
import type { ComposeResult, EvidenceClaim } from './types';

export interface RoundReviewInput {
  player_id: string;
  /** Coach billed for this call. Null when the player generates the
   *  review themselves (rare — usually it's the post-round trigger
   *  running under the head coach's budget). */
  coach_id: string | null;
  player_first_name: string;
  /** Total score the player shot (e.g. 76). */
  total_score: number;
  /** Score to par as a signed integer (e.g. +4, -1, 0). */
  score_to_par: number;
  /** "Lakewood Country Club" — used to ground the open. */
  course_name: string | null;
  /** Putts, fairways hit, GIR — the headline stat trio the prose
   *  always cites. */
  total_putts: number | null;
  fairways_hit: number | null;
  fairways_total: number | null;
  gir: number | null;
  gir_total: number | null;
  /** 1-2 sentence template fallback that runs verbatim when the LLM
   *  is budget-gated or errors. Required — the prose surface always
   *  shows something. */
  fallback_summary: string;
  /** Coach's narrative goal for this player (W27 intent). When
   *  provided, the prompt nudges tone toward the goal framing. */
  narrative_goal?: string;
}

function buildPrompt(input: RoundReviewInput): string {
  const toParStr =
    input.score_to_par === 0
      ? 'even par'
      : input.score_to_par > 0
        ? `+${input.score_to_par}`
        : String(input.score_to_par);

  const courseClause = input.course_name ? `at ${input.course_name}` : '';

  const stats: string[] = [];
  if (input.total_putts !== null) stats.push(`${input.total_putts} putts`);
  if (input.fairways_hit !== null && input.fairways_total !== null) {
    stats.push(`${input.fairways_hit}/${input.fairways_total} fairways`);
  }
  if (input.gir !== null && input.gir_total !== null) {
    stats.push(`${input.gir}/${input.gir_total} greens`);
  }
  const statsClause = stats.length > 0 ? stats.join(', ') : '';

  const goalClause = input.narrative_goal
    ? `- Coach intent for this player: ${input.narrative_goal}`
    : '';

  return [
    `You are a college golf coach writing a one-paragraph round summary to ${input.player_first_name}.`,
    ``,
    `Round facts:`,
    `- Score: ${input.total_score} (${toParStr}) ${courseClause}`.trim(),
    statsClause ? `- Stats: ${statsClause}` : '',
    goalClause,
    ``,
    `Write 80-150 words in second person ("you"). Mention the score and at least one of the stats from the facts above.`,
    `Be specific and grounded — do NOT invent numbers or details not in the facts.`,
    input.narrative_goal
      ? `Adjust your tone to reflect the coach's intent ("${input.narrative_goal}"). For example: "breakout" = ambitious push, "rehabilitate" = patient rebuild, "bubble" = urgent improvement needed, "maintain" = steady reinforcement, "develop" = growth-oriented encouragement.`
      : '',
    `Tone: direct, encouraging, no clichés. End on a single concrete focus for the next round.`,
    ``,
    `Return only the paragraph, no headers, no quotes.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildEvidence(input: RoundReviewInput): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [
    { field: 'total_score', value: input.total_score },
    { field: 'score_to_par', value: input.score_to_par },
    { field: 'score_to_par_signed', value: input.score_to_par > 0 ? `+${input.score_to_par}` : input.score_to_par },
  ];
  if (input.total_putts !== null) claims.push({ field: 'total_putts', value: input.total_putts });
  if (input.fairways_hit !== null) claims.push({ field: 'fairways_hit', value: input.fairways_hit });
  if (input.fairways_total !== null) claims.push({ field: 'fairways_total', value: input.fairways_total });
  if (input.gir !== null) claims.push({ field: 'gir', value: input.gir });
  if (input.gir_total !== null) claims.push({ field: 'gir_total', value: input.gir_total });
  return claims;
}

export async function composeRoundReview(input: RoundReviewInput): Promise<ComposeResult> {
  return compose(
    {
      task: 'round_review',
      coach_id: input.coach_id,
      player_id: input.player_id,
      prompt: buildPrompt(input),
      evidence: buildEvidence(input),
      max_completion_tokens: 250, // ~150 words headroom
    },
    input.fallback_summary,
  );
}

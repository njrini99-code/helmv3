/**
 * Round-review narrative — a 3-5 sentence LLM-authored paragraph for the
 * Round Review page, cached once per round on `golf_round_reviews.ai_narrative`
 * (migration 20260923100000_round_recap_single_flight_lock.sql).
 *
 * Distinct from two existing, similarly-named surfaces:
 *   - round-recap.ts's `generateLLMRecap` — 2 sentences, cached on
 *     `golf_rounds.ai_recap`, task key 'round_review'. Different column,
 *     different length, different prompt.
 *   - `composeRoundReview` (./round-review.ts) — 80-150 words, task
 *     'round_review', NEVER persisted (the caller in v3/llm.ts renders it
 *     ephemerally and discards it on navigation). This module does NOT
 *     reuse that composer: reusing it would mean two very differently
 *     shaped surfaces (one persisted, one not; different word counts)
 *     silently share a prompt that was tuned for the other one.
 *
 * Own compose task key: 'round_review_narrative' (src/lib/coachhelm/v3/llm/types.ts)
 * — kept separate from 'round_review' specifically so the owner can see
 * this surface's spend in golf_coachhelm_llm_calls without it blending
 * into round-recap.ts's or the ephemeral composer's existing volume.
 *
 * No 'server-only' / 'use server' directive here — this is a plain
 * composer module, imported by the 'use server' narrative action
 * (src/app/golf/actions/round-review-narrative.ts), same layering as
 * round-review.ts and hero-narrative.ts.
 */

import { compose } from './compose';
import { buildRecapEvidence } from './recap-evidence';
import { pct } from '@/lib/golf/stat-formulas';
import type { ComposeResult } from './types';

export interface RoundReviewNarrativeInput {
  player_id: string;
  /** Coach billed for this call. Callers must resolve a real billing
   *  owner before calling — passing null here is NOT the "skip the
   *  budget gate" affordance some system jobs use; see the caller's own
   *  DS-44-style billing-owner gate. */
  coach_id: string | null;
  player_first_name: string;
  total_score: number;
  score_to_par: number;
  course_name: string | null;
  round_type: string | null;
  total_putts: number | null;
  fairways_hit: number | null;
  fairways_total: number | null;
  gir: number | null;
  gir_total: number | null;
  /** 3-5 sentence deterministic fallback that runs verbatim when the LLM
   *  is budget-gated, errors, or fails validation. Required — the
   *  narrative column always caches something, never a raw LLM failure. */
  fallback_narrative: string;
}

function buildFacts(input: RoundReviewNarrativeInput): string[] {
  const stp = input.score_to_par;
  const scoreChip = stp === 0 ? 'E' : stp > 0 ? `+${stp}` : `${stp}`;
  const fir =
    input.fairways_hit !== null && input.fairways_total !== null
      ? pct(input.fairways_hit, input.fairways_total)
      : null;
  const gir =
    input.gir !== null && input.gir_total !== null ? pct(input.gir, input.gir_total) : null;

  const facts: string[] = [
    `Player: ${input.player_first_name}`,
    `Score: ${input.total_score} (${scoreChip})`,
    `Course: ${input.course_name ?? 'Unknown'}`,
    `Round type: ${input.round_type ?? 'practice'}`,
  ];
  if (input.total_putts !== null) facts.push(`Putts: ${input.total_putts}`);
  if (fir !== null) facts.push(`Fairways hit: ${fir}%`);
  if (gir !== null) facts.push(`Greens in regulation: ${gir}%`);
  return facts;
}

function buildPrompt(input: RoundReviewNarrativeInput, facts: string[]): string {
  return `You are a college golf coach writing a short narrative paragraph about a player's completed round, for the player to read on their Round Review page.

Write 3 to 5 sentences in second person ("you") or referring to "${input.player_first_name}" — never first person. Open with the one fact that defines this round (the score, a strong or weak stretch, a stat that stands out). Close with a single, concrete, forward-looking takeaway for the next round — an observation, not a verdict.

Strict rules:
- 3 to 5 sentences total, no more.
- No exclamation points, no emojis, no em-dashes — use periods or commas.
- Cite at least one specific stat by number from the data below.
- Do not invent numbers or details not in the data below.
- Tone: direct, encouraging, no clichés ("showed up", "great job", "solid round").

Round data:
${facts.join('\n')}

Output only the paragraph. No headers, no quotes.`;
}

export async function composeRoundReviewNarrative(
  input: RoundReviewNarrativeInput,
): Promise<ComposeResult> {
  const facts = buildFacts(input);
  const prompt = buildPrompt(input, facts);

  return compose(
    {
      task: 'round_review_narrative',
      coach_id: input.coach_id,
      player_id: input.player_id,
      prompt,
      evidence: buildRecapEvidence(facts),
      max_completion_tokens: 220, // ~5 sentences headroom
    },
    input.fallback_narrative,
  );
}

// ---------------------------------------------------------------------------
// Test surface — exported for unit tests only.
// ---------------------------------------------------------------------------

export const __testables = { buildFacts, buildPrompt };

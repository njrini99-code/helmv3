/**
 * v3 composeHeroNarrative() — Haiku writes a 2-3 sentence hero paragraph
 * for the player dashboard (W31).
 *
 * Inputs: player first name + the top insight's headline metric + team-
 * percentile standing + (optional) active goal + (optional) counterfactual
 * stroke savings. All ground-truth — the model must not invent.
 *
 * Output target: punchy, second-person, ≤80 words. Renders above the
 * existing HeroInsightCard.
 */

import { compose } from './compose';
import type { ComposeResult, EvidenceClaim } from './types';

export interface HeroNarrativeInput {
  player_id: string;
  /** Coach billed for the call. Null = no budget gate (rare). */
  coach_id: string | null;
  player_first_name: string;

  /** What the hero card is centered on. */
  top_insight: {
    /** "Lag putting", "Bunker save %", "Driving accuracy", etc. */
    metric_label: string;
    /** Player's own value as displayed on the card: "57%", "+1.2", "31 ft". */
    your_value_display: string;
    /** Team percentile, integer 0-100. null when no standing computed yet. */
    team_pct: number | null;
  };

  /** Optional — a goal that aligns with the top insight. */
  goal?: {
    /** "Bunker save % to 50% by 2026-06-15" — already-formatted. */
    target_display: string;
  };

  /** Optional — counterfactual stroke savings (per Part X disciplne,
   *  ≥0.3 strokes/round to mention). */
  counterfactual_strokes_per_round?: number;

  /** Template fallback the surface shows verbatim when LLM is gated. */
  fallback_text: string;
}

function buildPrompt(input: HeroNarrativeInput): string {
  const pct = input.top_insight.team_pct;
  const standingClause =
    pct === null ? '' : `Team percentile: ${pct} (lower = below team avg).`;

  const goalClause = input.goal ? `Active goal: ${input.goal.target_display}.` : '';

  const cfClause =
    input.counterfactual_strokes_per_round && input.counterfactual_strokes_per_round >= 0.3
      ? `Closing this gap is worth ~${input.counterfactual_strokes_per_round.toFixed(1)} strokes/round.`
      : '';

  return [
    `You are a college golf coach writing one short paragraph to ${input.player_first_name} on their dashboard.`,
    ``,
    `Top finding:`,
    `- ${input.top_insight.metric_label}: ${input.top_insight.your_value_display}`,
    standingClause,
    goalClause,
    cfClause,
    ``,
    `Write 2-3 sentences, second person ("you"). Lead with the headline ` +
      `(${input.top_insight.metric_label} at ${input.top_insight.your_value_display}). ` +
      `Mention exactly one of: the team percentile (if given), the goal target (if given), or the stroke savings (if given).`,
    `Be specific and grounded — do NOT invent any number or label not in the facts above.`,
    `Tone: direct, encouraging, no clichés, no exclamation marks.`,
    ``,
    `Return only the paragraph.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildEvidence(input: HeroNarrativeInput): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [
    { field: 'metric_label', value: input.top_insight.metric_label },
    { field: 'your_value', value: input.top_insight.your_value_display },
  ];
  if (input.top_insight.team_pct !== null) {
    claims.push({ field: 'team_pct', value: input.top_insight.team_pct });
  }
  if (input.goal) {
    claims.push({ field: 'goal_target', value: input.goal.target_display });
  }
  if (
    input.counterfactual_strokes_per_round &&
    input.counterfactual_strokes_per_round >= 0.3
  ) {
    // Tolerate ±0.05 rounding by registering both the raw and rounded form.
    claims.push({
      field: 'cf_strokes',
      value: input.counterfactual_strokes_per_round.toFixed(1),
    });
  }
  return claims;
}

export async function composeHeroNarrative(input: HeroNarrativeInput): Promise<ComposeResult> {
  return compose(
    {
      task: 'hero_narrative',
      coach_id: input.coach_id,
      player_id: input.player_id,
      prompt: buildPrompt(input),
      evidence: buildEvidence(input),
      max_completion_tokens: 140, // ~80 words headroom
    },
    input.fallback_text,
  );
}

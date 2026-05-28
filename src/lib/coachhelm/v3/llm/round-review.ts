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
 *
 * Enrichment 2026-05-27 (v3 audit Tier-2 #5) — prompt now optionally
 * receives per-round SG breakdown, composite-insight titles from this
 * round, the player's genome persona label, and the single active
 * goal. Every new section is optional: missing data drops the section
 * silently. SG values are surfaced to the model as DIRECTIONAL labels
 * ("strong", "neutral", "weak") rather than raw decimals — this keeps
 * the citation verifier happy without losing signal, since the prose
 * can lean on words like "your putting was a clear strength" instead
 * of fabricating a number it can't safely cite.
 *
 * Composed with coach-intent `narrative_goal` (W27 alert-posture
 * loader, PR #131): the prompt nudges tone toward the coach's intent
 * for this player (breakout, rehabilitate, bubble, maintain, develop).
 * The two enrichment streams are orthogonal and combine cleanly.
 */

import { compose } from './compose';
import type { ComposeResult, EvidenceClaim } from './types';

/**
 * Per-component Strokes Gained for this round. All five may be null when
 * the round predates shot-level capture or the cache row hasn't been
 * computed yet.
 */
export interface RoundReviewSG {
  total: number | null;
  tee: number | null;
  approach: number | null;
  around_green: number | null;
  putting: number | null;
}

/** A single composite-insight title surfaced for context. */
export type CompositeInsightTitle = string;

/** Active goal summary — both metric label and target shown verbatim. */
export interface RoundReviewActiveGoal {
  /** Display label for the metric, e.g. "Putts inside 10 ft". */
  metric_label: string;
  /** Already-formatted target string, e.g. "≥ 75% by 2026-06-15". */
  target_display: string;
}

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

  // --- Optional enrichment (v3 audit Tier-2 #5) -------------------------
  /** Per-component SG for this round. Omit (or pass all-null) when
   *  shot-level data isn't available. */
  strokes_gained?: RoundReviewSG;
  /** Up to 3 composite-insight titles synthesized from this round. The
   *  composer trims to 3; extras are dropped to control prompt size. */
  composite_insight_titles?: CompositeInsightTitle[];
  /** Short editorial persona label, e.g. "Reliable off-tee · holds
   *  steady on par-3s". Derived upstream from the player's genome
   *  vector. */
  persona_label?: string | null;
  /** The player's single most-relevant active goal. */
  active_goal?: RoundReviewActiveGoal | null;
}

/** A signed-decimal token to a one-word directional bucket. */
function sgBucket(value: number | null): 'strong' | 'neutral' | 'weak' | null {
  if (value === null || Number.isNaN(value)) return null;
  if (value >= 0.3) return 'strong';
  if (value <= -0.3) return 'weak';
  return 'neutral';
}

/**
 * Format the 5 SG components as a bullet block for the prompt. Each
 * value is rendered as its directional bucket only — no raw decimals
 * leak into the prompt, so the citation verifier never sees a
 * fabricated number.
 */
function buildSgBlock(sg: RoundReviewSG | undefined): string {
  if (!sg) return '';
  const lines: string[] = [];
  const push = (label: string, v: number | null) => {
    const bucket = sgBucket(v);
    if (bucket) lines.push(`  - ${label}: ${bucket}`);
  };
  push('Off the tee', sg.tee);
  push('Approach', sg.approach);
  push('Around the green', sg.around_green);
  push('Putting', sg.putting);
  push('Total', sg.total);
  if (lines.length === 0) return '';
  return ['Strokes Gained (directional only — do NOT quote numbers):', ...lines].join('\n');
}

function buildCompositeBlock(titles: CompositeInsightTitle[] | undefined): string {
  if (!titles || titles.length === 0) return '';
  const trimmed = titles.slice(0, 3);
  const lines = trimmed.map((t) => `  - ${t}`);
  return ['Patterns flagged on this round:', ...lines].join('\n');
}

function buildPersonaBlock(label: string | null | undefined): string {
  if (!label) return '';
  return `Player persona: ${label}`;
}

function buildGoalBlock(goal: RoundReviewActiveGoal | null | undefined): string {
  if (!goal) return '';
  return `Active goal: ${goal.metric_label} → ${goal.target_display}`;
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

  // W27 coach-intent line — orthogonal to the v3-audit enrichment
  // sections below; included in the Round-facts block.
  const intentClause = input.narrative_goal
    ? `- Coach intent for this player: ${input.narrative_goal}`
    : '';

  const sgBlock = buildSgBlock(input.strokes_gained);
  const compositeBlock = buildCompositeBlock(input.composite_insight_titles);
  const personaBlock = buildPersonaBlock(input.persona_label);
  const goalBlock = buildGoalBlock(input.active_goal);

  // Optional-section guidance only appears when at least one optional
  // block is non-empty. Keeps the baseline prompt small for rounds with
  // no enrichment available.
  const hasEnrichment = Boolean(sgBlock || compositeBlock || personaBlock || goalBlock);

  return [
    `You are a college golf coach writing a one-paragraph round summary to ${input.player_first_name}.`,
    ``,
    `Round facts:`,
    `- Score: ${input.total_score} (${toParStr}) ${courseClause}`.trim(),
    statsClause ? `- Stats: ${statsClause}` : '',
    intentClause,
    sgBlock,
    compositeBlock,
    personaBlock,
    goalBlock,
    ``,
    `Write 80-150 words in second person ("you"). Mention the score and at least one of the stats from the facts above.`,
    hasEnrichment
      ? `If the patterns, persona, or goal are listed above, weave ONE of them in naturally — do not list them all, and do not invent extras.`
      : '',
    `For Strokes Gained use only the directional words above ("strong", "neutral", "weak") — do NOT quote raw SG numbers.`,
    `For any goal you reference, name the metric only; do NOT quote the target number or date.`,
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
  // Note: SG values are intentionally NOT added as numeric evidence —
  // the prompt instructs the model to use directional words only, so
  // any raw SG decimal that slips through will (correctly) trip the
  // verifier as a fabricated number. Composite titles, persona label,
  // and goal display are non-numeric and naturally pass the verifier's
  // numeric-token regex, so they don't need explicit claims either.
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

// ---------------------------------------------------------------------------
// Test surface — exported for unit tests in src/test/coachhelm/v3/.
// Production callers should use composeRoundReview() above.
// ---------------------------------------------------------------------------

export const __testables = {
  buildPrompt,
  buildEvidence,
  sgBucket,
};

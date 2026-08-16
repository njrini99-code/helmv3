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
import { extractNumericTokens } from './citations';
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

  // The percentage is stated, not left to be derived. Prose about a
  // "9/14 fairways" fact naturally reaches for "64.3%", and until 2026-08-16
  // that derivation was rejected by the citation verifier as a fabricated
  // number — see pushDerivedPct() below for the measured impact. Quoting a
  // supplied figure is also one less arithmetic step for the model to get
  // wrong than computing one.
  const stats: string[] = [];
  if (input.total_putts !== null) stats.push(`${input.total_putts} putts`);
  if (input.fairways_hit !== null && input.fairways_total !== null) {
    stats.push(`${input.fairways_hit}/${input.fairways_total} fairways${pctSuffix(input.fairways_hit, input.fairways_total)}`);
  }
  if (input.gir !== null && input.gir_total !== null) {
    stats.push(`${input.gir}/${input.gir_total} greens${pctSuffix(input.gir, input.gir_total)}`);
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

/** " (64.3%)" for a usable denominator, "" otherwise. Must agree exactly with
 *  the 1-dp value `pushDerivedPct` registers, or the prompt would quote a
 *  figure the verifier rejects. */
function pctSuffix(made: number | null, total: number | null): string {
  if (made === null || total === null || total <= 0) return '';
  const pct = (made / total) * 100;
  if (!Number.isFinite(pct)) return '';
  return ` (${Number(pct.toFixed(1))}%)`;
}

/**
 * Register `made/total` as a citable percentage, in both the renderings the
 * model actually produces.
 *
 * Silent no-op when the denominator is missing or zero — a null `gir_total`
 * must not register `NaN` or `Infinity` as a citable fact.
 */
function pushDerivedPct(
  claims: EvidenceClaim[],
  field: string,
  made: number | null,
  total: number | null,
): void {
  if (made === null || total === null || total <= 0) return;
  const pct = (made / total) * 100;
  if (!Number.isFinite(pct)) return;

  const oneDp = Number(pct.toFixed(1));
  claims.push({ field: `${field}_pct`, value: oneDp });

  // "56%" and "55.6%" are the same true fact. Only add the second claim when
  // it differs, so an exact figure like 50% doesn't get a duplicate row.
  const rounded = Math.round(pct);
  if (rounded !== oneDp) {
    claims.push({ field: `${field}_pct_rounded`, value: rounded });
  }
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

  // The percentages the model will DERIVE from the counts above.
  //
  // Measured in production 2026-08-16: 19 of 107 round_review compose() calls
  // (17.8%) were discarded for failed citation verification — and every
  // discard in `golf_coachhelm_llm_calls` is a round review. The unmatched
  // tokens were not hallucinations, they were correct arithmetic:
  //
  //   55.6 = 10/18   72.2 = 13/18   27.8 = 5/18   44.4 = 8/18
  //   64.3 = 9/14    71.4 = 10/14   57.1 = 8/14   53.8 = 7/13
  //
  // We hand the model COUNTS and ask for prose about them, so "you hit 55.6%
  // of greens" is exactly what a good narrative says. The verifier requires
  // every numeric token to appear verbatim in this evidence set, so it read a
  // correct derivation as a fabricated cite and compose() threw the WHOLE
  // review away — one in five players silently got the deterministic template
  // instead of the feature.
  //
  // Fixed by SUPPLYING the derived value, never by loosening the verifier: a
  // percentage that does not follow from these counts is still rejected. Both
  // the 1-dp and the rounded rendering are registered because the model uses
  // either ("55.6%" and "56%" are the same true fact, and which one it picks
  // is not something we should be discarding a review over).
  pushDerivedPct(claims, 'gir', input.gir, input.gir_total);
  pushDerivedPct(claims, 'fairways', input.fairways_hit, input.fairways_total);
  // Note: SG values are intentionally NOT added as numeric evidence —
  // the prompt instructs the model to use directional words only, so
  // any raw SG decimal that slips through will (correctly) trip the
  // verifier as a fabricated number.
  //
  // CORRECTED 2026-08-16. This note used to continue "Composite titles,
  // persona label, and goal display are non-numeric and naturally pass the
  // verifier's numeric-token regex, so they don't need explicit claims
  // either." Composite titles are emphatically NOT non-numeric. Sampled from
  // production `golf_coach_insights`:
  //
  //   "3-5 ft putting: 47%"
  //   "175+ yd approach: 33% greens hit · 25 ft when you do"
  //   "Par 4 scoring: 4.24 (+0.24 vs par)"
  //   "Double bogey-or-worse rate: 4.5%"
  //   "10-15 ft putting: 21%"
  //
  // `buildCompositeBlock` injects those verbatim, so the prompt SHOWS the model
  // a figure the verifier would then reject — and compose() discards the entire
  // review over one such token. A number we handed the model is not a
  // fabrication, so it is registered rather than the verifier being loosened.
  //
  // Uses the verifier's own scanner (`extractNumericTokens`) so the set we
  // register and the set it judges cannot drift apart.
  //
  // Persona label and goal display are left alone: the persona is a word, and
  // the prompt already instructs "name the metric only; do NOT quote the target
  // number or date" for goals, so a goal figure SHOULD still trip the verifier.
  const titleFigures = new Set<string>();
  for (const title of input.composite_insight_titles ?? []) {
    for (const tok of extractNumericTokens(title)) titleFigures.add(tok);
  }
  for (const tok of titleFigures) {
    claims.push({ field: 'composite_title_figure', value: tok });
  }

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

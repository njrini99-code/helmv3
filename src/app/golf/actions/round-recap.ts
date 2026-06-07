'use server';

/**
 * Round AI recap — generates a 2-sentence editorial recap for a
 * completed golf round and persists it to `golf_rounds.ai_recap`.
 *
 * Voice and tone:
 *   - Magazine beat-reporter: declarative, concrete, no hype.
 *   - Lead with the one fact that defines the round (best score, putt
 *     trouble, fairways saved the day, finishing kick, etc.).
 *   - Second sentence is forward-looking: what to take into the next
 *     round, framed as a takeaway not a verdict.
 *
 * Provider:
 *   - Default: Vercel AI Gateway via the `ai` SDK using a model string
 *     like `anthropic/claude-haiku-4.5`. Auth is handled by the SDK
 *     automatically through the OIDC token Vercel injects on deploys
 *     (also synced to local via `vercel env pull` — see the project's
 *     `.env.development.local`). No manual credential rotation needed.
 *   - Fallback: a deterministic recap built from round stats and any
 *     active CoachHelm patterns. Used when the gateway is unreachable
 *     (network failure, rate limit, missing OIDC). Same shape, no LLM.
 *
 * The recap is generated lazily — first read of the round detail page
 * after completion fires the generation, persists the result, and
 * subsequent reads return cached text.
 */

import { createClient } from '@/lib/supabase/server';
import { compose } from '@/lib/coachhelm/v3/llm/compose';
import { pct } from '@/lib/golf/stat-formulas';

interface RoundContext {
  id: string;
  player_id: string;
  course_name: string | null;
  course_city: string | null;
  course_state: string | null;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  holes_played: number | null;
  front_nine: number | null;
  back_nine: number | null;
}

interface PlayerStatContext {
  scoring_average: number | null;
  best_round: number | null;
  rounds_played: number | null;
}

export async function generateRoundRecap(roundId: string): Promise<{ recap: string | null; cached: boolean }> {
  const supabase = await createClient();

  // 1. Fetch round + verify status
  const { data: round } = await supabase
    .from('golf_rounds')
    .select(
      'id, player_id, course_name, course_city, course_state, round_date, round_type, total_score, score_to_par, total_putts, total_fairways, total_fairways_hit, total_gir, total_gir_possible, holes_played, front_nine, back_nine, status, ai_recap, ai_recap_generated_at',
    )
    .eq('id', roundId)
    .maybeSingle<RoundContext & { status: string | null; ai_recap: string | null; ai_recap_generated_at: string | null }>();

  if (!round) return { recap: null, cached: false };
  if (round.status !== 'completed') return { recap: null, cached: false };
  if (round.ai_recap) return { recap: round.ai_recap, cached: true };

  // 2. Pull peer context — player's recent stats cache for comparison
  const { data: stats } = await supabase
    .from('golf_player_stats_cache')
    .select('scoring_average, best_round, rounds_played')
    .eq('player_id', round.player_id)
    .maybeSingle<PlayerStatContext>();

  // 3. Build deterministic fallback first — compose() needs a fallback to
  // return when the budget gate denies, the LLM errors, or citations fail.
  const deterministic = buildDeterministicRecap(round, stats);

  // 4. Resolve the player's primary coach so the budget gate bills the
  // right team. If no primary coach is on file (e.g. unattached player
  // profile), pass null — compose() still logs the call but skips the gate.
  const coachId = await resolveBillingCoachId(supabase, round.player_id);

  // 5. Route the LLM call through the v3 compose() wrapper — same
  // budget gate + golf_coachhelm_llm_calls log + citation verifier as
  // round-review / hero-narrative. Falls back to `deterministic` if
  // gated or on error.
  const recap = await generateLLMRecap(round, stats, coachId, deterministic);

  // 4. Persist. Cast through unknown until the generated DB types pick up
  // the new ai_recap columns (migration 20260503000000_golf_round_ai_recap).
  await supabase
    .from('golf_rounds')
    .update({
      ai_recap: recap,
      ai_recap_generated_at: new Date().toISOString(),
    } as unknown as never)
    .eq('id', roundId);

  return { recap, cached: false };
}

// --- LLM path -------------------------------------------------------------

async function generateLLMRecap(
  round: RoundContext,
  stats: PlayerStatContext | null,
  coachId: string | null,
  fallbackText: string,
): Promise<string | null> {
  // Auth is handled by the SDK via Vercel's OIDC token (auto-rotated)
  // inside compose(). compose() also enforces the v3 budget gate, logs
  // the call to golf_coachhelm_llm_calls, and falls back to the
  // deterministic recap on any error or gate denial.

  const stp = round.score_to_par ?? 0;
  const scoreChip = stp === 0 ? 'E' : stp > 0 ? `+${stp}` : `${stp}`;
  const fir =
    round.total_fairways_hit !== null && round.total_fairways !== null
      ? pct(round.total_fairways_hit, round.total_fairways)
      : null;
  const gir =
    round.total_gir !== null && round.total_gir_possible !== null
      ? pct(round.total_gir, round.total_gir_possible)
      : null;

  const facts: string[] = [
    `Score: ${round.total_score} (${scoreChip}) over ${round.holes_played ?? 18} holes`,
    `Course: ${round.course_name ?? 'Unknown'}${round.course_city ? ` in ${round.course_city}, ${round.course_state ?? ''}` : ''}`,
    `Round type: ${round.round_type ?? 'practice'}`,
  ];
  if (round.total_putts !== null) facts.push(`Putts: ${round.total_putts}`);
  if (fir !== null) facts.push(`Fairways hit: ${fir}%`);
  if (gir !== null) facts.push(`Greens in regulation: ${gir}%`);
  if (round.front_nine !== null && round.back_nine !== null) {
    facts.push(`Front 9 / Back 9: ${round.front_nine} / ${round.back_nine}`);
  }
  if (stats?.scoring_average) {
    facts.push(`Player's season scoring average: ${stats.scoring_average.toFixed(1)}`);
  }
  if (stats?.best_round) {
    facts.push(`Player's best round of the season: ${stats.best_round}`);
  }

  const prompt = `You are a golf magazine beat reporter writing a two-sentence post-round recap. Voice: editorial, declarative, concrete, no hype, no clichés (avoid "showed up", "performance", "solid round"). Match the calm authority of The New York Times sports desk.

Lead with the one fact that defines this round — best score in a stretch, putt trouble, fairways saving the day, finishing kick, blowup hole, etc. Use the data provided to pick which thread is the lede. The second sentence is forward-looking: a takeaway for the next round, framed as observation not verdict.

Strict rules:
- Exactly two sentences.
- ≤ 36 words total.
- No exclamation points. No emojis. No em-dashes — use periods or commas.
- Use the player's third person ("Nick", "the round") or second person ("you"), not first person.
- Don't restate the score number more than once.
- Reference at least one specific stat by number.

Round data:
${facts.join('\n')}

Output only the two sentences. Nothing else.`;

  const result = await compose(
    {
      task: 'round_review',
      coach_id: coachId,
      player_id: round.player_id,
      prompt,
      evidence: [],
      max_completion_tokens: 120, // ~36 words × ~3 tokens/word + buffer
    },
    fallbackText,
  );

  // compose() always returns text — either LLM or the fallback we passed.
  // Run the same sanity check as before so a degenerate LLM reply still
  // collapses to fallback at the persistence layer.
  const trimmed = result.text.trim();
  if (!trimmed || trimmed.length < 30 || trimmed.length > 400) return null;
  return trimmed;
}

/**
 * Resolve the coach to bill the LLM spend against. Picks the primary
 * coach of the player's first active team. Returns null when no primary
 * coach exists — compose() then skips the budget gate but still logs.
 */
async function resolveBillingCoachId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<string | null> {
  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!membership?.team_id) return null;

  const { data: staff } = await supabase
    .from('golf_team_coach_staff')
    .select('coach_id')
    .eq('team_id', membership.team_id)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle();
  return staff?.coach_id ?? null;
}

// --- Deterministic fallback ----------------------------------------------

function buildDeterministicRecap(
  round: RoundContext,
  stats: PlayerStatContext | null,
): string {
  const stp = round.score_to_par ?? 0;
  const score = round.total_score ?? 0;
  const fir =
    round.total_fairways_hit !== null && round.total_fairways !== null
      ? pct(round.total_fairways_hit, round.total_fairways)
      : null;
  const gir =
    round.total_gir !== null && round.total_gir_possible !== null
      ? pct(round.total_gir, round.total_gir_possible)
      : null;

  // Pick the lede thread by what's most defining
  let lede: string;
  if (stats?.scoring_average && score < stats.scoring_average - 1) {
    const delta = (stats.scoring_average - score).toFixed(1);
    lede = `${score} on the card, ${delta} strokes below the season average.`;
  } else if (stats?.best_round && score < stats.best_round) {
    lede = `${score} sets a new low for the season.`;
  } else if (stp < 0) {
    lede = `${score} dipped under par — the kind of round the rest of the season measures itself against.`;
  } else if (round.total_putts !== null && round.holes_played && round.total_putts / round.holes_played > 2) {
    lede = `${score} on the card, but the putter cost ${round.total_putts} strokes on ${round.holes_played} holes.`;
  } else if (fir !== null && fir > 75) {
    lede = `${score} built off the tee — ${fir}% of fairways found.`;
  } else if (gir !== null && gir < 40) {
    lede = `${score}, with the approach game leaking — only ${gir}% of greens.`;
  } else {
    lede = `${score} on the card at ${round.course_name ?? 'the course'}.`;
  }

  // Forward-looking takeaway
  let takeaway: string;
  if (round.total_putts !== null && round.holes_played && round.total_putts / round.holes_played > 2) {
    takeaway = 'Short-game reps before the next outing should pay back what the lag putts gave away.';
  } else if (gir !== null && gir < 50) {
    takeaway = 'Tighter approach proximity is the next thread — the scoring window opens with green-hit rate.';
  } else if (fir !== null && fir < 50) {
    takeaway = 'A more reliable tee shot would compound the gains everywhere else.';
  } else if (stp < 0) {
    takeaway = 'Hold this advantage — the drills supporting it are the ones to keep on the practice plan.';
  } else {
    takeaway = 'The next round is where this baseline gets tested.';
  }

  return `${lede} ${takeaway}`;
}

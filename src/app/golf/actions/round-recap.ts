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
import { generateText } from 'ai';

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

const RECAP_MODEL =
  process.env.AI_RECAP_MODEL ?? 'anthropic/claude-haiku-4.5';

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

  // 3. Try LLM generation. Falls through to deterministic on any failure.
  let recap: string | null = null;
  try {
    recap = await generateLLMRecap(round, stats);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[round-recap] AI gateway unavailable, falling back:', err);
    }
  }
  if (!recap) {
    recap = buildDeterministicRecap(round, stats);
  }

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
): Promise<string | null> {
  // Auth is handled by the SDK via Vercel's OIDC token (auto-rotated).
  // If the token is missing or the gateway is unreachable, the SDK throws
  // and the caller's try/catch falls back to the deterministic recap.

  const stp = round.score_to_par ?? 0;
  const scoreChip = stp === 0 ? 'E' : stp > 0 ? `+${stp}` : `${stp}`;
  const fir =
    round.total_fairways && round.total_fairways > 0 && round.total_fairways_hit !== null
      ? Math.round(((round.total_fairways_hit ?? 0) / round.total_fairways) * 100)
      : null;
  const gir =
    round.total_gir_possible && round.total_gir_possible > 0 && round.total_gir !== null
      ? Math.round(((round.total_gir ?? 0) / round.total_gir_possible) * 100)
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

  const { text } = await generateText({
    model: RECAP_MODEL,
    prompt,
    temperature: 0.6,
    maxRetries: 1,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'round-recap',
      recordInputs: true,
      recordOutputs: true,
    },
  });

  // Lightweight sanity check — a trimmed, two-sentence-ish string.
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 30 || trimmed.length > 400) return null;
  return trimmed;
}

// --- Deterministic fallback ----------------------------------------------

function buildDeterministicRecap(
  round: RoundContext,
  stats: PlayerStatContext | null,
): string {
  const stp = round.score_to_par ?? 0;
  const score = round.total_score ?? 0;
  const fir =
    round.total_fairways && round.total_fairways > 0 && round.total_fairways_hit !== null
      ? Math.round(((round.total_fairways_hit ?? 0) / round.total_fairways) * 100)
      : null;
  const gir =
    round.total_gir_possible && round.total_gir_possible > 0 && round.total_gir !== null
      ? Math.round(((round.total_gir ?? 0) / round.total_gir_possible) * 100)
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

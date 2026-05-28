'use server';

/**
 * v3 LLM server actions (W30).
 *
 * Thin wrapper around composeRoundReview. Pulls the round + player +
 * billing-coach context from the authed session, calls the composer,
 * returns the prose text + flags.
 *
 * Caller (a client component on the round-review page) renders the
 * returned text alongside the existing template summary.
 */

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import {
  composeRoundReview,
  type RoundReviewActiveGoal,
  type RoundReviewSG,
} from '@/lib/coachhelm/v3/llm/round-review';
import { composeHeroNarrative } from '@/lib/coachhelm/v3/llm/hero-narrative';
import { loadAlertPostureForPlayer } from '@/lib/coachhelm/v3/intent/loader';
import { loadGenome } from '@/lib/coachhelm/v3/genome/loader';
import { derivePersona } from '@/lib/coachhelm/v3/genome/persona';

export interface LlmRoundReviewActionResult {
  ok: boolean;
  text?: string;
  used_llm?: boolean;
  citations_verified?: boolean;
  cost_usd?: number;
  error?: string;
}

/**
 * Generate (or regenerate) the LLM round-review prose for one round.
 *
 * Auth: caller must be the player who owns the round, or a coach of
 * the player's team. RLS on golf_rounds enforces this independently.
 */
export async function generateLlmRoundReview(
  roundId: string,
  fallback_summary: string,
): Promise<LlmRoundReviewActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { data: round } = await supabase
      .from('golf_rounds')
      .select(
        'id, player_id, total_score, score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, course_name',
      )
      .eq('id', roundId)
      .maybeSingle();
    if (!round || round.total_score === null || round.score_to_par === null) {
      return { ok: false, error: 'Round not found or incomplete' };
    }

    const { data: player } = await supabase
      .from('golf_players')
      .select('id, first_name')
      .eq('id', round.player_id)
      .maybeSingle();
    if (!player) return { ok: false, error: 'Player not found' };

    // Resolve the billing coach — primary coach of the player's
    // (first active) team. golf_players has no team_id; the join goes
    // through golf_team_members. null = no coach to bill against, in
    // which case compose() skips the budget gate but still logs.
    let billing_coach_id: string | null = null;
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', round.player_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (membership?.team_id) {
      const { data: staff } = await supabase
        .from('golf_team_coach_staff')
        .select('coach_id')
        .eq('team_id', membership.team_id)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle();
      billing_coach_id = staff?.coach_id ?? null;
    }

    // W27 — load narrative_goal so the LLM can adjust tone.
    const intentResult = await loadAlertPostureForPlayer(round.player_id);

    // ------------------------------------------------------------------
    // Optional enrichment (v3 audit Tier-2 #5) — failures are non-fatal.
    // Each loader is wrapped so a single missing/erroring source can't
    // block the LLM call. The composer accepts every field as optional
    // and gracefully omits the corresponding prompt section.
    // ------------------------------------------------------------------
    const enrichment = await loadRoundReviewEnrichment(supabase, {
      round_id: roundId,
      player_id: round.player_id,
    });

    const result = await composeRoundReview({
      player_id: round.player_id,
      coach_id: billing_coach_id,
      player_first_name: player.first_name ?? 'Player',
      total_score: round.total_score,
      score_to_par: round.score_to_par,
      course_name: round.course_name,
      total_putts: round.total_putts,
      fairways_hit: round.total_fairways_hit,
      fairways_total: round.total_fairways,
      gir: round.total_gir,
      gir_total: round.total_gir_possible,
      fallback_summary,
      narrative_goal: intentResult?.narrative_goal,
      strokes_gained: enrichment.strokes_gained,
      composite_insight_titles: enrichment.composite_insight_titles,
      persona_label: enrichment.persona_label,
      active_goal: enrichment.active_goal,
    });

    return {
      ok: true,
      text: result.text,
      used_llm: result.used_llm,
      citations_verified: result.citations_verified,
      cost_usd: result.cost_usd,
    };
  } catch (err) {
    await logServerError(
      `generateLlmRoundReview failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.llm.generateLlmRoundReview' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

// ---------------------------------------------------------------------------
// W31 — Hero narrative for the player dashboard
// ---------------------------------------------------------------------------

export interface HeroNarrativeInput {
  /** Player whose dashboard is rendering this. Must match the authed
   *  player (or be a coach viewing-as the player). */
  player_id: string;
  metric_label: string;
  your_value_display: string;
  team_pct: number | null;
  goal_target_display?: string;
  counterfactual_strokes_per_round?: number;
  fallback_text: string;
}

export interface LlmHeroNarrativeActionResult {
  ok: boolean;
  text?: string;
  used_llm?: boolean;
  citations_verified?: boolean;
  cost_usd?: number;
  error?: string;
}

export async function generateHeroNarrative(
  input: HeroNarrativeInput,
): Promise<LlmHeroNarrativeActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { data: player } = await supabase
      .from('golf_players')
      .select('id, first_name')
      .eq('id', input.player_id)
      .maybeSingle();
    if (!player) return { ok: false, error: 'Player not found' };

    // Bill against the primary coach of the player's first active team
    // (same resolution as round-review). null = no budget gate.
    let billing_coach_id: string | null = null;
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', input.player_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (membership?.team_id) {
      const { data: staff } = await supabase
        .from('golf_team_coach_staff')
        .select('coach_id')
        .eq('team_id', membership.team_id)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle();
      billing_coach_id = staff?.coach_id ?? null;
    }

    // W27 — load narrative_goal so the LLM can adjust tone.
    const intentResult = await loadAlertPostureForPlayer(input.player_id);

    const result = await composeHeroNarrative({
      player_id: input.player_id,
      coach_id: billing_coach_id,
      player_first_name: player.first_name ?? 'Player',
      top_insight: {
        metric_label: input.metric_label,
        your_value_display: input.your_value_display,
        team_pct: input.team_pct,
      },
      goal: input.goal_target_display
        ? { target_display: input.goal_target_display }
        : undefined,
      counterfactual_strokes_per_round: input.counterfactual_strokes_per_round,
      fallback_text: input.fallback_text,
      narrative_goal: intentResult?.narrative_goal,
    });

    return {
      ok: true,
      text: result.text,
      used_llm: result.used_llm,
      citations_verified: result.citations_verified,
      cost_usd: result.cost_usd,
    };
  } catch (err) {
    await logServerError(
      `generateHeroNarrative failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.llm.generateHeroNarrative' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

// ---------------------------------------------------------------------------
// Internal: round-review prompt enrichment loader (v3 audit Tier-2 #5).
//
// Pulls SG breakdown + composite-insight titles + genome persona +
// single active goal for the round. Every source is independently
// try/catch'd so a single failure (RLS edge, race with the
// post-round trigger that writes the cache, missing genome) just
// drops one optional section from the prompt rather than failing
// the whole LLM call.
// ---------------------------------------------------------------------------

interface RoundReviewEnrichment {
  strokes_gained?: RoundReviewSG;
  composite_insight_titles?: string[];
  persona_label?: string | null;
  active_goal?: RoundReviewActiveGoal | null;
}

// Use ReturnType to inherit Database<T> from the project's server helper
// without re-importing the @supabase/supabase-js generic; this keeps the
// type imports identical to the rest of the file.
type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

async function loadRoundReviewEnrichment(
  supabase: ServerSupabase,
  args: { round_id: string; player_id: string },
): Promise<RoundReviewEnrichment> {
  const [sg, composites, persona, goal] = await Promise.all([
    loadStrokesGained(supabase, args.round_id).catch(() => undefined),
    loadCompositeInsightTitles(supabase, args).catch(() => undefined),
    loadPersonaLabel(supabase, args.player_id).catch(() => null),
    loadActiveGoal(supabase, args.player_id).catch(() => null),
  ]);
  return {
    strokes_gained: sg,
    composite_insight_titles: composites,
    persona_label: persona,
    active_goal: goal,
  };
}

async function loadStrokesGained(
  supabase: ServerSupabase,
  roundId: string,
): Promise<RoundReviewSG | undefined> {
  const { data } = await supabase
    .from('golf_round_stats_cache')
    .select(
      'strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting',
    )
    .eq('round_id', roundId)
    .maybeSingle();
  if (!data) return undefined;
  return {
    total: data.strokes_gained_total,
    tee: data.strokes_gained_tee,
    approach: data.strokes_gained_approach,
    around_green: data.strokes_gained_around_green,
    putting: data.strokes_gained_putting,
  };
}

async function loadCompositeInsightTitles(
  supabase: ServerSupabase,
  args: { round_id: string; player_id: string },
): Promise<string[]> {
  // golf_coach_insights.source_id stores the round_id for round-triggered
  // composite rows (W28 synthesis pass). Cap at 3 to keep prompt budget
  // bounded — the composer also defends with .slice(0, 3) but
  // pre-trimming saves a few tokens.
  const { data } = await supabase
    .from('golf_coach_insights')
    .select('title, signature, created_at')
    .eq('player_id', args.player_id)
    .eq('source_id', args.round_id)
    .like('signature', 'v3:composite:%')
    .order('created_at', { ascending: false })
    .limit(3);
  return (data ?? []).map((row) => row.title).filter(Boolean);
}

async function loadPersonaLabel(
  supabase: ServerSupabase,
  playerId: string,
): Promise<string | null> {
  const genome = await loadGenome(supabase, playerId);
  if (!genome) return null;
  const persona = derivePersona(genome.vector);
  // Build a short slash-delimited label from up to 2 strengths so the
  // prompt stays tight. Falls back to course_profile when no confident
  // strengths exist yet.
  if (persona.strengths.length === 0) {
    return persona.course_profile === 'Not enough rounds yet for a course profile.'
      ? null
      : persona.course_profile;
  }
  const parts = persona.strengths
    .slice(0, 2)
    .map((s) => s.qualitative ?? s.label);
  return parts.join(' / ');
}

async function loadActiveGoal(
  supabase: ServerSupabase,
  playerId: string,
): Promise<RoundReviewActiveGoal | null> {
  // Pick the soonest-ending active goal. RLS gates which goals the
  // calling user can see (the round's player or a coach on their team).
  const { data } = await supabase
    .from('golf_goals')
    .select('title, target_value, ends_at, metric_id')
    .eq('player_id', playerId)
    .eq('state', 'active')
    .order('ends_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const target =
    data.target_value !== null && data.target_value !== undefined
      ? `${data.target_value} by ${data.ends_at.slice(0, 10)}`
      : `by ${data.ends_at.slice(0, 10)}`;
  return {
    metric_label: data.title,
    target_display: target,
  };
}

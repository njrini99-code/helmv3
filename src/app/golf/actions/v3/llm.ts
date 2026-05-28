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
import { composeRoundReview } from '@/lib/coachhelm/v3/llm/round-review';
import { composeHeroNarrative } from '@/lib/coachhelm/v3/llm/hero-narrative';
import { loadAlertPostureForPlayer } from '@/lib/coachhelm/v3/intent/loader';

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

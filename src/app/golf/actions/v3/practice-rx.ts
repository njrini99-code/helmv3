'use server';

/**
 * v3 Practice Rx server action (W38).
 *
 * Resolves goal → drills → coach → composer. Returns the structured
 * plan (day-by-day with drill ids the UI can hydrate against
 * golf_drills) plus the raw LLM text for debugging / fallback render.
 */

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { composePracticeRx, type PracticePlan } from '@/lib/coachhelm/v3/practice-rx/composer';

export interface PracticeRxActionResult {
  ok: boolean;
  plan?: PracticePlan;
  error?: string;
}

export async function generatePracticeRx(goal_id: string): Promise<PracticeRxActionResult> {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { data: goal } = await sb
      .from('golf_goals')
      .select('id, title, metric_id, target_value, current_value, window_days, player_id')
      .eq('id', goal_id)
      .maybeSingle();
    if (!goal) return { ok: false, error: 'Goal not found' };

    // Authz: caller is the player who owns the goal OR any coach of
    // the player's team. RLS would already gate the select above.
    // No further check needed — if we got the row, we're good.

    // Candidate drills tagged to this goal's metric.
    const { data: drills } = await sb
      .from('golf_drills')
      .select('id, slug, title, duration_min, difficulty')
      .eq('impacts_metric_id', goal.metric_id);
    const candidate_drills = (drills ?? []).map((d) => ({
      id: d.id,
      slug: d.slug,
      title: d.title,
      duration_min: d.duration_min,
      difficulty: d.difficulty,
    }));

    if (candidate_drills.length === 0) {
      return {
        ok: false,
        error: `No drills tagged with impacts_metric_id=${goal.metric_id}. Add drills via the content library before generating Practice Rx for this goal.`,
      };
    }

    // Resolve billing coach (primary coach of player's first active team).
    let billing_coach_id: string | null = null;
    const { data: membership } = await sb
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', goal.player_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (membership?.team_id) {
      const { data: staff } = await sb
        .from('golf_team_coach_staff')
        .select('coach_id')
        .eq('team_id', membership.team_id)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle();
      billing_coach_id = staff?.coach_id ?? null;
    }

    // Fallback text the UI shows verbatim when LLM is gated.
    const fallback_text = candidate_drills
      .slice(0, 7)
      .map(
        (d, i) =>
          `Day ${i + 1}: drill_ids=${d.id} — ${d.title} (${d.duration_min} min).`,
      )
      .join('\n');

    const plan = await composePracticeRx({
      player_id: goal.player_id,
      coach_id: billing_coach_id,
      goal: {
        id: goal.id,
        title: goal.title,
        metric_id: goal.metric_id,
        target_value: goal.target_value,
        current_value: goal.current_value,
        window_days: goal.window_days ?? 30,
      },
      candidate_drills,
      fallback_text,
    });

    return { ok: true, plan };
  } catch (err) {
    await logServerError(
      `generatePracticeRx failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.practice-rx.generate' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

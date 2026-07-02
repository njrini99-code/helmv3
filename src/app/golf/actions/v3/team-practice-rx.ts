'use server';

/**
 * ============================================================================
 * Team Practice Rx — generate a practice plan for a TEAM skill area.
 * ----------------------------------------------------------------------------
 * The per-goal generatePracticeRx is keyed by a player goal. A coach drilling
 * into a team weakness (or strength) wants a plan for the AREA, with no goal in
 * hand. This composes the SAME engine (composePracticeRx) with a SYNTHETIC,
 * area-keyed goal — the composer only reads {id,title,metric_id,target,current,
 * window_days} + the candidate drills, so no goal row is minted just to draft a
 * plan. The plan is ephemeral; it is materialized only if the coach saves it as
 * a Document (saveTextDocument). Coach-team access is enforced here.
 * ========================================================================== */

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { validateCoachTeamAccess } from '@/lib/golf/resolve-team';
import { composePracticeRx, type PracticePlan } from '@/lib/coachhelm/v3/practice-rx/composer';
import { metricForArea } from '@/lib/coachhelm/v3/practice-rx/area-metric-map';
import { withAdminObserved } from '@/lib/admin/observed-action';

export interface TeamPracticeRxInput {
  team_id: string;
  area_id: string;
  area_label: string;
}

export interface TeamPracticeRxResult {
  ok: boolean;
  plan?: PracticePlan;
  /** Candidate drills (id→title) so the UI can hydrate the plan / render markdown. */
  drills?: Array<{ id: string; title: string; duration_min: number }>;
  error?: string;
}

async function generateTeamPracticeRxImpl(
  input: TeamPracticeRxInput,
): Promise<TeamPracticeRxResult> {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    // Coach-team access guard (server action without an auth check is a hard CI
    // rule). Resolve the coach, then verify they staff this team.
    const { data: coach } = await sb
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) return { ok: false, error: 'Only coaches can generate team practice plans' };

    const allowed = await validateCoachTeamAccess(sb, coach.id, input.team_id, coach.organization_id);
    if (!allowed) return { ok: false, error: 'Not authorized for this team' };

    const metric_id = metricForArea(input.area_id);
    if (!metric_id) return { ok: false, error: `Unknown skill area: ${input.area_id}` };

    // Candidate drills tagged to this area's metric (same query as the per-goal path).
    const { data: drills } = await sb
      .from('golf_drills')
      .select('id, slug, title, duration_min, difficulty')
      .eq('impacts_metric_id', metric_id);
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
        error: `No drills tagged for ${input.area_label}. Add drills to the content library before generating a plan.`,
      };
    }

    // Representative roster player for LLM-budget attribution (the plan is for
    // the team, not one player). First active member; the team is verified above.
    const { data: member } = await sb
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', input.team_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    const attributionPlayerId = member?.player_id ?? null;

    const fallback_text = candidate_drills
      .slice(0, 7)
      .map((d, i) => `Day ${i + 1}: drill_ids=${d.id} — ${d.title} (${d.duration_min} min).`)
      .join('\n');

    const plan = await composePracticeRx({
      // Budget attribution only — a representative roster member, or null when the
      // team has no active members (compose()/logCall accept null; '' would be an
      // invalid uuid for golf_coachhelm_llm_calls.player_id).
      player_id: attributionPlayerId,
      coach_id: coach.id,
      goal: {
        id: `team:${input.area_id}`,
        title: `Team practice — ${input.area_label}`,
        metric_id,
        target_value: null,
        current_value: null,
        window_days: 7,
      },
      candidate_drills,
      fallback_text,
    });

    return {
      ok: true,
      plan,
      drills: candidate_drills.map((d) => ({ id: d.id, title: d.title, duration_min: d.duration_min })),
    };
  } catch (err) {
    await logServerError(
      `generateTeamPracticeRx failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.team-practice-rx.generate' },
    );
    return { ok: false, error: 'Internal error' };
  }
}

const observedGenerateTeamPracticeRx = withAdminObserved(
  'generateTeamPracticeRx',
  { sport: 'golf', feature: 'drills_practice_rx' },
  generateTeamPracticeRxImpl,
);

export async function generateTeamPracticeRx(input: TeamPracticeRxInput): Promise<TeamPracticeRxResult> {
  return observedGenerateTeamPracticeRx(input);
}

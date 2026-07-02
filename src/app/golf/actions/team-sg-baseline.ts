'use server';

/**
 * Per-team Strokes Gained baseline (Coaching Intelligence setting).
 *
 * A coach picks the baseline their team's SG is measured against (PGA Tour,
 * Women's, Scratch, D1/D2/D3). It persists on golf_team_settings.sg_baseline and
 * — because SG is stored, not computed on read — changing it recomputes the
 * team's stored SG at the new baseline (DB recompute_team_sg, service-role only),
 * so every SG surface (StandingBar, stats, CoachHelm) reflects the choice.
 *
 * Defaults: women's teams -> 'womens', men's -> 'pga_tour' (matches the gender
 * baseline shipped in 20260607170000). Resolution mirrors the DB
 * sg_scale_for_player().
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import {
  SG_BASELINE_OPTIONS,
  effectiveSgBaseline,
  type SgBaselineKey,
  type TeamGender,
} from '@/lib/golf/sg-benchmarks';

const VALID_KEYS = new Set<string>(SG_BASELINE_OPTIONS.map((o) => o.key));

async function resolveCoachTeam(): Promise<
  { teamId: string; gender: TeamGender } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach?.organization_id) return { error: 'Coach not found' };

  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  if (!teamId) return { error: 'No team assigned' };

  const { data: team } = await supabase
    .from('golf_teams')
    .select('gender')
    .eq('id', teamId)
    .maybeSingle();

  return { teamId, gender: (team?.gender as TeamGender) ?? 'mens' };
}

export interface TeamSgBaselineState {
  baseline: SgBaselineKey; // effective (explicit setting or gender default)
  isExplicit: boolean;
  gender: TeamGender;
}

/** Current effective SG baseline for the signed-in coach's team. */
async function getTeamSgBaselineImpl(): Promise<
  { success: true; data: TeamSgBaselineState } | { success: false; error: string }
> {
  const resolved = await resolveCoachTeam();
  if ('error' in resolved) return { success: false, error: resolved.error };

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('golf_team_settings')
    .select('sg_baseline')
    .eq('team_id', resolved.teamId)
    .maybeSingle();

  const explicit = (settings?.sg_baseline as SgBaselineKey | null) ?? null;
  return {
    success: true,
    data: {
      baseline: effectiveSgBaseline(explicit, resolved.gender),
      isExplicit: explicit !== null,
      gender: resolved.gender,
    },
  };
}

const observedGetTeamSgBaseline = withAdminObserved(
  'getTeamSgBaseline',
  { sport: 'golf', feature: 'stats_analytics' },
  getTeamSgBaselineImpl,
);

export async function getTeamSgBaseline(): Promise<
  { success: true; data: TeamSgBaselineState } | { success: false; error: string }
> {
  return observedGetTeamSgBaseline();
}

/**
 * Set the team's SG baseline and recompute its stored SG. Pass null to clear the
 * override (revert to the gender default).
 */
async function setTeamSgBaselineImpl(
  baseline: SgBaselineKey | null,
): Promise<{ success: boolean; error?: string }> {
  if (baseline !== null && !VALID_KEYS.has(baseline)) {
    return { success: false, error: 'Invalid baseline' };
  }

  const resolved = await resolveCoachTeam();
  if ('error' in resolved) return { success: false, error: resolved.error };
  const { teamId } = resolved;

  const supabase = await createClient();
  // Upsert the per-team setting (RLS scopes the coach to their own team's row).
  const { error: upsertError } = await supabase
    .from('golf_team_settings')
    .upsert({ team_id: teamId, sg_baseline: baseline }, { onConflict: 'team_id' });
  if (upsertError) {
    await logServerError(`setTeamSgBaseline upsert failed: ${upsertError.message}`, {
      action: 'team-sg-baseline.set', featureArea: 'stats', extra: { teamId, baseline },
    });
    return { success: false, error: 'Failed to save baseline' };
  }

  // Recompute the team's stored SG at the new baseline (service-role RPC).
  const admin = createAdminClient();
  const { error: rpcError } = await admin.rpc('recompute_team_sg', { p_team_id: teamId });
  if (rpcError) {
    await logServerError(`recompute_team_sg failed: ${rpcError.message}`, {
      action: 'team-sg-baseline.recompute', featureArea: 'stats', extra: { teamId, baseline },
    });
    return { success: false, error: 'Saved, but recompute failed — try again' };
  }

  revalidatePath('/golf/dashboard/stats');
  revalidatePath('/golf/dashboard/stats/team');
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/settings/coaching-intelligence');
  return { success: true };
}

const observedSetTeamSgBaseline = withAdminObserved(
  'setTeamSgBaseline',
  { sport: 'golf', feature: 'stats_analytics' },
  setTeamSgBaselineImpl,
);

export async function setTeamSgBaseline(
  baseline: SgBaselineKey | null,
): Promise<{ success: boolean; error?: string }> {
  return observedSetTeamSgBaseline(baseline);
}

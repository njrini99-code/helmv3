import type { createAdminClient } from '@/lib/supabase/admin';

/**
 * Who the CoachHelm engine would run a player under, and whether CoachHelm is
 * switched on for them. This is the engine's own park check
 * (`triggerPlayerInsightsAfterRound` in `src/app/golf/actions/insights-
 * coachhelm.ts` returns `engine_no_team_membership`, `engine_no_coach` or
 * `engine_disabled` from it), shared so the roster sweep's stale refresh
 * skips exactly the players the engine would park.
 *
 * Read errors are not told apart from "no row", as in the engine: a failed
 * read parks the run there, so it skips the player here.
 */
export type EngineOwner =
  | { kind: 'ok'; teamId: string; coachId: string }
  | { kind: 'no_team' }
  | { kind: 'no_org'; teamId: string }
  | { kind: 'no_coach'; teamId: string }
  | { kind: 'disabled'; scope: 'coach' | 'team'; reason: string | null; teamId: string; coachId: string };

type AdminClient = ReturnType<typeof createAdminClient>;

export async function resolveEngineOwner(admin: AdminClient, playerId: string): Promise<EngineOwner> {
  const { data: membership } = await admin
    .from('golf_team_members')
    .select('team_id, golf_teams(organization_id)')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .limit(1)
    .single();
  if (!membership?.team_id) return { kind: 'no_team' };

  const teamId = membership.team_id;
  const orgId = (membership.golf_teams as { organization_id: string } | null)?.organization_id;
  if (!orgId) return { kind: 'no_org', teamId };

  // The order is load-bearing, not cosmetic: `player-signal-settings.ts`
  // documents that it resolves the coach the SAME way as this path, so a
  // player's Stats page and their post-round insights agree on whose windows
  // apply. Without a total order neither query guarantees a row, so two
  // multi-coach organizations (measured: 2, holding 5 coaches) could resolve
  // differently here than there. `created_at` is nullable, so `id` is the
  // tie-break that makes it total. Keep the two in step.
  const { data: coach } = await admin
    .from('golf_coaches')
    .select('id')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  if (!coach) return { kind: 'no_coach', teamId };
  const coachId = coach.id as string;

  const { data: coachSettings } = await admin
    .from('golf_coachhelm_settings')
    .select('enabled, disabled_reason')
    .eq('coach_id', coachId)
    .maybeSingle();
  if (coachSettings?.enabled === false) {
    return { kind: 'disabled', scope: 'coach', reason: coachSettings.disabled_reason ?? null, teamId, coachId };
  }

  const { data: teamSettings } = await admin
    .from('golf_team_coachhelm_settings')
    .select('enabled, disabled_reason')
    .eq('team_id', teamId)
    .maybeSingle();
  if (teamSettings?.enabled === false) {
    return { kind: 'disabled', scope: 'team', reason: teamSettings.disabled_reason ?? null, teamId, coachId };
  }

  return { kind: 'ok', teamId, coachId };
}

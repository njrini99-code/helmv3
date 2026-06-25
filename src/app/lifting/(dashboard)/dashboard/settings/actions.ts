'use server';

// =============================================================================
// src/app/lifting/(dashboard)/dashboard/settings/actions.ts
//
// Small server actions scoped to the settings page:
//   getOrgTeamsForLifting — returns {id, name, sport} for all teams in an org
//     that can be assigned to a lifting coach. Used by the team-picker combobox
//     in LiftingSettingsClient (W8e).
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { HelmLiftingSport } from '@/lib/types/helm-lifting';

export interface OrgTeamOption {
  id: string;
  name: string;
  sport: HelmLiftingSport;
}

/**
 * Fetch all teams (baseball + golf) for the given org, filtered to those
 * the current user's active lifting coach covers or could cover.
 *
 * Auth: caller must be an active lifting coach for the org.
 * Returns an empty array if not authorized or no teams are found.
 */
export async function getOrgTeamsForLifting(orgId: string): Promise<OrgTeamOption[]> {
  if (!orgId) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Verify the caller is an active lifting coach for this org.
  const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('id')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .maybeSingle() as { data: { id: string } | null };

  if (!coachRow) return [];

  const teams: OrgTeamOption[] = [];

  // Baseball teams for the org
  const { data: baseballTeams } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('organization_id', orgId)
    .order('name') as { data: Array<{ id: string; name: string }> | null };

  for (const t of baseballTeams ?? []) {
    teams.push({ id: t.id, name: t.name, sport: 'baseball' as HelmLiftingSport });
  }

  // Golf teams for the org
  const { data: golfTeams } = await supabase
    .from('golf_teams')
    .select('id, name')
    .eq('organization_id', orgId)
    .order('name') as { data: Array<{ id: string; name: string }> | null };

  for (const t of golfTeams ?? []) {
    teams.push({ id: t.id, name: t.name, sport: 'golf' as HelmLiftingSport });
  }

  return teams;
}

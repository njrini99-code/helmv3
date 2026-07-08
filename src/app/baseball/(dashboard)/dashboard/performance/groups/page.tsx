// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/groups/page.tsx
//
// V11 Strength Groups (spec L24 + L151-198 + Packet C). SERVER-GATED:
//   * Active baseball context required (never trusts a cookie alone).
//   * STAFF role required; players are redirected to their Today view.
//   * can_manage_lifting required (grouping is a prescribe capability). Nav
//     hiding is not relied upon; the page server-redirects without the gate.
//
// LANE C — ONE LIFT LAB: repointed at the canonical
// src/components/lifting/groups/StrengthGroupsClient (native HelmLifting*
// props) instead of the legacy src/components/baseball/performance/
// StrengthGroupsClient. Fetches helm_lifting_groups directly (mirroring
// src/app/lifting/(dashboard)/dashboard/groups/page.tsx), team-scoped.
//
// Note: the legacy StrengthGroupsClient also supported dynamic-rule groups
// with a live preview and a "seed default groups" affordance (getStrengthGroupsBoard
// -> board.defaultGroupsPresent). The canonical component only supports
// static groups (create / rename / archive / add-remove member) — dynamic
// group rules and the seed-defaults CTA are not carried over. See this
// lane's report.
//
// WRITES: createGroup / deleteGroup / addGroupMember / removeGroupMember from
// src/app/lifting/actions/groups.ts (withLiftingAction, requireEdit:true —
// see this lane's report for the confirmed helm_lifting_coaches access-gate
// gap for baseball staff who haven't onboarded through /lifting).
// =============================================================================

import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveBaseballLiftingOrg } from '@/lib/lifting/resolve-baseball-context';
import { StrengthGroupsClient } from '@/components/lifting/groups/StrengthGroupsClient';
import type { HelmLiftingGroupRow } from '@/lib/types/helm-lifting-data';
import type { HelmLiftingAthleteRow } from '@/lib/types/helm-lifting';

interface GroupWithMembers extends HelmLiftingGroupRow {
  member_count: number;
  member_athlete_ids: string[];
}

async function getGroupsWithMembers(organizationId: string, teamId: string): Promise<GroupWithMembers[]> {
  const supabase = await createClient();

  const { data: groups } = (await fromUntyped(supabase, 'helm_lifting_groups')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(100)) as { data: HelmLiftingGroupRow[] | null };

  if (!groups || groups.length === 0) return [];

  const { data: members } = (await fromUntyped(supabase, 'helm_lifting_group_members')
    .select('group_id, athlete_id')
    .in('group_id', groups.map((g) => g.id))
    .is('ends_at', null)) as { data: Array<{ group_id: string; athlete_id: string }> | null };

  const membersByGroup = new Map<string, string[]>();
  for (const m of members ?? []) {
    const arr = membersByGroup.get(m.group_id) ?? [];
    arr.push(m.athlete_id);
    membersByGroup.set(m.group_id, arr);
  }

  return groups.map((g) => {
    const athleteIds = membersByGroup.get(g.id) ?? [];
    return { ...g, member_count: athleteIds.length, member_athlete_ids: athleteIds };
  });
}

async function getAthletes(
  organizationId: string,
  teamId: string,
): Promise<Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>>> {
  const supabase = await createClient();
  const { data } = (await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id, first_name, last_name, position, sport')
    .eq('organization_id', organizationId)
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('last_name', { ascending: true })
    .limit(500)) as {
    data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>> | null;
  };
  return data ?? [];
}

export default async function StrengthGroupsPage() {
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole !== 'coach') redirect('/baseball/player/today');

  const teamId = context.activeTeamId;
  const caps = await resolveBaseballCapabilities(teamId);
  if (!caps.can_manage_lifting) redirect('/baseball/dashboard/performance');

  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  const [groups, athletes] = liftCtx
    ? await Promise.all([
        getGroupsWithMembers(liftCtx.organizationId, teamId),
        getAthletes(liftCtx.organizationId, teamId),
      ])
    : [[], []];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <StrengthGroupsClient
        groups={groups}
        athletes={athletes}
        orgId={liftCtx?.organizationId ?? ''}
        canEdit={caps.can_manage_lifting}
      />
    </div>
  );
}

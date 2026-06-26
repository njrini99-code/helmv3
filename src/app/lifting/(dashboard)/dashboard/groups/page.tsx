// =============================================================================
// src/app/lifting/(dashboard)/dashboard/groups/page.tsx
//
// Helm Lifting Lab — strength groups page (server component).
// Loads all active groups + their member counts + the active athlete roster.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { StrengthGroupsClient } from '@/components/lifting/groups/StrengthGroupsClient';
import type { HelmLiftingGroupRow } from '@/lib/types/helm-lifting-data';
import type { HelmLiftingAthleteRow } from '@/lib/types/helm-lifting';

export interface GroupWithMembers extends HelmLiftingGroupRow {
  member_count: number;
  member_athlete_ids: string[];
}

async function getOrgId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1) as { data: Array<{ organization_id: string }> | null };
  return data?.[0]?.organization_id ?? null;
}

async function getGroupsWithMembers(orgId: string): Promise<GroupWithMembers[]> {
  const supabase = await createClient();

  const { data: groups } = await fromUntyped(supabase, 'helm_lifting_groups')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(100) as { data: HelmLiftingGroupRow[] | null };

  if (!groups || groups.length === 0) return [];

  const { data: members } = await fromUntyped(supabase, 'helm_lifting_group_members')
    .select('group_id, athlete_id')
    .in('group_id', groups.map((g) => g.id))
    .is('ends_at', null) as { data: Array<{ group_id: string; athlete_id: string }> | null };

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

async function getAthletes(orgId: string): Promise<Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>>> {
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id, first_name, last_name, position, sport')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('last_name', { ascending: true })
    .limit(500) as {
      data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>> | null
    };
  return data ?? [];
}

export default async function GroupsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/lifting/login');

  const orgId = await getOrgId(user.id);
  if (!orgId) redirect('/lifting/coach');

  const access = await resolveLiftingAccess(orgId);
  if (!access.canView) redirect('/lifting/login');

  const [groups, athletes] = await Promise.all([
    getGroupsWithMembers(orgId),
    getAthletes(orgId),
  ]);

  return (
    <StrengthGroupsClient
      groups={groups}
      athletes={athletes}
      orgId={orgId}
      canEdit={access.canEdit}
    />
  );
}

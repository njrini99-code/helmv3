// =============================================================================
// src/app/lifting/(dashboard)/dashboard/sessions/page.tsx
//
// Helm Lifting Lab — session list page (server component).
// Fetches recent sessions for this org and hands off to SessionListClient.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { SessionListClient } from '@/components/lifting/sessions/SessionListClient';
import type { HelmLiftingSessionRow } from '@/lib/types/helm-lifting-data';
import type { HelmLiftingAthleteRow } from '@/lib/types/helm-lifting';

export interface SessionListItem extends HelmLiftingSessionRow {
  athlete_first_name: string | null;
  athlete_last_name: string | null;
  athlete_position: string | null;
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

async function getSessions(orgId: string): Promise<SessionListItem[]> {
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: sessions } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('*')
    .eq('organization_id', orgId)
    .gte('scheduled_date', thirtyDaysAgo)
    .lte('scheduled_date', today)
    .order('scheduled_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100) as { data: HelmLiftingSessionRow[] | null };

  if (!sessions || sessions.length === 0) return [];

  const athleteIds = [...new Set(sessions.map((s) => s.athlete_id))];
  const { data: athletes } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id, first_name, last_name, position')
    .in('id', athleteIds) as {
      data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position'>> | null
    };

  const athleteMap = new Map((athletes ?? []).map((a) => [a.id, a]));

  return sessions.map((s) => {
    const a = athleteMap.get(s.athlete_id);
    return {
      ...s,
      athlete_first_name: a?.first_name ?? null,
      athlete_last_name: a?.last_name ?? null,
      athlete_position: a?.position ?? null,
    };
  });
}

export default async function SessionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/lifting/login');

  const orgId = await getOrgId(user.id);
  if (!orgId) redirect('/lifting/onboarding');

  const access = await resolveLiftingAccess(orgId);
  if (!access.canView) redirect('/lifting/login');

  const sessions = await getSessions(orgId);

  return (
    <SessionListClient
      sessions={sessions}
      orgId={orgId}
      canEdit={access.canEdit}
    />
  );
}

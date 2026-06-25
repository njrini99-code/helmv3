// =============================================================================
// src/app/lifting/(dashboard)/dashboard/readiness/page.tsx
//
// Helm Lifting Lab — readiness board page (server component).
// Loads today's readiness summary for all active athletes and renders the
// ReadinessBoardClient for the staff view.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { getReadinessSummary } from '@/app/lifting/actions/readiness';
import { ReadinessBoardClient } from '@/components/lifting/readiness/ReadinessBoardClient';

async function getOrgId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1) as { data: Array<{ organization_id: string }> | null };
  return data?.[0]?.organization_id ?? null;
}

export default async function ReadinessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/lifting/login');

  const orgId = await getOrgId(user.id);
  if (!orgId) redirect('/lifting/onboarding');

  const access = await resolveLiftingAccess(orgId);
  if (!access.canView) redirect('/lifting/login');

  const today = new Date().toISOString().slice(0, 10);
  const summaries = await getReadinessSummary({ orgId, date: today });

  return (
    <ReadinessBoardClient
      summaries={summaries}
      orgId={orgId}
      date={today}
      canEdit={access.canEdit}
    />
  );
}

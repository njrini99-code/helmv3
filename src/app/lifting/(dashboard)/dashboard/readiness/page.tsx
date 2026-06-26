// =============================================================================
// src/app/lifting/(dashboard)/dashboard/readiness/page.tsx
//
// Helm Lifting Lab — readiness board page (server component).
// Loads today's readiness summary for all active athletes and renders the
// ReadinessBoardClient for the staff view.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { resolveLiftingAccess, resolveLiftingOrgIdForUser } from '@/lib/lifting/access';
import { getReadinessSummary } from '@/app/lifting/actions/readiness';
import { ReadinessBoardClient } from '@/components/lifting/readiness/ReadinessBoardClient';

export default async function ReadinessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/lifting/login');

  const orgId = await resolveLiftingOrgIdForUser();
  if (!orgId) redirect('/lifting/coach');

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

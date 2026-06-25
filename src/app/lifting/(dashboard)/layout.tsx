import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { LabShell } from '@/components/lifting/shell/LabShell';
import type { HelmLiftingCoachRow } from '@/lib/types/helm-lifting';

/**
 * Auth-gate layout for all /lifting/dashboard/** routes.
 *
 * Resolution order:
 *   1. No auth session → redirect to /lifting/login
 *   2. Active helm_lifting_coaches row → full Lab shell (isCoach=true)
 *   3. helm_lifting_org_viewers row → VIEW-ONLY shell (isViewOnly=true)
 *   4. Neither → redirect to /lifting/login (no lifting access)
 *
 * The layout itself passes a serialisable coachRow prop to the client LabShell
 * so it can render the user strip without an extra client fetch.
 */
export default async function LiftingDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/lifting/login');
  }

  // 1. Check for active lifting coach row (any org)
  const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle() as { data: HelmLiftingCoachRow | null };

  if (coachRow) {
    // Full Lab — coach is active
    return (
      <LabShell coachRow={coachRow} isViewOnly={false}>
        {children}
      </LabShell>
    );
  }

  // 2. Check for org viewer row (head coach cross-portal view)
  const { data: viewerRows } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
    .select('id')
    .eq('user_id', user.id)
    .limit(1) as { data: Array<{ id: string }> | null };

  if (viewerRows && viewerRows.length > 0) {
    // View-only access for head coaches
    return (
      <LabShell coachRow={null} isViewOnly={true}>
        {children}
      </LabShell>
    );
  }

  // 3. No access → send to login
  redirect('/lifting/login');
}

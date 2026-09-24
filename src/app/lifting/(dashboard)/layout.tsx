import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { LabShell } from '@/components/lifting/shell/LabShell';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import type { HelmLiftingCoachRow } from '@/lib/types/helm-lifting';

/**
 * Auth-gate layout for all /lifting/dashboard/** routes.
 *
 * Resolution order:
 *   1. No auth session → redirect to /lifting/login
 *   2. Active helm_lifting_coaches row → full Lab shell (isCoach=true)
 *   3. helm_lifting_org_viewers row → VIEW-ONLY shell (isViewOnly=true)
 *   4. helm_lifting_athletes row (athlete-self, mirrors RLS helper
 *      helm_lifting_is_my_athlete()) → VIEW-ONLY shell, never full edit.
 *      This is what lets a plain player reach athlete-facing routes like
 *      dashboard/lift/[sessionId] instead of being redirected to login.
 *   5. None of the above → redirect to /lifting/login (no lifting access)
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
      <SessionActivityProvider>
        <LabShell coachRow={coachRow} isViewOnly={false}>
          {children}
        </LabShell>
      </SessionActivityProvider>
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
      <SessionActivityProvider>
        <LabShell coachRow={null} isViewOnly={true}>
          {children}
        </LabShell>
      </SessionActivityProvider>
    );
  }

  // 3. Check for an athlete-self row (plain player — mirrors RLS helper
  //    helm_lifting_is_my_athlete()). Grants view-only access, never full
  //    edit; the athlete-facing pages under this route tree (e.g.
  //    dashboard/lift/[sessionId]) resolve + scope their own data to this
  //    athlete independently, with RLS as the hard backstop.
  const { data: athleteRows } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id')
    .eq('user_id', user.id)
    .limit(1) as { data: Array<{ id: string }> | null };

  if (athleteRows && athleteRows.length > 0) {
    return (
      <SessionActivityProvider>
        <LabShell coachRow={null} isViewOnly={true}>
          {children}
        </LabShell>
      </SessionActivityProvider>
    );
  }

  // 4. No access → send to login
  redirect('/lifting/login');
}

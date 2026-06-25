import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { LiftingSettingsClient } from './settings-client';
import type { HelmLiftingCoachRow, HelmLiftingCoachAssignmentRow } from '@/lib/types/helm-lifting';

interface OrgInfo {
  id: string;
  name: string;
}

export default async function LiftingSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/lifting/login');
  }

  // Only coaches may access settings; viewers get a redirect
  const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle() as { data: HelmLiftingCoachRow | null };

  if (!coachRow) {
    // Viewer (head coach) — no settings to manage
    redirect('/lifting/dashboard');
  }

  const access = await resolveLiftingAccess(coachRow.organization_id);

  // Fetch all active assignments for this coach
  const { data: assignmentRows } = await fromUntyped(supabase, 'helm_lifting_coach_assignments')
    .select('*')
    .eq('coach_id', coachRow.id)
    .eq('is_active', true) as { data: HelmLiftingCoachAssignmentRow[] | null };

  // Fetch org info
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', coachRow.organization_id)
    .maybeSingle() as { data: OrgInfo | null };

  return (
    <LiftingSettingsClient
      coachRow={coachRow}
      assignments={assignmentRows ?? []}
      org={orgRow}
      canEdit={access.canEdit}
    />
  );
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { LiftingSettingsClient, ViewerSettingsPanel } from './settings-client';
import type {
  HelmLiftingCoachRow,
  HelmLiftingCoachAssignmentRow,
  HelmLiftingOrgViewerRow,
  HelmLiftingCoachInviteRow,
} from '@/lib/types/helm-lifting';

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

  // Check for an active lifting coach row first
  const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle() as { data: HelmLiftingCoachRow | null };

  if (coachRow) {
    // Full settings for lifting coaches
    const { data: assignmentRows } = await fromUntyped(supabase, 'helm_lifting_coach_assignments')
      .select('*')
      .eq('coach_id', coachRow.id)
      .eq('is_active', true) as { data: HelmLiftingCoachAssignmentRow[] | null };

    const { data: orgRow } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', coachRow.organization_id)
      .maybeSingle() as { data: OrgInfo | null };

    // Fetch any pending invite for this org (so the coach can see invite state)
    const { data: pendingInvites } = await fromUntyped(supabase, 'helm_lifting_coach_invites')
      .select('id, email, role_title, status, expires_at, created_at, updated_at, organization_id, invited_by_user_id, invited_by_sport, source_team_id, token')
      .eq('organization_id', coachRow.organization_id)
      .in('status', ['pending']) as { data: HelmLiftingCoachInviteRow[] | null };

    return (
      <LiftingSettingsClient
        coachRow={coachRow}
        assignments={assignmentRows ?? []}
        org={orgRow}
        canEdit={true}
        pendingInvites={pendingInvites ?? []}
      />
    );
  }

  // Check for an org viewer row (head coach in view-only mode)
  const { data: viewerRows } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
    .select('*')
    .eq('user_id', user.id) as { data: HelmLiftingOrgViewerRow[] | null };

  if (viewerRows && viewerRows.length > 0) {
    // Pick the first viewer row (most users have one org)
    const viewerRow = viewerRows[0]!;

    const { data: orgRow } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', viewerRow.organization_id)
      .maybeSingle() as { data: OrgInfo | null };

    // Fetch any pending invite for this org
    const { data: pendingInvites } = await fromUntyped(supabase, 'helm_lifting_coach_invites')
      .select('id, email, role_title, status, expires_at, created_at, updated_at, organization_id, invited_by_user_id, invited_by_sport, source_team_id, token')
      .eq('organization_id', viewerRow.organization_id)
      .in('status', ['pending']) as { data: HelmLiftingCoachInviteRow[] | null };

    return (
      <ViewerSettingsPanel
        viewerRow={viewerRow}
        org={orgRow}
        pendingInvites={pendingInvites ?? []}
      />
    );
  }

  // No access at all
  redirect('/lifting/login');
}

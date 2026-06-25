// =============================================================================
// src/app/lifting/(dashboard)/dashboard/athletes/page.tsx
//
// Coach-facing Athlete Roster page (server component).
// Fetches helm_lifting_athletes for the lifting coach's org and passes them to
// AthleteRosterClient for tabbed sport-filter display.
//
// Auth / access is handled by the (dashboard)/layout.tsx guard before this page
// is rendered. Here we just resolve the org, fetch athletes, and pass down.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { AthleteRosterClient } from '@/components/lifting/athletes/AthleteRosterClient';
import type { HelmLiftingAthleteRow, HelmLiftingCoachAssignmentRow } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helper — resolve the org for the current authenticated lifting coach/viewer
// ---------------------------------------------------------------------------

async function resolveOrgId(userId: string): Promise<string | null> {
  const supabase = await createClient();

  // Check lifting coach first
  const { data: coach } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle() as { data: { organization_id: string } | null };

  if (coach?.organization_id) return coach.organization_id;

  // Fall back to org_viewer (head-coach no-coach mode)
  const { data: viewer } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle() as { data: { organization_id: string } | null };

  return viewer?.organization_id ?? null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AthletesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/lifting/login');

  const orgId = await resolveOrgId(user.id);
  if (!orgId) redirect('/lifting/dashboard');

  const access = await resolveLiftingAccess(orgId);
  if (!access.canView) redirect('/lifting/dashboard');

  // Fetch all active athletes for the org
  const { data: athleteRows } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true }) as {
    data: HelmLiftingAthleteRow[] | null;
  };

  const athletes = athleteRows ?? [];

  // Fetch active coach assignments so the client knows which sports/teams are covered
  const assignments: HelmLiftingCoachAssignmentRow[] = access.assignments ?? [];

  return (
    <AthleteRosterClient
      athletes={athletes}
      assignments={assignments}
      orgId={orgId}
      canEdit={access.canEdit}
    />
  );
}

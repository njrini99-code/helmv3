// =============================================================================
// src/app/lifting/(dashboard)/dashboard/check-ins/page.tsx
//
// Helm Lifting Lab — "Check-In Schedules & Nutrition" coach page.
//
// Hosts the three main schedule / upload builders:
//   1. SorenessScheduleBuilder   — create soreness check schedules
//   2. WeightCheckInScheduleBuilder — create weight check-in schedules
//   3. NutritionPlanUploader     — upload / create nutrition plans
//
// Tabs let coaches switch between the three builders. All components handle
// their own client-side state (form + success/error toasts). This server
// component resolves orgId + sport then hydrates the client shell.
// =============================================================================

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { CheckInsPageClient } from './check-ins-client';
import type { HelmLiftingCoachRow, HelmLiftingSport } from '@/lib/types/helm-lifting';

export const metadata = {
  title: 'Check-In Schedules · Helm Lifting Lab',
};

export default async function CheckInsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/lifting/login');

  const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle() as { data: HelmLiftingCoachRow | null };

  let orgId: string | null = coachRow?.organization_id ?? null;

  if (!orgId) {
    const { data: viewerRow } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { organization_id: string } | null };
    orgId = viewerRow?.organization_id ?? null;
  }

  if (!orgId) redirect('/lifting/login');

  // HelmLiftingCoachRow doesn't carry sport; derive from coach assignments
  // (or fall back to 'baseball' which covers the majority of Lab users).
  const { data: assignmentRow } = await fromUntyped(supabase, 'helm_lifting_coach_assignments')
    .select('sport')
    .eq('coach_id', coachRow?.id ?? '')
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle() as { data: { sport: string } | null };

  const sport: HelmLiftingSport = (assignmentRow?.sport as HelmLiftingSport | null) ?? 'baseball';

  // Fetch groups and athletes for the builder dropdowns.
  const [{ data: groupRows }, { data: athleteRows }] = await Promise.all([
    fromUntyped(supabase, 'helm_lifting_groups')
      .select('id, name')
      .eq('organization_id', orgId)
      .limit(100) as Promise<{ data: Array<{ id: string; name: string }> | null }>,
    fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, first_name, last_name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .limit(200) as Promise<{ data: Array<{ id: string; first_name: string | null; last_name: string | null }> | null }>,
  ]);

  const groups = (groupRows ?? []).map((g) => ({ id: g.id, name: g.name }));
  const athletes = (athleteRows ?? []).map((a) => ({
    id: a.id,
    firstName: a.first_name,
    lastName: a.last_name,
  }));

  return (
    <CheckInsPageClient
      orgId={orgId}
      sport={sport}
      groups={groups}
      athletes={athletes}
    />
  );
}

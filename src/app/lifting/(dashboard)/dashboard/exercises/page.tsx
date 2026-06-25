// =============================================================================
// src/app/lifting/(dashboard)/dashboard/exercises/page.tsx
//
// Helm Lifting Lab — exercise library (server component).
// Fetches exercises for the resolved org and passes them to
// ExerciseLibraryClient which owns the create / edit / archive flow.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { ExerciseLibraryClient } from '@/components/lifting/exercises/ExerciseLibraryClient';
import type { HelmLiftingExerciseRow } from '@/lib/types/helm-lifting-data';

async function getOrgId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1) as { data: Array<{ organization_id: string }> | null };
  return data?.[0]?.organization_id ?? null;
}

async function getExercises(orgId: string): Promise<HelmLiftingExerciseRow[]> {
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'helm_lifting_exercises')
    .select('*')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })
    .limit(500) as { data: HelmLiftingExerciseRow[] | null };
  return data ?? [];
}

export default async function ExercisesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/lifting/login');

  const orgId = await getOrgId(user.id);
  if (!orgId) redirect('/lifting/coach');

  const access = await resolveLiftingAccess(orgId);
  if (!access.canView) redirect('/lifting/login');

  const exercises = await getExercises(orgId);

  return (
    <ExerciseLibraryClient
      exercises={exercises}
      orgId={orgId}
      canEdit={access.canEdit}
    />
  );
}

// =============================================================================
// src/app/lifting/(dashboard)/dashboard/programs/page.tsx
//
// Helm Lifting Lab — program list page (server component).
// Fetches all programs for the resolved org + sport scope, then renders the
// client ProgramListClient which owns the create / filter / navigate flow.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess, resolveLiftingOrgIdForUser } from '@/lib/lifting/access';
import { ProgramListClient } from '@/components/lifting/programs/ProgramListClient';
import type { HelmLiftingProgramRow } from '@/lib/types/helm-lifting-data';

interface HelmLiftingProgramWithCounts extends HelmLiftingProgramRow {
  week_count: number;
  day_count: number;
}


async function getPrograms(orgId: string): Promise<HelmLiftingProgramWithCounts[]> {
  const supabase = await createClient();

  const { data: programs } = await fromUntyped(supabase, 'helm_lifting_programs')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200) as { data: HelmLiftingProgramRow[] | null };

  if (!programs || programs.length === 0) return [];

  const ids = programs.map((p) => p.id);

  const { data: weeks } = await fromUntyped(supabase, 'helm_lifting_weeks')
    .select('id, program_id')
    .in('program_id', ids) as { data: Array<{ id: string; program_id: string }> | null };

  const weekCountByProgram = new Map<string, number>();
  const programByWeek = new Map<string, string>();
  for (const w of weeks ?? []) {
    weekCountByProgram.set(w.program_id, (weekCountByProgram.get(w.program_id) ?? 0) + 1);
    programByWeek.set(w.id, w.program_id);
  }

  const dayCountByProgram = new Map<string, number>();
  if ((weeks ?? []).length > 0) {
    const { data: days } = await fromUntyped(supabase, 'helm_lifting_days')
      .select('week_id')
      .in('week_id', (weeks ?? []).map((w) => w.id)) as { data: Array<{ week_id: string }> | null };
    for (const d of days ?? []) {
      const progId = programByWeek.get(d.week_id);
      if (progId) dayCountByProgram.set(progId, (dayCountByProgram.get(progId) ?? 0) + 1);
    }
  }

  return programs.map((p) => ({
    ...p,
    week_count: weekCountByProgram.get(p.id) ?? 0,
    day_count: dayCountByProgram.get(p.id) ?? 0,
  }));
}

export default async function ProgramsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/lifting/login');

  const orgId = await resolveLiftingOrgIdForUser();
  if (!orgId) redirect('/lifting/coach');

  const access = await resolveLiftingAccess(orgId);
  if (!access.canView) redirect('/lifting/login');

  const programs = await getPrograms(orgId);

  return (
    <ProgramListClient
      programs={programs}
      orgId={orgId}
      canEdit={access.canEdit}
    />
  );
}

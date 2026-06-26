// =============================================================================
// src/app/lifting/(dashboard)/dashboard/programs/[programId]/page.tsx
//
// Helm Lifting Lab — program editor (server component). Fetches the full
// program tree (program → weeks → days → sections → prescriptions + exercise
// library) and passes it to ProgramEditorClient.
// =============================================================================

import { notFound, redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess, resolveLiftingOrgIdForUser } from '@/lib/lifting/access';
import { ProgramEditorClient } from '@/components/lifting/programs/ProgramEditorClient';
import type {
  HelmLiftingProgramRow,
  HelmLiftingWeekRow,
  HelmLiftingDayRow,
  HelmLiftingSectionRow,
  HelmLiftingPrescriptionRow,
  HelmLiftingGroupRow,
} from '@/lib/types/helm-lifting-data';
import type { HelmLiftingAthleteRow } from '@/lib/types/helm-lifting';


export interface LiftProgramTree {
  program: HelmLiftingProgramRow;
  weeks: Array<
    HelmLiftingWeekRow & {
      days: Array<
        HelmLiftingDayRow & {
          sections: Array<
            HelmLiftingSectionRow & {
              prescriptions: HelmLiftingPrescriptionRow[];
            }
          >;
        }
      >;
    }
  >;
  exerciseNameMap: Record<string, string>;
}

export interface AssignContext {
  athletes: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>>;
  groups: Array<Pick<HelmLiftingGroupRow, 'id' | 'name' | 'group_type'>>;
}

async function getProgramTree(
  programId: string,
  orgId: string,
): Promise<LiftProgramTree | null> {
  const supabase = await createClient();

  const { data: program } = await fromUntyped(supabase, 'helm_lifting_programs')
    .select('*')
    .eq('id', programId)
    .eq('organization_id', orgId)
    .maybeSingle() as { data: HelmLiftingProgramRow | null };

  if (!program) return null;

  const { data: weeks } = await fromUntyped(supabase, 'helm_lifting_weeks')
    .select('*')
    .eq('program_id', programId)
    .order('week_number', { ascending: true }) as { data: HelmLiftingWeekRow[] | null };

  const weekList = weeks ?? [];
  if (weekList.length === 0) {
    return { program, weeks: [], exerciseNameMap: {} };
  }

  const { data: days } = await fromUntyped(supabase, 'helm_lifting_days')
    .select('*')
    .in('week_id', weekList.map((w) => w.id))
    .order('day_number', { ascending: true }) as { data: HelmLiftingDayRow[] | null };

  const dayList = days ?? [];
  const { data: sections } = await fromUntyped(supabase, 'helm_lifting_sections')
    .select('*')
    .in('lift_day_id', dayList.map((d) => d.id))
    .order('section_order', { ascending: true }) as { data: HelmLiftingSectionRow[] | null };

  const sectionList = sections ?? [];
  const { data: prescriptions } = await fromUntyped(supabase, 'helm_lifting_prescriptions')
    .select('*')
    .in('section_id', sectionList.map((s) => s.id))
    .order('order_index', { ascending: true }) as { data: HelmLiftingPrescriptionRow[] | null };

  const prescList = prescriptions ?? [];

  // Resolve exercise names.
  const exerciseIds = [...new Set(prescList.map((p) => p.exercise_id).filter(Boolean) as string[])];
  const exerciseNameMap: Record<string, string> = {};
  if (exerciseIds.length > 0) {
    const { data: exRows } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .select('id, name')
      .in('id', exerciseIds) as { data: Array<{ id: string; name: string }> | null };
    for (const ex of exRows ?? []) exerciseNameMap[ex.id] = ex.name;
  }

  // Assemble tree.
  const prescsBySectionId = new Map<string, HelmLiftingPrescriptionRow[]>();
  for (const p of prescList) {
    const arr = prescsBySectionId.get(p.section_id) ?? [];
    arr.push(p);
    prescsBySectionId.set(p.section_id, arr);
  }

  const sectionsByDayId = new Map<string, Array<HelmLiftingSectionRow & { prescriptions: HelmLiftingPrescriptionRow[] }>>();
  for (const s of sectionList) {
    const arr = sectionsByDayId.get(s.lift_day_id) ?? [];
    arr.push({ ...s, prescriptions: prescsBySectionId.get(s.id) ?? [] });
    sectionsByDayId.set(s.lift_day_id, arr);
  }

  const daysByWeekId = new Map<string, Array<HelmLiftingDayRow & { sections: Array<HelmLiftingSectionRow & { prescriptions: HelmLiftingPrescriptionRow[] }> }>>();
  for (const d of dayList) {
    const arr = daysByWeekId.get(d.week_id) ?? [];
    arr.push({ ...d, sections: sectionsByDayId.get(d.id) ?? [] });
    daysByWeekId.set(d.week_id, arr);
  }

  return {
    program,
    weeks: weekList.map((w) => ({ ...w, days: daysByWeekId.get(w.id) ?? [] })),
    exerciseNameMap,
  };
}

async function getAssignContext(orgId: string): Promise<AssignContext> {
  const supabase = await createClient();

  const [{ data: athletes }, { data: groups }] = await Promise.all([
    fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, first_name, last_name, position, sport')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .limit(500) as Promise<{ data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>> | null }>,
    fromUntyped(supabase, 'helm_lifting_groups')
      .select('id, name, group_type')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(100) as Promise<{ data: Array<Pick<HelmLiftingGroupRow, 'id' | 'name' | 'group_type'>> | null }>,
  ]);

  return {
    athletes: athletes ?? [],
    groups: groups ?? [],
  };
}

interface Props {
  params: Promise<{ programId: string }>;
}

export default async function ProgramEditorPage({ params }: Props) {
  const { programId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/lifting/login');

  const orgId = await resolveLiftingOrgIdForUser();
  if (!orgId) redirect('/lifting/coach');

  const access = await resolveLiftingAccess(orgId);
  if (!access.canView) redirect('/lifting/login');

  const [tree, assignCtx] = await Promise.all([
    getProgramTree(programId, orgId),
    getAssignContext(orgId),
  ]);

  if (!tree) notFound();

  return (
    <ProgramEditorClient
      programTree={tree}
      assignContext={assignCtx}
      orgId={orgId}
      canEdit={access.canEdit}
    />
  );
}

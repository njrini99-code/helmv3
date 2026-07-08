// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/programs/[programId]/page.tsx
//
// V11 Program editor (spec L26 + L200-228 + Packet E). SERVER-GATED (defense
// in depth; RLS backs every write):
//   * Active baseball context required.
//   * STAFF role; players redirected to Today.
//   * can_manage_lifting required.
//   * notFound() when the program id is unknown, not this team's, or RLS
//     hides it.
//
// LANE C — ONE LIFT LAB: repointed at the canonical
// src/components/lifting/programs/ProgramEditorClient (native HelmLifting*
// props) instead of the legacy src/components/baseball/performance/
// ProgramEditorClient. Fetches the program tree + assign context directly
// from helm_lifting_* (mirroring src/app/lifting/(dashboard)/dashboard/
// programs/[programId]/page.tsx), team-scoped for the assign roster/groups.
//
// WRITES: every mutation in ProgramEditorClient (publish, add/duplicate/
// delete week-day-section-prescription, save-as-template) calls
// src/app/lifting/actions/programs.ts (withLiftingAction, requireEdit:true —
// see this lane's report for the confirmed helm_lifting_coaches access-gate
// gap for baseball staff who haven't onboarded through /lifting).
// =============================================================================

import { notFound, redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveBaseballLiftingOrg } from '@/lib/lifting/resolve-baseball-context';
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

interface LiftProgramTree {
  program: HelmLiftingProgramRow;
  weeks: Array<
    HelmLiftingWeekRow & {
      days: Array<
        HelmLiftingDayRow & {
          sections: Array<HelmLiftingSectionRow & { prescriptions: HelmLiftingPrescriptionRow[] }>;
        }
      >;
    }
  >;
  exerciseNameMap: Record<string, string>;
}

interface AssignContext {
  athletes: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>>;
  groups: Array<Pick<HelmLiftingGroupRow, 'id' | 'name' | 'group_type'>>;
}

async function getProgramTree(
  programId: string,
  organizationId: string,
  teamId: string,
): Promise<LiftProgramTree | null> {
  const supabase = await createClient();

  const { data: program } = (await fromUntyped(supabase, 'helm_lifting_programs')
    .select('*')
    .eq('id', programId)
    .eq('organization_id', organizationId)
    .eq('team_id', teamId)
    .maybeSingle()) as { data: HelmLiftingProgramRow | null };

  if (!program) return null;

  const { data: weeks } = (await fromUntyped(supabase, 'helm_lifting_weeks')
    .select('*')
    .eq('program_id', programId)
    .order('week_number', { ascending: true })) as { data: HelmLiftingWeekRow[] | null };

  const weekList = weeks ?? [];
  if (weekList.length === 0) {
    return { program, weeks: [], exerciseNameMap: {} };
  }

  const { data: days } = (await fromUntyped(supabase, 'helm_lifting_days')
    .select('*')
    .in('week_id', weekList.map((w) => w.id))
    .order('day_number', { ascending: true })) as { data: HelmLiftingDayRow[] | null };

  const dayList = days ?? [];
  const { data: sections } = (await fromUntyped(supabase, 'helm_lifting_sections')
    .select('*')
    .in('lift_day_id', dayList.map((d) => d.id))
    .order('section_order', { ascending: true })) as { data: HelmLiftingSectionRow[] | null };

  const sectionList = sections ?? [];
  const { data: prescriptions } = (await fromUntyped(supabase, 'helm_lifting_prescriptions')
    .select('*')
    .in('section_id', sectionList.map((s) => s.id))
    .order('order_index', { ascending: true })) as { data: HelmLiftingPrescriptionRow[] | null };

  const prescList = prescriptions ?? [];

  const exerciseIds = [...new Set(prescList.map((p) => p.exercise_id).filter(Boolean) as string[])];
  const exerciseNameMap: Record<string, string> = {};
  if (exerciseIds.length > 0) {
    const { data: exRows } = (await fromUntyped(supabase, 'helm_lifting_exercises')
      .select('id, name')
      .in('id', exerciseIds)) as { data: Array<{ id: string; name: string }> | null };
    for (const ex of exRows ?? []) exerciseNameMap[ex.id] = ex.name;
  }

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

async function getAssignContext(organizationId: string, teamId: string): Promise<AssignContext> {
  const supabase = await createClient();

  const [{ data: athletes }, { data: groups }] = await Promise.all([
    fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, first_name, last_name, position, sport')
      .eq('organization_id', organizationId)
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .limit(500) as Promise<{ data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>> | null }>,
    fromUntyped(supabase, 'helm_lifting_groups')
      .select('id, name, group_type')
      .eq('organization_id', organizationId)
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(100) as Promise<{ data: Array<Pick<HelmLiftingGroupRow, 'id' | 'name' | 'group_type'>> | null }>,
  ]);

  return { athletes: athletes ?? [], groups: groups ?? [] };
}

export default async function ProgramEditorPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;

  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole !== 'coach') redirect('/baseball/player/today');

  const teamId = context.activeTeamId;
  const caps = await resolveBaseballCapabilities(teamId);
  if (!caps.can_manage_lifting) redirect('/baseball/dashboard/performance');

  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  if (!liftCtx) notFound();

  const [tree, assign] = await Promise.all([
    getProgramTree(programId, liftCtx.organizationId, teamId),
    getAssignContext(liftCtx.organizationId, teamId),
  ]);

  if (!tree) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <ProgramEditorClient
        programTree={tree}
        assignContext={assign}
        orgId={liftCtx.organizationId}
        canEdit={caps.can_manage_lifting}
      />
    </div>
  );
}

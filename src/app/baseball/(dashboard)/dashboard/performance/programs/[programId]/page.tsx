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
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError } from '@/lib/server-error-logger';
import { resolveBaseballLiftingOrg } from '@/lib/lifting/resolve-baseball-context';
import { ReadModelStateNotice } from '@/components/baseball/ReadModelStateNotice';
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

interface ProgramTreeResult {
  tree: LiftProgramTree | null;
  error: boolean;
}

async function logProgramTreeError(step: string, error: unknown, metadata: Record<string, unknown>) {
  await logServerError(
    `[performance/programs] getProgramTree ${step} query failed: ${
      (error as Error)?.message ?? String(error)
    }`,
    { action: 'baseball.programEditor.getProgramTree', metadata },
  );
}

async function getProgramTree(
  programId: string,
  organizationId: string,
  teamId: string,
): Promise<ProgramTreeResult> {
  const supabase = await createClient();

  const { data: program, error: programError } = (await fromUntyped(supabase, 'helm_lifting_programs')
    .select('*')
    .eq('id', programId)
    .eq('organization_id', organizationId)
    .eq('team_id', teamId)
    .maybeSingle()) as { data: HelmLiftingProgramRow | null; error: unknown };

  if (programError) {
    await logProgramTreeError('program', programError, { programId, organizationId, teamId });
    return { tree: null, error: true };
  }

  if (!program) return { tree: null, error: false };

  const { data: weeks, error: weeksError } = (await fromUntyped(supabase, 'helm_lifting_weeks')
    .select('*')
    .eq('program_id', programId)
    .order('week_number', { ascending: true })) as { data: HelmLiftingWeekRow[] | null; error: unknown };

  if (weeksError) {
    await logProgramTreeError('weeks', weeksError, { programId });
    return { tree: null, error: true };
  }

  const weekList = weeks ?? [];
  if (weekList.length === 0) {
    return { tree: { program, weeks: [], exerciseNameMap: {} }, error: false };
  }

  const { data: days, error: daysError } = (await fromUntyped(supabase, 'helm_lifting_days')
    .select('*')
    .in('week_id', weekList.map((w) => w.id))
    .order('day_number', { ascending: true })) as { data: HelmLiftingDayRow[] | null; error: unknown };

  if (daysError) {
    await logProgramTreeError('days', daysError, { programId });
    return { tree: null, error: true };
  }

  const dayList = days ?? [];
  const { data: sections, error: sectionsError } = (await fromUntyped(supabase, 'helm_lifting_sections')
    .select('*')
    .in('lift_day_id', dayList.map((d) => d.id))
    .order('section_order', { ascending: true })) as { data: HelmLiftingSectionRow[] | null; error: unknown };

  if (sectionsError) {
    await logProgramTreeError('sections', sectionsError, { programId });
    return { tree: null, error: true };
  }

  const sectionList = sections ?? [];

  // Paginated via fetchAllRowsResult: a dense program (many weeks x days x
  // sections x sets) can push prescriptions past PostgREST's 1000-row cap,
  // silently truncating the tree under a single unpaginated `.select()`.
  // Ordered by the unique `id` column (not `order_index`, which repeats
  // across sections) so page boundaries never drift; the display order is
  // restored below with an explicit sort.
  const { data: prescriptions, error: prescriptionsError } = sectionList.length > 0
    ? await fetchAllRowsResult<HelmLiftingPrescriptionRow>((from, to) =>
        fromUntyped(supabase, 'helm_lifting_prescriptions')
          .select('*')
          .in('section_id', sectionList.map((s) => s.id))
          .order('id', { ascending: true })
          .range(from, to),
      )
    : { data: [] as HelmLiftingPrescriptionRow[], error: null };

  if (prescriptionsError) {
    await logProgramTreeError('prescriptions', prescriptionsError, { programId });
    return { tree: null, error: true };
  }

  const prescList = (prescriptions ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index);

  const exerciseIds = [...new Set(prescList.map((p) => p.exercise_id).filter(Boolean) as string[])];
  const exerciseNameMap: Record<string, string> = {};
  if (exerciseIds.length > 0) {
    const { data: exRows, error: exRowsError } = (await fromUntyped(supabase, 'helm_lifting_exercises')
      .select('id, name')
      .in('id', exerciseIds)) as { data: Array<{ id: string; name: string }> | null; error: unknown };

    if (exRowsError) {
      await logProgramTreeError('exRows', exRowsError, { programId });
      return { tree: null, error: true };
    }

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
    tree: {
      program,
      weeks: weekList.map((w) => ({ ...w, days: daysByWeekId.get(w.id) ?? [] })),
      exerciseNameMap,
    },
    error: false,
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

  const [{ tree, error: treeError }, assign] = await Promise.all([
    getProgramTree(programId, liftCtx.organizationId, teamId),
    getAssignContext(liftCtx.organizationId, teamId),
  ]);

  if (treeError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <ReadModelStateNotice state="error" title="Program could not load" />
      </div>
    );
  }

  if (!tree) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <ProgramEditorClient
        programTree={tree}
        assignContext={assign}
        orgId={liftCtx.organizationId}
        canEdit={caps.can_manage_lifting}
        basePath="/baseball/dashboard/performance/programs"
      />
    </div>
  );
}

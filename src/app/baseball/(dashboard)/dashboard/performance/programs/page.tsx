// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/programs/page.tsx
//
// V11 Program list (spec L25 + Packet E). SERVER-GATED:
//   * Active baseball context required (never trusts a cookie alone).
//   * STAFF role required; players are redirected to their Today view.
//   * can_manage_lifting required (programming is a prescribe capability). Nav
//     hiding is not relied upon; the page server-redirects without the gate.
//
// LANE C — ONE LIFT LAB: repointed at the canonical
// src/components/lifting/programs/ProgramListClient (native HelmLifting*
// props) instead of the legacy src/components/baseball/performance/
// ProgramListClient. Fetches helm_lifting_programs directly (mirroring
// src/app/lifting/(dashboard)/dashboard/programs/page.tsx) — team-scoped
// (this route is per baseball team) rather than org-wide.
//
// WRITES: ProgramListClient's "New program" flow calls createProgram from
// src/app/lifting/actions/programs.ts (withLiftingAction, requireEdit:true).
// That wrapper gates on resolveLiftingAccess(orgId), which requires an active
// helm_lifting_coaches (or org_viewer) row for THIS org — baseball staff who
// have never onboarded through /lifting have neither. See this lane's report
// for the confirmed access-gate gap (out of this lane's file scope to fix).
// =============================================================================

import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveBaseballLiftingOrg } from '@/lib/lifting/resolve-baseball-context';
import { ProgramListClient } from '@/components/lifting/programs/ProgramListClient';
import type { HelmLiftingProgramRow } from '@/lib/types/helm-lifting-data';

interface ProgramWithCounts extends HelmLiftingProgramRow {
  week_count: number;
  day_count: number;
}

async function getPrograms(organizationId: string, teamId: string): Promise<ProgramWithCounts[]> {
  const supabase = await createClient();

  const { data: programs } = (await fromUntyped(supabase, 'helm_lifting_programs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(200)) as { data: HelmLiftingProgramRow[] | null };

  if (!programs || programs.length === 0) return [];

  const ids = programs.map((p) => p.id);

  const { data: weeks } = (await fromUntyped(supabase, 'helm_lifting_weeks')
    .select('id, program_id')
    .in('program_id', ids)) as { data: Array<{ id: string; program_id: string }> | null };

  const weekCountByProgram = new Map<string, number>();
  const programByWeek = new Map<string, string>();
  for (const w of weeks ?? []) {
    weekCountByProgram.set(w.program_id, (weekCountByProgram.get(w.program_id) ?? 0) + 1);
    programByWeek.set(w.id, w.program_id);
  }

  const dayCountByProgram = new Map<string, number>();
  if ((weeks ?? []).length > 0) {
    const { data: days } = (await fromUntyped(supabase, 'helm_lifting_days')
      .select('week_id')
      .in('week_id', (weeks ?? []).map((w) => w.id))) as { data: Array<{ week_id: string }> | null };
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
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole !== 'coach') redirect('/baseball/player/today');

  const teamId = context.activeTeamId;
  const caps = await resolveBaseballCapabilities(teamId);
  if (!caps.can_manage_lifting) redirect('/baseball/dashboard/performance');

  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  const programs = liftCtx ? await getPrograms(liftCtx.organizationId, teamId) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <ProgramListClient
        programs={programs}
        orgId={liftCtx?.organizationId ?? ''}
        canEdit={caps.can_manage_lifting}
        basePath="/baseball/dashboard/performance/programs"
      />
    </div>
  );
}

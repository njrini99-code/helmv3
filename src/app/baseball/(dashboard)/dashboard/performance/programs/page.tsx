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
// have never onboarded through /lifting have neither.
//
// The read path has the same gap: helm_lifting_programs RLS is gated by
// public.helm_lifting_can_view_org() (supabase/migrations/
// 20260625000000_helm_lifting_identity.sql), which only allows an active
// helm_lifting_coaches row or a helm_lifting_org_viewers row — passing
// BaseballHelm's own can_manage_lifting gate is not enough. Rather than let
// getPrograms() silently come back empty for an unonboarded coach, resolve
// canView up front and render an explicit "not onboarded" state instead.
// =============================================================================

import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveBaseballLiftingOrg } from '@/lib/lifting/resolve-baseball-context';
import { resolveLiftingAccess } from '@/lib/lifting/access';
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
  const access = liftCtx ? await resolveLiftingAccess(liftCtx.organizationId) : null;

  if (!liftCtx || !access?.canView) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl border border-warm-200/60 bg-cream-50 px-6 py-10 text-center">
          <h2 className="text-h3 font-semibold text-warm-900">Lift Lab access not set up</h2>
          <p className="mx-auto mt-2 max-w-md text-body-sm text-warm-500">
            {liftCtx
              ? "You have programming access on the baseball side, but you haven't been onboarded into this team's Lifting Lab yet. Ask a Lift Lab admin to add you as a coach or org viewer to see programs here."
              : "This team isn't linked to a Lifting Lab organization yet. Ask an admin to link it before programs can be created."}
          </p>
        </div>
      </div>
    );
  }

  const programs = await getPrograms(liftCtx.organizationId, teamId);

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

// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/programs/page.tsx
//
// V11 Program list (spec L25 + Packet E). The entry point to the deepest coach
// authoring layer: list every training program (phase / goal / status / template)
// with week+day counts, and create a new one. SERVER-GATED:
//   * Active baseball context required (never trusts a cookie alone).
//   * STAFF role required; players are redirected to their Today view.
//   * can_manage_lifting required (programming is a prescribe capability). Nav
//     hiding is not relied upon; the page server-redirects without the gate.
//
// RLS backs every read (program SELECT is staff-scoped). The capability resolve
// here is defense-in-depth + drives the create affordance.
// =============================================================================

import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { getLiftProgramList } from '@/lib/baseball/read-models/lift-programs';
import { ProgramListClient } from '@/components/baseball/performance/ProgramListClient';

export default async function ProgramsPage() {
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole !== 'coach') redirect('/baseball/player/today');

  const teamId = context.activeTeamId;
  const caps = await resolveBaseballCapabilities(teamId);
  if (!caps.can_manage_lifting) redirect('/baseball/dashboard/performance');

  const programs = await getLiftProgramList(teamId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <ProgramListClient programs={programs} />
    </div>
  );
}

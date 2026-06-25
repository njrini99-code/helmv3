// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/programs/[programId]/page.tsx
//
// V11 Program editor (spec L26 + L200-228 + Packet E). The deepest coach authoring
// surface: macrocycle -> week -> day -> section -> prescription, with drag-drop
// reorder, duplicate week/day, save-as-template, and an Assign+Publish flow that
// materializes sessions onto the weight-room board.
//
// SERVER-GATED (defense in depth; RLS backs every write):
//   * Active baseball context required.
//   * STAFF role; players redirected to Today.
//   * can_manage_lifting required.
//   * notFound() when the program id is unknown or RLS hides it.
// =============================================================================

import { notFound, redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import {
  getLiftProgramTree,
  getAssignContext,
} from '@/lib/baseball/read-models/lift-programs';
import { ProgramEditorClient } from '@/components/baseball/performance/ProgramEditorClient';

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

  const tree = await getLiftProgramTree(teamId, programId);
  if (!tree) notFound();

  const assign = await getAssignContext(teamId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <ProgramEditorClient tree={tree} assign={assign} />
    </div>
  );
}

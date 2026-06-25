// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/groups/page.tsx
//
// V11 Strength Groups (spec L24 + L151-198 + Packet C). The athlete-segmentation
// surface: build static / dynamic groups, manage membership, and preview a
// dynamic rule's exact included players before saving. SERVER-GATED:
//   * Active baseball context required (never trusts a cookie alone).
//   * STAFF role required; players are redirected to their Today view.
//   * can_manage_lifting required (grouping is a prescribe capability). Nav hiding
//     is not relied upon; the page server-redirects without the gate.
//
// RLS backs every read (group + member SELECT is staff-scoped). The capability
// resolve here is defense-in-depth + drives the create / seed affordances. The
// roster attribute snapshot is assembled once and feeds BOTH the athlete table and
// the live rule preview (one engine — no drift between preview and persisted set).
// =============================================================================

import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { getStrengthGroupsBoard } from '@/lib/baseball/read-models/strength-groups';
import { StrengthGroupsClient } from '@/components/baseball/performance/StrengthGroupsClient';

export default async function StrengthGroupsPage() {
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole !== 'coach') redirect('/baseball/player/today');

  const teamId = context.activeTeamId;
  const caps = await resolveBaseballCapabilities(teamId);
  if (!caps.can_manage_lifting) redirect('/baseball/dashboard/performance');

  const board = await getStrengthGroupsBoard(teamId);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <StrengthGroupsClient
        groups={board.groups}
        roster={board.roster}
        defaultGroupsPresent={board.defaultGroupsPresent}
      />
    </div>
  );
}

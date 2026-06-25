// =============================================================================
// src/app/baseball/(dashboard)/dashboard/decision-room/page.tsx
//
// Wave 11 / packet: decision-room
//
// Server entry for the Staff Decision Room — the shared coaching-intelligence
// surface for a team's staff. The nav-registry 'staff-decision-room' entry
// points here (/baseball/dashboard/decision-room); without this page.tsx that
// link 404s and StaffDecisionRoomClient is unreachable.
//
// Auth + active-team context + capability are all resolved server-side inside
// getDecisionRoomData (it runs through withBaseballAction with
// requiredCapability: 'can_manage_settings'). We render the client view with
// the resolved data.
//
// This route is for COACHES. A player who reaches it has no coach profile / no
// active team coach role with that capability, so getDecisionRoomData throws
// the wrapper's 401/403 — caught by the sibling error.tsx — and the sidebar
// never surfaces the entry to players in the first place (nav-registry
// role:'coach').
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getDecisionRoomData } from '@/app/baseball/actions/teams';
import { StaffDecisionRoomClient } from '@/components/baseball/staff-decision-room/StaffDecisionRoomClient';

export const metadata = {
  title: 'Decision Room | Helm Baseball',
  description: 'Shared coaching intelligence for your staff.',
};

export default async function DecisionRoomPage() {
  const supabase = await createClient();

  // Auth gate up front so unauthenticated users land on login, not the error
  // page.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/decision-room');
  }

  // getDecisionRoomData resolves the active team + viewer capability and
  // enforces auth/context server-side. Any failure (no active team, no coach
  // role, missing capability) surfaces through error.tsx.
  const data = await getDecisionRoomData();

  return <StaffDecisionRoomClient data={data} />;
}

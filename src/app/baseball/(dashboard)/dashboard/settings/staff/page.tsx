// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/staff/page.tsx
//
// Wave 11 / packet: decision-room
//
// Server entry for the Staff Settings surface. Auth + active-team context +
// the staff roster/invitations are resolved inside getStaffSettingsData (which
// runs through withBaseballAction). We render the client matrix editor with the
// resolved data; all writes re-validate capability SERVER-SIDE.
//
// This route is for COACHES. A player who reaches it has no coach profile / no
// active team coach role, so getStaffSettingsData throws the wrapper's
// 401/403 — caught by error.tsx — and the sidebar never shows the entry to
// players in the first place (nav-registry role:'coach').
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getStaffSettingsData } from '@/app/baseball/actions/teams';
import { StaffSettingsClient } from '@/components/baseball/staff/StaffSettingsClient';

export const metadata = {
  title: 'Staff & Permissions | Helm Baseball',
  description: 'Manage your coaching staff and their access.',
};

export default async function StaffSettingsPage() {
  const supabase = await createClient();

  // Auth gate up front so unauthenticated users go to login, not the error page.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/settings/staff');
  }

  // getStaffSettingsData resolves the active team + viewer capabilities and
  // enforces auth/context server-side. Any failure (no active team, no coach
  // role) surfaces through error.tsx.
  const data = await getStaffSettingsData();

  return <StaffSettingsClient initialData={data} />;
}

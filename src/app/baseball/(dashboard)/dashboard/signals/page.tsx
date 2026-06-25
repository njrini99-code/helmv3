// =============================================================================
// src/app/baseball/(dashboard)/dashboard/signals/page.tsx
//
// Packet: signal-inbox — the Signals route (V10 §Signals tab). Resolves the
// staff viewer + active team, builds the Signal Inbox read model, loads roster +
// staff for the convert-to-action dialog, resolves the can_manage_stats
// capability server-side, and renders the four-view workspace.
//
// Staff-only by data: the read model returns authorized:false for non-staff and
// the client renders an honest "staff-only" envelope.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { getSignalInbox } from '@/lib/baseball/read-models/signal-inbox';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import { SignalInboxClient } from '@/components/baseball/signals';

export default async function SignalsPage() {
  const supabase = await createClient();

  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  const coach = session.coach;
  if (!coach) redirect('/baseball/coach');
  if (!coach.organization_id) redirect('/baseball/dashboard/program');

  // Resolve the team for this program.
  const { data: team } = (await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('organization_id', coach.organization_id)
    .single()) as { data: { id: string; name: string } | null };

  if (!team) {
    // No team yet — render the inbox empty/unauthorized envelope honestly.
    const model = await getSignalInbox('');
    return (
      <SignalInboxClient
        model={model}
        playerNames={{}}
        roster={[]}
        staff={[]}
        canManage={false}
      />
    );
  }

  // Build the read model (staff-authorized; honest envelope otherwise).
  const model = await getSignalInbox(team.id, { limit: 200 });

  // Roster + staff for the convert dialog + grouping labels.
  const [membersRes, staffRes] = await Promise.all([
    supabase
      .from('baseball_team_members')
      .select('player_id, baseball_players!inner ( id, first_name, last_name )')
      .eq('team_id', team.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('baseball_team_coach_staff')
      .select('coach_id, baseball_coaches!inner ( id, full_name )')
      .eq('team_id', team.id),
  ]);

  const playerNames: Record<string, string> = {};
  const roster: { id: string; name: string }[] = [];
  for (const m of membersRes.data ?? []) {
    const p = m.baseball_players as unknown as {
      id: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
    if (p) {
      const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
      playerNames[p.id] = name;
      roster.push({ id: p.id, name });
    }
  }
  roster.sort((a, b) => a.name.localeCompare(b.name));

  const staff: { id: string; name: string }[] = [];
  for (const s of (staffRes.data ?? []) as Array<{
    baseball_coaches: { id: string; full_name: string | null } | null;
  }>) {
    const c = s.baseball_coaches;
    if (c) staff.push({ id: c.id, name: c.full_name || 'Coach' });
  }
  staff.sort((a, b) => a.name.localeCompare(b.name));

  // Capability: can this viewer triage / convert? (Read model already gated
  // visibility; this gates the write affordances.)
  const canManage = model.authorized
    ? await hasBaseballCapability(team.id, 'can_manage_stats')
    : false;

  return (
    <SignalInboxClient
      model={model}
      playerNames={playerNames}
      roster={roster}
      staff={staff}
      canManage={canManage}
    />
  );
}

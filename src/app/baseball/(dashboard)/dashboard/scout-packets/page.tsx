// =============================================================================
// src/app/baseball/(dashboard)/dashboard/scout-packets/page.tsx
//
// V5 Scout Packet — the Showcase "event roster -> scout packet" hub.
// Showcase variant: "scout packet export · college coach viewer access".
//
// A coach with export rights scans the roster, sees exposure + live-link status
// at a glance, and jumps into managing any player's packet. This is the staff
// entry point that turns the V5 §Scout Packet "event roster" into action.
//
// Export capability is enforced server-side by getScoutPacketRoster; this page
// also surfaces the program-level export guardrail so a coach knows when sharing
// is disabled at the program level.
// =============================================================================

import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { getScoutPacketRoster } from '@/app/baseball/actions/scout-packet';
import { ScoutPacketsFairway } from '@/components/baseball/passport/ScoutPacketsFairway';
import { fairwayScope } from '@/lib/redesign/flag';

export const metadata = {
  title: 'Scout Packets · BaseballHelm',
};

export default async function ScoutPacketsHubPage() {
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/dashboard/command-center');
  if (context.activeRole !== 'coach') redirect('/baseball/player/passport');

  const caps = await resolveBaseballCapabilities(context.activeTeamId);
  if (!(caps.can_export_reports || caps.is_head_coach)) {
    redirect('/baseball/dashboard/command-center');
  }

  const roster = await getScoutPacketRoster();

  return (
    <div className={fairwayScope('min-h-dvh bg-[var(--paper-canvas)]')}>
      <ScoutPacketsFairway roster={roster} />
    </div>
  );
}

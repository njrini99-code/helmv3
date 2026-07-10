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
import { BaseballUnauthorizedError } from '@/lib/baseball/with-baseball-action';
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

  // getScoutPacketRoster independently re-resolves auth (withBaseballAction),
  // so a session that expires in the narrow window between the checks above
  // and this call throws BaseballUnauthorizedError here. Left uncaught, that
  // raw-throws through this Server Component's render straight to error.tsx
  // and the error tracker (Sentry/Vercel) instead of the honest "please sign
  // in again" redirect — the same class of bug fixed on the baseball
  // announcements page. Redirect on that specific case; any other thrown
  // error (a real failure for a signed-in coach) keeps propagating to error.tsx.
  let roster: Awaited<ReturnType<typeof getScoutPacketRoster>>;
  try {
    roster = await getScoutPacketRoster();
  } catch (error) {
    if (error instanceof BaseballUnauthorizedError) {
      redirect('/baseball/login?returnTo=/baseball/dashboard/scout-packets');
    }
    throw error;
  }

  return (
    <div className={fairwayScope('min-h-dvh bg-[var(--paper-canvas)]')}>
      <ScoutPacketsFairway roster={roster} />
    </div>
  );
}

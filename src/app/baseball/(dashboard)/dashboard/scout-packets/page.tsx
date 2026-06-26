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
import Link from 'next/link';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { getScoutPacketRoster } from '@/app/baseball/actions/scout-packet';
import { ScoutPacketRosterList } from '@/components/baseball/passport/ScoutPacketRosterList';
import { IconAlertCircle } from '@/components/icons';

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
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        <header className="mb-6">
          <p className="text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
            Recruiting
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-warm-900">Scout Packets</h1>
          <p className="mt-1 text-warm-500">
            Share source-backed packets with college coaches. Each link shows only verified,
            scout-exposed fields — never internal notes.
          </p>
        </header>

        {!roster.exportEnabled && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
            <IconAlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              Scout packet export is off for this program. Turn on scout access and export in{' '}
              <Link
                href="/baseball/dashboard/settings/program"
                className="font-medium underline underline-offset-2"
              >
                Settings
              </Link>{' '}
              before sharing links.
            </p>
          </div>
        )}

        <ScoutPacketRosterList entries={roster.entries} />
      </div>
    </div>
  );
}

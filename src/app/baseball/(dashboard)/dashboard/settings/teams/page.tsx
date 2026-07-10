// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/teams/page.tsx
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// Dedicated TEAM settings route (v4 §Team Settings) — join code, invite policy,
// player self-join, and coach-approval-required. These TEAM-grain join controls
// had no editing surface before. Auth + active-team + viewer caps resolve inside
// getTeamJoinSettings (withBaseballAction); every write re-validates
// can_manage_settings SERVER-SIDE. COACH route.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getTeamJoinSettings } from '@/app/baseball/actions/team-season-settings';
import { BaseballUnauthorizedError } from '@/lib/baseball/with-baseball-action';
import { redirectOnUnauthorized } from '@/lib/baseball/redirect-on-unauthorized';
import { TeamSettingsClient } from '@/components/baseball/settings/TeamSettingsClient';

export const metadata = {
  title: 'Team Settings | Helm Baseball',
  description: 'Join code, invite policy, self-join, and coach-approval controls.',
};

export default async function TeamSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/settings/teams');
  }

  // getTeamJoinSettings independently re-resolves auth (withBaseballAction).
  // A session that expires in the narrow window between the check above and
  // this call throws BaseballUnauthorizedError, which must redirect to login
  // rather than raw-throw to error.tsx/Sentry. Any OTHER failure keeps
  // propagating.
  const data = await redirectOnUnauthorized(
    () => getTeamJoinSettings(),
    (error) => error instanceof BaseballUnauthorizedError,
    '/baseball/dashboard/settings/teams',
  );

  return <TeamSettingsClient data={data} />;
}

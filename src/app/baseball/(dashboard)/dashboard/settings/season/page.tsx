// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/season/page.tsx
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// Dedicated SEASON settings route (v4 §Team And Season Settings + §Season-
// specific). Phases, archive status, current season, and per-season module
// toggles (roster / schedule / stats / practice-templates / lift-groups /
// performance-baselines / player-status) — none of which had a surface before.
// Auth + active-team + viewer caps resolve inside listSeasons (withBaseballAction);
// every write re-validates can_manage_settings SERVER-SIDE. COACH route.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { listSeasons } from '@/app/baseball/actions/team-season-settings';
import { BaseballUnauthorizedError } from '@/lib/baseball/with-baseball-action';
import { redirectOnUnauthorized } from '@/lib/baseball/redirect-on-unauthorized';
import { SeasonSettingsClient } from '@/components/baseball/settings/SeasonSettingsClient';

export const metadata = {
  title: 'Season Settings | Helm Baseball',
  description: 'Season phases, the current season, and season-specific modules.',
};

export default async function SeasonSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/settings/season');
  }

  // listSeasons independently re-resolves auth (withBaseballAction). A
  // session that expires in the narrow window between the check above and
  // this call throws BaseballUnauthorizedError, which must redirect to login
  // rather than raw-throw to error.tsx/Sentry. Any OTHER failure keeps
  // propagating.
  const data = await redirectOnUnauthorized(
    () => listSeasons(),
    (error) => error instanceof BaseballUnauthorizedError,
    '/baseball/dashboard/settings/season',
  );

  return <SeasonSettingsClient data={data} />;
}

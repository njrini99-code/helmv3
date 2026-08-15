/**
 * W42 — per-category notification preferences settings.
 *
 * /dashboard/settings/notifications · player-only. The per-category channel
 * matrix lives on `golf_player_notification_state`, a player-scoped table —
 * there is no coach equivalent of this screen. Coaches already have a real,
 * working Notifications control (top-level delivery preferences, writing
 * `users.notification_preferences`) on the general Settings page — see
 * `NotificationsPanel` in `FairwaySettingsGeneral.tsx`. Rendering an
 * explanatory near-empty card here for coaches was a dead end; point them at
 * that working surface instead (audit W4 — no blank pages).
 *
 * #1251 — how we point them there changed. This used to
 * `redirect('/golf/dashboard/settings')`, and that redirect crashed React
 * (#310, "rendered more hooks than during the previous render") on 3/3 coach
 * loads, thrown inside Next's client router rather than in any app component.
 * The framework-level fix used for the bare redirect shims — intercepting the
 * path in `next.config.mjs` `redirects()` before the page renders — cannot
 * apply here, because whether to redirect depends on the visitor's role and
 * the config layer has no session.
 *
 * So we drop the redirect entirely and render `<FeatureUnavailable>` IN PLACE,
 * the same pattern every coach-only page already uses for the mirror case (see
 * whats-new/page.tsx, which adopted it for the same class of crash). Same
 * route, same request, nothing new to fetch — and the W4 intent is better
 * served than before: the coach now gets a stated reason AND a one-click CTA
 * to the Settings page that holds their real control, instead of a silent hop.
 *
 * #1318 — the CTA copy used to just say "the general Settings page" / "Open
 * Settings". That reads as a dead end of its own: this route's own breadcrumb
 * and sidebar both already say "Settings" (the top-bar breadcrumb only ever
 * shows the FIRST path segment as the second crumb — see `buildBreadcrumbs` in
 * `FairwayDashboardShell.tsx` — so `/settings/notifications` renders exactly
 * the same "Dashboard / Settings" trail as `/settings` itself, and the rail's
 * Settings link highlights on any `/settings*` path). Telling a coach who
 * already appears to be "at Settings" to go to Settings reads as a loop, not
 * a hand-off. The copy now names the specific place inside Settings the
 * control lives (the Notifications section) instead of repeating the same
 * word the chrome is already showing.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import type { Metadata } from 'next';
import type { PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';
import { fairwayScope } from '@/lib/redesign/flag';
import { FeatureUnavailable } from '@/components/fairway';
import { FairwaySettingsNotifications } from '@/components/fairway/pages/settings';

export const metadata: Metadata = {
  title: 'Notification preferences · GolfHelm',
};

export default async function NotificationPrefsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.player) {
    // Two different visitors land here with no player profile, and they need
    // two different next steps — see the file header (#1318) for why the
    // coach copy specifically avoids saying "Settings" as if that were new
    // information.
    return session.coach ? (
      <FeatureUnavailable
        title="Notification preferences"
        message="This per-category matrix is a player-only control — coach accounts don't have one. Your own alert preferences (push, email, in-app) live in the Notifications section, further down the Settings page."
        actionHref="/golf/dashboard/settings"
        actionLabel="Manage your notifications"
      />
    ) : (
      <FeatureUnavailable
        title="Notification preferences"
        message="No coach or player profile is linked to this account yet. Finish onboarding to start managing your preferences."
        actionHref="/golf/player"
        actionLabel="Finish onboarding"
      />
    );
  }

  const sb = await createClient();
  const { data: row } = await sb
    .from('golf_player_notification_state')
    .select('prefs, quiet_mode')
    .eq('player_id', session.player.id)
    .maybeSingle();

  const prefs = (row?.prefs as PrefsByCategory) ?? {};
  const quietMode = row?.quiet_mode ?? false;

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwaySettingsNotifications prefs={prefs} quietMode={quietMode} />
    </div>
  );
}

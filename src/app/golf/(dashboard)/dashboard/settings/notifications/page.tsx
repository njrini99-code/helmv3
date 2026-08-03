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
    return (
      <FeatureUnavailable
        title="Notification preferences"
        message={
          session.coach
            ? 'Per-category notification preferences are a player surface. Your delivery preferences live on the general Settings page.'
            : 'No coach or player profile found. Please complete onboarding.'
        }
        actionHref="/golf/dashboard/settings"
        actionLabel="Open Settings"
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

/**
 * W42 — per-category notification preferences settings.
 *
 * /dashboard/settings/notifications · player-only. The per-category channel
 * matrix lives on `golf_player_notification_state`, a player-scoped table —
 * there is no coach equivalent of this screen. Coaches already have a real,
 * working Notifications control (top-level delivery preferences, writing
 * `users.notification_preferences`) on the general Settings page — see
 * `NotificationsPanel` in `FairwaySettingsGeneral.tsx`. Rendering an
 * explanatory near-empty card here for coaches was a dead end; redirect to
 * that working surface instead (audit W4 — no blank pages).
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import type { Metadata } from 'next';
import type { PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwaySettingsNotifications } from '@/components/fairway/pages/settings';

export const metadata: Metadata = {
  title: 'Notification preferences · GolfHelm',
};

export default async function NotificationPrefsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.player) redirect('/golf/dashboard/settings');

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

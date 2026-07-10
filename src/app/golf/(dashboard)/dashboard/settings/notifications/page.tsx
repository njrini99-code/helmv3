/**
 * W42 — per-category notification preferences settings.
 *
 * /dashboard/settings/notifications · player-only.
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
  if (!session.player) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto w-full max-w-[760px] px-4 py-6 pb-24 md:px-6 md:py-8">
          <div className="rounded-2xl border border-border-subtle bg-surface p-5">
            <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Settings
            </p>
            <h1 className="mt-2 font-fw-display text-h2 text-text-primary">
              Notifications
            </h1>
            <p className="mt-2 font-fw-sans text-body-sm text-text-secondary">
              Per-category notification controls are currently tied to a player profile.
              Coach notification preferences are handled through team and CoachHelm settings.
            </p>
          </div>
        </div>
      </div>
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

/**
 * W42 — per-category notification preferences settings.
 *
 * /dashboard/settings/notifications · player-only.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { NotificationPrefsClient } from './NotificationPrefsClient';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import type { Metadata } from 'next';
import type { PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwaySettingsNotifications } from '@/components/fairway/pages/settings';

export const metadata: Metadata = {
  title: 'Notification preferences · GolfHelm',
};

export default async function NotificationPrefsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.player) {
    if (isRedesignEnabled())
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

    return (
      <AnimatedPage className="min-h-full bg-transparent">
        <AnimatedItem>
          <MobileNavHeader
            title="Notifications"
            backHref="/golf/dashboard/settings"
            backLabel="Settings"
            breadcrumb={
              <Breadcrumb
                items={[
                  { label: 'Dashboard', href: '/golf/dashboard' },
                  { label: 'Settings', href: '/golf/dashboard/settings' },
                  { label: 'Notifications' },
                ]}
              />
            }
          />
        </AnimatedItem>
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <section className="surface-matte rounded-2xl border border-warm-200/60 p-5">
            <p className="text-eyebrow uppercase tracking-[0.14em] text-warm-500 mb-1.5">
              Settings
            </p>
            <h2 className="text-2xl font-medium text-warm-900 tracking-tight">
              Notifications
            </h2>
            <p className="mt-2 text-sm text-warm-600">
              Per-category notification controls are currently tied to a player profile.
              Coach notification preferences are handled through team and CoachHelm settings.
            </p>
          </section>
        </div>
      </AnimatedPage>
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

  if (isRedesignEnabled())
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwaySettingsNotifications prefs={prefs} quietMode={quietMode} />
      </div>
    );

  return (
    <AnimatedPage className="min-h-full bg-transparent">
      <AnimatedItem>
        <MobileNavHeader
          title="Notifications"
          backHref="/golf/dashboard/settings"
          backLabel="Settings"
          breadcrumb={
            <Breadcrumb
              items={[
                { label: 'Dashboard', href: '/golf/dashboard' },
                { label: 'Settings', href: '/golf/dashboard/settings' },
                { label: 'Notifications' },
              ]}
            />
          }
        />
      </AnimatedItem>
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <header className="mb-8">
          <p className="text-eyebrow uppercase tracking-[0.14em] text-warm-500 mb-1.5">Settings</p>
          {/* a11y W3D: page h1 is supplied by the consolidated PageHeader
              (MobileNavHeader) above; demote this in-content title to <h2>
              so the page exposes exactly one semantic <h1>. Visual look is
              unchanged — sizing comes from the className, not the tag. */}
          <h2 className="text-3xl font-medium text-warm-900 tracking-tight">Notifications</h2>
          <p className="mt-2 text-sm text-warm-600">
            Choose how each kind of update reaches you. Quiet mode silences everything except
            round-review-ready and coach-assigned goals.
          </p>
        </header>
        <NotificationPrefsClient prefs={prefs} quietMode={quietMode} />
      </div>
    </AnimatedPage>
  );
}

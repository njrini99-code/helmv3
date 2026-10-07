/**
 * /golf/dashboard/settings/[section] — the drill-in pages behind the settings
 * index (redesign direction A).
 *
 * Server-side, before any client code runs:
 *   • an unknown section is a 404 (the dashboard's own not-found page);
 *   • a section the role doesn't have renders FeatureUnavailable IN PLACE,
 *     with a way to where that setting does live. No redirect: role-dependent
 *     redirects here crashed React (#1251, see notifications/page.tsx).
 *
 * `notifications` and `coaching-intelligence` are static siblings and always
 * win over this segment, so they keep their own pages.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { fairwayScope } from '@/lib/redesign/flag';
import { FeatureUnavailable } from '@/components/fairway';
import { getSettingsSection } from '@/components/fairway/pages/settings/redesign-settings/a/sections';
import { SettingsSectionPage } from '@/components/fairway/pages/settings/redesign-settings/a/settings-section-page';

type Params = Promise<{ section: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { section } = await params;
  return { title: getSettingsSection(section)?.title ?? 'Settings' };
}

export default async function SettingsSectionRoute({ params }: { params: Params }) {
  const { section } = await params;
  const config = getSettingsSection(section);
  if (!config) notFound();

  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  if (!session.role) {
    return (
      <FeatureUnavailable
        title={config.title}
        message="No coach or player profile is linked to this account yet. Finish onboarding to manage your settings."
        actionHref="/golf/player"
        actionLabel="Finish onboarding"
      />
    );
  }

  if (!config.roles.includes(session.role)) {
    return (
      <FeatureUnavailable
        title={config.title}
        message={config.unavailable.message}
        actionHref={config.unavailable.href}
        actionLabel={config.unavailable.label}
      />
    );
  }

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <SettingsSectionPage slug={config.slug} />
    </div>
  );
}

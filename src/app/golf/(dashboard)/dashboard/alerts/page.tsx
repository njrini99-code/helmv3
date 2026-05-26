/**
 * Coach alerts page — hosts the CoachAlertCenter that was previously
 * orphaned. Five action files (`alerts.ts`, `insight-management.ts`,
 * `intelligence-dashboard.ts`, `development.ts`, `coaching-philosophy.ts`)
 * already call `revalidatePath('/golf/dashboard/alerts')`, so this
 * route needs to exist for those revalidations to land.
 *
 * Coach-only — players get the canonical FeatureUnavailable redirect
 * to /coachhelm.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { CoachAlertCenter } from '@/components/golf/coachhelm/alerts';
import { FeatureUnavailable } from '@/components/golf/layout/FeatureUnavailable';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';

export const metadata = {
  title: 'Alerts | CoachHelm',
  description: 'High-priority coaching alerts that need your attention.',
};

export default async function AlertsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  if (!coach) {
    if (player) {
      return (
        <FeatureUnavailable
          title="Alerts"
          message="The Alerts inbox is part of the coach toolkit. Your personal AI surfaces live on the CoachHelm dashboard."
          actionHref="/golf/dashboard/coachhelm"
          actionLabel="Open CoachHelm"
        />
      );
    }
    redirect('/golf/login');
  }

  // Resolve the coach's team for the alerts query.
  const supabase = await createClient();
  let teamId: string | null = null;
  if (coach.organization_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = team?.id ?? null;
  }

  if (!teamId) {
    return (
      <FeatureUnavailable
        title="Alerts"
        message="No active team is linked to your coach account yet. Create or join a team to start receiving alerts."
        actionHref="/golf/dashboard/team"
        actionLabel="Go to Team Settings"
      />
    );
  }

  return (
    <div>
      <LargeTitleHeader title="Alerts" subtitle="High-priority signals that need your attention." />
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-8">
            <PageHeader
              eyebrow="CoachHelm"
              eyebrowAccent="primary"
              title="Alerts inbox."
              subtitle="Reviewed and dismissed items move out of view automatically."
            />
          </div>
        </Reveal>
        <Reveal staggerIndex={1}>
          <CoachAlertCenter coachId={coach.id} teamId={teamId} />
        </Reveal>
      </div>
    </div>
  );
}

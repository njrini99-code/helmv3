/**
 * Coach alerts page — hosts the Signals triage workspace. Five action files
 * (`alerts.ts`, `insight-management.ts`, `intelligence-dashboard.ts`,
 * `development.ts`, `coaching-philosophy.ts`) already call
 * `revalidatePath('/golf/dashboard/alerts')`, so this route needs to exist
 * for those revalidations to land.
 *
 * Coach-only — players get a Fairway "feature unavailable" redirect to
 * /coachhelm.
 */

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { getInsightsForCoachWithMeta } from '@/app/golf/actions/insight-delivery';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayCoachHelmSignals, EmptyState, Button } from '@/components/fairway';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';

export const metadata = {
  title: 'Alerts | CoachHelm',
  description: 'High-priority coaching alerts that need your attention.',
};

/**
 * A Fairway-styled "feature unavailable" state — same copy/behavior as the
 * legacy `FeatureUnavailable` component, re-skinned onto the Fairway
 * EmptyState primitive (this route's un-gated edge states used to render
 * legacy chrome even with the redesign flag on — Wave W1 fix).
 */
function AlertsUnavailable({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas')}>
      <EmptyState
        icon={<Lock />}
        title={title}
        description={message}
        action={
          <Button asChild variant="primary">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        }
      />
    </div>
  );
}

export default async function AlertsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  if (!coach) {
    if (player) {
      return (
        <AlertsUnavailable
          title="Alerts"
          message="The Alerts inbox is part of the coach toolkit. Your personal AI surfaces live on the CoachHelm dashboard."
          actionHref="/golf/dashboard/coachhelm"
          actionLabel="Open CoachHelm"
        />
      );
    }
    redirect('/golf/login');
  }

  // Resolve the coach's team for the alerts query (deterministic: handles
  // orgs with >1 team).
  const supabase = await createClient();
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

  if (!teamId) {
    return (
      <AlertsUnavailable
        title="Alerts"
        message="No active team is linked to your coach account yet. Create or join a team to start receiving alerts."
        actionHref="/golf/dashboard/team"
        actionLabel="Go to Team Settings"
      />
    );
  }

  // SSR-seed the urgent/high insights via the SAME preserved read the surface
  // client-fetches (getInsightsForCoachWithMeta, limit 100, fetchPriorities),
  // so the Signals workspace paints data on the first frame instead of
  // mounting at loading=true → an always-on client fetch + skeleton flash on
  // every /alerts visit. Mirrors how /patterns already SSR-seeds initialPatterns.
  const [countsRes, insightsRes] = await Promise.all([
    getAlertCounts(coach.id),
    getInsightsForCoachWithMeta(coach.id, {
      limit: 100,
      priorities: ['urgent', 'high'],
    }),
  ]);
  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;
  // Honest fallback: a DB error leaves initialInsights empty so the surface
  // falls back to its own client fetch + error handling (never a fake feed).
  const initialInsights = insightsRes.ok ? insightsRes.data : [];
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <FairwayCoachHelmSignals
        coachId={coach.id}
        teamId={teamId}
        signalSource="insights"
        initialInsights={initialInsights}
        defaultFilter={{
          // The client filter compares against MAPPED row tones
          // (insight `urgent` → row `critical`; see patternToInsightVocabulary
          // INSIGHT_PRIORITY_MAP), so the seeded severity set must use the
          // mapped tones or the default filter would hide every urgent alert.
          severity: ['critical', 'high'],
          // The DB read still selects the raw insight priorities.
          fetchPriorities: ['urgent', 'high'],
          status: 'active',
          signalTypes: ['insight', 'pattern'],
        }}
        signalCount={signalCount}
        showScanTeam
      />
    </div>
  );
}

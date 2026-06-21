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
import { ContainerReading } from '@/components/ui/containers';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { getInsightsForCoachWithMeta } from '@/app/golf/actions/insight-delivery';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayCoachHelmSignals } from '@/components/fairway';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';

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

  // Resolve the coach's team for the alerts query (deterministic: handles
  // orgs with >1 team).
  const supabase = await createClient();
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

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

  // ── Thin flag fork (ADDITIVE) ──────────────────────────────────────────────
  // Flag ON → the unified Signals triage workspace (alerts preset: interleaves
  // urgent/high insights + patterns, Scan-Team control on). It renders the
  // CoachHelmShell itself and client-fetches via the SAME preserved actions the
  // legacy CoachAlertCenter used. Flag OFF (default) → CoachAlertCenter verbatim.
  if (isRedesignEnabled()) {
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

  return (
    <div>
      <LargeTitleHeader title="Alerts" subtitle="High-priority signals that need your attention." />
      <ContainerReading className="py-6 md:py-8 space-y-5">
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
      </ContainerReading>
    </div>
  );
}

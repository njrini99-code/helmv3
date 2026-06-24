import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { getInsightsForCoachWithMeta } from '@/app/golf/actions/insight-delivery';
import { getTeamPatterns } from '@/app/golf/actions/pattern-management';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayCoachHelmSignals } from '@/components/fairway';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';

export const metadata = {
  title: 'Signals | CoachHelm',
  description: 'Triage alerts, insights, and patterns in one workspace.',
};

type Preset = 'inbox' | 'all' | 'patterns';

export default async function CoachHelmTeamSignalsPage({
  searchParams,
}: {
  searchParams?: Promise<{ preset?: string | string[] }>;
}) {
  if (!isRedesignEnabled()) {
    redirect('/golf/dashboard/alerts');
  }

  const session = await getGolfSessionProfile();
  if (!session?.coach) redirect('/golf/login');

  const supabase = await createClient();
  const teamId = await resolveCoachTeamIdWithCookie(
    supabase,
    session.coach.organization_id,
    session.coach.id,
  );
  if (!teamId) redirect('/golf/dashboard');

  const params = (await searchParams) ?? {};
  const rawPreset = Array.isArray(params.preset) ? params.preset[0] : params.preset;
  const preset: Preset =
    rawPreset === 'all' || rawPreset === 'patterns' ? rawPreset : 'inbox';

  const countsRes = await getAlertCounts(session.coach.id);
  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;

  if (preset === 'patterns') {
    const patternsRes = await getTeamPatterns({ limit: 100 });
    return (
      <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
        <FairwayCoachHelmSignals
          coachId={session.coach.id}
          teamId={teamId}
          signalSource="patterns"
          initialPatterns={patternsRes.success ? patternsRes.patterns ?? [] : []}
          defaultFilter={{ groupBy: 'player', view: 'grouped' }}
          signalCount={signalCount}
        />
      </div>
    );
  }

  const insightsRes = await getInsightsForCoachWithMeta(session.coach.id, {
    limit: 100,
    ...(preset === 'inbox' ? { priorities: ['urgent', 'high'] } : {}),
  });
  const initialInsights = insightsRes.ok ? insightsRes.data : [];

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <FairwayCoachHelmSignals
        coachId={session.coach.id}
        teamId={teamId}
        signalSource="insights"
        initialInsights={initialInsights}
        defaultFilter={
          preset === 'inbox'
            ? {
                severity: ['critical', 'high'],
                fetchPriorities: ['urgent', 'high'],
                status: 'active',
                signalTypes: ['insight', 'pattern'],
              }
            : { smartDefault: 'new_and_critical_this_week' }
        }
        signalCount={signalCount}
        showScanTeam={preset === 'inbox'}
      />
    </div>
  );
}

import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getTeamPatterns } from '@/app/golf/actions/pattern-management';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayCoachHelmSignals, FeatureUnavailable, InlineNotice } from '@/components/fairway';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { surfaceName } from '@/lib/golf/surface-registry';

/**
 * Patterns Page - Server Component
 *
 * Displays AI-detected patterns for the team with management capabilities.
 * Coach-only page.
 */
export default async function PatternsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  if (!coach) {
    if (player) {
      return (
        <FeatureUnavailable
          title={surfaceName('patterns')}
          message="The Patterns dashboard is designed for coaches. Players can view their own patterns from the CoachHelm dashboard."
          actionHref="/golf/dashboard/coachhelm"
          actionLabel="Open CoachHelm"
        />
      );
    }
    return (
      <FeatureUnavailable
        title={surfaceName('patterns')}
        message="No coach or player profile found. Please complete onboarding."
        actionHref="/golf/dashboard"
        actionLabel="Back to Dashboard"
      />
    );
  }

  // Fetch patterns for the unified Signals workspace (patterns-only preset,
  // grouped by player). It renders the CoachHelmShell itself and seeds
  // initialPatterns from this SAME getTeamPatterns read.
  const patternsResult = await getTeamPatterns();

  const supabase = await createClient();
  const teamId = (await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)) ?? '';
  const countsRes = await getAlertCounts(coach.id);
  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      {!patternsResult.success ? (
        <div className="px-1 py-6 sm:px-2">
          <InlineNotice tone="danger" title="Unable to load patterns">
            {patternsResult.error || 'Failed to load patterns'}
          </InlineNotice>
        </div>
      ) : (
        <FairwayCoachHelmSignals
          coachId={coach.id}
          teamId={teamId}
          signalSource="patterns"
          defaultFilter={{
            signalTypes: ['pattern'],
            groupBy: 'player',
            view: 'grouped',
          }}
          initialPatterns={patternsResult.patterns || []}
          signalCount={signalCount}
        />
      )}
    </div>
  );
}

export const metadata = {
  title: `${surfaceName('patterns')} | CoachHelm`,
  description: 'View and manage AI-detected performance patterns for your team',
};

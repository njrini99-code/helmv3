import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { IconInfo } from '@/components/icons';
import { getTeamPatterns, getPatternStats } from '@/app/golf/actions/pattern-management';
import { PatternsDashboardClient } from './PatternsDashboardClient';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { FeatureUnavailable } from '@/components/golf/layout/FeatureUnavailable';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayCoachHelmSignals } from '@/components/fairway';
import { InlineNotice } from '@/components/fairway';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';

/**
 * Error state component
 */
function ErrorState({ error }: { error: string }) {
  return (
    <div className="min-h-full flex items-center justify-center p-4 md:p-6 bg-gradient-to-br from-red-500/5 via-transparent to-transparent">
      <Card variant="overlay" padding="md" className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
          <IconInfo size={32} className="text-red-500" />
        </div>
        <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.015em] mb-2">
          Unable to Load Patterns
        </h2>
        <p className="text-warm-600 mb-6">{error}</p>
        <a
          href="/golf/dashboard/patterns"
          className="inline-block px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          Try Again
        </a>
      </Card>
    </div>
  );
}

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
          title="Pattern Management"
          message="The Pattern Management dashboard is designed for coaches. Players can view their own patterns from the CoachHelm dashboard."
          actionHref="/golf/dashboard/coachhelm"
          actionLabel="Open CoachHelm"
        />
      );
    }
    return <ErrorState error="No coach or player profile found. Please complete onboarding." />;
  }

  // Fetch patterns and stats in parallel
  const [patternsResult, statsResult] = await Promise.all([
    getTeamPatterns(),
    getPatternStats(),
  ]);

  // ── Thin flag fork (ADDITIVE) ──────────────────────────────────────────────
  // Flag ON → the unified Signals workspace (patterns-only preset, grouped by
  // player). It renders the CoachHelmShell itself and seeds initialPatterns from
  // the SAME getTeamPatterns read above. The bespoke ErrorState is replaced by an
  // honest InlineNotice ONLY in this branch. Flag OFF → PatternsDashboardClient
  // (and the bespoke ErrorState) render EXACTLY as today.
  if (isRedesignEnabled()) {
    const supabase = await createClient();
    const teamId = (await resolveCoachTeamId(supabase, coach.organization_id, coach.id)) ?? '';
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

  if (!patternsResult.success) {
    return <ErrorState error={patternsResult.error || 'Failed to load patterns'} />;
  }

  return (
    <AnimatedPage>
      <AnimatedItem>
        <PatternsDashboardClient
          initialPatterns={patternsResult.patterns || []}
          initialStats={statsResult.success ? statsResult.stats : undefined}
        />
      </AnimatedItem>
    </AnimatedPage>
  );
}

export const metadata = {
  title: 'Pattern Management | CoachHelm',
  description: 'View and manage AI-detected performance patterns for your team',
};

import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { GlassCard } from '@/components/ui/glass-card';
import { IconInfo, IconSparkles } from '@/components/icons';
import { getTeamPatterns, getPatternStats } from '@/app/golf/actions/pattern-management';
import { PatternsDashboardClient } from './PatternsDashboardClient';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

/**
 * Error state component
 */
function ErrorState({ error }: { error: string }) {
  return (
    <div className="min-h-full flex items-center justify-center p-4 md:p-6 bg-gradient-to-br from-red-500/5 via-transparent to-transparent">
      <GlassCard className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
          <IconInfo size={32} className="text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-warm-900 mb-2">
          Unable to Load Patterns
        </h2>
        <p className="text-warm-600 mb-6">{error}</p>
        <a
          href="/golf/dashboard/patterns"
          className="inline-block px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          Try Again
        </a>
      </GlassCard>
    </div>
  );
}

/**
 * Not a coach state - Patterns page is coach-only
 */
function NotCoachState() {
  return (
    <div className="min-h-full flex items-center justify-center p-4 md:p-6">
      <GlassCard className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <IconSparkles size={32} className="text-amber-500" />
        </div>
        <h2 className="text-xl font-semibold text-warm-900 mb-2">
          Coach Dashboard Only
        </h2>
        <p className="text-warm-600 mb-6">
          The Pattern Management dashboard is designed for coaches. Players can view their
          own patterns from the CoachHelm dashboard.
        </p>
        <a
          href="/golf/dashboard/coachhelm"
          className="inline-block px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          Go to Your Dashboard
        </a>
      </GlassCard>
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
    if (player) return <NotCoachState />;
    return <ErrorState error="No coach or player profile found. Please complete onboarding." />;
  }

  // Fetch patterns and stats in parallel
  const [patternsResult, statsResult] = await Promise.all([
    getTeamPatterns(),
    getPatternStats(),
  ]);

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

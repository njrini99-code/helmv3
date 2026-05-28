import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { InsightsPageContent } from './InsightsPageContent';
import { PageLoading } from '@/components/ui/loading';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { FeatureUnavailable } from '@/components/golf/layout/FeatureUnavailable';
import { getInsightFilterOptions } from '@/app/golf/actions/insight-management';

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: 'AI Insights | CoachHelm',
  description: 'View and manage AI-powered coaching insights',
};

// ============================================================================
// PAGE COMPONENT
// ============================================================================

interface InsightsPageProps {
  searchParams: Promise<{
    q?: string;
    player?: string;
    type?: string;
    priority?: string;
    status?: string;
    dateRange?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
    sort?: string;
    order?: string;
    /** Comma-separated lifecycle states for the triage chip strip. */
    lifecycle?: string;
    /** Comma-separated canonical insight categories for the triage chip strip. */
    categoryChips?: string;
  }>;
}

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  const params = await searchParams;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach } = session;
  if (!coach) {
    return (
      <FeatureUnavailable
        title="AI Insights"
        message="The Insights workspace is designed for coaches managing the team's AI-generated insights. Players can view their own insights from the CoachHelm dashboard."
        actionHref="/golf/dashboard/coachhelm"
        actionLabel="Open CoachHelm"
      />
    );
  }

  // Get filter options (players, etc.)
  const filterOptionsResult = await getInsightFilterOptions(coach.id);
  const filterOptions = filterOptionsResult.success && filterOptionsResult.options
    ? filterOptionsResult.options
    : null;

  return (
    <div className="min-h-full">
      <Suspense fallback={<PageLoading />}>
        <AnimatedPage>
          <AnimatedItem>
            <InsightsPageContent
              coachId={coach.id}
              initialSearchParams={params}
              filterOptions={filterOptions}
            />
          </AnimatedItem>
        </AnimatedPage>
      </Suspense>
    </div>
  );
}

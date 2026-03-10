import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { InsightsPageContent } from './InsightsPageContent';
import { PageLoading } from '@/components/ui/loading';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
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
  }>;
}

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  const params = await searchParams;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach } = session;
  if (!coach) redirect('/golf/dashboard?message=Insights+is+a+coach-only+feature');

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

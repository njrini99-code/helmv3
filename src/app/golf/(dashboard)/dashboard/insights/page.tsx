import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { InsightsPageContent } from './InsightsPageContent';
import { PageLoading } from '@/components/ui/loading';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { FeatureUnavailable } from '@/components/golf/layout/FeatureUnavailable';
import { getInsightFilterOptions } from '@/app/golf/actions/insight-management';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayCoachHelmSignals } from '@/components/fairway';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';

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
    /**
     * Single canonical category token from a deep-link (e.g. FairwayBrief's
     * `/golf/dashboard/insights?category=tee`). Folded into `categoryChips`
     * below so the existing triage-chip filter consumes it.
     */
    category?: string;
    /**
     * Single insight id from a deep-link (e.g. the command palette's
     * `/golf/dashboard/insights?id=<insightId>`). Seeds `openRowId` in
     * FairwayCoachHelmSignals so the palette result opens the exact insight
     * panel instead of landing on the firehose list. Passed straight through
     * via `restParams` (see below).
     */
    id?: string;
  }>;
}

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  const rawParams = await searchParams;
  // Fold a single `?category=` deep-link token (e.g. FairwayBrief's
  // `/golf/dashboard/insights?category=tee`) into the comma-separated category
  // filter, deduping if values are already present. The two surfaces read
  // DIFFERENT keys, so we feed BOTH so whichever fork renders applies it:
  //   • redesign (live)  → FairwayCoachHelmSignals reads `sp.category`
  //   • legacy           → InsightsPageContent reads `params.categoryChips`
  // Without writing to `category`, the deep-link landed only in `categoryChips`
  // (the legacy key) and the LIVE surface silently dropped it.
  let params = rawParams;
  if (rawParams.category) {
    const mergedCategories = Array.from(
      new Set(
        [
          ...(rawParams.category.split(',') ?? []),
          ...(rawParams.categoryChips?.split(',') ?? []),
        ]
          .map((c) => c.trim())
          .filter((c) => c.length > 0),
      ),
    ).join(',');
    params = {
      ...rawParams,
      category: mergedCategories,
      categoryChips: mergedCategories,
    };
  }
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

  // ── Thin flag fork (ADDITIVE) ──────────────────────────────────────────────
  // Flag ON → the unified Signals workspace (insights-only preset, smart default
  // "new & critical this week", table view). It renders the CoachHelmShell itself
  // and client-fetches via getInsightsForCoach (the SAME read InsightsPageContent
  // used). Flag OFF (default) → InsightsPageContent renders EXACTLY as today.
  if (isRedesignEnabled()) {
    // org→team lookup ONLY in the redesign branch (legacy path unchanged) so the
    // Scan-Team control prop is satisfiable; not functionally used here.
    const supabase = await createClient();
    const teamId = (await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id)) ?? '';
    // Suppress the shell badge on the insights surface: the on-page "Urgent +
    // high" tile is the single source of truth for the pressing-signal count.
    // A shell badge (urgent+high alerts) contradicts the tile on the SAME
    // screen (e.g. badge "13" vs tile "8"), so we pass null here. The
    // getAlertCounts read is kept off this path entirely — it was only ever
    // feeding the now-suppressed badge.
    const signalCount = null;
    return (
      <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
        <FairwayCoachHelmSignals
          coachId={coach.id}
          teamId={teamId}
          signalSource="insights"
          defaultFilter={{
            signalTypes: ['insight'],
            smartDefault: 'new_and_critical_this_week',
            view: 'table',
          }}
          signalCount={signalCount}
          initialSearchParams={params}
        />
      </div>
    );
  }

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

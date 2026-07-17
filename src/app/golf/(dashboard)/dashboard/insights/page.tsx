import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayCoachHelmSignals, FeatureUnavailable } from '@/components/fairway';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { surfaceName } from '@/lib/golf/surface-registry';

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: `${surfaceName('insights')} | CoachHelm`,
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
  // `/golf/dashboard/insights?category=tee`) into the comma-separated
  // `categoryChips` filter, deduping if values are already present.
  // FairwayCoachHelmSignals reads `sp.category`.
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
        title={surfaceName('insights')}
        message="The Insights workspace is designed for coaches managing the team's AI-generated insights. Players can view their own insights from the CoachHelm dashboard."
        actionHref="/golf/dashboard/coachhelm"
        actionLabel="Open CoachHelm"
      />
    );
  }

  // The unified Signals workspace (insights-only preset, smart default "new &
  // critical this week", table view). It renders the CoachHelmShell itself and
  // client-fetches via getInsightsForCoach.
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

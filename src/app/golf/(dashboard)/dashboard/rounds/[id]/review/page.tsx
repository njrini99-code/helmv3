'use client';

/**
 * Round Review Page
 *
 * Displays AI-generated analysis of completed rounds using the
 * RoundReviewDisplay component with CoachHelm integration.
 */

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import type { ReactElement } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { containerVariants, itemVariants } from '@/components/golf/dashboard/premium-components';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRoundReviewV2 } from '@/hooks/coachhelm/useRoundReviewV2';
import { useToast } from '@/components/ui/sonner';
import { RoundReviewDisplay } from '@/components/golf/coachhelm/RoundReviewDisplay';
import { RoundStatsComparison } from '@/components/golf/coachhelm/RoundStatsComparison';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import {
  getRoundReview,
  generateAndStoreRoundReview,
  getStatAverages,
  getPlayerStandingForReview,
  shareRoundReviewWithCoach,
  type ComparisonAverages,
  type RoundReviewWithRound,
} from '@/app/golf/actions/round-review-system';
import { markReviewAsViewed } from '@/app/golf/actions/round-reviews';
import {
  RoundTakeaway,
  V2ReviewSummary,
} from '@/components/golf/coachhelm/round-review';
import { EmptyState } from '@/components/ui/empty-state';
import {
  getRoundTakeawayInsight,
  getInsightsForPlayer,
  type EvidenceInsight,
} from '@/app/golf/actions/insight-delivery';
import { IconSparkles, IconRefresh, IconGolf } from '@/components/icons';
import { PromoteToFocusAreaButton } from '@/components/golf/coachhelm/PromoteToFocusAreaButton';
import { RoundReviewLlmCard } from '@/components/golf/coachhelm/v3/RoundReviewLlmCard';
import { HoleByHoleShotPaths } from '@/components/golf/coachhelm/round-review/HoleByHoleShotPaths';
import { Button } from '@/components/ui/button';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { StandingBar } from '@/components/golf/coachhelm/v3/StandingBar';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

// ============================================================================
// TYPES
// ============================================================================

interface RoundData {
  id: string;
  player_id: string;
  course_name: string | null;
  round_date: string;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  holes_played: number | null;
  holes?: Array<{
    hole_number: number;
    score: number | null;
    par: number | null;
    yardage: number | null;
  }>;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Maps an insight category (or a free-form area string) to the focus-area
 *  type vocabulary the development.ts action expects. */
function mapCategoryToAreaType(input: string | null | undefined): string {
  if (!input) return 'other';
  const v = input.toLowerCase();
  if (v.includes('putt')) return 'putting';
  if (v.includes('approach') || v.includes('iron') || v.includes('gir')) return 'iron_play';
  if (v.includes('drive') || v.includes('tee') || v.includes('fairway')) return 'driving';
  if (v.includes('chip') || v.includes('short') || v.includes('scramble') || v.includes('sand')) return 'short_game';
  if (v.includes('mental') || v.includes('pressure') || v.includes('course')) return 'mental_game';
  return 'other';
}

/** Deterministic 1-sentence opener used as the LLM round-review
 *  card's fallback. Always renders something specific (score +
 *  score-to-par + optional course) so the surface is never empty
 *  when the W30 budget gate trips or the action errors. */
function buildRoundReviewFallback(
  totalScore: number,
  scoreToPar: number | null,
  courseName: string | null,
): string {
  const toParStr =
    scoreToPar === null || scoreToPar === undefined
      ? ''
      : scoreToPar === 0
        ? ' (even)'
        : scoreToPar > 0
          ? ` (+${scoreToPar})`
          : ` (${scoreToPar})`;
  const courseClause = courseName ? ` at ${courseName}` : '';
  return `You shot ${totalScore}${toParStr}${courseClause}. Review the stats and takeaways below.`;
}

interface PromoteSuggestion {
  title: string;
  description: string;
  areaType: string;
}

/** Picks the best section-level pre-fill for the Promote-to-Focus-Area CTA.
 *  Prefers the takeaway insight (carries category + concrete framing); falls
 *  back to the top areasForImprovement entry on the stored review. */
function derivePromoteSuggestion(
  takeawayInsight: EvidenceInsight | null,
  storedReview: RoundReviewWithRound | null,
): PromoteSuggestion | null {
  if (takeawayInsight) {
    return {
      title: takeawayInsight.title,
      description: takeawayInsight.content,
      areaType: mapCategoryToAreaType(takeawayInsight.category),
    };
  }
  const top = storedReview?.review_content?.areasForImprovement?.[0];
  if (top) {
    return {
      title: top.area,
      description: top.recommendation,
      areaType: mapCategoryToAreaType(top.area),
    };
  }
  return null;
}

/** Adapts the null-honest `ComparisonAverages` shape to the optional-number
 *  props `RoundStatsComparison` expects. A null average means "no honest
 *  baseline for this stat" — mapping it to `undefined` makes the component
 *  skip that comparison entirely instead of comparing against a fabricated
 *  number. */
function toComparisonProps(avg: ComparisonAverages | null): {
  avgGirPct?: number;
  avgFairwayPct?: number;
  avgPutts?: number;
} | null {
  if (!avg) return null;
  return {
    avgGirPct: avg.avgGirPct ?? undefined,
    avgFairwayPct: avg.avgFairwayPct ?? undefined,
    avgPutts: avg.avgPutts ?? undefined,
  };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RoundReviewPage() {
  const prefersReducedMotion = useReducedMotion();
  const params = useParams();
  const { addToast } = useToast();
  const roundId = params.id as string;

  // State
  const [round, setRound] = useState<RoundData | null>(null);
  const [storedReview, setStoredReview] = useState<RoundReviewWithRound | null>(null);
  // Null-honest averages: each field is independently null when the player's
  // history can't support it (see ComparisonAverages). Comparisons with a
  // null average are skipped, never faked.
  const [playerAvg, setPlayerAvg] = useState<ComparisonAverages | null>(null);
  const [teamAvg, setTeamAvg] = useState<ComparisonAverages | null>(null);
  // Season-level standing (PGA + team + you) keyed by canonical metric_id.
  // Redesign-only: feeds the StandingBar "where this sits" band below the
  // round stats. Empty `{}` until the season standing cron has populated rows
  // for this player — the band renders nothing in that cold-start case.
  const [standing, setStanding] = useState<Record<string, PlayerStanding>>({});
  const [loadingRound, setLoadingRound] = useState(true);
  const [loadingStoredReview, setLoadingStoredReview] = useState(true);
  const [generatingReview, setGeneratingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Evidence-backed insight delivery — takeaway + supporting list. Fetched
  // from `golf_coach_insights` (NOT the in-memory engine) so the round-review
  // surface reads from the same source as the Hub + CoachHelm dashboard.
  const [takeawayInsight, setTakeawayInsight] = useState<EvidenceInsight | null>(null);
  const [supportingInsights, setSupportingInsights] = useState<EvidenceInsight[]>([]);

  // Use existing CoachHelm hook for V2 features. V1 review object is no
  // longer rendered on this page (IA audit 2026-05-28 trimmed the dual V1/V2
  // surface down to V2 only — the W30 LLM round-review card lives in V2);
  // the hook still returns it for back-compat with `RoundReviewViewer.tsx`.
  // NOTE: the hook call is retained (it drives V2 hydration side effects), but
  // its `loading` return is intentionally NOT destructured — the page-level
  // `isLoading` gate no longer consults it (see the umbrella below). We still
  // pull `generating` for the Refresh-button spinner state.
  const {
    v2Review,
    isV2Enabled,
    generating: v1Generating,
  } = useRoundReviewV2(roundId);

  const supabase = useMemo(() => createClient(), []);

  // Fetch round data with auth check. Players see only their own rounds.
  // Coaches see any round belonging to a player on their team — same access
  // model as the parent /rounds/[id] server page and the round-review-system
  // server actions (`generateAndStoreRoundReview`, `getRoundReview` both use
  // role 'player_or_coach' in verifyReviewAccess). Previously this client
  // page hard-rejected coaches with "You must be a player to view round
  // reviews." which left `loadingStoredReview` stuck on its initial `true`
  // (the dependent effect early-returns when `round` stays null), so the page
  // hung on the "Loading review..." skeleton forever for coach sessions.
  useEffect(() => {
    async function fetchRound() {
      setLoadingRound(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Not authenticated');
          return;
        }

        // Look up player + coach records in parallel — a user may legitimately
        // be one or the other (and historically dual-role accounts exist).
        const [{ data: playerRecord }, { data: coachRecord }] = await Promise.all([
          supabase.from('golf_players').select('id').eq('user_id', user.id).maybeSingle(),
          supabase.from('golf_coaches').select('id, organization_id').eq('user_id', user.id).maybeSingle(),
        ]);

        const currentPlayerId = playerRecord?.id ?? null;
        const coachOrgId = coachRecord?.organization_id ?? null;

        if (!currentPlayerId && !coachOrgId) {
          setError('You must be a player or coach to view round reviews.');
          return;
        }

        // Fetch the round unrestricted — we authorize ownership below. RLS
        // already prevents reading rounds the user has no relationship to.
        const { data, error: fetchError } = await supabase
          .from('golf_rounds')
          .select('*, holes:golf_holes(*)')
          .eq('id', roundId)
          .maybeSingle();

        if (fetchError || !data) {
          setError('Round not found');
          return;
        }

        const roundData = data as RoundData;

        // Authorize: player owns the round OR coach has team membership over
        // the round's player. Mirrors the server action's verifyReviewAccess.
        const isOwnRound = currentPlayerId !== null && roundData.player_id === currentPlayerId;
        let isCoachOnTeam = false;
        if (!isOwnRound && coachOrgId) {
          // Deterministic org→team resolution (handles orgs with >1 team)
          const orgTeamId = await resolveCoachTeamId(supabase, coachOrgId, coachRecord?.id ?? null);
          if (orgTeamId) {
            const { data: teamMembership } = await supabase
              .from('golf_team_members')
              .select('id')
              .eq('team_id', orgTeamId)
              .eq('player_id', roundData.player_id)
              .maybeSingle();
            isCoachOnTeam = !!teamMembership;
          }
        }

        if (!isOwnRound && !isCoachOnTeam) {
          setError('Round not found');
          return;
        }

        if (roundData.holes) {
          roundData.holes = roundData.holes.sort((a, b) => a.hole_number - b.hole_number);
        }
        setRound(roundData);
      } catch {
        setError('Failed to load round');
      } finally {
        setLoadingRound(false);
      }
    }

    fetchRound();
  }, [roundId, supabase]);

  // Fetch stored review and averages. Resets `loadingStoredReview` regardless
  // of whether `round` resolved — previously an early `if (!round) return;`
  // left the flag stuck on its initial `true`, which hung the umbrella
  // `isLoading` boolean and the page on the "Loading review..." skeleton
  // whenever the round-fetch step bailed (e.g. error path, auth rejection).
  useEffect(() => {
    if (!loadingRound && !round) {
      setLoadingStoredReview(false);
      return;
    }
    if (!round) return;
    let cancelled = false;

    async function fetchReviewAndAverages() {
      if (!round) return;
      setLoadingStoredReview(true);
      try {
        // Fetch stored review
        const reviewResult = await getRoundReview(roundId);
        if (!cancelled && reviewResult.success && reviewResult.review) {
          setStoredReview(reviewResult.review);
        }

        // Fetch averages for comparison
        const avgResult = await getStatAverages(round.player_id);
        if (!cancelled && avgResult.success) {
          setPlayerAvg(avgResult.playerAvg ?? null);
          setTeamAvg(avgResult.teamAvg ?? null);
        }

        // Redesign-only: fetch season standing for the PGA/team/you band.
        // Gated so flag-off does zero extra work; failure-silent (the action
        // returns `{}` on error/cold-start, so the band simply won't render).
        if (isRedesignEnabled()) {
          const standingMap = await getPlayerStandingForReview(round.player_id);
          if (!cancelled) setStanding(standingMap);
        }
      } catch {
        // Silently ignore fetch errors
      } finally {
        if (!cancelled) setLoadingStoredReview(false);
      }
    }

    fetchReviewAndAverages();
    return () => {
      cancelled = true;
    };
  }, [round, roundId, loadingRound]);

  // Fetch evidence-backed takeaway + supporting insights in parallel once we
  // know which player the round belongs to. Server actions handle auth +
  // drill pre-fetch — the page stays a 'use client' island but defers all
  // data access to `getRoundTakeawayInsight` / `getInsightsForPlayer`.
  useEffect(() => {
    if (!round) return;
    let cancelled = false;

    async function loadInsightDelivery() {
      if (!round) return;
      try {
        const [takeaway, supporting] = await Promise.all([
          getRoundTakeawayInsight(round.player_id, roundId),
          getInsightsForPlayer(round.player_id, { limit: 6 }),
        ]);
        if (cancelled) return;
        setTakeawayInsight(takeaway);
        // Drop the takeaway row from the supporting list so we never render
        // it twice. V2ReviewSummary also filters defensively, but clipping
        // upstream keeps the prop shape tight.
        setSupportingInsights(
          takeaway ? supporting.filter((i) => i.id !== takeaway.id) : supporting,
        );
      } catch {
        // Server actions already route to `logServerError`. Fall through to
        // the empty state — an insight-delivery failure must never block the
        // rest of the review.
        if (cancelled) return;
        setTakeawayInsight(null);
        setSupportingInsights([]);
      }
    }

    void loadInsightDelivery();
    return () => {
      cancelled = true;
    };
  }, [round, roundId]);

  // Generate review if needed
  const generateReview = useCallback(async () => {
    if (!round) return;

    setGeneratingReview(true);
    setError(null);

    try {
      const result = await generateAndStoreRoundReview(roundId, round.player_id);

      if (result.success && result.review) {
        setStoredReview(result.review);
        addToast({
          type: 'success',
          title: 'Review Generated',
          description: 'AI analysis complete for your round.',
        });
      } else {
        setError(result.error ?? 'Failed to generate review');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setGeneratingReview(false);
    }
  }, [round, roundId, addToast]);

  // Auto-generate if no review exists (only once)
  const [autoGenerateAttempted, setAutoGenerateAttempted] = useState(false);
  useEffect(() => {
    if (!loadingRound && !loadingStoredReview && round && !storedReview && !generatingReview && !autoGenerateAttempted) {
      setAutoGenerateAttempted(true);
      generateReview();
    }
  }, [loadingRound, loadingStoredReview, round, storedReview, generatingReview, generateReview, autoGenerateAttempted]);

  // Mark the review as viewed the first time this page loads a stored review
  // for the current session. `markReviewAsViewed` is itself idempotent (it
  // short-circuits when patterns_detected.player_viewed_at is already set),
  // so this is safe to invoke on every mount — but we also keep a local flag
  // to avoid duplicate round-trips when the effect's deps change.
  const [viewedMarked, setViewedMarked] = useState(false);
  useEffect(() => {
    if (!storedReview?.id) return;
    if (viewedMarked) return;
    setViewedMarked(true);
    void markReviewAsViewed(storedReview.id).catch(() => {
      // Errors are already logged server-side via logServerError; swallow
      // here so we never disrupt the player's view of the review.
    });
  }, [storedReview?.id, viewedMarked]);

  // Handle share with coach
  const handleShare = async () => {
    if (!storedReview) return;

    try {
      const result = await shareRoundReviewWithCoach(storedReview.id);

      if (result.success) {
        setStoredReview(prev => prev ? { ...prev, shared_with_coach: true, shared_at: new Date().toISOString() } : null);
        addToast({
          type: 'success',
          title: 'Shared with Coach',
          description: 'Your coach can now view this round review.',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Share Failed',
          description: result.error ?? 'Could not share review.',
        });
      }
    } catch {
      addToast({
        type: 'error',
        title: 'Share Failed',
        description: 'An unexpected error occurred.',
      });
    }
  };

  // Loading state — gated on the page's OWN states only. The vestigial
  // `useRoundReviewV2` hook states (v1Loading / v1Generating) were removed
  // from this umbrella on 2026-05-30: the page no longer renders the V1
  // review object (IA audit 2026-05-28 trimmed the surface to V2-only), and
  // that hook performs a REDUNDANT second auth + status + golf_round_reviews
  // round-trip whose slowness/transient generating state would hold the whole
  // page on the skeleton even when `storedReview` is already in hand. The
  // page now renders its body from loadingRound / loadingStoredReview /
  // generatingReview (its own generation). `v1Generating` is still consumed
  // by `isGenerating` below to drive the Refresh-button spinner + the
  // "Running CoachHelm analysis..." copy when the hook generates in the
  // background, so it remains referenced; `v1Loading` is intentionally unused.
  const isLoading = loadingRound || loadingStoredReview || generatingReview;
  const isGenerating = generatingReview || v1Generating;

  if (isLoading) {
    return (
      <m.div
        variants={containerVariants}
        initial={prefersReducedMotion ? false : "hidden"}
        animate="visible"
        className="pb-[calc(var(--golf-mobile-bottom-nav-offset)+1rem)] lg:pb-6"
      >
        {/* Header stays mounted during generation so the Refresh button is
            always reachable. The icon spins while a generation is in flight. */}
        <MobileNavHeader
          title="Round Review"
          subtitle={round?.course_name ?? undefined}
          backHref="/golf/dashboard/rounds"
          backLabel="Rounds"
          breadcrumb={
            <Breadcrumb
              items={[
                { label: 'Dashboard', href: '/golf/dashboard' },
                { label: 'Rounds', href: '/golf/dashboard/rounds' },
                { label: round?.course_name ?? 'Round', href: `/golf/dashboard/rounds/${roundId}` },
                { label: 'Review' },
              ]}
            />
          }
        >
          {isV2Enabled && (
            <span className="flex items-center gap-1.5 text-xs px-2 py-1 bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 rounded-full font-medium">
              <IconSparkles size={12} />
              CoachHelm AI
            </span>
          )}
          <Button variant="ghost"
            onClick={() => generateReview()}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-medium text-warm-600 hover:text-warm-900 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
          >
            <IconRefresh size={14} className={isGenerating ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </MobileNavHeader>

        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="space-y-6">
            <div className="rounded-2xl border border-warm-100 overflow-hidden">
              <div className="bg-primary-50/55 px-6 pt-6 pb-5">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-warm-200/60 skeleton-shimmer" />
                  <div className="h-5 w-32 bg-warm-200/40 rounded-lg skeleton-shimmer" />
                  <div className="h-10 w-20 bg-warm-200/40 rounded-lg skeleton-shimmer" />
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="text-center p-3 rounded-xl bg-warm-50/80 border border-warm-100">
                      <div className="h-6 w-10 bg-warm-200/60 rounded mx-auto mb-1 skeleton-shimmer" />
                      <div className="h-3 w-12 bg-warm-100 rounded mx-auto skeleton-shimmer" />
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <div className="h-4 w-24 bg-warm-100 rounded skeleton-shimmer" />
                  <div className="h-16 bg-warm-50 rounded-xl border border-warm-100 skeleton-shimmer" />
                  <div className="h-16 bg-warm-50 rounded-xl border border-warm-100 skeleton-shimmer" />
                </div>
              </div>
            </div>
            <p className="text-sm text-warm-500 font-medium text-center">
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <IconSparkles size={16} className="text-purple-500" />
                  {isV2Enabled ? 'Running CoachHelm analysis...' : 'Analyzing your round...'}
                </span>
              ) : (
                'Loading review...'
              )}
            </p>
          </div>
        </div>
      </m.div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="primary"
            onClick={() => generateReview()}
            className="px-5 py-3 min-h-[48px] bg-primary-600 text-white rounded-xl hover:bg-primary-700 active:scale-95 transition-all flex items-center gap-2 mx-auto font-medium"
          >
            <IconRefresh size={16} />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // No data state — show the shared EmptyState primitive with a back-to-rounds
  // recovery action instead of the bare "Round not found" paragraph (IA audit
  // 2026-05-28 flagged this as a states-fix orphan).
  if (!round) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <EmptyState
          variant="compact"
          icon={<IconGolf size={32} />}
          title="Round not found"
          description="This round may have been deleted, or you may not have access to it. Head back to your rounds list to try another."
          action={{
            label: 'Back to Rounds',
            href: '/golf/dashboard/rounds',
          }}
        />
      </div>
    );
  }

  // Calculate stats for comparison
  const girPct = round.total_gir !== null && round.total_gir_possible
    ? Math.round((round.total_gir / round.total_gir_possible) * 100)
    : null;
  const firPct = round.total_fairways_hit !== null && round.total_fairways
    ? Math.round((round.total_fairways_hit / round.total_fairways) * 100)
    : null;
  // avgPutts is an 18-hole figure, so normalize the round's raw putt count to
  // an 18-hole equivalent (×18/holes_played) before comparing — otherwise a
  // 9-hole round reads "16 putts vs a 32-putt average". GIR/FIR are already
  // scale-invariant percentages; score is never compared against an average
  // on this page (only score-to-par framing), so putts is the lone count stat.
  const holesPlayed = round.holes_played ?? 18;
  const putts18 = round.total_putts !== null && holesPlayed > 0
    ? Math.round(round.total_putts * (18 / holesPlayed))
    : round.total_putts;
  // Note: scramble percentage not available at round level - would need hole-level data
  const scramblePct = null;

  // Round-level score-to-par used for the RoundTakeaway framing line. Prefer
  // the server-stored `score_to_par`; fall back to (total_score - sum(par))
  // when the round is missing the cached column.
  const roundScoreToPar = (() => {
    if (round.score_to_par !== null && round.score_to_par !== undefined) return round.score_to_par;
    if (round.total_score === null || round.total_score === undefined) return null;
    const parSum = (round.holes ?? []).reduce((sum, h) => sum + (h.par ?? 0), 0);
    if (parSum === 0) return null;
    return round.total_score - parSum;
  })();

  return (
    <m.div
      variants={containerVariants}
      initial={prefersReducedMotion ? false : "hidden"}
      animate="visible"
      className="pb-[calc(var(--golf-mobile-bottom-nav-offset)+1rem)] lg:pb-6"
    >
      {/* Header */}
      <MobileNavHeader
        title="Round Review"
        subtitle={round.course_name ?? undefined}
        backHref="/golf/dashboard/rounds"
        backLabel="Rounds"
        breadcrumb={
          <Breadcrumb
            items={[
              { label: 'Dashboard', href: '/golf/dashboard' },
              { label: 'Rounds', href: '/golf/dashboard/rounds' },
              { label: round.course_name ?? 'Round', href: `/golf/dashboard/rounds/${roundId}` },
              { label: 'Review' },
            ]}
          />
        }
      >
        {isV2Enabled && v2Review && (
          <span className="flex items-center gap-1.5 text-xs px-2 py-1 bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 rounded-full font-medium">
            <IconSparkles size={12} />
            CoachHelm AI
          </span>
        )}
        <Button variant="ghost"
          onClick={() => generateReview()}
          disabled={isGenerating}
          className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-medium text-warm-600 hover:text-warm-900 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
        >
          <IconRefresh size={14} className={isGenerating ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </MobileNavHeader>

      <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Content — 24px rhythm (space-y-6) to match the rest of the product
          surfaces (IA audit 2026-05-28 normalized this from space-y-4). */}
      <m.div variants={itemVariants} className="space-y-6">
        {/* W30 LLM round-review prose. Renders the deterministic
            fallback on mount and swaps in Haiku-composed prose once
            the server action resolves. Failure-silent — when the
            budget gate trips or the action errors, the fallback stays
            verbatim. Mirrors HeroNarrativeCard placement (above the
            primary review surface so it reads as the editorial opener). */}
        {round && round.total_score !== null && round.score_to_par !== null && (
          <RoundReviewLlmCard
            roundId={roundId}
            fallbackText={buildRoundReviewFallback(
              round.total_score,
              roundScoreToPar,
              round.course_name,
            )}
          />
        )}

        {/* Primary Review Display - New Component */}
        {storedReview && storedReview.review_content && (
          <RoundReviewDisplay
            review={storedReview.review_content}
            courseName={round.course_name ?? undefined}
            roundDate={round.round_date}
            score={round.total_score ?? undefined}
            scoreToPar={round.score_to_par ?? undefined}
            onShare={handleShare}
            isShared={storedReview.shared_with_coach}
          />
        )}

        {/* Stats Comparison */}
        <RoundStatsComparison
          roundStats={{
            girPct,
            firPct,
            putts: putts18,
            penalties: null, // Not tracked at round level
            scramblePct,
          }}
          playerAvg={toComparisonProps(playerAvg)}
          teamAvg={toComparisonProps(teamAvg)}
        />

        {/* Where this sits vs PGA + team — REDESIGN ONLY.
            Season-level standing (NOT round values) for the metrics this round
            exercised. The standing `player_value` is the season figure the
            PGA/team markers are calibrated against; mixing a single-round value
            onto a season scale would lie. Renders only when at least one
            canonical standing row exists — otherwise the RoundStatsComparison
            above is the honest fallback (cold-start: <5 rounds / cron unrun).
            Flag-off: this whole block is byte-for-byte absent. */}
        {isRedesignEnabled() && (() => {
          const bandMetrics = ['gir_pct', 'sg_ott', 'sg_approach', 'sg_putting'] as const;
          const bars = bandMetrics
            .map((mid) => {
              const st = standing[mid];
              const cfg = getMetricRenderConfig(mid);
              if (!st || !cfg) return null; // honest-empty: no row → no bar
              return (
                <StandingBar
                  key={mid}
                  size="card"
                  metric_id={mid}
                  metric_label={cfg.display_label}
                  player_value={st.player_value}
                  team_avg={st.team_avg}
                  team_n={st.team_n}
                  team_pct={st.team_pct}
                  pga_value={st.pga_value}
                  pga_omitted={st.pga_omitted}
                  is_womens={st.is_womens}
                  direction={cfg.direction}
                  unit={cfg.unit}
                  scale={cfg.default_scale}
                />
              );
            })
            .filter((b): b is ReactElement => b !== null);
          if (bars.length === 0) return null; // band hidden entirely when no rows
          return (
            <section className={fairwayScope('space-y-3')}>
              <div>
                <h2 className="text-base font-medium text-warm-900 tracking-[-0.012em]">
                  Where this sits
                </h2>
                <p className="text-xs text-warm-500">
                  Your season standing vs PGA Tour and your team.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{bars}</div>
            </section>
          );
        })()}

        {/* HERO takeaway — one insight that matters for today.
            When V2 is enabled (and `v2Review` resolved) we let V2ReviewSummary
            compose the hero + the AI-prose block + the collapsed "See more
            analysis" disclosure so the round-review surface reads like a
            single narrative. When V2 is unavailable (engine disabled or the
            review row is still hydrating) we fall back to the standalone
            hero so the surface is never blank. The legacy V1 prose stack
            (CompletionCard / GoalImpactCard / HighlightsSection / etc.) was
            removed in the 2026-05-28 IA audit — V2 is the single source of
            truth for round-review narrative. */}
        {!(isV2Enabled && v2Review) && (
          <RoundTakeaway
            insight={takeawayInsight}
            roundScore={roundScoreToPar}
            roundId={roundId}
          />
        )}

        {/* Hole-by-hole shot path grid — data-driven (golf_shots). */}
        {round.holes && round.holes.length > 0 && (
          <HoleByHoleShotPaths roundId={roundId} holes={round.holes} />
        )}

        {/* V2 narrative — hero + AI prose + collapsed supporting insights. */}
        {isV2Enabled && v2Review && (
          <V2ReviewSummary
            review={v2Review}
            takeawayInsight={takeawayInsight}
            supportingInsights={supportingInsights}
            roundId={roundId}
            roundScore={roundScoreToPar}
          />
        )}

        {/* Promote-to-focus-area CTA. One section-level button — the bottom
            sheet lets the player edit before confirming. We prefer the
            takeaway insight (it carries category + concrete framing); fall
            back to the top "areas for improvement" entry from the stored
            review content. */}
        {(() => {
          const promoteSuggestion = derivePromoteSuggestion(
            takeawayInsight,
            storedReview,
          );
          if (!storedReview?.id || !promoteSuggestion) return null;
          return (
            <div className="rounded-2xl border border-primary-200/60 bg-primary-50/40 backdrop-blur-xl p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-warm-900">
                  Turn this into a focus area
                </p>
                <p className="text-xs text-warm-600 mt-0.5">
                  {promoteSuggestion.title}
                </p>
              </div>
              <PromoteToFocusAreaButton
                source="review"
                sourceId={storedReview.id}
                playerId={round.player_id}
                suggestedTitle={promoteSuggestion.title}
                suggestedDescription={promoteSuggestion.description}
                suggestedAreaType={promoteSuggestion.areaType}
                reviewContext={round.course_name ?? undefined}
                className="flex-shrink-0"
              />
            </div>
          );
        })()}
      </m.div>
      </div>

      {/* Bottom actions */}
      <m.div variants={itemVariants} className="fixed bottom-0 left-0 right-0 z-30 p-4 pb-[var(--golf-mobile-bottom-nav-offset)] bg-gradient-to-t from-white via-white to-transparent lg:relative lg:z-auto lg:bg-none lg:p-0 lg:pb-0 lg:mt-6">
        <div className="max-w-2xl mx-auto flex gap-3">
          <Link
            href={`/golf/dashboard/rounds/${roundId}`}
            className="flex-1 py-3 bg-warm-100 text-warm-700 rounded-xl text-center font-medium hover:bg-warm-200 transition-colors"
          >
            Round Detail
          </Link>
          <Link
            href="/golf/dashboard/stats"
            className="flex-1 py-3 bg-primary-600 text-white rounded-xl text-center font-medium hover:bg-primary-700 transition-colors"
          >
            All Stats
          </Link>
        </div>
      </m.div>
    </m.div>
  );
}

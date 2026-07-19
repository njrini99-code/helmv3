'use client';

/**
 * Round Review Page
 *
 * Displays AI-generated analysis of completed rounds using the
 * RoundReviewDisplay component with CoachHelm integration.
 */

import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { containerVariants, itemVariants } from '@/components/golf/dashboard/premium-components';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRoundReviewV2 } from '@/hooks/coachhelm/useRoundReviewV2';
import { useToast } from '@/components/ui/sonner';
import { RoundReviewDisplay } from '@/components/golf/coachhelm/RoundReviewDisplay';
import { RoundStatsComparison } from '@/components/golf/coachhelm/RoundStatsComparison';
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
import { CoachNotesSection } from './CoachNotesSection';
import {
  RoundTakeaway,
  V2ReviewSummary,
} from '@/components/golf/coachhelm/round-review';
import {
  getRoundTakeawayInsight,
  getInsightsForPlayer,
  type EvidenceInsight,
} from '@/app/golf/actions/insight-delivery';
import { IconSparkles, IconRefresh } from '@/components/icons';
import { PromoteToFocusAreaButton } from '@/components/golf/coachhelm/PromoteToFocusAreaButton';
import {
  ViewHeader as FwViewHeader,
  Button as FwButton,
  StatusPill as FwStatusPill,
  InlineNotice as FwInlineNotice,
  EmptyState as FwEmptyState,
  Skeleton as FwSkeleton,
  Surface as FwSurface,
  Eyebrow as FwEyebrow,
  SelectablePill as FwSelectablePill,
} from '@/components/fairway';
import { Flag as LucideFlag } from 'lucide-react';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';
import { useGolfUser } from '@/contexts/golf-user-context';
import { fairwayScope } from '@/lib/redesign/flag';
import { StandingBar } from '@/components/golf/coachhelm/v3/StandingBar';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { cleanCourseName } from '@/lib/golf/course-name';

// ============================================================================
// CODE-SPLIT BELOW-THE-FOLD PANELS
// ============================================================================
// This route is the heaviest First Load JS in the app (bundle scout finding
// #3). None of these three render during the initial client render anyway —
// every render path above `reviewBody` returns early while `isLoading`/`error`/
// `!round` is true, and `round` only resolves after this page's own fetch
// effects complete — so splitting them into separate chunks trims the route's
// initial JS without changing when, whether, or in what order they render.
// RoundReviewDisplay/RoundStatsComparison/RoundTakeaway/V2ReviewSummary are
// deliberately left as static imports (out of scope — see task notes).
const RoundReviewLlmCard = dynamic(
  () =>
    import('@/components/golf/coachhelm/v3/RoundReviewLlmCard').then(
      (mod) => mod.RoundReviewLlmCard,
    ),
  {
    // Shape-matches the mounted card: eyebrow + a text-body-lg/md:text-h3
    // paragraph that can wrap onto a 2nd line, inside the same surface-stone
    // shell — a single skeleton line under-reserved height for the common
    // 2-line case (CodeRabbit #797 cluster-4 finding 1).
    loading: () => (
      <div className="surface-stone rounded-3xl p-6 md:p-7 mb-5 md:mb-6 space-y-3">
        <FwSkeleton className="h-3 w-24" />
        <FwSkeleton className="h-6 w-full" />
        <FwSkeleton className="h-6 w-2/3" />
      </div>
    ),
  },
);
const HoleByHoleShotPaths = dynamic(
  () =>
    import('@/components/golf/coachhelm/round-review/HoleByHoleShotPaths').then(
      (mod) => mod.HoleByHoleShotPaths,
    ),
  {
    // Mirrors the component's OWN internal skeleton (shown while its shot
    // ledger fetch is in flight): a surface-stone header block, then a
    // surface-matte frame holding the same aspect-[140/320] card grid — not
    // a single h-40 bar, which reserved far less height than the real
    // header+grid that mounts (CodeRabbit #797 cluster-4 finding 1).
    loading: () => (
      <div>
        <div className="surface-stone rounded-3xl p-6 md:p-8 mb-4 space-y-2">
          <FwSkeleton className="h-3 w-28" />
          <FwSkeleton className="h-6 w-64 max-w-full" />
          <FwSkeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="surface-matte rounded-2xl p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 max-w-[860px] mx-auto justify-items-center">
            {Array.from({ length: 6 }).map((_, i) => (
              <FwSkeleton
                key={i}
                className="w-full max-w-[240px] aspect-[140/320] rounded-2xl"
              />
            ))}
          </div>
        </div>
      </div>
    ),
  },
);
const RoundIntelligence = dynamic(
  () =>
    import('@/components/golf/coachhelm/round-review/RoundIntelligence').then(
      (mod) => mod.RoundIntelligence,
    ),
  {
    // Panel-sized skeleton matching InstrumentPanel's bezel (eyebrow +
    // header) + opportunity-row body — was `null`, which reserved zero
    // height for a real multi-row panel (CodeRabbit #797 cluster-4 finding 1).
    loading: () => (
      <div className="rounded-card border border-border-subtle bg-surface p-6 space-y-5">
        <div className="space-y-1">
          <FwSkeleton className="h-3 w-32" />
          <FwSkeleton className="h-5 w-64 max-w-full" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <FwSkeleton className="h-3.5 w-24" />
                <FwSkeleton className="h-3.5 w-12" />
              </div>
              <FwSkeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
);

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

/** Minor words a title-cased course name keeps lowercase after the first
 *  word (mirrors the helper in FairwayCoachDashboard.tsx). */
const COURSE_NAME_MINOR_WORDS = new Set([
  'a', 'an', 'the', 'at', 'by', 'for', 'in', 'of', 'on', 'to', 'up', 'and', 'as', 'but', 'or', 'nor',
]);

/** Display-normalize a course name for every render call site on this page
 *  (#109): strips QA-suffix disambiguation parentheticals via the shared
 *  `cleanCourseName`, then title-cases a name that was entered in
 *  all-lowercase (e.g. "pine lakes" -> "Pine Lakes") so it renders
 *  consistently with every sibling course-name row elsewhere in the app.
 *  Already mixed-case words (e.g. "TPC", "No.") are left untouched — the
 *  check is per-word, so it's safe to run on already-cased strings. */
function displayCourseName(name: string | null | undefined): string {
  const cleaned = cleanCourseName(name);
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map((word, i) => {
      if (!word) return word;
      if (word !== word.toLowerCase()) return word;
      if (i > 0 && COURSE_NAME_MINOR_WORDS.has(word.toLowerCase())) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
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

  // The whole review surface (chrome, loading, error, the round-body wrapper +
  // bottom bar) renders in the Fairway design system inside `.fairway-ds` on
  // bg-canvas — exactly as the sibling Detail/Library/Recover pages do — so the
  // Detail page's "Open full review" CTA lands on a Fairway surface.

  // Layout-resolved user context (cookie-aware active team + all staffed
  // teams) — used to authorize coach access across every team they staff.
  const golfUser = useGolfUser();
  const activeTeamId = golfUser.role === 'coach' ? golfUser.teamId ?? null : null;
  const coachTeamIdsKey = (golfUser.coachTeams ?? []).map((t) => t.id).join(',');

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
  // True only when the viewer is a coach on the round's player's team (not
  // the player themselves, even a dual-role coach viewing their OWN round —
  // matches the server-side `callerRole === 'coach'` gate in
  // `annotateReviewImpl`). Drives the Coach Notes edit affordance below.
  const [isCoachViewer, setIsCoachViewer] = useState(false);
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
  // the hook still returns it, but this page's own `coach_notes` reads/writes
  // go through `storedReview` (round-review-system.ts) + `CoachNotesSection`
  // instead, not through this hook's `review.coachNotes`.
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
    // Rebuilt from the stable joined key so the effect deps stay primitive.
    const coachTeamIds = coachTeamIdsKey ? coachTeamIdsKey.split(',') : [];
    async function fetchRound() {
      setLoadingRound(true);
      setIsCoachViewer(false);
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
          // Authorize against EVERY team the coach staffs (context, cookie-aware)
          // — a program head can review rounds from any of their teams,
          // regardless of which team the toggle currently shows. Falls back to
          // the deterministic org resolver when the context has no teams.
          const candidateTeamIds = [
            ...new Set(
              [activeTeamId, ...coachTeamIds].filter((id): id is string => Boolean(id)),
            ),
          ];
          if (candidateTeamIds.length === 0) {
            const orgTeamId = await resolveCoachTeamId(supabase, coachOrgId, coachRecord?.id ?? null);
            if (orgTeamId) candidateTeamIds.push(orgTeamId);
          }
          if (candidateTeamIds.length > 0) {
            const { data: teamMemberships } = await supabase
              .from('golf_team_members')
              .select('id')
              .in('team_id', candidateTeamIds)
              .eq('player_id', roundData.player_id)
              .limit(1);
            isCoachOnTeam = (teamMemberships?.length ?? 0) > 0;
          }
        }

        if (!isOwnRound && !isCoachOnTeam) {
          setError('Round not found');
          return;
        }

        setIsCoachViewer(isCoachOnTeam);

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
  }, [roundId, supabase, activeTeamId, coachTeamIdsKey]);

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

        // Fetch season standing for the PGA/team/you band. Failure-silent
        // (the action returns `{}` on error/cold-start, so the band simply
        // won't render).
        const standingMap = await getPlayerStandingForReview(round.player_id);
        if (!cancelled) setStanding(standingMap);
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

  // Hole-jump nav (#34): the shot-reconstruction section renders one card
  // per hole and can run tens of thousands of px tall on mobile with no way
  // to skip to a specific hole. `HoleByHoleShotPaths` lays its cards out in
  // the same ascending hole-number order as this page's own `round.holes`
  // (sorted once on fetch, above), inside a grid whose per-hole cards share
  // a stable `max-w-[240px]` marker class both before AND after the shot
  // ledger loads (the loading skeleton uses the same class) — so matching on
  // it lets a 1-18 chip nav scroll straight to any hole without reaching
  // into that component's internals.
  const holeSectionRef = useRef<HTMLDivElement>(null);
  const scrollToHole = useCallback((holeNumber: number) => {
    const container = holeSectionRef.current;
    if (!container || !round?.holes) return;
    const index = round.holes.findIndex((h) => h.hole_number === holeNumber);
    if (index < 0) return;
    const cards = container.querySelectorAll<HTMLElement>('[class*="max-w-[240px]"]');
    cards[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [round?.holes]);

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

  // P216: one standardized analysis-in-progress message (no V1/V2 split copy)
  // for the redesigned surface. Reads "Analyzing your round…" while a review is
  // being generated, "Loading review…" otherwise.
  const fairwayStatusCopy = isGenerating ? 'Analyzing your round…' : 'Loading review…';

  // ── Fairway loading surface (P203/P216) ──────────────────────────────────
  if (isLoading) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto w-full max-w-2xl px-5 py-8 md:px-8 md:py-10">
          <FwViewHeader
            eyebrow="Round Review"
            title={displayCourseName(round?.course_name) || 'Round Review'}
            description="Your CoachHelm analysis for this round."
            primaryAction={
              <FwButton
                variant="secondary"
                size="sm"
                onClick={() => generateReview()}
                disabled={isGenerating}
              >
                <IconRefresh size={16} className={isGenerating ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </FwButton>
            }
          />

          <div
            role="status"
            aria-busy="true"
            aria-live="polite"
            className="mt-8 flex flex-col gap-6"
          >
            <span className="sr-only">{fairwayStatusCopy}</span>
            <div className="rounded-card border border-border-subtle bg-surface p-6">
              <div className="flex flex-col items-center gap-3">
                <FwSkeleton className="h-12 w-12 rounded-fw-md" />
                <FwSkeleton className="h-5 w-32" />
                <FwSkeleton className="h-9 w-20" />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-2 rounded-fw-md bg-surface-sunken p-3"
                  >
                    <FwSkeleton className="h-6 w-10" />
                    <FwSkeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <FwSkeleton className="h-4 w-24" />
                <FwSkeleton className="h-16 w-full rounded-fw-md" />
                <FwSkeleton className="h-16 w-full rounded-fw-md" />
              </div>
            </div>
            <p className="flex items-center justify-center gap-2 text-center font-fw-sans text-body-sm text-text-tertiary">
              {isGenerating ? (
                <FwStatusPill tone="accent" dot={false} size="sm">
                  <IconSparkles size={14} />
                  {fairwayStatusCopy}
                </FwStatusPill>
              ) : (
                fairwayStatusCopy
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Fairway error surface (P205) ─────────────────────────────────────────
  // A designed Fairway error state: InlineNotice (danger tone, text-fw-danger
  // via the tone bar) with a clear retry Button, inside the .fairway-ds scope.
  // Raw `text-red-500` + `bg-primary-600` are gone.
  if (error) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto w-full max-w-2xl px-5 py-10 md:px-8">
          <FwInlineNotice
            tone="danger"
            title="We couldn't load this review"
            action={
              <FwButton variant="secondary" size="sm" onClick={() => generateReview()}>
                <IconRefresh size={16} />
                <span>Try again</span>
              </FwButton>
            }
          >
            {error}
          </FwInlineNotice>
        </div>
      </div>
    );
  }

  // ── Fairway no-data surface (P203) ───────────────────────────────────────
  if (!round) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto w-full max-w-2xl px-5 py-12 md:px-8">
          <FwEmptyState
            variant="default"
            icon={LucideFlag}
            title="Round not found"
            description="This round may have been deleted, or you may not have access to it. Head back to your rounds list to try another."
            action={
              <FwButton variant="secondary" size="sm" asChild>
                <Link href="/golf/dashboard/rounds">Back to Rounds</Link>
              </FwButton>
            }
          />
        </div>
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

  // Round-review BODY, rendered once below inside the Fairway chrome (P203):
  // LLM card, RoundReviewDisplay, stats comparison, standing band, takeaway,
  // shot paths, V2 summary, promote CTA.
  const reviewBody = (
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
              displayCourseName(round.course_name) || null,
            )}
          />
        )}

        {/* Primary Review Display - New Component */}
        {storedReview && storedReview.review_content && (
          <RoundReviewDisplay
            review={storedReview.review_content}
            courseName={displayCourseName(round.course_name) || undefined}
            roundDate={round.round_date}
            score={round.total_score ?? undefined}
            scoreToPar={round.score_to_par ?? undefined}
            onShare={handleShare}
            isShared={storedReview.shared_with_coach}
          />
        )}

        {/* Coach notes — read-only for the player, editable only for a
            coach on this player's team. Renders nothing for a player when
            no note has been left yet (honest-empty). */}
        {storedReview?.id && (
          <CoachNotesSection
            reviewId={storedReview.id}
            initialNotes={storedReview.coach_notes ?? null}
            canEdit={isCoachViewer}
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

        {/* CoachHelm round intelligence. Surfaces this round's stroke-leak
            board (review.strokesToGain) + the per-round practice priority
            (review.coachHelm) — both computed by the engine but, until now,
            all but invisible on the review. Additive; the component itself
            returns null when neither piece has content. Page is already
            inside the `.fairway-ds` scope, so no nested scope here. */}
        {storedReview?.review_content && (
          <RoundIntelligence
            strokesToGain={storedReview.review_content.strokesToGain}
            coachHelm={storedReview.review_content.coachHelm}
          />
        )}

        {/* Where this sits vs PGA + team.
            Season-level standing (NOT round values) for the metrics this round
            exercised. The standing `player_value` is the season figure the
            PGA/team markers are calibrated against; mixing a single-round value
            onto a season scale would lie. Renders only when at least one
            canonical standing row exists — otherwise the RoundStatsComparison
            above is the honest fallback (cold-start: <5 rounds / cron unrun). */}
        {(() => {
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
          // P204: no lone `fairwayScope` island — under the redesign this whole
          // page is already wrapped in `.fairway-ds` (see the content return),
          // so a nested scope here is redundant. This band only renders when the
          // redesign is on, so the outer page scope always supplies the tokens.
          return (
            <section className="space-y-3">
              <div>
                <FwEyebrow as="h2">Where this sits</FwEyebrow>
                <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">
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

        {/* Hole-by-hole shot path grid — data-driven (golf_shots). A 1-18
            chip nav (#34) sits above the section so a player can skip
            straight to any hole instead of scrolling the whole grid. */}
        {round.holes && round.holes.length > 0 && (
          <div className="space-y-3">
            <div>
              <FwEyebrow as="h2">Jump to hole</FwEyebrow>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {round.holes.map((h) => (
                  <FwSelectablePill
                    key={h.hole_number}
                    shape="round"
                    onClick={() => scrollToHole(h.hole_number)}
                    aria-label={`Jump to hole ${h.hole_number}`}
                    className="h-8 min-w-[32px] px-0"
                  >
                    {h.hole_number}
                  </FwSelectablePill>
                ))}
              </div>
            </div>
            <div ref={holeSectionRef}>
              <HoleByHoleShotPaths roundId={roundId} holes={round.holes} />
            </div>
          </div>
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
            <FwSurface
              elevation="border"
              padding="sm"
              className="flex items-start gap-3 border-accent-200 bg-accent-50/60"
            >
              <div className="flex-1 min-w-0">
                <p className="font-fw-sans text-body-sm font-medium text-text-primary">
                  Turn this into a focus area
                </p>
                <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
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
                reviewContext={displayCourseName(round.course_name) || undefined}
                className="flex-shrink-0"
              />
            </FwSurface>
          );
        })()}
    </m.div>
  );

  // ── Fairway content surface (P203/P204/P216) ─────────────────────────────
  // The whole page renders in the Fairway design system inside `.fairway-ds` on
  // bg-canvas: a single ViewHeader (with the CoachHelm StatusPill + Refresh in
  // the action cluster — no purple-blue gradient pill), the shared body, and a
  // calm Fairway bottom action row. The standing band's lone scoped island is
  // gone (P204) — the outer scope supplies the tokens now.
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
        <m.div
          variants={containerVariants}
          initial={prefersReducedMotion ? false : 'hidden'}
          animate="visible"
          className="mx-auto w-full max-w-2xl px-5 py-8 pb-[calc(var(--golf-mobile-bottom-nav-offset)+1rem)] md:px-8 md:py-10 lg:pb-10"
        >
          <FwViewHeader
            eyebrow="Round Review"
            title={displayCourseName(round.course_name) || 'Round Review'}
            description="Your CoachHelm analysis for this round."
            meta={
              isV2Enabled && v2Review ? (
                <FwStatusPill tone="accent" dot={false} size="sm">
                  <IconSparkles size={14} />
                  CoachHelm AI
                </FwStatusPill>
              ) : undefined
            }
            primaryAction={
              <FwButton
                variant="secondary"
                size="sm"
                onClick={() => generateReview()}
                disabled={isGenerating}
              >
                <IconRefresh size={16} className={isGenerating ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </FwButton>
            }
          />

          <div className="mt-8">{reviewBody}</div>

          {/* Bottom actions — calm Fairway row (Detail / All Stats) */}
          <m.div variants={itemVariants} className="mt-8 flex gap-3">
            <FwButton variant="secondary" className="flex-1" asChild>
              <Link href={`/golf/dashboard/rounds/${roundId}`}>Round Detail</Link>
            </FwButton>
            <FwButton variant="primary" className="flex-1" asChild>
              <Link href={`/golf/dashboard/stats?player=${round.player_id}`}>All Stats</Link>
            </FwButton>
          </m.div>
        </m.div>
      </div>
    );
}

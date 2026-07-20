'use client';

/**
 * Round Review Page
 *
 * Round Review on the Spine & Stage filmstrip (Task 10): a green hero panel
 * (score + to-par, `GradeDots`, scoring mix) beside the 18-hole `Filmstrip`,
 * ONE AI narrative, strokes-lost `RailBars`, a "what to do next" block, coach
 * notes, the season standing band, and a single "Full breakdown" DrillPanel —
 * all composed by `FilmstripReview`. This page owns data-fetching + auth
 * only; see `FilmstripReview` for the presentation.
 */

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { containerVariants, itemVariants } from '@/components/golf/dashboard/premium-components';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRoundReviewV2 } from '@/hooks/coachhelm/useRoundReviewV2';
import { useToast } from '@/components/ui/sonner';
import {
  getRoundReview,
  generateAndStoreRoundReview,
  getPlayerStandingForReview,
  shareRoundReviewWithCoach,
  type RoundReviewWithRound,
} from '@/app/golf/actions/round-review-system';
import { markReviewAsViewed } from '@/app/golf/actions/round-reviews';
import { getRoundTakeawayInsight, type EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { IconSparkles, IconRefresh } from '@/components/icons';
import {
  ViewHeader as FwViewHeader,
  Button as FwButton,
  StatusPill as FwStatusPill,
  InlineNotice as FwInlineNotice,
  EmptyState as FwEmptyState,
  Skeleton as FwSkeleton,
} from '@/components/fairway';
import { Flag as LucideFlag } from 'lucide-react';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';
import { useGolfUser } from '@/contexts/golf-user-context';
import { fairwayScope } from '@/lib/redesign/flag';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { cleanCourseName } from '@/lib/golf/course-name';
import { FilmstripReview, type PromoteSuggestion } from '@/components/golf/coachhelm/round-review/FilmstripReview';
import { sanitizeNaN } from '@/components/golf/coachhelm/round-review/buildReviewViewModel';

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

  // Evidence-backed takeaway — used ONLY to pre-fill the Promote-to-Focus-Area
  // CTA (title/description/category). The takeaway is no longer rendered as
  // its own hero card (spec §3.4: ONE narrative replaces every prose surface,
  // including the old `RoundTakeaway` hero).
  const [takeawayInsight, setTakeawayInsight] = useState<EvidenceInsight | null>(null);

  // Use existing CoachHelm hook for V2 features. The hook's `review` (V1
  // object) is never rendered on this page — V2's `composedReview.body` is
  // the narrative's preferred source, with the V1 rule-based `summary` (on
  // `storedReview`) as the honest fallback. NOTE: the hook call is retained
  // (it drives V2 hydration side effects) but its `loading` return is
  // intentionally NOT destructured — the page-level `isLoading` gate no
  // longer consults it (see the umbrella below). We still pull `generating`
  // for the Refresh-button spinner state.
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

  // Fetch stored review + season standing. Resets `loadingStoredReview`
  // regardless of whether `round` resolved — previously an early
  // `if (!round) return;` left the flag stuck on its initial `true`, which
  // hung the umbrella `isLoading` boolean and the page on the "Loading
  // review..." skeleton whenever the round-fetch step bailed (e.g. error
  // path, auth rejection).
  useEffect(() => {
    if (!loadingRound && !round) {
      setLoadingStoredReview(false);
      return;
    }
    if (!round) return;
    let cancelled = false;

    async function fetchReviewAndStanding() {
      if (!round) return;
      setLoadingStoredReview(true);
      try {
        const reviewResult = await getRoundReview(roundId);
        if (!cancelled && reviewResult.success && reviewResult.review) {
          setStoredReview(reviewResult.review);
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

    fetchReviewAndStanding();
    return () => {
      cancelled = true;
    };
  }, [round, roundId, loadingRound]);

  // Fetch the evidence-backed takeaway once we know which player the round
  // belongs to — used only to pre-fill the Promote-to-Focus-Area CTA (see
  // `derivePromoteSuggestion`). Server action handles auth; this page stays a
  // 'use client' island but defers all data access to `getRoundTakeawayInsight`.
  useEffect(() => {
    if (!round) return;
    let cancelled = false;

    async function loadTakeaway() {
      if (!round) return;
      try {
        const takeaway = await getRoundTakeawayInsight(round.player_id, roundId);
        if (cancelled) return;
        setTakeawayInsight(takeaway);
      } catch {
        // Server actions already route to `logServerError`. Fall through to
        // the fallback-suggestion path — a fetch failure must never block
        // the rest of the review.
        if (cancelled) return;
        setTakeawayInsight(null);
      }
    }

    void loadTakeaway();
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

  // Round-level score-to-par used for the hero + narrative. Prefer the
  // server-stored `score_to_par`; fall back to (total_score - sum(par)) when
  // the round is missing the cached column.
  const roundScoreToPar = (() => {
    if (round.score_to_par !== null && round.score_to_par !== undefined) return round.score_to_par;
    if (round.total_score === null || round.total_score === undefined) return null;
    const parSum = (round.holes ?? []).reduce((sum, h) => sum + (h.par ?? 0), 0);
    if (parSum === 0) return null;
    return round.total_score - parSum;
  })();

  const promoteSuggestion = derivePromoteSuggestion(takeawayInsight, storedReview);
  const v2Body = isV2Enabled && v2Review?.composedReview?.body ? sanitizeNaN(v2Review.composedReview.body) : null;
  const v2PracticePriority =
    isV2Enabled && v2Review?.practicePriority ? sanitizeNaN(v2Review.practicePriority) : null;

  // Round-review BODY, rendered once below inside the Fairway chrome (P203).
  const reviewBody = (
    <m.div variants={itemVariants} className="space-y-6">
      {storedReview?.review_content && round.total_score !== null && roundScoreToPar !== null ? (
        <FilmstripReview
          roundId={roundId}
          playerId={round.player_id}
          courseName={displayCourseName(round.course_name)}
          roundDate={round.round_date}
          totalScore={round.total_score}
          scoreToPar={roundScoreToPar}
          review={storedReview.review_content}
          reviewId={storedReview.id}
          sharedWithCoach={storedReview.shared_with_coach}
          onShare={handleShare}
          v2Body={v2Body}
          v2PracticePriority={v2PracticePriority}
          isCoachViewer={isCoachViewer}
          coachNotes={storedReview.coach_notes ?? null}
          promoteSuggestion={promoteSuggestion}
          standing={standing}
          holes={round.holes ?? []}
        />
      ) : (
        <FwEmptyState
          variant="default"
          icon={LucideFlag}
          title="No review yet"
          description="Refresh to generate CoachHelm analysis for this round."
          action={
            <FwButton variant="secondary" size="sm" onClick={() => generateReview()} disabled={isGenerating}>
              <IconRefresh size={16} className={isGenerating ? 'animate-spin' : ''} />
              <span>Generate review</span>
            </FwButton>
          }
        />
      )}
    </m.div>
  );

  // ── Fairway content surface (P203/P204/P216) ─────────────────────────────
  // The whole page renders in the Fairway design system inside `.fairway-ds` on
  // bg-canvas: a single ViewHeader (with the CoachHelm StatusPill + Refresh in
  // the action cluster — no purple-blue gradient pill), the shared body, and a
  // calm Fairway bottom action row.
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

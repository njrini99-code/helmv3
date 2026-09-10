'use client';

/**
 * Round Review Page
 *
 * Round review as a field sheet (docs/design/fairway-facelift/screens/
 * round-review.v3.md): a bare masthead, ONE stage holding the `RoundShape`
 * instrument beside its readouts, a three-column ledger, and the hole-by-hole
 * table — all composed by `RoundReviewFieldSheet`. This page owns
 * data-fetching + auth only; see that component for the presentation, and
 * `FullBreakdownPanel` for everything the four regions do not carry.
 */

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRoundReviewV2 } from '@/hooks/coachhelm/useRoundReviewV2';
import { useToast } from '@/components/ui/sonner';
import {
  getRoundReview,
  generateAndStoreRoundReview,
  getPlayerStandingForReview,
  getRoundReviewTrend,
  getStatAverages,
  shareRoundReviewWithCoach,
  type ComparisonAverages,
  type RoundReviewWithRound,
  type RoundReviewTrendRow,
} from '@/app/golf/actions/round-review-system';
import { markReviewAsViewed } from '@/app/golf/actions/round-reviews';
import { getRoundTakeawayInsight, type EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { getPlayerDisplayName, getDetailedStats } from '@/app/golf/actions/stats-data';
import { RoundStatsPanel } from '@/components/golf/coachhelm/round-review/RoundStatsPanel';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { IconRefresh } from '@/components/icons';
import {
  Button as FwButton,
  InlineNotice as FwInlineNotice,
  EmptyState as FwEmptyState,
  Skeleton as FwSkeleton,
  Sheet as FwSheet,
} from '@/components/fairway';
import { Flag as LucideFlag } from 'lucide-react';
import { regimeHeadline } from '@/lib/coachhelm/v3/insights/round-regime';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';
import { useGolfUser } from '@/contexts/golf-user-context';
import { fairwayScope } from '@/lib/redesign/flag';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { cleanCourseName } from '@/lib/golf/course-name';
import {
  RoundReviewFieldSheet,
  type PromoteSuggestion,
} from '@/components/golf/coachhelm/round-review/RoundReviewFieldSheet';
import { FullBreakdownPanel } from '@/components/golf/coachhelm/round-review/FullBreakdownPanel';
import {
  sanitizeNaN,
  buildRoundTypeLabel,
} from '@/components/golf/coachhelm/round-review/buildReviewViewModel';

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
  // Round-level Strokes Gained cache (Wave D — RoundSGSummary headline).
  // Already selected by the `select('*')` below; declared here only so this
  // page's TS type reflects the columns it now threads through to
  // `FilmstripReview` -> `RoundSGSummary`.
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
  // R0 header's second `StatusPill` (round-review.v2.md). Already selected
  // by the `select('*')` below (values `practice|tournament|qualifier`),
  // just previously undeclared here.
  round_type: string | null;
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
  // Reviewed player's display name — fetched ONLY for a coach viewer, so the
  // "Where this sits" StandingBar band can read the player's name instead of
  // "You" (FIX: StandingBar Card previously hardcoded "You" for every
  // viewer). Mirrors FairwayPlayerStats.tsx's identical viewedPlayerName
  // pattern for a coach drilling into a teammate's stats.
  const [viewedPlayerName, setViewedPlayerName] = useState<string | null>(null);
  // Full per-round stat breakdown. `getDetailedStats` has always accepted a
  // roundId and honours it in every branch; nothing here was calling it with a
  // real one, which is why Round Review showed a fraction of what the coach
  // could see on the player's career page. Loaded separately from the review
  // narrative so a stats failure never blanks the review, and vice versa.
  const [roundStats, setRoundStats] = useState<GolfStats | null>(null);
  const [loadingRoundStats, setLoadingRoundStats] = useState(true);
  const [roundStatsError, setRoundStatsError] = useState(false);
  // True while the season-standing fetch is in flight — split out from
  // `loadingStoredReview` (AUDIT perf row 15) so the review's own loading
  // flag clears the moment `getRoundReview` resolves instead of waiting on
  // this separate, independently-slow read. `FilmstripReview`'s "Where this
  // sits" band renders its own inline pending/absent state off this flag.
  const [loadingStanding, setLoadingStanding] = useState(true);
  // R3, Season trajectory (round-review.v2.md) — the player's last ~12
  // completed rounds' score-to-par, for the ONE new instrument that survives
  // a scorecard-only round (it reads OTHER rounds, never this one's holes or
  // SG). Own effect, own loading flag, deliberately decoupled from every
  // other fetch on this page (the exact AUDIT perf row 15 mistake this page
  // already paid down once for the standing fetch).
  const [trendRounds, setTrendRounds] = useState<RoundReviewTrendRow[]>([]);
  const [loadingTrend, setLoadingTrend] = useState(true);
  // The player's own recent averages (`getStatAverages` — their last 20
  // completed rounds), the ONLY honest basis for the stage readouts' deltas:
  // the trend rows above carry `score_to_par` alone, so putts, greens and
  // fairways have no season comparison in them. `null` until this resolves,
  // and `null` forever on a failure — every readout then renders its number
  // with no delta rather than a fabricated one. Own effect, own flag, never
  // folded into the page's umbrella loading state (AUDIT perf row 15).
  const [playerAverages, setPlayerAverages] = useState<ComparisonAverages | null>(null);
  // R7, Full breakdown — opens `RoundStatsPanel`/`RoundStatReport` in a
  // Sheet instead of always resting inline at the page's end.
  const [fullBreakdownOpen, setFullBreakdownOpen] = useState(false);
  const [loadingRound, setLoadingRound] = useState(true);
  const [loadingStoredReview, setLoadingStoredReview] = useState(true);
  const [generatingReview, setGeneratingReview] = useState(false);
  // Page-level failures only (auth, round-fetch, "not found") — renders the
  // full-page error surface below. A review-GENERATION failure is a
  // different, recoverable thing (the round loaded fine; only the AI call
  // failed) and must never trip this — see `generationError`.
  const [error, setError] = useState<string | null>(null);
  // Review-generation failure — rendered INLINE in the review body (with its
  // own retry) so a scorecard-only round whose auto-generate call fails
  // still shows the page shell + header, not the whole-page error surface
  // (REVIEW.md: "We couldn't load this review · An unexpected error
  // occurred" on a scorecard-only round — that message was this state
  // wrongly routed through the page-level `error`).
  const [generationError, setGenerationError] = useState<string | null>(null);

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

  // Fetch the reviewed player's display name — ONLY for a coach viewer (a
  // player never needs their own name; StandingBar's 'self' viewer_context
  // default already reads "You", and the header identity line below reads
  // the logged-in player's own name straight off `golfUser.name` instead —
  // no need to round-trip for a name the viewer already carries in context).
  // `getPlayerDisplayName` re-verifies access itself (verifyPlayerAccess),
  // consistent with every other coach-viewing-a-teammate surface.
  useEffect(() => {
    if (!isCoachViewer || !round?.player_id) {
      setViewedPlayerName(null);
      return;
    }
    let cancelled = false;
    getPlayerDisplayName(round.player_id)
      .then((name) => {
        if (!cancelled) setViewedPlayerName(name);
      })
      .catch(() => {
        if (!cancelled) setViewedPlayerName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isCoachViewer, round?.player_id]);

  /**
   * Full per-round stat breakdown, scoped to THIS round.
   *
   * Deliberately its own effect and its own error flag rather than folded into
   * the review fetch: the narrative and the numbers fail independently, and a
   * stats outage must not blank a review that loaded fine. `null` from the
   * action means the read failed; an empty stat object means the round has no
   * logged shots, which is a different thing the panel says differently.
   */
  const loadRoundStats = useCallback(
    async (playerId: string, id: string) => {
      setLoadingRoundStats(true);
      setRoundStatsError(false);
      try {
        const s = await getDetailedStats(playerId, id);
        setRoundStats(s ?? null);
        setRoundStatsError(!s);
      } catch {
        setRoundStats(null);
        setRoundStatsError(true);
      } finally {
        setLoadingRoundStats(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!round?.player_id) return;
    void loadRoundStats(round.player_id, roundId);
  }, [round?.player_id, roundId, loadRoundStats]);

  // Fetch the stored review. Resets `loadingStoredReview` regardless of
  // whether `round` resolved — previously an early `if (!round) return;`
  // left the flag stuck on its initial `true`, which hung the umbrella
  // `isLoading` boolean and the page on the "Loading review..." skeleton
  // whenever the round-fetch step bailed (e.g. error path, auth rejection).
  //
  // AUDIT perf row 15: this used to also `await getPlayerStandingForReview`
  // in the SAME try block before clearing the flag, so the review sat behind
  // a second, independently-slow read even though nothing it renders depends
  // on the standing. Season standing is now fetched by its own effect below
  // with its own loading flag — this effect clears as soon as the review
  // itself resolves.
  useEffect(() => {
    if (!loadingRound && !round) {
      setLoadingStoredReview(false);
      return;
    }
    if (!round) return;
    let cancelled = false;

    async function fetchReview() {
      setLoadingStoredReview(true);
      try {
        const reviewResult = await getRoundReview(roundId);
        if (!cancelled && reviewResult.success && reviewResult.review) {
          setStoredReview(reviewResult.review);
        }
      } catch {
        // Silently ignore fetch errors — a null `storedReview` routes to the
        // auto-generate effect below, which surfaces its own inline state.
      } finally {
        if (!cancelled) setLoadingStoredReview(false);
      }
    }

    fetchReview();
    return () => {
      cancelled = true;
    };
  }, [round, roundId, loadingRound]);

  // Fetch season standing (the PGA/team/you "Where this sits" band) — its
  // own effect and its own `loadingStanding` flag, deliberately decoupled
  // from the review fetch above (AUDIT perf row 15). `FilmstripReview`
  // renders its own inline pending state while this is in flight and an
  // inline absent state if it resolves empty, rather than blocking the
  // review narrative on a read nothing else on the page depends on.
  useEffect(() => {
    if (!round?.player_id) {
      setLoadingStanding(false);
      return;
    }
    let cancelled = false;
    setLoadingStanding(true);

    getPlayerStandingForReview(round.player_id)
      .then((standingMap) => {
        if (!cancelled) setStanding(standingMap);
      })
      .catch(() => {
        // getPlayerStandingForReview already resolves `{}` on a handled
        // failure/cold-start; an unexpected throw just leaves `standing` at
        // its prior value — the band's own absent state covers it either way.
      })
      .finally(() => {
        if (!cancelled) setLoadingStanding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [round?.player_id]);

  // Fetch the season-trajectory rows (R3) — its own effect and its own
  // `loadingTrend` flag, deliberately decoupled from every other fetch on
  // this page (AUDIT perf row 15, same reasoning as the standing fetch just
  // above). This is the one new instrument that renders fully regardless of
  // whether THIS round has holes or computed Strokes Gained, because it
  // reads the player's OTHER rounds — it must never end up gated behind a
  // slower, unrelated read.
  useEffect(() => {
    if (!round?.player_id) {
      setLoadingTrend(false);
      return;
    }
    let cancelled = false;
    setLoadingTrend(true);

    getRoundReviewTrend(round.player_id, roundId)
      .then((rows) => {
        if (!cancelled) setTrendRounds(rows);
      })
      .catch(() => {
        // getRoundReviewTrend already resolves `[]` on a handled failure/
        // denial; an unexpected throw just leaves `trendRounds` at its prior
        // value — `buildRoundTrendSeries`'s own round-count floor covers it.
      })
      .finally(() => {
        if (!cancelled) setLoadingTrend(false);
      });

    return () => {
      cancelled = true;
    };
  }, [round?.player_id, roundId]);

  // Fetch the player's own recent averages for the stage readouts' deltas.
  // Its own effect and its own absence handling, deliberately decoupled from
  // every other fetch on this page: a slow or failed comparison read must
  // drop the delta captions and nothing else.
  useEffect(() => {
    if (!round?.player_id) {
      setPlayerAverages(null);
      return;
    }
    let cancelled = false;
    getStatAverages(round.player_id)
      .then((result) => {
        if (cancelled) return;
        setPlayerAverages(result.success && result.playerAvg ? result.playerAvg : null);
      })
      .catch(() => {
        if (!cancelled) setPlayerAverages(null);
      });
    return () => {
      cancelled = true;
    };
  }, [round?.player_id]);

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

  // Generate review if needed. Failures set `generationError` — rendered
  // INLINE in the review body with its own retry — never the page-level
  // `error` (that surface replaces the ENTIRE page, including the header;
  // a failed AI generation on an otherwise-fine round shouldn't do that).
  const generateReview = useCallback(async () => {
    if (!round) return;

    setGeneratingReview(true);
    setGenerationError(null);

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
        setGenerationError(result.error ?? 'Failed to generate review');
      }
    } catch {
      setGenerationError('An unexpected error occurred');
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

  // Masthead identity — the v3 masthead's title is the reviewed PLAYER's
  // name (round-review.v3.md); the course and date ride the eyebrow row
  // above it. A coach viewer reads the reviewed player's name
  // (`viewedPlayerName`, fetched above); a player viewing their own round
  // reads it straight off their own context, with no extra round trip.
  const headerPlayerName = isCoachViewer ? viewedPlayerName : golfUser.name;
  const displayedCourse = round ? displayCourseName(round.course_name) : '';

  // Loading state — gated on the page's OWN states only, and no longer on
  // `generatingReview` (AUDIT perf row 15's second half): auto-generation now
  // renders its own inline state inside the review body once the page shell
  // is up, rather than holding the WHOLE page under this generic skeleton for
  // however long the LLM call takes. `v1Generating` is still consumed by
  // `isGenerating` below to drive the "Analyzing your round…" copy when the
  // hook generates in the background, so it remains referenced.
  const isLoading = loadingRound || loadingStoredReview;
  const isGenerating = generatingReview || v1Generating;
  const fairwayStatusCopy = isGenerating ? 'Analyzing your round…' : 'Loading review…';

  const PAGE_SHELL = 'mx-auto w-full max-w-[1200px] px-5 pt-6 pb-[calc(var(--golf-mobile-bottom-nav-offset)+1rem)] md:px-8 md:pt-8 lg:pb-16';

  // ── Fairway loading surface ──────────────────────────────────────────────
  // The masthead's own shape, bare on the canvas, then the stage's shape —
  // never a card skeleton for a page that has no cards.
  if (isLoading) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className={PAGE_SHELL}>
          <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
            <span className="sr-only">{fairwayStatusCopy}</span>
            <FwSkeleton className="h-3 w-48" />
            <FwSkeleton className="h-10 w-64" />
            <FwSkeleton className="h-5 w-full max-w-[48ch]" />
            <FwSkeleton className="h-5 w-full max-w-[36ch]" />
            <div className="mt-7 rounded-card border border-border-subtle bg-surface p-5 md:p-6">
              <FwSkeleton className="h-4 w-40" />
              <FwSkeleton className="mt-4 h-16 w-full" />
              <FwSkeleton className="mt-3 h-3 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Fairway error surface (P205) ─────────────────────────────────────────
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

  // Round-level score-to-par used for the masthead + verdict. Prefer the
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
  const roundTypeLabel = buildRoundTypeLabel(round.round_type);

  // Whole-round Strokes Gained truly not computed — every one of the five
  // cached columns is null/absent, not just some. A round with EVEN ONE
  // category computed still counts as computed; this only catches the
  // truly-uncomputed case, which the "Against the field" ledger column
  // states in one honest line.
  const hasAnySG = [
    round.strokes_gained_total,
    round.strokes_gained_tee,
    round.strokes_gained_approach,
    round.strokes_gained_around_green,
    round.strokes_gained_putting,
  ].some((v) => typeof v === 'number' && Number.isFinite(v));

  // Women's-team flag for the Full breakdown's SG caption — read off
  // whichever season-standing SG metric happens to be populated (they are all
  // resolved from the SAME player-cohort lookup, so any of the three agrees).
  const isWomens = Boolean(
    standing.sg_ott?.is_womens ?? standing.sg_approach?.is_womens ?? standing.sg_putting?.is_womens,
  );

  // Whether there's a complete, renderable stored review — the guard the
  // field sheet needs beyond just "a review row exists".
  const hasRenderableReview = Boolean(
    storedReview?.review_content && round.total_score !== null && roundScoreToPar !== null,
  );

  // Which lens explains THIS round, stated before the numbers are read.
  // Measured over all 328 completed rounds with a GIR figure: putts per round
  // FALL as greens fall (33.2 -> 31.7 -> 29.8) while the score climbs from
  // +1.78 to +9.44. On the 36 rounds in the scrambling band a low putt count
  // is a CONSEQUENCE of missing greens — chip close, 1-putt for bogey — so
  // reading it as good putting is exactly backwards. Silent on the 9-11
  // transitional band (37% of rounds), where the research makes no claim.
  const lens = regimeHeadline({
    gir: round.total_gir,
    gir_total: round.total_gir_possible,
    total_putts: round.total_putts,
  });

  // ── Fairway content surface ──────────────────────────────────────────────
  // The whole page renders in the Fairway design system inside `.fairway-ds`
  // on bg-canvas. There is no ViewHeader: the v3 masthead is bare type on the
  // canvas, composed by `RoundReviewFieldSheet` with the actions on its own
  // eyebrow row.
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className={PAGE_SHELL}>
        {hasRenderableReview && storedReview ? (
          <>
            <RoundReviewFieldSheet
              roundId={roundId}
              playerId={round.player_id}
              courseName={displayedCourse}
              roundDate={round.round_date}
              playerLabel={headerPlayerName?.trim() || 'Round review'}
              roundTypeLabel={roundTypeLabel}
              totalScore={round.total_score}
              scoreToPar={roundScoreToPar}
              totalPutts={round.total_putts}
              fairwaysHit={round.total_fairways_hit}
              fairwaysPlayed={round.total_fairways}
              gir={round.total_gir}
              girPossible={round.total_gir_possible}
              review={storedReview.review_content}
              reviewId={storedReview.id}
              sharedWithCoach={storedReview.shared_with_coach}
              onShare={handleShare}
              v2Body={v2Body}
              isCoachViewer={isCoachViewer}
              coachNotes={storedReview.coach_notes ?? null}
              promoteSuggestion={promoteSuggestion}
              standing={standing}
              standingLoading={loadingStanding}
              playerName={isCoachViewer ? viewedPlayerName : null}
              averages={playerAverages}
              trendRounds={trendRounds}
              trendLoading={loadingTrend}
              hasAnySG={hasAnySG}
              onRecompute={() => generateReview()}
              recomputing={isGenerating}
              onOpenFullBreakdown={() => setFullBreakdownOpen(true)}
            />
            {lens ? (
              <div className="mt-8">
                <FwInlineNotice tone={lens.tone} title={lens.title}>
                  {lens.body}
                </FwInlineNotice>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-3">
              <p
                data-slot="masthead-eyebrow"
                className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary"
              >
                Round review
                {roundTypeLabel ? (
                  <>
                    {' '}
                    <span aria-hidden="true">·</span> {roundTypeLabel}
                  </>
                ) : null}
                {displayedCourse ? (
                  <>
                    {' '}
                    <span aria-hidden="true">·</span> {displayedCourse}
                  </>
                ) : null}
              </p>
              <h1 className="font-fw-display text-h1 text-text-primary md:text-display">
                {headerPlayerName?.trim() || 'Round review'}
              </h1>
            </header>
            {isGenerating ? (
              <div role="status" aria-busy="true" aria-live="polite">
                <FwInlineNotice tone="info" title="Analyzing your round…">
                  CoachHelm is building this round&rsquo;s analysis. This usually takes a few seconds.
                </FwInlineNotice>
              </div>
            ) : generationError ? (
              <FwInlineNotice
                tone="danger"
                title="We couldn't generate this review"
                action={
                  <FwButton variant="secondary" size="sm" onClick={() => generateReview()}>
                    <IconRefresh size={16} />
                    <span>Try again</span>
                  </FwButton>
                }
              >
                {generationError}
              </FwInlineNotice>
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
          </div>
        )}
      </div>

      {/* Full breakdown — this round's Strokes Gained rollup, the round
          breakdown instruments and the full stat report, opened from the
          masthead's overflow menu. The v3 page keeps its four regions; every
          other real instrument lives here rather than as another inline
          card. */}
      <FwSheet
        open={fullBreakdownOpen}
        onOpenChange={setFullBreakdownOpen}
        side="right"
        mobileSide="bottom"
        material="matte"
        title="Full breakdown"
      >
        <FwSheet.Body>
          <div className="flex flex-col gap-8">
            {storedReview?.review_content ? (
              <FullBreakdownPanel
                roundId={roundId}
                review={storedReview.review_content}
                holes={round.holes ?? []}
                roundStats={roundStats}
                strokesGainedTotal={round.strokes_gained_total}
                strokesGainedTee={round.strokes_gained_tee}
                strokesGainedApproach={round.strokes_gained_approach}
                strokesGainedAroundGreen={round.strokes_gained_around_green}
                strokesGainedPutting={round.strokes_gained_putting}
                hasAnySG={hasAnySG}
                isWomens={isWomens}
              />
            ) : null}
            <RoundStatsPanel
              stats={roundStats}
              loading={loadingRoundStats}
              error={roundStatsError}
              onRetry={() => {
                if (round?.player_id) void loadRoundStats(round.player_id, roundId);
              }}
            />
          </div>
        </FwSheet.Body>
      </FwSheet>
    </div>
  );
}

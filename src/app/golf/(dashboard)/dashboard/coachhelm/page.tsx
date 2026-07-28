import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getPlayerCoachHelmDashboard } from '@/app/golf/actions/insights';
import { getPlayerShotAnalytics } from '@/app/golf/actions/shot-analytics';
import { getPlayerFingerprint, type PlayerFingerprint } from '@/app/golf/actions/player-fingerprint';
import {
  getTopInsightForPlayer,
  getInsightsForPlayer,
  getThemesForPlayer,
} from '@/app/golf/actions/insight-delivery';
import type { Metadata } from 'next';
import { fairwayScope } from '@/lib/redesign/flag';
import { InlineNotice, Button, FeatureUnavailable, type FocusAreaCardData } from '@/components/fairway';
import { surfaceHref, surfaceName } from '@/lib/golf/surface-registry';
import { PlayerCoachHelmHome } from '@/components/golf/coachhelm/home/PlayerCoachHelmHome';
import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

// ── `development` drill reads — copied from my-development/page.tsx (the
// route it now absorbs via ?view=development). ──────────────────────────────
import type { AreaAutoFillStats } from '@/lib/coachhelm/focus-areas/catalog';
import {
  loadActiveGoals,
  loadPendingGoalSuggestions,
  loadRecentlyAchievedGoals,
} from '@/lib/coachhelm/v3/goals/loader';
import { evaluateAndPersistGoals, evaluateAndPersistFocusAreas } from '@/lib/golf/progress-drivers';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';
import type { GoalSuggestionView } from '@/components/fairway/pages/coachhelm/GoalsSection';
import { getPlayerCausalRelationships } from '@/app/golf/actions/causal-relationships';

// ── `profile` drill reads — copied from my-game-profile/page.tsx. ───────────
import { loadGenome } from '@/lib/coachhelm/v3/genome/loader';
import { derivePersona } from '@/lib/coachhelm/v3/genome/persona';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { normalizeForRadar } from '@/lib/coachhelm/v3/genome/normalize';

// ── `standing` drill read — copied from my-standing/page.tsx (the
// counterfactual baseline; the standing map itself is already fetched below). ─
import { loadPlayerScoringBaseline } from '@/lib/coachhelm/v3/counterfactual/baseline-loader';

export const metadata: Metadata = {
  title: 'CoachHelm | GolfHelm',
  description: 'AI-powered insights, predictions, and focus areas for your golf performance.',
};

/**
 * Error state component for displaying errors gracefully
 */
function ErrorState({ error }: { error: string }) {
  return (
    <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas px-4 py-16 md:px-6')}>
      <div className="w-full max-w-md">
        <InlineNotice
          tone="danger"
          title="Unable to Load AI Dashboard"
          action={
            <Button asChild variant="primary" size="sm">
              <Link href="/golf/dashboard/coachhelm">Try Again</Link>
            </Button>
          }
        >
          {error}
        </InlineNotice>
      </div>
    </div>
  );
}

/**
 * Not a player error state - shown when user is a coach or has no player profile
 */
function NotPlayerState() {
  return (
    <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas px-4 py-16 md:px-6')}>
      <div className="w-full max-w-md">
        <InlineNotice
          tone="info"
          title="Player Dashboard Only"
          action={
            <Button asChild variant="primary" size="sm">
              <Link href="/golf/dashboard">Go to Dashboard</Link>
            </Button>
          }
        >
          This CoachHelm dashboard is designed for players. As a coach, you can access
          player insights from the roster page.
        </InlineNotice>
      </div>
    </div>
  );
}

/**
 * Soft "still working on it" state for `TRANSIENT_FAILURE` — a retryable DB
 * hiccup (Postgres deadlock/timeout, most commonly ShotPatternMiner racing a
 * coachhelm-* cron writer on `golf_patterns_v2`; see
 * dashboard-error-classifier.ts). By the time this renders, the page has
 * already retried the dashboard fetch once server-side (see below) and it's
 * STILL failing — unlike ErrorState this is not framed as broken, since a
 * refresh a few seconds later is very likely to just work.
 */
function DashboardWarmingUpState() {
  return (
    <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas px-4 py-16 md:px-6')}>
      <div className="w-full max-w-md">
        <InlineNotice
          tone="info"
          title="Still Crunching Your Latest Rounds"
          action={
            <Button asChild variant="primary" size="sm">
              <Link href="/golf/dashboard/coachhelm">Refresh</Link>
            </Button>
          }
        >
          Your CoachHelm insights are being recalculated right now — refresh in a moment and they&apos;ll be ready.
        </InlineNotice>
      </div>
    </div>
  );
}

/**
 * CoachHelm disabled state
 */
function CoachHelmDisabledState({ reason }: { reason: string }) {
  return (
    <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas px-4 py-16 md:px-6')}>
      <div className="w-full max-w-md">
        <InlineNotice
          tone="warning"
          title="CoachHelm AI Not Available"
          action={
            <Button asChild variant="primary" size="sm">
              <Link href="/golf/dashboard">Return to Dashboard</Link>
            </Button>
          }
        >
          {reason || 'CoachHelm is currently disabled for your team. Contact your coach for more information.'}
        </InlineNotice>
      </div>
    </div>
  );
}

/** `progress_notes` ({ entries: [{ at, value, note }] }) → the card's
 *  progressHistory shape — ported verbatim from my-development/page.tsx. */
function progressHistoryOf(raw: unknown): { at: string; value: number; note?: string }[] {
  const entries = (raw as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(
      (e): e is { at: string; value: number; note?: string } =>
        Boolean(e) &&
        typeof (e as { at?: unknown }).at === 'string' &&
        typeof (e as { value?: unknown }).value === 'number',
    )
    .map((e) => ({ at: e.at, value: e.value, note: e.note }));
}

/**
 * Player CoachHelm Dashboard Page
 *
 * Server component that:
 * 1. Authenticates the user
 * 2. Fetches player record
 * 3. Fetches CoachHelm dashboard data
 * 4. Renders the client dashboard component
 */
export default async function PlayerCoachHelmPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;

  if (!player) {
    if (coach) {
      // A coach landing on the PLAYER CoachHelm dashboard has their own
      // coach-facing Brief — point them straight at it instead of an
      // interstitial that just says "the roster page". The generic
      // `NotPlayerState` stays for the genuine edge case: a coach record with
      // no resolved organization yet (mid-onboarding), where the Brief route
      // can't resolve a team either.
      //
      // This branch renders IN PLACE rather than `redirect()`-ing: a
      // conditional `redirect()` out of an RSC page is what produced React
      // #310 on this route (see stats/page.tsx for the full reasoning).
      if (coach.organization_id) {
        return (
          <FeatureUnavailable
            title="CoachHelm"
            message="This CoachHelm dashboard is the player view. Your coach-facing Brief lives in CoachHelm AI."
            actionHref={surfaceHref('brief')}
            actionLabel={`Open ${surfaceName('brief')}`}
          />
        );
      }
      return <NotPlayerState />;
    }
    return (
      <FeatureUnavailable
        title="CoachHelm"
        message="No player profile is linked to this account yet. Finish player onboarding to start building your CoachHelm profile."
        actionHref="/golf/player"
        actionLabel="Finish onboarding"
      />
    );
  }

  // Fetch CoachHelm dashboard data, shot analytics, and the new evidence-backed
  // insight feed (top + secondary) in parallel. The insight-delivery fetchers
  // are the canonical source for the hero-card layout; `getPlayerCoachHelmDashboard`
  // still provides focus areas, prediction, and recent-round metadata.
  let dashboardResult: Awaited<ReturnType<typeof getPlayerCoachHelmDashboard>>;
  let analyticsResult: Awaited<ReturnType<typeof getPlayerShotAnalytics>>;
  let topInsight: Awaited<ReturnType<typeof getTopInsightForPlayer>> = null;
  let secondaryInsights: Awaited<ReturnType<typeof getInsightsForPlayer>> = [];
  // Hierarchical THEME scaffold (flag-gated read; only consumed in the redesign
  // fork below). A failed/rejected themes fetch MUST degrade to `[]` themes and
  // NEVER error the page, so it joins the parallel fetch via a swallow-to-null
  // wrapper rather than the fail-the-page Promise.all alongside it.
  let themesRes: Awaited<ReturnType<typeof getThemesForPlayer>> | null = null;
  try {
    [dashboardResult, analyticsResult, topInsight, secondaryInsights, themesRes] =
      await Promise.all([
        getPlayerCoachHelmDashboard(player.id),
        getPlayerShotAnalytics(player.id, 30),
        getTopInsightForPlayer(player.id),
        // Pull a small buffer — the client dedupes the hero id and displays up to 5.
        getInsightsForPlayer(player.id, { limit: 6 }),
        // Swallow to null so a themes failure can never reject the page load.
        getThemesForPlayer(player.id).catch(() => null),
      ]);
  } catch (err) {
    return <ErrorState error={err instanceof Error ? err.message : 'Failed to load dashboard data'} />;
  }

  // A TRANSIENT_FAILURE (retryable DB hiccup — see dashboard-error-classifier.ts,
  // most commonly ShotPatternMiner's savePatterns racing a concurrently-running
  // coachhelm-* cron writer) is often gone a moment later. Retry ONLY the
  // dashboard fetch, once, server-side — not the whole Promise.all above, since
  // the other reads already succeeded (or degrade gracefully on their own) and
  // re-running them would just waste time.
  if (!dashboardResult.success && dashboardResult.errorCode === 'TRANSIENT_FAILURE') {
    dashboardResult = await getPlayerCoachHelmDashboard(player.id);
  }

  // Fetch additional V3 data (optional — new components). Expected empty-state
  // codes (see src/lib/view-state/expected-empty-states.ts) are preserved so
  // the client empty surfaces can render the registry's copy for the ACTUAL
  // reason data is absent, instead of a generic "warming up" line.
  let profileData = null;
  let trendData = null;
  let shotData = null;
  const v3EmptyCodes: { profile?: string | null; trend?: string | null; shots?: string | null } = {};
  try {
    const { getPlayerProfile, getPlayerTrendAnalysis, getPlayerShotContext } = await import('@/app/golf/actions/coachhelm-data');
    const [profileResult, trendResult, shotResult] = await Promise.all([
      getPlayerProfile(player.id),
      getPlayerTrendAnalysis(player.id),
      getPlayerShotContext(player.id),
    ]);
    profileData = profileResult.success ? profileResult.data : null;
    trendData = trendResult.success ? trendResult.data : null;
    shotData = shotResult.success ? shotResult.data : null;
    v3EmptyCodes.profile = profileResult.success ? null : profileResult.code ?? null;
    v3EmptyCodes.trend = trendResult.success ? null : trendResult.code ?? null;
    v3EmptyCodes.shots = shotResult.success ? null : shotResult.code ?? null;
  } catch { /* V3 actions not yet available — degrade gracefully */ }

  // Handle CoachHelm disabled or other errors
  if (!dashboardResult.success) {
    const error = dashboardResult.error || 'Failed to load AI dashboard';

    // Check if CoachHelm is disabled using explicit error code (more reliable than string matching)
    if (dashboardResult.errorCode === 'COACHHELM_DISABLED') {
      return <CoachHelmDisabledState reason={error} />;
    }

    // Still transient after the one server-side retry above — render the
    // soft "come back in a moment" state instead of the hard dead-end error.
    if (dashboardResult.errorCode === 'TRANSIENT_FAILURE') {
      return <DashboardWarmingUpState />;
    }

    return <ErrorState error={error} />;
  }

  if (!dashboardResult.data) {
    return <ErrorState error="No dashboard data available" />;
  }

  // Standing snapshots (you vs team vs PGA). Convert the Map to a plain Record
  // so it serializes across the server→client boundary.
  const standingMap = await loadPlayerStandingMap(player.id);
  const standingByMetric = Object.fromEntries(standingMap) as Record<string, PlayerStanding>;
  // Hierarchical theme scaffold — degrades to `[]` on a failed/absent fetch.
  const themes = themesRes?.data?.themes ?? [];

  // ── `?view=development` reads — copied verbatim from my-development/page.tsx
  // (the drill's own DrillPanel now hosts this content; the fetch shape is
  // unchanged). Best-effort: a failure here degrades to an honest loadError
  // flag inside the drill rather than failing the whole CoachHelm home. ──────
  const supabase = await createClient();
  let developmentActiveAreas: FocusAreaCardData[] = [];
  let developmentCompletedAreas: FocusAreaCardData[] = [];
  let developmentProposedAreas: FocusAreaCardData[] = [];
  let developmentPlayerStats: AreaAutoFillStats = {
    rounds_played: 0,
    avg_score: null,
    avg_putts: null,
    fairway_pct: null,
    gir_pct: null,
  };
  let developmentLoadError = false;
  let goals: FairwayGoalCardData[] = [];
  let achievedGoals: FairwayGoalCardData[] = [];
  let suggestions: GoalSuggestionView[] = [];
  let causalRelationships: Awaited<ReturnType<typeof getPlayerCausalRelationships>> = [];
  try {
    // Recompute each active goal's + focus area's observed snapshot BEFORE
    // reading golf_player_focus_areas below — best-effort, mirrors the goals
    // sequencing (loadActiveGoals runs after evaluateAndPersistGoals too).
    // Reading the focus-area row BEFORE this evaluate call was the bug: a
    // player opening Development right after logging a round saw the
    // pre-round `current_value` because evaluateAndPersistFocusAreas hadn't
    // written the fresh windowed value yet.
    try {
      await Promise.all([evaluateAndPersistGoals(player.id), evaluateAndPersistFocusAreas(player.id)]);
    } catch { /* progress refresh is best-effort */ }

    const { data: focusAreas, error: focusAreasError } = await supabase
      .from('golf_player_focus_areas')
      .select(
        `id, area_type, title, description, status, target_metric, current_value,
         target_value, target_kind, target_date, target_rounds, started_at,
         completed_at, created_at, from_review_id, from_insight_id,
         review_context, progress_notes`,
      )
      .eq('player_id', player.id)
      .order('created_at', { ascending: false });
    developmentLoadError = Boolean(focusAreasError);

    const reviewIds = Array.from(
      new Set((focusAreas || []).map((fa) => fa.from_review_id).filter((id): id is string => Boolean(id))),
    );
    const roundIdByReviewId: Record<string, string> = {};
    if (reviewIds.length > 0) {
      const { data: reviewRows } = await supabase
        .from('golf_round_reviews')
        .select('id, round_id')
        .in('id', reviewIds);
      for (const row of reviewRows || []) {
        if (row.round_id) roundIdByReviewId[row.id] = row.round_id;
      }
    }

    const focusAreasWithHistory = (focusAreas || []).map((fa) => ({
      ...fa,
      progressHistory: progressHistoryOf(fa.progress_notes),
      from_review_round_id: fa.from_review_id ? roundIdByReviewId[fa.from_review_id] ?? null : null,
    }));

    developmentActiveAreas = focusAreasWithHistory.filter(
      (fa) => fa.status === 'active' || fa.status === 'in_progress' || fa.status === 'paused',
    ) as unknown as FocusAreaCardData[];
    developmentCompletedAreas = focusAreasWithHistory.filter((fa) => fa.status === 'completed') as unknown as FocusAreaCardData[];
    developmentProposedAreas = focusAreasWithHistory.filter((fa) => fa.status === 'proposed') as unknown as FocusAreaCardData[];

    const [activeGoals, achievedGoalsRes, suggestionsRes, causalRes, statsRow] = await Promise.all([
      loadActiveGoals(player.id),
      loadRecentlyAchievedGoals(player.id),
      loadPendingGoalSuggestions(player.id, 5),
      getPlayerCausalRelationships(player.id),
      supabase
        .from('golf_player_stats_cache')
        .select(
          'rounds_played, scoring_average, putts_per_round, driving_accuracy_percentage, gir_percentage, best_round, driving_distance_average, approach_proximity_average, scrambling_percentage, up_and_down_percentage, sand_save_percentage, one_putt_percentage, three_putt_percentage, par3_average, par4_average, par5_average',
        )
        .eq('player_id', player.id)
        .maybeSingle(),
    ]);
    const sr = statsRow.data;
    developmentPlayerStats = {
      rounds_played: sr?.rounds_played ?? 0,
      avg_score: sr?.scoring_average ?? null,
      avg_putts: sr?.putts_per_round ?? null,
      fairway_pct: sr?.driving_accuracy_percentage ?? null,
      gir_pct: sr?.gir_percentage ?? null,
      best_score: sr?.best_round ?? null,
      driving_distance: sr?.driving_distance_average ?? null,
      proximity_to_hole: sr?.approach_proximity_average ?? null,
      scrambling_pct: sr?.scrambling_percentage ?? null,
      up_and_down_pct: sr?.up_and_down_percentage ?? null,
      sand_save_pct: sr?.sand_save_percentage ?? null,
      one_putt_pct: sr?.one_putt_percentage ?? null,
      three_putt_pct: sr?.three_putt_percentage ?? null,
      par3_avg: sr?.par3_average ?? null,
      par4_avg: sr?.par4_average ?? null,
      par5_avg: sr?.par5_average ?? null,
    };
    goals = activeGoals.map((g) => ({ goal: g, standing: standingMap.get(g.metric_id) ?? null }));
    achievedGoals = achievedGoalsRes.map((g) => ({ goal: g, standing: standingMap.get(g.metric_id) ?? null }));
    suggestions = suggestionsRes.map((s) => {
      const cfg = getMetricRenderConfig(s.metric_id);
      return { suggestion: s, display_label: cfg?.display_label ?? s.metric_id, unit: cfg?.unit ?? 'count' };
    });
    causalRelationships = causalRes;
  } catch {
    developmentLoadError = true;
  }

  // ── `?view=profile` reads — copied verbatim from my-game-profile/page.tsx. ──
  let genomeAxes: { label: string; value: number }[] = [];
  let genomeDimensions: { id: string; label: string; score: number | null; qualitative: string | null }[] = [];
  let genomeStrengths: { id: string; label: string; qualitative: string | null }[] = [];
  let genomeWatchouts: { id: string; label: string; qualitative: string | null }[] = [];
  let genomeCourseProfile: string | null = null;
  let genomeRoundsBasis: number | null = null;
  try {
    const genome = await loadGenome(supabase, player.id);
    const persona = genome ? derivePersona(genome.vector) : null;
    const cells = genome
      ? GENOME_DIMENSIONS.map((dim) => {
          const r = genome.vector[dim.id];
          const norm = r ? normalizeForRadar(dim.id, r) : null;
          return {
            id: dim.id,
            label: dim.label,
            score: norm == null ? null : Math.round(norm * 100),
            qualitative: r?.label ?? null,
          };
        })
      : [];
    genomeDimensions = cells;
    genomeAxes = cells
      .filter((c): c is typeof c & { score: number } => c.score != null)
      .map((c) => ({ label: c.label, value: c.score }));
    genomeStrengths = (persona?.strengths ?? []).map((s) => ({ id: s.dim_id, label: s.label, qualitative: s.qualitative }));
    genomeWatchouts = (persona?.watchouts ?? []).map((w) => ({ id: w.dim_id, label: w.label, qualitative: w.qualitative }));
    genomeCourseProfile = persona?.course_profile ?? null;
    genomeRoundsBasis = genome?.rounds_basis ?? null;
  } catch { /* genome not yet available — the profile drill degrades honestly */ }

  // ── Player-self Game Fingerprint — same composition/data the coach's
  // `/dashboard/players/[playerId]/game` page renders, via the player-self
  // auth branch on `getPlayerFingerprint` (`verifyPlayerAccess` returns
  // `reason: 'self'` when the authenticated user IS the requested player —
  // see player-fingerprint.ts). Feeds `ProfileDrill`'s "Game Fingerprint"
  // tab. Best-effort: any failure degrades to null and `ProfileDrill` falls
  // back to its prior Genome-only content — never blocks the page.
  let fingerprint: PlayerFingerprint | null = null;
  try {
    fingerprint = await getPlayerFingerprint(player.id, supabase);
  } catch { /* fingerprint not available — ProfileDrill degrades to Genome-only */ }

  // ── `?view=standing` read — the F028 counterfactual baseline (the standing
  // map itself is already fetched above). Copied from my-standing/page.tsx. ──
  let playerBaseline: number | null = null;
  try {
    playerBaseline = await loadPlayerScoringBaseline(player.id);
  } catch { /* counterfactual line degrades honestly (suppressed) */ }

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-6 md:py-6">
        <PlayerCoachHelmHome
          data={dashboardResult.data}
          playerId={player.id}
          initialShotAnalytics={analyticsResult.success ? analyticsResult.data : null}
          profileData={profileData}
          trendData={trendData}
          shotData={shotData}
          v3EmptyCodes={v3EmptyCodes}
          topInsight={topInsight}
          secondaryInsights={secondaryInsights}
          standingByMetric={standingByMetric}
          themes={themes}
          developmentActiveAreas={developmentActiveAreas}
          developmentCompletedAreas={developmentCompletedAreas}
          developmentProposedAreas={developmentProposedAreas}
          developmentPlayerStats={developmentPlayerStats}
          developmentLoadError={developmentLoadError}
          goals={goals}
          suggestions={suggestions}
          causalRelationships={causalRelationships}
          achievedGoals={achievedGoals}
          genomeAxes={genomeAxes}
          genomeDimensions={genomeDimensions}
          genomeStrengths={genomeStrengths}
          genomeWatchouts={genomeWatchouts}
          genomeCourseProfile={genomeCourseProfile}
          genomeRoundsBasis={genomeRoundsBasis}
          fingerprint={fingerprint}
          playerBaseline={playerBaseline}
        />
      </div>
    </div>
  );
}

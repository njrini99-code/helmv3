import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getTeamCategoryInsights, getTeamOverview } from '@/app/golf/actions/team-category-insights';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { getInsightsForCoachWithMeta } from '@/app/golf/actions/insight-delivery';
import { getTeamPatterns } from '@/app/golf/actions/pattern-management';
import { getTeamPlayers } from '@/app/golf/actions/roster';
import {
  getCoachHelmOverview,
  getInsightEffectiveness,
  getPredictionPerformance,
  getPatternImpact,
} from '@/app/golf/actions/coachhelm-analytics';
import { fairwayScope } from '@/lib/redesign/flag';
import { FeatureUnavailable, type PlayersGridPlayer, type PlayersGridFocusArea, type PlayersGridStats } from '@/components/fairway';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { surfaceName } from '@/lib/golf/surface-registry';
import { CoachIntelligenceHome } from '@/components/golf/coachhelm/home/CoachIntelligenceHome';
import { resolveSignalsFilter } from '@/components/golf/coachhelm/home/buildCoachHomeViewModel';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { ExtendedPattern } from '@/app/golf/actions/pattern-management';
import { getTeamCausalRelationships, type CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
import { loadCoachIntents } from '@/lib/coachhelm/v3/intent/loader';
import type { CoachPlayerIntent } from '@/lib/coachhelm/v3/intent/types';
import { loadActiveGoalsForPlayers } from '@/lib/coachhelm/v3/goals/loader';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { loadPlayersStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { runGoalProgressForPlayers, runFocusAreaProgressForPlayers } from '@/lib/golf/progress-drivers';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: `${surfaceName('brief')} | CoachHelm`,
  description: 'AI-powered insights, patterns, predictions, and coaching intelligence for your team',
};

// The coach Brief reflects team data that PLAYERS change (logging rounds). Force
// dynamic so the route is always freshly rendered and never served from a stale
// Full Route Cache entry — the CoachIntelligenceHome stage now absorbs Signals/
// Players/Effectiveness too, all of which are similarly live/mutable.
export const dynamic = 'force-dynamic';

interface IntelligencePageProps {
  searchParams: Promise<{
    view?: string;
    filter?: string;
    // Deep-link params forwarded into the `signals` drill (mirrors the old
    // /insights route's own searchParams contract).
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
    lifecycle?: string;
    categoryChips?: string;
    category?: string;
    id?: string;
  }>;
}

/** `progress_notes` ({ entries: [{ at, value, note }] }) → the FocusAreaCard's
 *  progressHistory shape — ported verbatim from development/page.tsx. */
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

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function IntelligenceDashboardPage({ searchParams }: IntelligencePageProps) {
  const sp = await searchParams;

  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  if (!coach) {
    if (player) {
      return (
        <FeatureUnavailable
          title={surfaceName('brief')}
          message={`The ${surfaceName('brief')} aggregates team-wide signals for coaches. Your personal AI coaching surface lives on the CoachHelm dashboard.`}
          actionHref="/golf/dashboard/coachhelm"
          actionLabel="Open CoachHelm"
        />
      );
    }
    redirect('/golf/login');
  }

  const supabase = await createClient();

  // Single org→team lookup shared by every fetch below. Deterministic
  // resolution: handles orgs with >1 team.
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

  if (!teamId) {
    redirect('/golf/dashboard');
  }

  // ── Spine data — the SAME two reads FairwayBrief fetched, plus two
  // `players` drill extras (causalByPlayer, coachIntents) that only depend on
  // teamId/coach.id — already available here — so they run fully parallel
  // with the rest of this block instead of adding a serial round trip later.
  // Individually `.catch()`-degraded: `loadActiveGoalsForPlayers` and
  // `loadCoachIntents` throw on a DB error (unlike the `.success`-shaped
  // actions above), so a hiccup on either must not blank the whole Brief. ──
  const [overviewResult, categoryInsightsResult, countsRes, causalByPlayer, coachIntents] = await Promise.all([
    getTeamOverview(teamId),
    getTeamCategoryInsights(teamId),
    getAlertCounts(coach.id),
    getTeamCausalRelationships(teamId).catch(() => ({}) as Record<string, CausalRelationshipRow[]>),
    loadCoachIntents(coach.id).catch(() => new Map<string, CoachPlayerIntent>()),
  ]);
  const alertCounts = countsRes.success ? (countsRes.counts ?? null) : null;

  // ── `signals` drill reads — copied from alerts/insights/patterns/page.tsx,
  // fetching ONLY the preset the active `?filter=` needs (a filter switch is
  // a real navigation via FairwayCoachHelmSignals's own Segmented control, so
  // this route re-runs with the new filter — no wasted fetch for the other
  // two presets on every load). ─────────────────────────────────────────────
  const signalsFilter = resolveSignalsFilter(sp.filter);
  const rosterRes = await getTeamPlayers();
  const signalsPlayerNames: Record<string, string> = {};
  for (const p of rosterRes.data ?? []) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    if (name) signalsPlayerNames[p.id] = name;
  }

  let signalsInitialInsights: EvidenceInsight[] = [];
  let signalsInitialPatterns: ExtendedPattern[] = [];
  if (signalsFilter === 'patterns') {
    const patternsResult = await getTeamPatterns();
    signalsInitialPatterns = patternsResult.success ? (patternsResult.patterns ?? []) : [];
  } else if (signalsFilter === 'alerts') {
    // Mirrors alerts/page.tsx exactly — SSR-seeds the urgent/high preset so
    // the workspace paints on the first frame.
    const insightsRes = await getInsightsForCoachWithMeta(coach.id, { limit: 100, priorities: ['urgent', 'high'] });
    signalsInitialInsights = insightsRes.ok ? insightsRes.data : [];
  }
  // signalsFilter === 'insights': no SSR seed (mirrors insights/page.tsx —
  // the surface self-fetches via its own smartDefault client read).

  const signalsInitialSearchParams =
    signalsFilter === 'insights'
      ? (() => {
          // Fold a single `?category=` deep-link token into `categoryChips`,
          // exactly like the old /insights route did.
          const merged = Array.from(
            new Set(
              [...(sp.category?.split(',') ?? []), ...(sp.categoryChips?.split(',') ?? [])]
                .map((c) => c.trim())
                .filter((c) => c.length > 0),
            ),
          ).join(',');
          return { ...sp, category: merged, categoryChips: merged };
        })()
      : undefined;

  // ── `players` drill reads — a port of development/page.tsx's roster +
  // focus-area fetch. The goals/causal/silent-posture extras (goalsByPlayer,
  // playerNameById, causalByPlayer, silentPostureByPlayer) are assembled
  // further below, once playerIds/coachIntents/goalsAndStandingPromise are
  // available. ───────────────────────────────────────────────────────────
  const { data: teamMembers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');
  const activePlayerIds = (teamMembers || []).map((tm) => tm.player_id);

  const { data: rawPlayers, error: playersError } =
    activePlayerIds.length > 0
      ? await supabase
          .from('golf_players')
          .select('id, first_name, last_name, avatar_url, graduation_year, handicap, hometown, state')
          .in('id', activePlayerIds)
          .order('last_name')
      : { data: [], error: null };
  const players: PlayersGridPlayer[] = rawPlayers ?? [];
  const playerIds = players.map((p) => p.id);

  // ── `players` drill goals/standing extra — a restored port of the
  // pre-redirect development/page.tsx read (PlayersGridView.goalsByPlayer +
  // playerNameById), dropped when that route consolidated into this one.
  // Kicked off here (not awaited yet) so it runs concurrently with the
  // focus-area/stats reads below, which don't depend on it either way; only
  // awaited once needed, right before `playersLoadError`. The progress
  // refresh stays best-effort try/catch (mirrors development/page.tsx P1-07)
  // so a hiccup there falls through to last-known goals instead of failing
  // the whole page; the goals/standing reads are individually `.catch()`-
  // degraded for the same reason `loadActiveGoalsForPlayers` can throw.
  const goalsAndStandingPromise: Promise<
    [Map<string, Goal[]>, Map<string, Map<MetricId, PlayerStanding>>]
  > = (async () => {
    try {
      await Promise.all([
        runGoalProgressForPlayers(playerIds),
        runFocusAreaProgressForPlayers(playerIds),
      ]);
    } catch {
      /* progress refresh is best-effort; fall through to last-known goals */
    }
    return Promise.all([
      loadActiveGoalsForPlayers(playerIds).catch(() => new Map<string, Goal[]>()),
      loadPlayersStandingMap(playerIds).catch(() => new Map<string, Map<MetricId, PlayerStanding>>()),
    ]);
  })();

  const { data: focusAreas, error: focusAreasError } =
    playerIds.length > 0
      ? await supabase
          .from('golf_player_focus_areas')
          .select(
            `id, player_id, coach_id, area_type, title, description, status, target_metric,
             current_value, target_value, target_kind, target_date, target_rounds,
             started_at, completed_at, created_at, updated_at,
             from_review_id, from_insight_id, review_context, progress_notes`,
          )
          .in('player_id', playerIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null };

  const sourceInsightIds = Array.from(
    new Set((focusAreas || []).map((fa) => fa.from_insight_id).filter((id): id is string => Boolean(id))),
  );
  const outcomeByInsightId: Record<string, string> = {};
  if (sourceInsightIds.length > 0) {
    const { data: insightOutcomes } = await supabase
      .from('golf_coach_insights')
      .select('id, outcome_status')
      .in('id', sourceInsightIds)
      .not('outcome_status', 'is', null);
    for (const row of insightOutcomes || []) {
      if (row.outcome_status) outcomeByInsightId[row.id] = row.outcome_status;
    }
  }

  const reviewIds = Array.from(
    new Set((focusAreas || []).map((fa) => fa.from_review_id).filter((id): id is string => Boolean(id))),
  );
  const roundIdByReviewId: Record<string, string> = {};
  if (reviewIds.length > 0) {
    const { data: reviewRows } = await supabase.from('golf_round_reviews').select('id, round_id').in('id', reviewIds);
    for (const row of reviewRows || []) {
      if (row.round_id) roundIdByReviewId[row.id] = row.round_id;
    }
  }

  const focusAreasWithPlayers: PlayersGridFocusArea[] = (focusAreas || []).map((fa) => ({
    ...fa,
    player: players.find((p) => p.id === fa.player_id) || null,
    outcome_status: fa.from_insight_id ? (outcomeByInsightId[fa.from_insight_id] ?? null) : null,
    progressHistory: progressHistoryOf(fa.progress_notes),
    from_review_round_id: fa.from_review_id ? (roundIdByReviewId[fa.from_review_id] ?? null) : null,
  })) as unknown as PlayersGridFocusArea[];

  const { data: statsRows } =
    playerIds.length > 0
      ? await supabase
          .from('golf_player_stats_cache')
          .select('player_id, rounds_played, scoring_average, putts_per_round, driving_accuracy_percentage, gir_percentage, best_round')
          .in('player_id', playerIds)
      : { data: [] };
  const gridStats: Record<string, PlayersGridStats> = {};
  for (const row of statsRows || []) {
    gridStats[row.player_id] = {
      rounds_played: row.rounds_played ?? 0,
      avg_score: row.scoring_average ?? null,
      avg_putts: row.putts_per_round ?? null,
      fairway_pct: row.driving_accuracy_percentage ?? null,
      gir_pct: row.gir_percentage ?? null,
      best_score: row.best_round ?? null,
      // Trend computation (the canonical scoring-trend classifier) is
      // omitted here — Team Stats (`/stats/team`) is this surface's linked
      // full-fidelity roster view; honest null, never a fabricated trend.
      recent_trend: null,
    };
  }
  for (const pid of playerIds) {
    if (!gridStats[pid]) {
      gridStats[pid] = {
        rounds_played: 0,
        avg_score: null,
        avg_putts: null,
        fairway_pct: null,
        gir_pct: null,
        best_score: null,
        recent_trend: null,
      };
    }
  }

  const playersLoadError = playersError || focusAreasError ? 'We couldn’t load your development data. Please try again.' : null;

  // ── Assemble the goals/causal/silent-posture extras (ported verbatim from
  // development/page.tsx, adapted to this page's variable names). ─────────
  const [goalsByPlayerMap, standingByPlayer] = await goalsAndStandingPromise;
  const goalsByPlayer: Record<string, FairwayGoalCardData[]> = {};
  for (const pid of playerIds) {
    const g = goalsByPlayerMap.get(pid) ?? [];
    const sm = standingByPlayer.get(pid) ?? new Map();
    goalsByPlayer[pid] = g.map((goal) => ({ goal, standing: sm.get(goal.metric_id) ?? null }));
  }

  const playerNameById: Record<string, string> = {};
  for (const p of players) {
    playerNameById[p.id] = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
  }

  // #920 — alert_posture='silent' makes the CoachHelm confidence gate
  // infinite for that player, so the engine keeps running but never surfaces
  // an insight for them; the roster row flags it instead of reading as
  // "nothing found." `coachIntents` was fetched in the spine Promise.all above.
  const silentPostureByPlayer: Record<string, boolean> = {};
  for (const pid of playerIds) {
    if (coachIntents.get(pid)?.alert_posture === 'silent') {
      silentPostureByPlayer[pid] = true;
    }
  }

  // ── `effectiveness` drill reads — copied from analytics/coachhelm/page.tsx. ─
  const [coachHelmOverviewResult, effectivenessResult, performanceResult, patternResult] = await Promise.all([
    getCoachHelmOverview(teamId),
    getInsightEffectiveness(teamId),
    getPredictionPerformance(teamId),
    getPatternImpact(teamId),
  ]);

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
        <CoachIntelligenceHome
          overview={overviewResult}
          categoryInsights={categoryInsightsResult}
          coachId={coach.id}
          teamId={teamId}
          alertCounts={alertCounts}
          signalsFilter={signalsFilter}
          signalsInitialInsights={signalsInitialInsights}
          signalsInitialPatterns={signalsInitialPatterns}
          signalsPlayerNames={signalsPlayerNames}
          signalsInitialSearchParams={signalsInitialSearchParams}
          playersDrillProps={{
            players,
            focusAreas: focusAreasWithPlayers,
            coachId: coach.id,
            playerStats: gridStats,
            signalCount: alertCounts?.critical ?? null,
            loadError: playersLoadError,
            goalsByPlayer,
            playerNameById,
            causalByPlayer,
            silentPostureByPlayer,
            // F133 deep-link (?player=, forwarded by the /development shim):
            // validate against the roster so a stale id degrades to the
            // unscoped grid instead of a phantom selection.
            initialSelectedPlayerId:
              sp.player && players.some((p) => p.id === sp.player) ? sp.player : null,
          }}
          effectivenessDrillProps={{
            teamId,
            coachId: coach.id,
            initialOverview: coachHelmOverviewResult.success ? coachHelmOverviewResult.data : undefined,
            initialEffectiveness: effectivenessResult.success ? effectivenessResult.data : undefined,
            initialPerformance: performanceResult.success ? performanceResult.data : undefined,
            initialPatternImpact: patternResult.success ? patternResult.data : undefined,
            signalCount: alertCounts?.critical ?? null,
            initialView: 'cockpit',
            initialRange: '30d',
          }}
        />
      </div>
    </div>
  );
}

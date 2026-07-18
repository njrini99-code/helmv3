import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { fairwayScope } from '@/lib/redesign/flag';
import { PlayersGridView, FeatureUnavailable, type PlayersGridStats } from '@/components/fairway';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { loadActiveGoalsForPlayers } from '@/lib/coachhelm/v3/goals/loader';
import { runGoalProgressForPlayers, runFocusAreaProgressForPlayers } from '@/lib/golf/progress-drivers';
import { getTeamCausalRelationships } from '@/app/golf/actions/causal-relationships';
import { loadPlayersStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { samplePerPlayerRounds } from '@/app/golf/actions/team-category-insights-helpers';
import { computeScoringTrendFromRounds } from '@/lib/golf/scoring-trend';
import { loadCoachIntents } from '@/lib/coachhelm/v3/intent/loader';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';
import { surfaceName } from '@/lib/golf/surface-registry';

export const metadata: Metadata = {
  // The browser tab should match the masthead tab identity the user actually
  // clicked ('Players', the coachhelm-tab surface-registry entry) — not the
  // page-content identity ('Development Plans', the 'page' group entry for
  // the SAME href). Both entries are intentional per surface-registry.ts's
  // two-name-level design; only the <title> was still reading the wrong one (#917).
  title: `${surfaceName('players-tab')} | Helm Golf`,
  description: 'Manage player development plans and focus areas for your team.',
};

export const revalidate = 60;

export default async function DevelopmentPlansPage({
  searchParams,
}: {
  searchParams?: Promise<{ player?: string | string[] }>;
}) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  if (!coach) {
    return (
      <FeatureUnavailable
        title={surfaceName('development')}
        message={
          player
            ? 'Development Plans is designed for coaches managing the team’s focus areas. Players can view their own plan from My Development.'
            : 'No coach or player profile found. Please complete onboarding.'
        }
        actionHref={player ? '/golf/dashboard/my-development' : '/golf/dashboard'}
        actionLabel={player ? 'Open My Development' : 'Back to Dashboard'}
      />
    );
  }

  const supabase = await createClient();

  // Get team_id from organization (deterministic: handles orgs with >1 team)
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

  if (!teamId) {
    redirect('/golf/dashboard');
  }

  // Get active team member player IDs (golf_players doesn't have team_id)
  const { data: teamMembers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  const activePlayerIds = (teamMembers || []).map(tm => tm.player_id);

  // Fetch player profiles for active team members. Capture `error` so a failed
  // query surfaces an honest error state instead of a fake-empty roster (P099 —
  // a cheerful "no players" empty must never mask a load failure).
  const { data: players, error: playersError } = activePlayerIds.length > 0
    ? await supabase
        .from('golf_players')
        .select('id, first_name, last_name, avatar_url, graduation_year, handicap, hometown, state')
        .in('id', activePlayerIds)
        .order('last_name')
    : { data: [], error: null };

  const playerIds = (players || []).map(p => p.id);

  // Fetch all focus areas for team players.
  // Selects from_review_id / from_insight_id / review_context (drive the shared
  // FocusAreaCard SourceChip), and progress_notes (drives the per-area
  // Sparkline). outcome_status is NOT a column on this table — it lives on the
  // source insight (golf_coach_insights) and is joined in below by from_insight_id.
  const { data: focusAreas, error: focusAreasError } = playerIds.length > 0
    ? await supabase
        .from('golf_player_focus_areas')
        .select(`
          id,
          player_id,
          coach_id,
          area_type,
          title,
          description,
          status,
          target_metric,
          current_value,
          target_value,
          target_kind,
          target_date,
          target_rounds,
          started_at,
          completed_at,
          created_at,
          updated_at,
          from_review_id,
          from_insight_id,
          review_context,
          progress_notes
        `)
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [], error: null };

  // P099 — derive a single honest load-error message from the critical queries
  // (the roster + its focus areas). If either failed, the redesign grid shows an
  // InlineNotice danger state instead of a fake-empty "No players" roster.
  const loadError =
    playersError || focusAreasError
      ? 'We couldn’t load your development data. Please try again.'
      : null;

  // ── Outcome-mix join (B13/F019) ─────────────────────────────────────────────
  // outcome_status is recorded on the SOURCE insight (golf_coach_insights), not on
  // golf_player_focus_areas. Pull the recorded verdict per source insight so the
  // RosterHealthHeader "Did the coaching land?" mix advances. RLS already scopes
  // coach visibility to their own insights; we just key by from_insight_id.
  const sourceInsightIds = Array.from(
    new Set(
      (focusAreas || [])
        .map(fa => fa.from_insight_id)
        .filter((id): id is string => Boolean(id)),
    ),
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

  // Resolve from_review_id (golf_round_reviews.id) → round_id so the shared
  // FocusAreaCard SourceChip "From a round review" link targets the round-review
  // route, which is keyed by ROUND id (mirrors the player My Development fix).
  const reviewIds = Array.from(
    new Set(
      (focusAreas || [])
        .map(fa => fa.from_review_id)
        .filter((id): id is string => Boolean(id)),
    ),
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

  // Per-row progress history for the FocusAreaCard Sparkline. progress_notes is
  // stored as { entries: [{ at, value, note }] }; map it to the card's
  // progressHistory shape (oldest→newest). Honest-empty when absent/malformed.
  const progressHistoryOf = (
    raw: unknown,
  ): { at: string; value: number; note?: string }[] => {
    const entries = (raw as { entries?: unknown } | null)?.entries;
    if (!Array.isArray(entries)) return [];
    return entries
      .filter(
        (e): e is { at: string; value: number; note?: string } =>
          Boolean(e) &&
          typeof (e as { at?: unknown }).at === 'string' &&
          typeof (e as { value?: unknown }).value === 'number',
      )
      .map(e => ({ at: e.at, value: e.value, note: e.note }));
  };

  // Combine focus areas with player info, the joined source-insight outcome, the
  // mapped progress history (Sparkline source), and the resolved review round id.
  const focusAreasWithPlayers = (focusAreas || []).map(fa => ({
    ...fa,
    player: (players || []).find(p => p.id === fa.player_id) || null,
    outcome_status: fa.from_insight_id
      ? outcomeByInsightId[fa.from_insight_id] ?? null
      : null,
    progressHistory: progressHistoryOf(fa.progress_notes),
    from_review_round_id: fa.from_review_id
      ? roundIdByReviewId[fa.from_review_id] ?? null
      : null,
  }));

  // The warm "Players" grid surface (CoachHelmShell active='players'). The
  // per-player stat snapshot is read from golf_player_stats_cache in a single
  // query rather than re-aggregating every completed round. The shared loader
  // block above (org→team, members, players, focus-areas) is reused unchanged.
  const { data: statsRows } = playerIds.length > 0
    ? await supabase
        .from('golf_player_stats_cache')
        .select(
          // Core grid stats + the extended per-metric sources the create-focus-
          // area form reads to autofill the current value for the chosen stat
          // (driving distance, proximity, scrambling, sand saves, putt buckets,
          // par-N averages). All nullable — honest-empty when not tracked yet.
          // NOTE: trend_direction intentionally NOT selected — recent_trend is
          // now computed below via the canonical scoring-trend classifier
          // (#914), not the DB-trigger column (which disagreed with Team
          // Stats' live-computed trend for the same player/rounds).
          'player_id, rounds_played, scoring_average, putts_per_round, driving_accuracy_percentage, gir_percentage, best_round, driving_distance_average, approach_proximity_average, scrambling_percentage, up_and_down_percentage, sand_save_percentage, one_putt_percentage, three_putt_percentage, par3_average, par4_average, par5_average',
        )
        .in('player_id', playerIds)
    : { data: [] };

  // ── Canonical scoring trend (#914) ──────────────────────────────────────
  // The roster table's Trend column previously read
  // `golf_player_stats_cache.trend_direction` — a DB-trigger value with its
  // OWN window (5-vs-5) and its OWN threshold (1.0 stroke), independent of
  // the Team Stats page's live-computed trend (5-vs-5, 0.3-stroke threshold).
  // Same player, two different verdicts. Recompute here from the same raw
  // rounds + the SAME canonical `computeScoringTrendFromRounds` Team Stats
  // uses (stats/team/page.tsx), capped to each player's last 10 rounds via
  // the same per-player sampler team-category-insights.ts uses (P448/P2-17 —
  // a single global row cap starves less-active players of rounds).
  const TREND_ROUNDS_PER_PLAYER = 10;
  const trendSince = new Date();
  trendSince.setDate(trendSince.getDate() - 365);
  const trendSinceStr = trendSince.toISOString().split('T')[0];

  const { data: trendRoundsRaw } = playerIds.length > 0
    ? await fetchAllRowsResult<{
        player_id: string;
        total_score: number | null;
        holes_played: number | null;
      }>(
        (from, to) => supabase
          .from('golf_rounds')
          .select('player_id, total_score, holes_played, round_date')
          .in('player_id', playerIds)
          .eq('status', 'completed')
          .not('total_score', 'is', null)
          .gte('round_date', trendSinceStr)
          .order('round_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
        undefined,
        { table: 'golf_rounds', action: 'developmentPlansPage', feature: 'development_plans_coach', sport: 'golf' },
      )
    : { data: [] };

  const trendRoundsByPlayer = new Map<string, { total_score: number | null; holes_played: number | null }[]>();
  for (const r of samplePerPlayerRounds(trendRoundsRaw ?? [], TREND_ROUNDS_PER_PLAYER)) {
    const list = trendRoundsByPlayer.get(r.player_id) ?? [];
    list.push({ total_score: r.total_score, holes_played: r.holes_played });
    trendRoundsByPlayer.set(r.player_id, list);
  }

  const recentTrendByPlayer = new Map<string, PlayersGridStats['recent_trend']>();
  for (const pid of playerIds) {
    const trendResult = computeScoringTrendFromRounds(trendRoundsByPlayer.get(pid) ?? []);
    recentTrendByPlayer.set(pid, trendResult.hasSignal ? trendResult.trend : null);
  }

  const gridStats: Record<string, PlayersGridStats> = {};
  for (const row of statsRows || []) {
    gridStats[row.player_id] = {
      rounds_played: row.rounds_played ?? 0,
      avg_score: row.scoring_average ?? null,
      avg_putts: row.putts_per_round ?? null,
      fairway_pct: row.driving_accuracy_percentage ?? null,
      gir_pct: row.gir_percentage ?? null,
      best_score: row.best_round ?? null,
      recent_trend: recentTrendByPlayer.get(row.player_id) ?? null,
      // Extended autofill sources (friendly keys → getMetricCurrentValue).
      driving_distance: row.driving_distance_average ?? null,
      proximity_to_hole: row.approach_proximity_average ?? null,
      scrambling_pct: row.scrambling_percentage ?? null,
      up_and_down_pct: row.up_and_down_percentage ?? null,
      sand_save_pct: row.sand_save_percentage ?? null,
      one_putt_pct: row.one_putt_percentage ?? null,
      three_putt_pct: row.three_putt_percentage ?? null,
      par3_avg: row.par3_average ?? null,
      par4_avg: row.par4_average ?? null,
      par5_avg: row.par5_average ?? null,
    };
  }
  // Players without a cache row still render — honest empty stats, never fake
  // 0s. `recent_trend` is still sourced live (a player can have completed
  // rounds — and therefore a real trend — before the cache job has caught up).
  for (const pid of playerIds) {
    if (!gridStats[pid]) {
      gridStats[pid] = {
        rounds_played: 0,
        avg_score: null,
        avg_putts: null,
        fairway_pct: null,
        gir_pct: null,
        best_score: null,
        recent_trend: recentTrendByPlayer.get(pid) ?? null,
      };
    }
  }

  // Shell Signals badge. getAlertCounts buckets BOTH 'urgent' AND 'high'
  // priority into `counts.critical` (see alerts.ts) — so this value is the
  // "urgent or high open signals" count the sub-nav badge's aria-label
  // promises. The bucket is named `critical` for historic reasons; the number
  // and its accessible description denote the same set (urgent + high).
  const countsRes = await getAlertCounts(coach.id);
  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;

  // ── Track-progress refresh (P1-07) ───────────────────────────────────────
  // Recompute progress for the whole roster's active goals from the latest
  // standing BEFORE loading them, so the coach sees REAL movement instead of
  // progress frozen at whatever the player last triggered. One batched pass
  // (single goals query + chunked standing); best-effort so a hiccup never
  // blanks the coach page.
  try {
    await Promise.all([
      runGoalProgressForPlayers(playerIds),
      // Same idea for focus areas: window each active area against the rounds
      // played since it started so the development-plan bar reflects reality,
      // not the value captured when the area was created. Best-effort.
      runFocusAreaProgressForPlayers(playerIds),
    ]);
  } catch {
    /* progress refresh is best-effort; fall through to last-known goals */
  }

  // ── v3 GOALS (read-only) ─────────────────────────────────────────────────
  // Surface each player's assigned/shared ACTIVE goals on the coach surface:
  // a count in the roster table + full cards in the scoped per-player view.
  // RLS scopes coach visibility to assigned + shared goals; we just compose
  // each goal with its live standing snapshot (null when the cron hasn't
  // populated a row for the metric yet). Coaches do not create/accept here.
  // Batched: one goals query (loadActiveGoalsForPlayers) + one chunked standing
  // read (loadPlayersStandingMap) for the WHOLE roster, instead of N per-player
  // round trips of each.
  const [goalsByPlayerMap, standingByPlayer] = await Promise.all([
    loadActiveGoalsForPlayers(playerIds),
    loadPlayersStandingMap(playerIds),
  ]);
  const goalsByPlayer: Record<string, FairwayGoalCardData[]> = {};
  for (const pid of playerIds) {
    const g = goalsByPlayerMap.get(pid) ?? [];
    const sm = standingByPlayer.get(pid) ?? new Map();
    goalsByPlayer[pid] = g.map(goal => ({ goal, standing: sm.get(goal.metric_id) ?? null }));
  }

  // Owning-player display names for the coach goal-card provenance labels.
  const playerNameById: Record<string, string> = {};
  for (const p of players || []) {
    playerNameById[p.id] = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
  }

  // Dedupe-aware causal "why their scores move" rows, keyed by player_id.
  const causalByPlayer = await getTeamCausalRelationships(teamId);

  // #920 — alert_posture='silent' makes the confidence gate infinite for that
  // player (src/app/golf/actions/insights.ts), so the CoachHelm engine keeps
  // running but never surfaces a single insight for them. That was invisible
  // anywhere in the coach UI. One roster-wide intent read (no N+1 — same
  // query the Roster page already uses) lets the Players-tab roster row flag
  // it instead of silently reading as "nothing found."
  const coachIntents = await loadCoachIntents(coach.id);
  const silentPostureByPlayer: Record<string, boolean> = {};
  for (const pid of playerIds) {
    if (coachIntents.get(pid)?.alert_posture === 'silent') {
      silentPostureByPlayer[pid] = true;
    }
  }

  // F133: honor the ?player= deep-link from a player's insight/genome card —
  // open the grid scoped to that player, but only if the id is actually on this
  // coach's roster (never trust the raw query param).
  const resolvedParams = (await searchParams) ?? {};
  const requestedPlayer = Array.isArray(resolvedParams.player)
    ? resolvedParams.player[0]
    : resolvedParams.player;
  const initialSelectedPlayerId =
    requestedPlayer && playerIds.includes(requestedPlayer) ? requestedPlayer : null;

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <PlayersGridView
        players={players || []}
        focusAreas={focusAreasWithPlayers}
        coachId={coach.id}
        playerStats={gridStats}
        signalCount={signalCount}
        goalsByPlayer={goalsByPlayer}
        playerNameById={playerNameById}
        causalByPlayer={causalByPlayer}
        silentPostureByPlayer={silentPostureByPlayer}
        initialSelectedPlayerId={initialSelectedPlayerId}
        loadError={loadError}
      />
    </div>
  );
}

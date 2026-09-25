import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getTeamOverview, getTeamCategoryInsights } from '@/app/golf/actions/team-category-insights';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { getSignalGroups } from '@/app/golf/actions/signal-groups';
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
import { getCoachChatContext, getCoachProgramPulse } from '@/lib/coachhelm/v3/chat/request-cache';
import { getTeamCausalRelationships, type CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
import { loadCoachIntents } from '@/lib/coachhelm/v3/intent/loader';
import type { CoachPlayerIntent } from '@/lib/coachhelm/v3/intent/types';
import { loadActiveGoalsForPlayers } from '@/lib/coachhelm/v3/goals/loader';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { loadPlayersStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { todayIsoInZone } from '@/lib/golf/timezone';
import { isFlagEnabled } from '@/lib/flags';
import { fromUntyped } from '@/lib/supabase/untyped';
import { computeEvidenceRevisionStatuses } from '@/lib/coachhelm/focus-areas/load-evidence-revision-status';
import type { EvidenceRevisionComparison } from '@/lib/coachhelm/focus-areas/evidence-revision-status';
import { loadFocusAreaPracticeLogData } from '@/lib/coachhelm/focus-areas/practice-log-loader';
import { loadFollowUpRoundCounts } from '@/lib/coachhelm/focus-areas/follow-up-eligibility-loader';
import {
  loadAttributionForInsights,
  loadPlayersAreaSg,
  loadTeamShotContext,
  loadTeamSgRounds,
} from '@/lib/coachhelm/root-map/loaders';
import { buildTeamHeadline, buildTeamRoots, type TeamRosterPlayer } from '@/lib/coachhelm/root-map/build-team-roots';
import { buildTeamTrend } from '@/lib/coachhelm/root-map/area-trends';
import { buildFocusSlopes, buildNeedsYou, type MetricMeta } from '@/lib/coachhelm/root-map/build-team-extras';
import { loadCoachPlayerDrill } from '@/lib/coachhelm/root-map/coach-player-drill';
import { measureWhat, type MeasuredWhat } from '@/lib/coachhelm/root-map/measured-what';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { TeamRootsData } from '@/components/golf/coachhelm/root-map/TeamRootsView';

/** Weeks the team trend shows, ending at the latest counted SG round. */
const TEAM_TREND_WEEKS = 12;
/** How far back the trend read looks for that latest round. The window is
 *  anchored on the team's newest counted round, not on today, so a team
 *  whose last SG round is weeks old still gets its last 12 weeks of play. */
const TEAM_TREND_LOOKBACK_WEEKS = 52;

function isoDaysBefore(dayIso: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = dayIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * A8 slice 3: the focus-area select is routed through `fromUntyped` (see
 * above) so it can conditionally add `evidence_revision`, a column that
 * doesn't exist in generated `database.ts` types until the owner applies
 * the migration — this is the resulting row shape, kept minimal to what
 * this page actually reads off it.
 */
interface RawFocusAreaRow {
  id: string;
  player_id: string;
  from_insight_id?: string | null;
  from_review_id?: string | null;
  progress_notes?: unknown;
  evidence_revision?: string | null;
  started_at: string | null;
  [key: string]: unknown;
}

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: `${surfaceName('brief')} | CoachHelm`,
  description: 'AI-powered insights, patterns, predictions, and coaching intelligence for your team',
};

// The coach Brief reflects team data that PLAYERS change (logging rounds). Force
// dynamic so the route is always freshly rendered and never served from a stale
// Full Route Cache entry — the Triage Desk absorbs Signals/Players/Effectiveness
// too, all of which are similarly live/mutable.
export const dynamic = 'force-dynamic';

interface IntelligencePageProps {
  searchParams: Promise<{
    // `view`/`filter`/`signal` (and the legacy `id` insight deep-link —
    // CommandPalette.tsx:326, FocusAreaCard.tsx:315, forwarded by the
    // `/insights` redirect shim) are read client-side by `TriageDesk` via
    // `useSearchParams()` (mirrors the old `StageRouter`'s self-contained
    // pattern) — nothing server-side needs to parse them. `player` is the
    // one deep-link param this page still resolves server-side (F133,
    // forwarded by the `/development` redirect shim).
    player?: string;
    /** Team roots drill: `?view=team&player=<id>&cause=<insightId>` opens
     *  that player's root map (built server-side, coach-scoped). */
    view?: string;
    cause?: string;
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

  // ── Home-gate + Triage Desk data — `getTeamOverview` still drives the
  // overview-failure-vs-empty-roster gate (Triage Desk spec §5); `alertCounts`
  // still feeds the Players/Effectiveness drills' `signalCount` badge
  // (unchanged from before this rebuild); `getSignalGroups` is the FROZEN
  // contract the Triage Desk itself reads — one unfiltered fetch of every
  // open signal for the team, with view/queue filtering happening entirely
  // client-side (see `buildTriageViewModel.ts`). The two `players` drill
  // extras (causalByPlayer, coachIntents) only depend on teamId/coach.id —
  // already available here — so they run fully parallel with the rest of
  // this block instead of adding a serial round trip later. Individually
  // `.catch()`-degraded: `loadActiveGoalsForPlayers` and `loadCoachIntents`
  // throw on a DB error (unlike the `.success`-shaped actions above), so a
  // hiccup on either must not blank the whole page. ──────────────────────
  const [
    overviewResult,
    countsRes,
    signalGroupsResult,
    causalByPlayer,
    coachIntents,
    coachHelmOverviewResult,
    effectivenessResult,
    performanceResult,
    patternResult,
    categoryInsightsResult,
    teamTimezoneResult,
  ] = await Promise.all([
    getTeamOverview(teamId),
    getAlertCounts(coach.id),
    getSignalGroups(teamId),
    getTeamCausalRelationships(teamId).catch(() => ({}) as Record<string, CausalRelationshipRow[]>),
    loadCoachIntents(coach.id).catch(() => new Map<string, CoachPlayerIntent>()),
    getCoachHelmOverview(teamId),
    getInsightEffectiveness(teamId),
    getPredictionPerformance(teamId),
    getPatternImpact(teamId),
    // Team-wide "where is the team bleeding strokes" band (categories[] +
    // teamHealth) — computed on every request already by
    // getTeamCategoryInsights, previously never fetched by this page at all
    // (a DISTINCT, richer action from `getTeamOverview` above: per-category
    // team avg/trend/per-player breakdown/insights, not just the 5-number
    // teamCategories rating used by the empty-roster gate). Additive read,
    // same team-scoped RLS as every other fetch in this block.
    getTeamCategoryInsights(teamId),
    // #1998 review — "due for review" needs the TEAM's wall-clock calendar
    // day, not the server's UTC day (dashboard-data.ts's own pattern).
    supabase.from('golf_team_settings').select('timezone').eq('team_id', teamId).maybeSingle(),
  ]);
  const alertCounts = countsRes.success ? (countsRes.counts ?? null) : null;
  const signalGroups = signalGroupsResult.success ? signalGroupsResult.groups : [];
  const signalGroupsError = signalGroupsResult.success ? null : (signalGroupsResult.error ?? 'Could not load signals.');
  // A failed read here must not silently masquerade as "no timezone row" —
  // bind the error and log it; the fallback below is still the correct
  // degrade (America/New_York), just an explicit one instead of an
  // accidental one.
  if (teamTimezoneResult.error) {
    void logServerError(
      `[intelligence] team timezone read failed for team ${teamId}; due-for-review dates will fall back to America/New_York: ${describeError(teamTimezoneResult.error)}`,
      { action: 'intelligence.loadTeamTimezone', featureArea: 'coachhelm' },
      'warning',
    );
  }
  const teamTimezone = (teamTimezoneResult.data as { timezone?: string } | null)?.timezone || 'America/New_York';
  // Resolved ONCE, server-side, on the team's zone — threaded down through
  // playersDrillProps -> PlayersGridView -> DueForReviewPanel. Never
  // recomputed client-side (see due-for-review.ts's module doc).
  const todayIso = todayIsoInZone(teamTimezone);

  // ── `players` drill reads — a port of development/page.tsx's roster +
  // focus-area fetch. The goals/causal/silent-posture extras (goalsByPlayer,
  // playerNameById, causalByPlayer, silentPostureByPlayer) are assembled
  // further below, once playerIds/coachIntents/goalsAndStandingPromise are
  // available. ───────────────────────────────────────────────────────────
  const { data: teamMembers, error: teamMembersError } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  // This roster read gates the entire Players view. `|| []` turns a failed
  // read into an empty squad, and every drill below keys off activePlayerIds —
  // so the coach's intelligence surface renders as a team with no players, no
  // focus areas and no goals. That is not a degraded view of a real team, it is
  // a different team, and nothing on the page says a read failed.
  if (teamMembersError) {
    void logServerError(
      `[intelligence] roster read failed for team ${teamId}; the Players view will render as an empty squad: ${describeError(teamMembersError)}`,
      { action: 'intelligence.loadRoster', featureArea: 'coachhelm' },
      'error',
    );
  }

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

  // Team roots reads (the coach landing view): per-round SG averaged over
  // each player's countable rounds, and stored per-round SG. Started here so they overlap the focus-area reads
  // below; each loader returns null on failure instead of throwing.
  const teamRootReads = Promise.all([
    loadPlayersAreaSg(supabase, playerIds),
    loadTeamSgRounds(supabase, playerIds, isoDaysBefore(todayIso, TEAM_TREND_LOOKBACK_WEEKS * 7)),
    // Recorded shots for the team map's measured What row (null on failure:
    // the map then keeps the stored-cause What row).
    loadTeamShotContext(supabase, playerIds),
  ]);

  // Page loads are read-only. Progress evaluation belongs to round ingestion /
  // scheduled refreshes; running two write-heavy recomputations here made every
  // tab click wait on database writes before the controls could hydrate.
  // A8 slice 3: only extend the select (and only route it through the
  // untyped escape hatch) when the flag is on — with it off, this must be
  // byte-for-byte the same select as before slice 1/3, since the column
  // doesn't exist in prod until the owner applies the migration.
  const evidenceRevisionFlagOn = isFlagEnabled('coachhelm_focus_area_evidence_revision');
  const focusAreaSelectColumns = `id, player_id, coach_id, area_type, title, description, status, target_metric,
             current_value, baseline_value, snapshots,
             target_value, target_kind, target_date, target_rounds,
             started_at, completed_at, created_at, updated_at,
             from_review_id, from_insight_id, review_context, progress_notes,
             outcome_status${evidenceRevisionFlagOn ? ', evidence_revision' : ''}`;

  const [focusResult, statsResult, goalsByPlayerMap, standingByPlayer] = await Promise.all([
    playerIds.length > 0
      ? // fromUntyped is `client.from(table) as any` at runtime — identical to
        // the typed call below for every column this select already carried
        // before slice 1/3; only the column LIST varies on the flag, never
        // the client, which keeps this branch simple to type.
        fromUntyped(supabase, 'golf_player_focus_areas')
          .select(focusAreaSelectColumns)
          .in('player_id', playerIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    playerIds.length > 0
      ? supabase
          .from('golf_player_stats_cache')
          .select('player_id, rounds_played, scoring_average, putts_per_round, driving_accuracy_percentage, gir_percentage, best_round, trend_direction')
          .in('player_id', playerIds)
      : Promise.resolve({ data: [], error: null }),
    loadActiveGoalsForPlayers(playerIds).catch(() => new Map<string, Goal[]>()),
    loadPlayersStandingMap(playerIds).catch(() => new Map<string, Map<MetricId, PlayerStanding>>()),
  ]);
  // fromUntyped's `any` return means `focusResult`/`focusAreas` are only
  // reliably typed by this cast — the select is a plain string either way
  // (flag off never even touches fromUntyped's row shape), so this reflects
  // what the query actually returns rather than widening anything further.
  const { data: focusAreas, error: focusAreasError } = focusResult as {
    data: RawFocusAreaRow[] | null;
    error: unknown;
  };
  const { data: statsRows } = statsResult;

  const sourceInsightIds = Array.from(
    new Set((focusAreas || []).map((fa) => fa.from_insight_id).filter(Boolean)),
  ) as string[];
  const outcomeByInsightId: Record<string, string> = {};
  const reviewIds = Array.from(
    new Set((focusAreas || []).map((fa) => fa.from_review_id).filter(Boolean)),
  ) as string[];
  // Stored before/after for the insight each focus area came from. Off with
  // the attribution flag: no read at all, and the section says unavailable.
  const attributionRead = isFlagEnabled('coachhelm_comparable_opportunity_attribution')
    ? loadAttributionForInsights(supabase, sourceInsightIds)
    : Promise.resolve(null);
  const [insightOutcomesResult, reviewRowsResult] = await Promise.all([
    sourceInsightIds.length > 0
      ? supabase
      .from('golf_coach_insights')
      .select('id, outcome_status')
      .in('id', sourceInsightIds)
          .not('outcome_status', 'is', null)
      : Promise.resolve({ data: [], error: null }),
    reviewIds.length > 0
      ? supabase.from('golf_round_reviews').select('id, round_id').in('id', reviewIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  // The "did the coaching land" outcome mix and the review back-links. Both
  // read as absence — "no outcomes recorded", "no review attached" — which is a
  // claim about the coaching rather than about the query, on the surface a
  // coach uses to decide what to work on next.
  for (const [dataset, failed] of [
    ['insight outcome', insightOutcomesResult.error],
    ['review back-link', reviewRowsResult.error],
  ] as const) {
    if (!failed) continue;
    void logServerError(
      `[intelligence] ${dataset} read failed for team ${teamId}; that panel will render as "none recorded": ${describeError(failed)}`,
      { action: 'intelligence.loadOutcomes', featureArea: 'coachhelm' },
      'warning',
    );
  }

  for (const row of insightOutcomesResult.data || []) {
      if (row.outcome_status) outcomeByInsightId[row.id] = row.outcome_status;
  }

  const roundIdByReviewId: Record<string, string> = {};
  for (const row of reviewRowsResult.data || []) {
      if (row.round_id) roundIdByReviewId[row.id] = row.round_id;
  }

  const evidenceRevisionStatusByFocusAreaId = await computeEvidenceRevisionStatuses(
    supabase,
    focusAreas || [],
  );
  // `null` means the live-insight read failed — render no badge, same as an
  // id simply missing from a successful map, but NEVER by silently
  // defaulting the whole result to `{}` first (that's the exact collapse
  // that hid a failed read behind "nothing changed").
  const evidenceRevisionStatusFor = (id: string): EvidenceRevisionComparison | undefined =>
    evidenceRevisionStatusByFocusAreaId ? evidenceRevisionStatusByFocusAreaId[id] : undefined;

  // A8 slice 2 (read side): zero .from() calls against either new table
  // while coachhelm_focus_area_practice_log is off — the loader checks the
  // flag first and returns empty maps immediately in that case.
  // Pkg 9 gap 2 (follow-up eligibility, owner decision 2026-09-23): a batch
  // golf_rounds read, independent of the practice-log tables above, run in
  // parallel with them. `null` (read failed) is threaded down as-is —
  // DueForReviewPanel treats it the same "unknown, not zero" way
  // criteriaByFocusArea/practiceSummaryByFocusArea already do.
  const [{ criteriaByFocusArea, practiceSummaryByFocusArea }, followUpRoundCountsMap] = await Promise.all([
    loadFocusAreaPracticeLogData(
      supabase,
      (focusAreas || []).map((fa) => fa.id),
    ),
    loadFollowUpRoundCounts(
      supabase,
      (focusAreas || []).map((fa) => ({ id: fa.id, player_id: fa.player_id, started_at: fa.started_at })),
    ),
  ]);
  // Client components can't receive a Map across the server/client boundary
  // — DueForReviewPanel (and everything between it and this page) is
  // 'use client', so this crosses as a plain object.
  const followUpRoundCounts: Record<string, number> | null = followUpRoundCountsMap
    ? Object.fromEntries(followUpRoundCountsMap)
    : null;
  // A8 slice 3 (write side): `isFlagEnabled` is server-only — resolved once
  // here and threaded down opaquely through `playersDrillProps` (see
  // PlayersGridViewProps.practiceLogEnabled) rather than re-derived from the
  // flag-gated criteria/practiceSummary data, which can't distinguish
  // "flag off" from "flag on, no data yet".
  const practiceLogEnabled = isFlagEnabled('coachhelm_focus_area_practice_log');

  const focusAreasWithPlayers: PlayersGridFocusArea[] = (focusAreas || []).map((fa) => ({
    ...fa,
    player: players.find((p) => p.id === fa.player_id) || null,
    outcome_status: fa.from_insight_id ? (outcomeByInsightId[fa.from_insight_id] ?? null) : null,
    // Owner decision follow-up (2026-09-23) — the RAW column, unlike
    // `outcome_status` above which only reflects the SOURCE INSIGHT and
    // misses areas with no `from_insight_id`. See PlayersGridFocusArea's
    // doc for why this needs its own field rather than reusing that one.
    recordedOutcomeStatus: fa.outcome_status ?? null,
    progressHistory: progressHistoryOf(fa.progress_notes),
    from_review_round_id: fa.from_review_id ? (roundIdByReviewId[fa.from_review_id] ?? null) : null,
    evidence_revision_status: evidenceRevisionStatusFor(fa.id),
    // `null` from the loader means that table's read failed (unknown), not
    // "no criteria"/"never practiced" -- the explicit `criteriaByFocusArea ?
    // ... : null` (rather than defaulting the whole map to `?? new Map()`)
    // keeps that distinction from collapsing here, one call up from the
    // loader itself. FocusAreaCard renders nothing for a `null` per-item
    // value either way, so a failed read and a genuine zero look the same
    // on screen, but never the same as each other in the data.
    criteria: criteriaByFocusArea ? (criteriaByFocusArea.get(fa.id) ?? null) : null,
    practiceSummary: practiceSummaryByFocusArea ? (practiceSummaryByFocusArea.get(fa.id) ?? null) : null,
  })) as unknown as PlayersGridFocusArea[];

  const gridStats: Record<string, PlayersGridStats> = {};
  for (const row of statsRows || []) {
    gridStats[row.player_id] = {
      rounds_played: row.rounds_played ?? 0,
      avg_score: row.scoring_average ?? null,
      avg_putts: row.putts_per_round ?? null,
      fairway_pct: row.driving_accuracy_percentage ?? null,
      gir_pct: row.gir_percentage ?? null,
      best_score: row.best_round ?? null,
      // `golf_player_stats_cache.trend_direction` is written by the same
      // canonical trend classifier Team Stats/the Players roster read
      // (CHECK constraint: 'improving' | 'stable' | 'declining') — pass it
      // straight through rather than the old hard-coded null so the Trend
      // column actually renders instead of always reading '—'.
      recent_trend: (row.trend_direction as 'improving' | 'declining' | 'stable' | null) ?? null,
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

  // ── Team roots (coach landing view). Pure shaping of the reads above; a
  // failed SG read leaves the view out (the desk keeps Signals as default)
  // rather than drawing an empty team as if it were real. ─────────────────
  let teamRoots: TeamRootsData | null = null;
  try {
    const [[sgCache, teamRounds, teamShots], attribution] = await Promise.all([teamRootReads, attributionRead]);
    if (sgCache && teamRounds) {
      const sgByPlayer = new Map(sgCache.map((r) => [r.playerId, r]));
      const roster: TeamRosterPlayer[] = players.map((p) => {
        const row = sgByPlayer.get(p.id);
        return {
          id: p.id,
          name: playerNameById[p.id] ?? 'Player',
          roundsPlayed: row?.roundsPlayed ?? null,
          sgTotal: row?.sgTotal ?? null,
          sg: row?.sg ?? { tee: null, approach: null, short_game: null, putting: null },
        };
      });
      const signals = signalGroups.flatMap((g) => g.signals);
      // Each player's What split, over the same countable rounds as their
      // Where row (`measureWhat` checks the window and the reconciliation).
      const measured = new Map<string, MeasuredWhat>();
      for (const [playerId, load] of teamShots ?? []) {
        const row = sgByPlayer.get(playerId);
        if (!row) continue;
        try {
          measured.set(
            playerId,
            measureWhat({ rounds: load.rounds, shots: load.shots, holes: load.holes, scale: load.scale, whereSg: row.sg, whereRounds: row.roundsPlayed }),
          );
        } catch (err) {
          void logServerError(
            `[intelligence] measured What row failed for player ${playerId}: ${describeError(err)}`,
            { action: 'intelligence.teamRoots.measured', featureArea: 'coachhelm' },
            'warning',
          );
        }
      }
      const model = buildTeamRoots({ players: roster, signals, measured });

      // Metric label/unit/direction: the metric registry first, then the
      // label the insight itself stored, then the raw id.
      const storedLabel = new Map<string, string>();
      for (const sig of signals) {
        const ev = sig.evidence as { metric?: unknown; metric_label?: unknown } | null | undefined;
        if (ev && typeof ev.metric === 'string' && typeof ev.metric_label === 'string') storedLabel.set(ev.metric, ev.metric_label);
      }
      const metricMeta = (id: string): MetricMeta => {
        const cfg = getMetricRenderConfig(id);
        if (cfg) return { label: cfg.display_label, unit: cfg.unit, direction: cfg.direction };
        return { label: storedLabel.get(id) ?? id.replace(/_/g, ' '), unit: null, direction: null };
      };

      teamRoots = {
        model,
        headline: buildTeamHeadline(model),
        trend: buildTeamTrend(teamRounds, { maxWeeks: TEAM_TREND_WEEKS }),
        slopes: attribution
          ? buildFocusSlopes({
              focusAreas: (focusAreas || []).map((fa) => ({
                id: fa.id,
                playerId: fa.player_id,
                title: typeof fa.title === 'string' ? fa.title : 'Focus',
                fromInsightId: fa.from_insight_id ?? null,
              })),
              attribution,
              playerNameById,
              metricMeta,
            })
          : null,
        needsYou: buildNeedsYou({
          focusAreas: (focusAreas || []).map((fa) => ({
            id: fa.id,
            playerId: fa.player_id,
            title: typeof fa.title === 'string' ? fa.title : 'Focus',
            status: typeof fa.status === 'string' ? fa.status : null,
            evidenceRevisionStatus: evidenceRevisionStatusFor(fa.id),
          })),
          signals,
          playerNameById,
        }),
        signalsFailed: signalGroupsError !== null,
        drill: null,
      };

      // Drill into one player (`?view=team&player=`): only for a player on
      // this coach's roster; access is re-checked inside the insight read.
      const drillPlayer = sp.view === 'team' && sp.player ? players.find((p) => p.id === sp.player) ?? null : null;
      if (drillPlayer) {
        teamRoots.drill = await loadCoachPlayerDrill(supabase, {
          coachId: coach.id,
          playerId: drillPlayer.id,
          playerName: drillPlayer.first_name?.trim() || playerNameById[drillPlayer.id] || 'Player',
          causeId: typeof sp.cause === 'string' && sp.cause.length > 0 ? sp.cause : null,
          signals,
        });
      }
    }
  } catch (err) {
    void logServerError(
      `[intelligence] team roots build failed for team ${teamId}; the desk falls back to Signals: ${describeError(err)}`,
      { action: 'intelligence.teamRoots', featureArea: 'coachhelm' },
      'warning',
    );
    teamRoots = null;
  }

  // ── The AI-first opening's inputs. Individually degraded: if the chat
  // context or the pulse cannot be read, the Brief still renders its existing
  // intelligence surfaces and simply omits the composer. ────────────────────
  let command: React.ComponentProps<typeof CoachIntelligenceHome>['command'] = null;
  try {
    // Request-cached: the dashboard layout resolves this same context and pulse
    // for the CoachHelm drawer on every /golf/dashboard/* render. Going through
    // the cached zero-arg getters means this page reuses that work instead of
    // repeating six serial round trips plus the pulse's query wave.
    const chatCtx = await getCoachChatContext();
    const pulse = await getCoachProgramPulse();
    if (!pulse) throw new Error('program pulse unavailable');
    command = {
      teamName: chatCtx.team_name,
      // `golf_coaches` stores one `full_name`; the greeting wants the first
      // word of it, and nothing at all rather than a guess when it is unset.
      coachFirstName: coach.full_name?.trim().split(/\s+/)[0] ?? null,
      players: chatCtx.roster.map((p) => ({ id: p.id, name: p.name })),
      pulse,
    };
  } catch {
    command = null;
  }

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
        <CoachIntelligenceHome
          command={command}
          overview={overviewResult}
          categoryInsights={categoryInsightsResult}
          coachId={coach.id}
          groups={signalGroups}
          scannedAt={signalGroupsResult.scannedAt}
          groupsError={signalGroupsError}
          teamRoots={teamRoots}
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
            todayIso,
            practiceLogEnabled,
            followUpRoundCounts,
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

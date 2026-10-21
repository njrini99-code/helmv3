import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { getInsightsForPlayer, getTopInsightsForPlayers, type EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { collapseParScoring, dedupeBySubject, mapRowToRankable, type RankableEvidenceInsight, type RawInsightRowForRanking } from '@/app/golf/actions/insight-delivery-ranking';
import { isCoachHelmEnabledForCoach, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';
import { getCoachChatContext, getCoachProgramPulse } from '@/lib/coachhelm/v3/chat/request-cache';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { isCountableRound } from '@/lib/golf/round-countable';
import { isCoursePlanEnabled } from '@/lib/coachhelm/course-plan/flag';
import { getPlayerSignalSettings } from '@/lib/golf/player-signal-settings';
import { resolveMinerWindows } from '@/lib/coachhelm/v2/mining/pattern-miner';
import { chLogServer } from '../lib/track-server';
import { isOpenFinding, kindOf, staleFloor } from './coachhelm-classify';
import { toChInsight } from './coachhelm-map';
import { readEngineFlags, readFocusVerdicts } from './coachhelm-engine';
import { readCorrections } from './coachhelm-corrections';
import { shapeReadsLifecycle } from './coachhelm-engine-shape';
import { speak } from './coachhelm-voice';
import { boardMissing, firstName, partitionInsights, pulseItemsThatStand, pulseMissing, pulseRows, sortCoachPlayers, type ChCoachHelmData, type ChCoachPlayer, type ChHelmAssigned, type ChPlayerHelm, type ChProposal, type ChPulse, type ChPulseResult, type ChTourBaseline } from './coachhelm-shape';
import { tourForGender } from './stats-common';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { teamPatternEnabled } from '@/lib/coachhelm/v3/team-pattern/flag';
import { computeTeamPatterns, TEAM_PATTERN_MIN_ROUNDS } from '@/lib/coachhelm/v3/team-pattern/pattern';
import { toChTeamPatterns, type ChTeamPatterns } from './coachhelm-team-pattern';

export type * from './coachhelm-shape';

/**
 * CoachHelm (Clubhouse P013; design/handoff/Player - CoachHelm.html,
 * Coach - CoachHelm.html, helm3.jsx). Every insight is read by the existing
 * delivery actions, so ranking, dedupe, visibility and the ledger's exposure
 * counts are the ones every other surface uses; nothing is generated or
 * computed here beyond re-shaping (data/coachhelm-map.ts).
 *
 * The delivery actions answer `[]` (or an empty map) when a read fails, which is
 * indistinguishable from "no insights". So when one comes back empty, a second
 * read of the visible insights decides: nothing there is a real first-run state;
 * something there means the first read failed, and the page says so.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

const log = (what: string, err: unknown) => chLogServer('coachhelm', what, err, 'coachhelm');

/** What the board calls a player with no name on file. */
const NO_NAME = 'Player';

/** The most insights one player's page loads: the feed's own ceiling for a player (`getInsightsForPlayer`). */
export const PLAYER_FEED_LIMIT = 30;

const VISIBLE_COLUMNS = 'id, player_id, category, insight_type, title, content, signature, evidence, metadata, lifecycle_state, status, priority, acknowledged_at, resolved_at, created_at, updated_at';

/**
 * The visible insights for these players, deduplicated as the feed does
 * (par scoring collapsed, one per player, category and subject). A row the feed
 * could not draw (no numeric impact, confidence or metric) is not counted.
 */
export async function loadVisible(supabase: Supabase, playerIds: string[]): Promise<{ rows: RankableEvidenceInsight[]; error: boolean }> {
  const res = await fetchAllRowsResult<RawInsightRowForRanking>(
    (from, to) =>
      applyInsightVisibility(supabase.from('golf_coach_insights').select(VISIBLE_COLUMNS).in('player_id', playerIds).not('evidence', 'is', null))
        .order('id', { ascending: true })
        .range(from, to),
    undefined,
    { table: 'golf_coach_insights', action: 'clubhouse.coachhelm', feature: 'coachhelm_ai_engine', sport: 'golf' },
  );
  if (res.error) {
    log('visible', res.error);
    return { rows: [], error: true };
  }
  const mapped = (res.data ?? []).map(mapRowToRankable).filter((r): r is NonNullable<typeof r> => r != null);
  return { rows: dedupeBySubject(collapseParScoring(mapped)), error: false };
}

/** Insights this player dismissed themselves: the newest feedback row per insight decides (`getInsightsForPlayer` hides them). */
export async function loadPlayerDismissed(supabase: Supabase, playerId: string): Promise<{ ids: Set<string>; error: boolean }> {
  const res = await supabase.from('golf_insight_player_feedback').select('insight_id, rating, created_at').eq('player_id', playerId).order('created_at', { ascending: false });
  if (res.error) {
    log('dismissed', res.error);
    return { ids: new Set(), error: true };
  }
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const r of res.data ?? []) {
    if (seen.has(r.insight_id)) continue;
    seen.add(r.insight_id);
    if (r.rating === 'dismissed') ids.add(r.insight_id);
  }
  return { ids, error: false };
}

/**
 * How many more rounds the pattern miner needs before it reads this player, counted as it counts them: its floor (the coach's
 * `min_rounds_for_signal` through the engine's own resolver, never under the miner's minimum, `resolveMinerWindows`) less the
 * countable completed rounds in its lookback window. For the empty board's "Post 2 more rounds"; null when a read failed.
 */
async function roundsToGo(supabase: Supabase, playerId: string): Promise<number | null> {
  try {
    const settings = await getPlayerSignalSettings(playerId);
    const { minRounds, lookbackDays } = resolveMinerWindows({ minRounds: settings.minRoundsForSignal, lookbackDays: settings.patternLookbackDays });
    const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
    const res = await supabase
      .from('golf_rounds')
      .select('id, total_score, front_nine, back_nine, holes_played, total_putts')
      .eq('player_id', playerId)
      .eq('is_test', false)
      .eq('status', 'completed')
      .gte('round_date', since)
      .limit(100);
    if (res.error) {
      log('roundsToGo', res.error);
      return null;
    }
    return Math.max(0, minRounds - (res.data ?? []).filter((r) => isCountableRound(r)).length);
  } catch (err) {
    log('roundsToGo', err);
    return null;
  }
}

/** Countable rounds the player has posted, or null when the read fails (the empty state then names no number). */
export async function countCountableRounds(supabase: Supabase, playerId: string): Promise<number | null> {
  const res = await fetchAllRowsResult<{ id: string; total_score: number | null; front_nine: number | null; back_nine: number | null; holes_played: number | null; total_putts: number | null }>(
    (from, to) =>
      supabase
        .from('golf_rounds')
        .select('id, total_score, front_nine, back_nine, holes_played, total_putts')
        .eq('player_id', playerId)
        .eq('is_test', false)
        .eq('status', 'completed')
        .order('id', { ascending: true })
        .range(from, to),
    undefined,
    { table: 'golf_rounds', action: 'clubhouse.coachhelm', feature: 'coachhelm_ai_engine', sport: 'golf' },
  );
  if (res.error) {
    log('rounds', res.error);
    return null;
  }
  return (res.data ?? []).filter((r) => isCountableRound(r)).length;
}

/**
 * The day of each player's newest completed countable round, from `since` on (the earliest day a round could make one of the
 * reads on the page out of date, `staleFloor`); a player with none in that span is absent, and without a `since` nothing is read.
 * A failed read is logged and answers an empty map with `error`: which reads are older than a round is then not known, and the
 * page says so instead of drawing every read as current. Never a write.
 */
export async function newestRounds(supabase: Supabase, playerIds: string[], since: string | null): Promise<{ days: Map<string, string>; error: boolean }> {
  const out = new Map<string, string>();
  if (!since || playerIds.length === 0) return { days: out, error: false };
  const res = await fetchAllRowsResult<{ id: string; player_id: string; round_date: string | null; total_score: number | null; front_nine: number | null; back_nine: number | null; holes_played: number | null; total_putts: number | null }>(
    (from, to) =>
      supabase
        .from('golf_rounds')
        .select('id, player_id, round_date, total_score, front_nine, back_nine, holes_played, total_putts')
        .in('player_id', playerIds)
        .eq('is_test', false)
        .eq('status', 'completed')
        .gte('round_date', since)
        .order('id', { ascending: true })
        .range(from, to),
    undefined,
    { table: 'golf_rounds', action: 'clubhouse.coachhelm', feature: 'coachhelm_ai_engine', sport: 'golf' },
  );
  if (res.error) {
    log('newestRounds', res.error);
    return { days: out, error: true };
  }
  for (const r of res.data ?? []) {
    const day = r.round_date?.slice(0, 10);
    if (!day || !isCountableRound(r)) continue;
    if (day > (out.get(r.player_id) ?? '')) out.set(r.player_id, day);
  }
  return { days: out, error: false };
}

/** The earliest day a round could make any of these reads out of date, or null when none can be told. */
export function earliestStaleFloor(rows: ReadonlyArray<Parameters<typeof staleFloor>[0]>): string | null {
  return rows.map(staleFloor).filter((d): d is string => !!d).sort()[0] ?? null;
}

/**
 * The attached drill's description by insight (the delivery shape carries the drill's name and length, not its text). Failing
 * leaves the drill's name and length, and `error`: the card says its drill text is missing instead of drawing "This week" short.
 */
export async function drillTextByInsight(supabase: Supabase, insights: EvidenceInsight[]): Promise<{ texts: Map<string, string>; error: boolean }> {
  const firstDrill = new Map<string, string>();
  for (const i of insights) if (i.drills?.[0]) firstDrill.set(i.id, i.drills[0].id);
  const out = new Map<string, string>();
  if (firstDrill.size === 0) return { texts: out, error: false };
  const res = await supabase
    .from('golf_drills')
    .select('id, description')
    .in('id', [...new Set(firstDrill.values())]);
  if (res.error) {
    log('drills', res.error);
    return { texts: out, error: true };
  }
  const byDrill = new Map((res.data ?? []).map((d) => [d.id, d.description]));
  for (const [insightId, drillId] of firstDrill) {
    const text = byDrill.get(drillId);
    if (text) out.set(insightId, text);
  }
  return { texts: out, error: false };
}

/**
 * Focus areas already made from these insights that still stand (a declined or completed one no longer does). Failing answers
 * `error`, and the coach's board then does not offer Assign: "nothing is assigned" is not what a failed read says (the server's
 * duplicate guard would still refuse a second one, but the board must not offer what it could not check).
 */
export async function assignedByInsight(supabase: Supabase, insightIds: string[]): Promise<{ byInsight: Map<string, ChHelmAssigned>; error: boolean }> {
  const out = new Map<string, ChHelmAssigned>();
  if (insightIds.length === 0) return { byInsight: out, error: false };
  const res = await supabase.from('golf_player_focus_areas').select('from_insight_id, status').in('from_insight_id', insightIds).in('status', ['proposed', 'active', 'in_progress', 'paused']);
  if (res.error) {
    log('assigned', res.error);
    return { byInsight: out, error: true };
  }
  for (const r of res.data ?? []) {
    if (!r.from_insight_id) continue;
    // A live focus beats a proposal of the same insight.
    if (r.status !== 'proposed' || !out.has(r.from_insight_id)) out.set(r.from_insight_id, r.status === 'proposed' ? 'proposed' : 'active');
  }
  return { byInsight: out, error: false };
}

/**
 * Insights whose focus area the player declined (CH13-23). The board says so instead of offering Assign as if it were new.
 * Failing answers `error`: whether the player declined one is not known, so the board neither offers Assign (as if it never
 * happened) nor says it did.
 */
export async function declinedByInsight(supabase: Supabase, insightIds: string[]): Promise<{ ids: Set<string>; error: boolean }> {
  const out = new Set<string>();
  if (insightIds.length === 0) return { ids: out, error: false };
  const res = await supabase.from('golf_player_focus_areas').select('from_insight_id').in('from_insight_id', insightIds).eq('status', 'declined');
  if (res.error) {
    log('declined', res.error);
    return { ids: out, error: true };
  }
  for (const r of res.data ?? []) if (r.from_insight_id) out.add(r.from_insight_id);
  return { ids: out, error: false };
}

/**
 * The Tour's values for a tour (`golf_pga_standards`), with `error` when the read failed. `loadTourBenchmarks` (stats-common) logs a
 * failed read and answers the same empty map as a tour with no rows, so this page reads it itself: a failed Tour comparison is
 * "Tour comparison unavailable" on the board, not "no comparison".
 */
async function readTourValues(supabase: Supabase, tour: ChTourBaseline['tour']): Promise<{ values: Map<string, number>; error: boolean }> {
  const values = new Map<string, number>();
  const { data, error } = await supabase.from('golf_pga_standards').select('metric_id, pga_tour_value').eq('tour', tour);
  if (error) {
    chLogServer('coachhelm', 'tourBenchmarks', error);
    return { values, error: true };
  }
  for (const r of data ?? []) {
    const v = r.pga_tour_value == null ? null : Number(r.pga_tour_value);
    if (v != null && Number.isFinite(v)) values.set(r.metric_id, v);
  }
  return { values, error: false };
}

/** What a Tour read answers: the baseline (null when none is claimed) and whether a read failed on the way. */
export type TourRead = { baseline: ChTourBaseline | null; error: boolean };

/**
 * The Tour's values for the team's own tour (Q-88: the Tour is the only benchmark): the LPGA's for a women's team, never the men's.
 * Without the team's row its tour is unknown, so no benchmark is claimed and a college comparison is left undrawn.
 */
async function tourBaselineOf(supabase: Supabase, team: { gender: string | null } | null): Promise<TourRead> {
  if (!team) return { baseline: null, error: false };
  const tour = tourForGender(team.gender);
  const { values, error } = await readTourValues(supabase, tour);
  return { baseline: { tour, values }, error };
}

/** The coach's team's Tour. A failed team read is logged, claims no benchmark and says so (`error`). */
async function coachTour(supabase: Supabase, teamId: string): Promise<TourRead> {
  const res = await supabase.from('golf_teams').select('gender').eq('id', teamId).maybeSingle();
  if (res.error) {
    log('team', res.error);
    return { baseline: null, error: true };
  }
  return tourBaselineOf(supabase, res.data);
}

/**
 * The player's active team and its tour. `error`: the read failed, so neither the tour nor the proposals are known. `tourError`:
 * the team is known but the Tour's values did not read, so the cards have no Tour comparison.
 */
export async function playerTeam(supabase: Supabase, playerId: string): Promise<{ teamId: string | null; tour: ChTourBaseline | null; error: boolean; tourError: boolean }> {
  const res = await supabase.from('golf_team_members').select('team_id, golf_teams(gender)').eq('player_id', playerId).eq('status', 'active').maybeSingle();
  if (res.error) {
    log('playerTeam', res.error);
    return { teamId: null, tour: null, error: true, tourError: false };
  }
  const row = res.data as { team_id: string; golf_teams: { gender: string | null } | null } | null;
  if (!row) return { teamId: null, tour: null, error: false, tourError: false };
  const tour = await tourBaselineOf(supabase, row.golf_teams);
  return { teamId: row.team_id, tour: tour.baseline, error: false, tourError: tour.error };
}

/**
 * The focus areas a coach proposed to this player on their team, newest first (Q-77). `from` names the insight it came from when that insight is on the page.
 * A proposal made through Fairway's Add focus area or Ask CoachHelm before they wrote the team carries none (`team_id` null), so the
 * read is the player's own proposals on their team or on no team: filtering on the team alone hid every one of those from the player it was for.
 */
async function loadProposals(supabase: Supabase, playerId: string, teamId: string | null, insights: ReadonlyArray<{ id: string; title: string }>): Promise<ChPlayerHelm['proposals']> {
  if (!teamId) return { list: [], error: false };
  const res = await supabase
    .from('golf_player_focus_areas')
    .select('id, title, from_insight_id, coach_id, created_at')
    .eq('player_id', playerId)
    .or(`team_id.is.null,team_id.eq.${teamId}`)
    .eq('status', 'proposed')
    .order('created_at', { ascending: false });
  if (res.error) {
    log('proposals', res.error);
    return { list: [], error: true };
  }
  // The read's title as the player reads it everywhere else on the page: typeset, in their voice.
  const titles = new Map(insights.map((i) => [i.id, speak(i.title, { role: 'player' })]));
  const rows = res.data ?? [];
  const coaches = await coachUserIds(supabase, rows.map((r) => r.coach_id).filter((id): id is string => !!id));
  const list: ChProposal[] = rows.map((r) => ({ id: r.id, title: r.title, from: (r.from_insight_id && titles.get(r.from_insight_id)) || null, coachUserId: (r.coach_id && coaches?.get(r.coach_id)) || null }));
  return { list, error: false };
}

/** The user ids of these coaches (golf_coaches is readable to any signed-in user). A failed read is logged and leaves them unknown. */
/** Proposing coaches' user ids by coach id, or null when the read failed (each proposal then offers no "Tell coach why"). */
async function coachUserIds(supabase: Supabase, coachIds: string[]): Promise<Map<string, string> | null> {
  const ids = [...new Set(coachIds)];
  if (!ids.length) return new Map();
  const res = await supabase.from('golf_coaches').select('id, user_id').in('id', ids);
  if (res.error) {
    log('proposalCoaches', res.error);
    return null;
  }
  return new Map((res.data ?? []).filter((c): c is { id: string; user_id: string } => !!c.user_id).map((c) => [c.id, c.user_id]));
}

/** The disabled gate names why; a failed lookup is a failed read, not "off". */
const LOOKUP_FAILED = /lookup failed/i;

/**
 * Whether CoachHelm is on for this player, for the board and for the Game profile, Standing and Deep dive views alike
 * (`isCoachHelmEnabledForPlayer`: the global switch, their coach's and their team's). A lookup that failed is `failed`, never
 * "off": the page says it did not load. `reason` is the coach's own words, when they gave some.
 */
export type PlayerHelmGate = { status: 'on' } | { status: 'off'; reason: string | null } | { status: 'failed' };

export async function loadPlayerHelmGate(playerId: string): Promise<PlayerHelmGate> {
  let gate;
  try {
    gate = await isCoachHelmEnabledForPlayer(playerId);
  } catch (err) {
    log('gate', err);
    return { status: 'failed' };
  }
  if (gate.effectivelyEnabled) return { status: 'on' };
  if (gate.disabledBy === null && gate.disabledReason && LOOKUP_FAILED.test(gate.disabledReason)) {
    log('gate', gate.disabledReason);
    return { status: 'failed' };
  }
  const reason = gate.disabledBy === 'coach' && gate.disabledReason && gate.disabledReason !== 'Disabled by coach' ? gate.disabledReason : null;
  return { status: 'off', reason };
}

/** The player's own CoachHelm. Their insights are their own, with or without a team. */
export async function loadPlayerCoachHelm(input: { playerId: string }): Promise<ChPlayerHelm> {
  const supabase = await createClient();
  const noProposals: ChPlayerHelm['proposals'] = { list: [], error: false };
  const failed: ChPlayerHelm = { off: null, proposals: noProposals, insights: { list: [], error: true }, rounds: null };

  const gate = await loadPlayerHelmGate(input.playerId);
  if (gate.status === 'failed') return failed;
  if (gate.status === 'off') return { off: { reason: gate.reason }, proposals: noProposals, insights: { list: [], error: false }, rounds: null };

  // The team gives the tour (Q-88) and the proposals (Q-77); it reads beside the feed.
  const teamRead = playerTeam(supabase, input.playerId);
  // CH13-21: only what the Board draws is counted as shown, and it knows that only once it has shaped the rows (the focus, up to
  // NEEDS_MAX reads and WORKING_MAX strengths, no note and no measured zero). Every return below says which ids it drew.
  let drew: (ids: readonly string[]) => void = () => {};
  const drawnIds = new Promise<readonly string[]>((resolve) => {
    drew = resolve;
  });
  let feed: EvidenceInsight[] = [];
  let threw = false;
  try {
    // includeMore: the Board caps 3 + 1 itself and counts the rest into the Deep dive, so it reads every read
    // (coachhelm_reads_v1_copy; no effect off).
    feed = await getInsightsForPlayer(input.playerId, { limit: PLAYER_FEED_LIMIT, drawnLater: () => drawnIds, includeMore: true });
  } catch (err) {
    log('feed', err);
    threw = true;
  }
  const done = <T,>(page: T, ids: readonly string[] = []): T => {
    drew(ids);
    return page;
  };

  if (threw) return done(failed);
  const team = await teamRead;
  // Without the team there is no telling what was proposed: the page says so, never "nothing proposed".
  const proposalsOf = async (insights: ReadonlyArray<{ id: string; title: string }>): Promise<ChPlayerHelm['proposals']> =>
    team.error ? { list: [], error: true } : loadProposals(supabase, input.playerId, team.teamId, insights);
  if (feed.length === 0) {
    // Empty: a real first run, or a swallowed failure? Rows the player has not dismissed themselves and the feed could draw say it failed.
    const [visible, dismissed] = await Promise.all([loadVisible(supabase, [input.playerId]), loadPlayerDismissed(supabase, input.playerId)]);
    if (visible.error || dismissed.error || visible.rows.some((r) => !dismissed.ids.has(r.id))) return done(failed);
    const [proposals, rounds, toGo] = await Promise.all([proposalsOf([]), countCountableRounds(supabase, input.playerId), roundsToGo(supabase, input.playerId)]);
    return done({ off: null, proposals, insights: { list: [], error: false }, rounds, roundsToGo: toGo });
  }

  // A card that states no finding ("no clear preference", "Scoring by par type") is not drawn on the player's board: it has nothing to work on.
  const drawn = feed.filter((i) => kindOf(i, team.tour) !== 'note');
  if (drawn.length === 0) {
    const [proposals, rounds, toGo] = await Promise.all([proposalsOf(feed), countCountableRounds(supabase, input.playerId), roundsToGo(supabase, input.playerId)]);
    return done({ off: null, proposals, insights: { list: [], error: false }, rounds, roundsToGo: toGo });
  }

  // The engine's states, each behind its flag (surfaces A): with every flag off `shaped.kept` is `drawn` and nothing is added.
  const flags = readEngineFlags();
  const now = new Date().toISOString();
  const viewer = { role: 'player' } as const;
  const shaped = shapeReadsLifecycle(drawn, flags.recheck, viewer, now);
  const [drills, proposals, assigned, newest, focus, corrections] = await Promise.all([
    drillTextByInsight(supabase, drawn),
    proposalsOf(feed),
    assignedByInsight(
      supabase,
      drawn.map((i) => i.id),
    ),
    newestRounds(supabase, [input.playerId], earliestStaleFloor(drawn)),
    readFocusVerdicts(
      supabase,
      shaped.kept.map((i) => i.id),
      flags.verdicts,
    ),
    // The player's own Not this / Good read on their reads (coachhelm_corrections_v1; null with it off or the table missing).
    readCorrections(supabase, { role: 'player', teamIds: team.teamId ? [team.teamId] : [], reads: shaped.kept.map((i) => ({ id: i.id, playerId: input.playerId })) }),
  ]);
  const newestRound = newest.days.get(input.playerId) ?? null;
  const list = shaped.kept.map((i) =>
    toChInsight(i, {
      drillText: drills.texts.get(i.id) ?? null,
      assigned: assigned.byInsight.get(i.id) ?? null,
      tour: team.tour,
      newestRound,
      viewer,
      engine: { flags, lifecycle: shaped.byId.get(i.id) ?? null, focus: focus.get(i.id) ?? null, now, corrections: corrections?.get(i.id) ?? null },
    }),
  );
  // A read beside the cards that failed leaves them drawn without it, and the board says so (never "not assigned", "not out of date").
  const missing = boardMissing({ drills: drills.error, assigned: assigned.error, newest: newest.error, tour: team.error || team.tourError });
  const board = partitionInsights(list);
  const shown = [board.focus, ...board.also, ...board.working].flatMap((i) => (i ? [i.id] : []));
  return done({ off: null, proposals, insights: { list, error: false }, rounds: null, ...(missing ? { missing } : {}), ...(shaped.cleared.length > 0 ? { cleared: shaped.cleared } : {}) }, shown);
}

/**
 * Whether CoachHelm is on for this coach, for the board and for Ask alike (`isCoachHelmEnabledForCoach`: the global switch, the
 * coach's own and the team's). A lookup that failed is `failed`, never "off": the page says it did not load.
 */
export type CoachHelmGate = { status: 'on' } | { status: 'off'; off: NonNullable<ChCoachHelmData['off']> } | { status: 'failed' };

export async function loadCoachHelmGate(coachId: string): Promise<CoachHelmGate> {
  let gate;
  try {
    gate = await isCoachHelmEnabledForCoach(coachId);
  } catch (err) {
    log('gate', err);
    return { status: 'failed' };
  }
  if (gate.effectivelyEnabled) return { status: 'on' };
  if (gate.disabledBy === null && gate.disabledReason && LOOKUP_FAILED.test(gate.disabledReason)) {
    log('gate', gate.disabledReason);
    return { status: 'failed' };
  }
  const by = gate.disabledBy === 'user' || gate.disabledBy === 'team' ? gate.disabledBy : 'global';
  const reason = by !== 'global' && gate.disabledReason && !/^Disabled by (user|team)$/.test(gate.disabledReason) ? gate.disabledReason : null;
  return { status: 'off', off: { by, reason } };
}

/** The coach's board with nothing on it; `off` is set when CoachHelm is off for them, which reads nothing else. */
export function emptyCoachHelm(off: ChCoachHelmData['off'] = null): ChCoachHelmData {
  return { off, roster: { count: 0, error: false }, pulse: { rows: [], error: false }, players: { list: [], error: false }, withoutSignals: 0 };
}

/**
 * The coach's CoachHelm for one team: the program pulse, and each player's top
 * insight with how many signals they have. Only the team's active players are
 * read, whichever other teams the coach staffs.
 */
export async function loadCoachCoachHelm(input: { coachId: string; teamId: string }): Promise<ChCoachHelmData> {
  const supabase = await createClient();
  const none = emptyCoachHelm();

  const gate = await loadCoachHelmGate(input.coachId);
  // The pulse is the program's, not the gate's: it still reads, so the board never says "nothing flagged" unread.
  if (gate.status === 'failed') return { ...none, roster: { count: 0, error: true }, pulse: pulseLater() };
  if (gate.status === 'off') return emptyCoachHelm(gate.off);

  // The gate is open, so the reads that need nothing from the roster start now and run beside it: the pulse (the longest chain on
  // this page) and the team's Tour. Nothing that records an insight as shown (`topInsights`) starts before the gate is known. The
  // pulse is never awaited here: only the board's pulse card draws it, so the board hands it over still on its way and the top card
  // does not wait for it (it is a promise that cannot reject, so an early return below leaves nothing unhandled). The Tour is
  // awaited with the cards it grades, so an early return may never await it and it is marked handled up front.
  const pulse = pulseLater();
  const tourRead = handled(coachTour(supabase, input.teamId));

  const members = await supabase.from('golf_team_members').select('player_id').eq('team_id', input.teamId).eq('status', 'active');
  if (members.error) {
    log('roster', members.error);
    return { ...none, roster: { count: 0, error: true }, pulse };
  }
  const memberIds = (members.data ?? []).map((m) => m.player_id);
  const people = memberIds.length
    ? await supabase.from('golf_players').select('id, first_name, last_name').in('id', memberIds)
    : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null }>, error: null };
  if (people.error) {
    log('players', people.error);
    return { ...none, roster: { count: 0, error: true }, pulse };
  }
  const roster = (people.data ?? []).map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || NO_NAME }));
  const ids = roster.map((p) => p.id);

  const [visible, heads] = await Promise.all([
    ids.length ? loadVisible(supabase, ids) : Promise.resolve({ rows: [], error: false }),
    ids.length ? topInsights(ids) : Promise.resolve(new Map<string, EvidenceInsight[]>()),
  ]);

  const top = [...heads.values()].map((l) => l[0]).filter((i): i is EvidenceInsight => !!i);
  // The heads came back empty though the visible read found insights: the delivery action swallowed a failure.
  const playersFailed = visible.error || (visible.rows.length > 0 && top.length === 0);
  if (playersFailed) return { off: null, roster: { count: roster.length, error: false }, pulse, players: { list: [], error: true }, withoutSignals: 0 };

  // The Tour is not waited for until here: nothing the next reads need comes from it, so it finishes beside them.
  // The team patterns count only current findings, by the same predicate as the player cards, so they wait for the newest rounds and
  // the Tour (their own eligibility read still runs beside the others).
  const newestRead = newestRounds(supabase, ids, earliestStaleFloor([...visible.rows, ...top]));
  const openRows = Promise.all([newestRead, tourRead]).then(([n, t]) => visible.rows.filter((r) => isOpenFinding(r, t.baseline, n.days.get(r.player_id) ?? null)));
  const [drills, assigned, declined, newest, tourResult, teamPatterns] = await Promise.all([
    drillTextByInsight(supabase, top),
    assignedByInsight(
      supabase,
      top.map((i) => i.id),
    ),
    declinedByInsight(
      supabase,
      top.map((i) => i.id),
    ),
    newestRead,
    tourRead,
    teamPatternsOf(supabase, input.teamId, roster, openRows),
  ]);
  const tour = tourResult.baseline;
  // The engine's states on each player's one card, each behind its flag (surfaces A). The lifecycle shapes each player's visible
  // reads, so a Contradicted pair finds its other read and the Cleared ones are listed under the card.
  const flags = readEngineFlags();
  const now = new Date().toISOString();
  const [focus, corrections] = await Promise.all([
    readFocusVerdicts(
      supabase,
      top.map((i) => i.id),
      flags.verdicts,
    ),
    // The coach's chips on each player's card: their own team's players only (the route checked the staff row).
    readCorrections(supabase, { role: 'coach', teamIds: [input.teamId], reads: top.map((i) => ({ id: i.id, playerId: i.player_id })) }),
  ]);
  // Open signals: a player's current findings. A strength, a card that states no finding and a read older than the player's
  // newest round are not signals, and a player whose top card is one of those has none (the old floor of one counted them).
  const counts = new Map<string, number>();
  for (const r of visible.rows) if (isOpenFinding(r, tour, newest.days.get(r.player_id) ?? null)) counts.set(r.player_id, (counts.get(r.player_id) ?? 0) + 1);

  const list: ChCoachPlayer[] = [];
  for (const p of roster) {
    const head = heads.get(p.id)?.[0];
    if (!head) continue;
    const newestRound = newest.days.get(p.id) ?? null;
    // The engine's states are the coach's whatever the name: the support pass and the coach-first day key on the role.
    const coach = { role: 'coach', first: p.name === NO_NAME ? NO_NAME : firstName(p.name) } as const;
    // The head leads its own list, so a pair it belongs to is drawn on it.
    const shaped = flags.recheck ? shapeReadsLifecycle([head, ...visible.rows.filter((r) => r.player_id === p.id && r.id !== head.id)], true, coach, now) : null;
    const card = toChInsight(head, {
      drillText: drills.texts.get(head.id) ?? null,
      assigned: assigned.byInsight.get(head.id) ?? null,
      declined: declined.ids.has(head.id),
      tour,
      newestRound,
      // The text is written to the player: by their first name on the coach's board (a player with no name keeps it as written).
      viewer: p.name === NO_NAME ? undefined : { role: 'coach', first: firstName(p.name) },
      engine: { flags, lifecycle: shaped?.byId.get(head.id) ?? null, focus: focus.get(head.id) ?? null, now, viewer: coach, corrections: corrections?.get(head.id) ?? null },
    });
    // The top card is a signal the board draws, so it counts even where the visible read deduped another copy of it away.
    const cleared = shaped?.cleared ?? [];
    list.push({ id: p.id, name: p.name, count: Math.max(counts.get(p.id) ?? 0, isOpenFinding(head, tour, newestRound) ? 1 : 0), top: card, ...(cleared.length > 0 ? { cleared } : {}) });
  }
  // A read beside the cards that failed leaves them drawn without it, and the board says so: never "not assigned", "not declined",
  // "not out of date" or "no Tour comparison", and with the focus status unknown it does not offer Assign.
  const missing = boardMissing({ drills: drills.error, assigned: assigned.error, declined: declined.error, newest: newest.error, tour: tourResult.error });
  const withoutNames = roster.filter((p) => !heads.get(p.id)?.[0] && p.name !== NO_NAME).map((p) => p.name);
  return { off: null, roster: { count: roster.length, error: false }, pulse, players: { list: sortCoachPlayers(list), error: false }, withoutSignals: roster.length - list.length, withoutNames, ...(missing ? { missing } : {}), ...(teamPatterns ? { teamPatterns } : {}), ...(isCoursePlanEnabled() ? { coursePlan: true } : {}) };
}

/**
 * Players with at least {@link TEAM_PATTERN_MIN_ROUNDS} countable rounds (the
 * team pattern's eligible roster, supercharge `03` §5.1), or null when the read
 * fails (the board then draws no Team pattern section rather than a wrong one).
 */
export async function eligibleForPatterns(supabase: Supabase, playerIds: string[]): Promise<Set<string> | null> {
  const counts = new Map<string, number>();
  for (const chunk of chunkIds(playerIds)) {
    const res = await fetchAllRowsResult<{ id: string; player_id: string; total_score: number | null; front_nine: number | null; back_nine: number | null; holes_played: number | null; total_putts: number | null }>(
      (from, to) =>
        supabase
          .from('golf_rounds')
          .select('id, player_id, total_score, front_nine, back_nine, holes_played, total_putts')
          .in('player_id', chunk)
          .eq('is_test', false)
          .eq('status', 'completed')
          .order('id', { ascending: true })
          .range(from, to),
      undefined,
      { table: 'golf_rounds', action: 'clubhouse.coachhelm', feature: 'coachhelm_ai_engine', sport: 'golf' },
    );
    if (res.error) {
      log('patternRounds', res.error);
      return null;
    }
    for (const r of res.data ?? []) if (isCountableRound(r)) counts.set(r.player_id, (counts.get(r.player_id) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= TEAM_PATTERN_MIN_ROUNDS).map(([id]) => id));
}

/**
 * The Team pattern section (Slice 7b, `coachhelm_team_pattern_v1`): the
 * engine's cause families shared by enough of the roster, from the visible
 * reads the board already loaded. Off, or a failed read, draws nothing.
 */
async function teamPatternsOf(supabase: Supabase, teamId: string, roster: ReadonlyArray<{ id: string; name: string }>, openRows: Promise<readonly RankableEvidenceInsight[]>): Promise<ChTeamPatterns | null> {
  if (!teamPatternEnabled() || roster.length === 0) return null;
  try {
    const [eligible, rows] = await Promise.all([
      eligibleForPatterns(
        supabase,
        roster.map((p) => p.id),
      ),
      openRows,
    ]);
    if (!eligible) return null;
    const result = computeTeamPatterns({
      teamId,
      reads: rows.map((r) => ({ id: r.id, player_id: r.player_id, insight_type: r.insight_type ?? '', evidence: r.evidence })),
      rosterTotal: roster.length,
      eligiblePlayerIds: eligible,
    });
    return toChTeamPatterns(result, new Map(roster.map((p) => [p.id, p.name])));
  } catch (err) {
    log('teamPatterns', err);
    return null;
  }
}

async function topInsights(ids: string[]): Promise<Map<string, EvidenceInsight[]>> {
  try {
    // One insight per player: only the top of each row is drawn, so only it is counted as shown in the effectiveness ledger.
    return await getTopInsightsForPlayers(ids, { limit: 1 });
  } catch (err) {
    log('heads', err);
    return new Map();
  }
}

/**
 * A read started before it is known to be needed, which a later early return may never await: marked handled now (so an early
 * return cannot leave an unhandled rejection) while still throwing to whoever does await it, exactly as it would have.
 */
export function handled<T>(read: Promise<T>): Promise<T> {
  read.catch(() => {});
  return read;
}

/**
 * The program pulse, `null` (its own "couldn't read") shown as its own notice. A pulse some of whose reads failed is its own
 * state too: the rows are what was found (an item made from a failed read is left out, never drawn as "no player has a round"),
 * and `missing` names what is not in them, so an empty pulse is never "nothing is flagged" over a read that did not land.
 */
async function pulseOf(): Promise<ChPulse> {
  // The pulse resolves its own chat context, and a roster read that failed leaves that context's roster empty: `getProgramPulse` answers
  // an empty program with no `failed`, which would be drawn as "Nothing is flagged" over a roster nobody read. Both getters are request
  // cached, so this is the context read the pulse already makes, not another one; it does not change what Fairway's callers get.
  const [ctx, pulse] = await Promise.all([getCoachChatContext(), getCoachProgramPulse()]);
  if (ctx.roster_failed) {
    log('pulse', new Error('the active roster did not read'));
    return { rows: [], error: true };
  }
  if (!pulse) return { rows: [], error: true };
  const missing = pulseMissing(pulse.failed);
  return { rows: pulseRows(pulseItemsThatStand(pulse.items, pulse.failed)), error: false, ...(missing.length > 0 ? { missing } : {}) };
}

/**
 * The pulse as a read the board can draw later: started now, marked handled, and never rejecting, so the loader hands it to the
 * board without waiting for it and an early return leaves nothing unhandled. A pulse that threw is `failed`, which the board draws
 * as the pulse not loading (CH-13203), logged here.
 */
function pulseLater(): Promise<ChPulseResult> {
  return handled(
    pulseOf().then(
      (pulse): ChPulseResult => ({ status: 'ok', pulse }),
      (err: unknown): ChPulseResult => {
        log('pulse', err);
        return { status: 'failed' };
      },
    ),
  );
}

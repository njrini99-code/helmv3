import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { getInsightsForPlayer, getTopInsightsForPlayers, type EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { collapseParScoring, dedupeBySubject, mapRowToRankable, type RankableEvidenceInsight, type RawInsightRowForRanking } from '@/app/golf/actions/insight-delivery-ranking';
import { isCoachHelmEnabledForCoach, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';
import { getCoachProgramPulse } from '@/lib/coachhelm/v3/chat/request-cache';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { isCountableRound } from '@/lib/golf/round-countable';
import { chLogServer } from '../lib/track-server';
import { isOpenFinding, kindOf, staleFloor } from './coachhelm-classify';
import { toChInsight } from './coachhelm-map';
import { firstName, pulseRows, sortCoachPlayers, type ChCoachHelmData, type ChCoachPlayer, type ChHelmAssigned, type ChPlayerHelm, type ChProposal, type ChTourBaseline } from './coachhelm-shape';
import { loadTourBenchmarks, tourForGender } from './stats-common';

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
 * A failed read is logged and answers an empty map: a read that cannot be compared is drawn as it is, never as an error on the
 * page. Never a write.
 */
export async function newestRounds(supabase: Supabase, playerIds: string[], since: string | null): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!since || playerIds.length === 0) return out;
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
    return out;
  }
  for (const r of res.data ?? []) {
    const day = r.round_date?.slice(0, 10);
    if (!day || !isCountableRound(r)) continue;
    if (day > (out.get(r.player_id) ?? '')) out.set(r.player_id, day);
  }
  return out;
}

/** The earliest day a round could make any of these reads out of date, or null when none can be told. */
export function earliestStaleFloor(rows: ReadonlyArray<Parameters<typeof staleFloor>[0]>): string | null {
  return rows.map(staleFloor).filter((d): d is string => !!d).sort()[0] ?? null;
}

/** The attached drill's description by insight (the delivery shape carries the drill's name and length, not its text). Failing leaves the drill's name and length. */
export async function drillTextByInsight(supabase: Supabase, insights: EvidenceInsight[]): Promise<Map<string, string>> {
  const firstDrill = new Map<string, string>();
  for (const i of insights) if (i.drills?.[0]) firstDrill.set(i.id, i.drills[0].id);
  const out = new Map<string, string>();
  if (firstDrill.size === 0) return out;
  const res = await supabase
    .from('golf_drills')
    .select('id, description')
    .in('id', [...new Set(firstDrill.values())]);
  if (res.error) {
    log('drills', res.error);
    return out;
  }
  const byDrill = new Map((res.data ?? []).map((d) => [d.id, d.description]));
  for (const [insightId, drillId] of firstDrill) {
    const text = byDrill.get(drillId);
    if (text) out.set(insightId, text);
  }
  return out;
}

/** Focus areas already made from these insights that still stand (a declined or completed one no longer does). Failing leaves Assign available; the server's duplicate guard still holds. */
export async function assignedByInsight(supabase: Supabase, insightIds: string[]): Promise<Map<string, ChHelmAssigned>> {
  const out = new Map<string, ChHelmAssigned>();
  if (insightIds.length === 0) return out;
  const res = await supabase.from('golf_player_focus_areas').select('from_insight_id, status').in('from_insight_id', insightIds).in('status', ['proposed', 'active', 'in_progress', 'paused']);
  if (res.error) {
    log('assigned', res.error);
    return out;
  }
  for (const r of res.data ?? []) {
    if (!r.from_insight_id) continue;
    // A live focus beats a proposal of the same insight.
    if (r.status !== 'proposed' || !out.has(r.from_insight_id)) out.set(r.from_insight_id, r.status === 'proposed' ? 'proposed' : 'active');
  }
  return out;
}

/**
 * The Tour's values for the team's own tour (Q-88: the Tour is the only benchmark): the LPGA's for a women's team, never the men's.
 * Without the team's row its tour is unknown, so no benchmark is claimed and a college comparison is left undrawn.
 */
async function tourBaselineOf(supabase: Supabase, team: { gender: string | null } | null): Promise<ChTourBaseline | null> {
  if (!team) return null;
  const tour = tourForGender(team.gender);
  return { tour, values: await loadTourBenchmarks(supabase, tour, 'coachhelm') };
}

/** The coach's team's Tour. A failed team read is logged and claims no benchmark. */
async function coachTour(supabase: Supabase, teamId: string): Promise<ChTourBaseline | null> {
  const res = await supabase.from('golf_teams').select('gender').eq('id', teamId).maybeSingle();
  if (res.error) {
    log('team', res.error);
    return null;
  }
  return tourBaselineOf(supabase, res.data);
}

/** The player's active team and its tour. `error`: the read failed, so neither the tour nor the proposals are known. */
export async function playerTeam(supabase: Supabase, playerId: string): Promise<{ teamId: string | null; tour: ChTourBaseline | null; error: boolean }> {
  const res = await supabase.from('golf_team_members').select('team_id, golf_teams(gender)').eq('player_id', playerId).eq('status', 'active').maybeSingle();
  if (res.error) {
    log('playerTeam', res.error);
    return { teamId: null, tour: null, error: true };
  }
  const row = res.data as { team_id: string; golf_teams: { gender: string | null } | null } | null;
  if (!row) return { teamId: null, tour: null, error: false };
  return { teamId: row.team_id, tour: await tourBaselineOf(supabase, row.golf_teams), error: false };
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
    .select('id, title, from_insight_id, created_at')
    .eq('player_id', playerId)
    .or(`team_id.is.null,team_id.eq.${teamId}`)
    .eq('status', 'proposed')
    .order('created_at', { ascending: false });
  if (res.error) {
    log('proposals', res.error);
    return { list: [], error: true };
  }
  const titles = new Map(insights.map((i) => [i.id, i.title]));
  const list: ChProposal[] = (res.data ?? []).map((r) => ({ id: r.id, title: r.title, from: (r.from_insight_id && titles.get(r.from_insight_id)) || null }));
  return { list, error: false };
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
  let feed: EvidenceInsight[] = [];
  let threw = false;
  try {
    feed = await getInsightsForPlayer(input.playerId, { limit: PLAYER_FEED_LIMIT });
  } catch (err) {
    log('feed', err);
    threw = true;
  }

  if (threw) return failed;
  const team = await teamRead;
  // Without the team there is no telling what was proposed: the page says so, never "nothing proposed".
  const proposalsOf = async (insights: ReadonlyArray<{ id: string; title: string }>): Promise<ChPlayerHelm['proposals']> =>
    team.error ? { list: [], error: true } : loadProposals(supabase, input.playerId, team.teamId, insights);
  if (feed.length === 0) {
    // Empty: a real first run, or a swallowed failure? Rows the player has not dismissed themselves and the feed could draw say it failed.
    const [visible, dismissed] = await Promise.all([loadVisible(supabase, [input.playerId]), loadPlayerDismissed(supabase, input.playerId)]);
    if (visible.error || dismissed.error || visible.rows.some((r) => !dismissed.ids.has(r.id))) return failed;
    const [proposals, rounds] = await Promise.all([proposalsOf([]), countCountableRounds(supabase, input.playerId)]);
    return { off: null, proposals, insights: { list: [], error: false }, rounds };
  }

  // A card that states no finding ("no clear preference", "Scoring by par type") is not drawn on the player's board: it has nothing to work on.
  const drawn = feed.filter((i) => kindOf(i, team.tour) !== 'note');
  if (drawn.length === 0) {
    const [proposals, rounds] = await Promise.all([proposalsOf(feed), countCountableRounds(supabase, input.playerId)]);
    return { off: null, proposals, insights: { list: [], error: false }, rounds };
  }

  const [drills, proposals, assigned, newest] = await Promise.all([
    drillTextByInsight(supabase, drawn),
    proposalsOf(feed),
    assignedByInsight(
      supabase,
      drawn.map((i) => i.id),
    ),
    newestRounds(supabase, [input.playerId], earliestStaleFloor(drawn)),
  ]);
  const newestRound = newest.get(input.playerId) ?? null;
  const list = drawn.map((i) => toChInsight(i, { drillText: drills.get(i.id) ?? null, assigned: assigned.get(i.id) ?? null, tour: team.tour, newestRound, viewer: { role: 'player' } }));
  return { off: null, proposals, insights: { list, error: false }, rounds: null };
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
  if (gate.status === 'failed') return { ...none, roster: { count: 0, error: true }, pulse: await pulseOf() };
  if (gate.status === 'off') return emptyCoachHelm(gate.off);

  const members = await supabase.from('golf_team_members').select('player_id').eq('team_id', input.teamId).eq('status', 'active');
  if (members.error) {
    log('roster', members.error);
    return { ...none, roster: { count: 0, error: true }, pulse: await pulseOf() };
  }
  const memberIds = (members.data ?? []).map((m) => m.player_id);
  const people = memberIds.length
    ? await supabase.from('golf_players').select('id, first_name, last_name').in('id', memberIds)
    : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null }>, error: null };
  if (people.error) {
    log('players', people.error);
    return { ...none, roster: { count: 0, error: true }, pulse: await pulseOf() };
  }
  const roster = (people.data ?? []).map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || NO_NAME }));
  const ids = roster.map((p) => p.id);

  const [pulse, visible, heads, tour] = await Promise.all([
    pulseOf(),
    ids.length ? loadVisible(supabase, ids) : Promise.resolve({ rows: [], error: false }),
    ids.length ? topInsights(ids) : Promise.resolve(new Map<string, EvidenceInsight[]>()),
    coachTour(supabase, input.teamId),
  ]);

  const top = [...heads.values()].map((l) => l[0]).filter((i): i is EvidenceInsight => !!i);
  // The heads came back empty though the visible read found insights: the delivery action swallowed a failure.
  const playersFailed = visible.error || (visible.rows.length > 0 && top.length === 0);
  if (playersFailed) return { off: null, roster: { count: roster.length, error: false }, pulse, players: { list: [], error: true }, withoutSignals: 0 };

  const [drills, assigned, newest] = await Promise.all([
    drillTextByInsight(supabase, top),
    assignedByInsight(
      supabase,
      top.map((i) => i.id),
    ),
    newestRounds(supabase, ids, earliestStaleFloor([...visible.rows, ...top])),
  ]);
  // Open signals: a player's current findings. A strength, a card that states no finding and a read older than the player's
  // newest round are not signals, and a player whose top card is one of those has none (the old floor of one counted them).
  const counts = new Map<string, number>();
  for (const r of visible.rows) if (isOpenFinding(r, tour, newest.get(r.player_id) ?? null)) counts.set(r.player_id, (counts.get(r.player_id) ?? 0) + 1);

  const list: ChCoachPlayer[] = [];
  for (const p of roster) {
    const head = heads.get(p.id)?.[0];
    if (!head) continue;
    const newestRound = newest.get(p.id) ?? null;
    const card = toChInsight(head, {
      drillText: drills.get(head.id) ?? null,
      assigned: assigned.get(head.id) ?? null,
      tour,
      newestRound,
      // The text is written to the player: by their first name on the coach's board (a player with no name keeps it as written).
      viewer: p.name === NO_NAME ? undefined : { role: 'coach', first: firstName(p.name) },
    });
    // The top card is a signal the board draws, so it counts even where the visible read deduped another copy of it away.
    list.push({ id: p.id, name: p.name, count: Math.max(counts.get(p.id) ?? 0, isOpenFinding(head, tour, newestRound) ? 1 : 0), top: card });
  }
  return { off: null, roster: { count: roster.length, error: false }, pulse, players: { list: sortCoachPlayers(list), error: false }, withoutSignals: roster.length - list.length };
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

/** The program pulse, `null` (its own "couldn't read") shown as its own notice. */
async function pulseOf(): Promise<ChCoachHelmData['pulse']> {
  const pulse = await getCoachProgramPulse();
  return pulse ? { rows: pulseRows(pulse.items), error: false } : { rows: [], error: true };
}

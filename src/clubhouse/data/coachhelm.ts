import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { getInsightsForPlayer, getTopInsightsForPlayers, type EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { collapseParScoring, dedupeBySubject, mapRowToRankable, type RawInsightRowForRanking } from '@/app/golf/actions/insight-delivery-ranking';
import { isCoachHelmEnabledForCoach, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';
import { getCoachProgramPulse } from '@/lib/coachhelm/v3/chat/request-cache';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { isCountableRound } from '@/lib/golf/round-countable';
import { chLogServer } from '../lib/track-server';
import { toChInsight } from './coachhelm-map';
import { pulseRows, sortCoachPlayers, type ChCoachHelmData, type ChCoachPlayer, type ChHelmAssigned, type ChPlayerHelm } from './coachhelm-shape';

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

/** The most insights one player's page loads: the feed's own ceiling for a player (`getInsightsForPlayer`). */
const PLAYER_FEED_LIMIT = 30;

const VISIBLE_COLUMNS = 'id, player_id, category, insight_type, title, content, signature, evidence, metadata, lifecycle_state, status, priority, acknowledged_at, resolved_at, created_at, updated_at';

/**
 * The visible insights for these players, deduplicated as the feed does
 * (par scoring collapsed, one per player, category and subject). A row the feed
 * could not draw (no numeric impact, confidence or metric) is not counted.
 */
async function loadVisible(supabase: Supabase, playerIds: string[]): Promise<{ rows: Array<{ id: string; player_id: string }>; error: boolean }> {
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
async function loadPlayerDismissed(supabase: Supabase, playerId: string): Promise<{ ids: Set<string>; error: boolean }> {
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
async function countCountableRounds(supabase: Supabase, playerId: string): Promise<number | null> {
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

/** The attached drill's description by insight (the delivery shape carries the drill's name and length, not its text). Failing leaves the drill's name and length. */
async function drillTextByInsight(supabase: Supabase, insights: EvidenceInsight[]): Promise<Map<string, string>> {
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
async function assignedByInsight(supabase: Supabase, insightIds: string[]): Promise<Map<string, ChHelmAssigned>> {
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

/** The disabled gate names why; a failed lookup is a failed read, not "off". */
const LOOKUP_FAILED = /lookup failed/i;

/** The player's own CoachHelm. Their insights are their own, with or without a team. */
export async function loadPlayerCoachHelm(input: { playerId: string }): Promise<ChPlayerHelm> {
  const supabase = await createClient();
  const failed: ChPlayerHelm = { off: null, insights: { list: [], error: true }, rounds: null };

  let gate;
  try {
    gate = await isCoachHelmEnabledForPlayer(input.playerId);
  } catch (err) {
    log('gate', err);
    return failed;
  }
  if (!gate.effectivelyEnabled) {
    if (gate.disabledBy === null && gate.disabledReason && LOOKUP_FAILED.test(gate.disabledReason)) {
      log('gate', gate.disabledReason);
      return failed;
    }
    const reason = gate.disabledBy === 'coach' && gate.disabledReason && gate.disabledReason !== 'Disabled by coach' ? gate.disabledReason : null;
    return { off: { reason }, insights: { list: [], error: false }, rounds: null };
  }

  let feed: EvidenceInsight[] = [];
  let threw = false;
  try {
    feed = await getInsightsForPlayer(input.playerId, { limit: PLAYER_FEED_LIMIT });
  } catch (err) {
    log('feed', err);
    threw = true;
  }

  if (threw) return failed;
  if (feed.length === 0) {
    // Empty: a real first run, or a swallowed failure? Rows the player has not dismissed themselves and the feed could draw say it failed.
    const [visible, dismissed] = await Promise.all([loadVisible(supabase, [input.playerId]), loadPlayerDismissed(supabase, input.playerId)]);
    if (visible.error || dismissed.error || visible.rows.some((r) => !dismissed.ids.has(r.id))) return failed;
    return { off: null, insights: { list: [], error: false }, rounds: await countCountableRounds(supabase, input.playerId) };
  }

  const drills = await drillTextByInsight(supabase, feed);
  return { off: null, insights: { list: feed.map((i) => toChInsight(i, { drillText: drills.get(i.id) ?? null })), error: false }, rounds: null };
}

/**
 * The coach's CoachHelm for one team: the program pulse, and each player's top
 * insight with how many signals they have. Only the team's active players are
 * read, whichever other teams the coach staffs.
 */
export async function loadCoachCoachHelm(input: { coachId: string; teamId: string }): Promise<ChCoachHelmData> {
  const supabase = await createClient();
  const none: ChCoachHelmData = { off: null, roster: { count: 0, error: false }, pulse: { rows: [], error: false }, players: { list: [], error: false }, withoutSignals: 0 };

  let gate;
  try {
    gate = await isCoachHelmEnabledForCoach(input.coachId);
  } catch (err) {
    log('gate', err);
    return { ...none, roster: { count: 0, error: true } };
  }
  if (!gate.effectivelyEnabled) {
    if (gate.disabledBy === null && gate.disabledReason && LOOKUP_FAILED.test(gate.disabledReason)) {
      log('gate', gate.disabledReason);
      return { ...none, roster: { count: 0, error: true } };
    }
    const by = gate.disabledBy === 'user' || gate.disabledBy === 'team' ? gate.disabledBy : 'global';
    const reason = by !== 'global' && gate.disabledReason && !/^Disabled by (user|team)$/.test(gate.disabledReason) ? gate.disabledReason : null;
    return { ...none, off: { by, reason } };
  }

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
  const roster = (people.data ?? []).map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Player' }));
  const ids = roster.map((p) => p.id);

  const [pulse, visible, heads] = await Promise.all([
    pulseOf(),
    ids.length ? loadVisible(supabase, ids) : Promise.resolve({ rows: [], error: false }),
    ids.length ? topInsights(ids) : Promise.resolve(new Map<string, EvidenceInsight[]>()),
  ]);

  const top = [...heads.values()].map((l) => l[0]).filter((i): i is EvidenceInsight => !!i);
  // The heads came back empty though the visible read found insights: the delivery action swallowed a failure.
  const playersFailed = visible.error || (visible.rows.length > 0 && top.length === 0);
  if (playersFailed) return { off: null, roster: { count: roster.length, error: false }, pulse, players: { list: [], error: true }, withoutSignals: 0 };

  const [drills, assigned] = await Promise.all([
    drillTextByInsight(supabase, top),
    assignedByInsight(
      supabase,
      top.map((i) => i.id),
    ),
  ]);
  const counts = new Map<string, number>();
  for (const r of visible.rows) counts.set(r.player_id, (counts.get(r.player_id) ?? 0) + 1);

  const list: ChCoachPlayer[] = [];
  for (const p of roster) {
    const head = heads.get(p.id)?.[0];
    if (!head) continue;
    list.push({ id: p.id, name: p.name, count: Math.max(1, counts.get(p.id) ?? 1), top: toChInsight(head, { drillText: drills.get(head.id) ?? null, assigned: assigned.get(head.id) ?? null }) });
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

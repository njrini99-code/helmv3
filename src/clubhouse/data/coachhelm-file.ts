import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { isFlagEnabled } from '@/lib/flags';
import { isReadEnabled } from '@/lib/coachhelm/v3/read/flag';
import { buildFieldDayContext } from '@/lib/coachhelm/v3/field-day/field';
import { loadTeamFieldRounds } from '@/lib/coachhelm/v3/field-day/loader';
import { readAttributionForPlayer } from '@/lib/coachhelm/v3/effectiveness/attribution-read';
import { loadFocusAreaPracticeLogData } from '@/lib/coachhelm/focus-areas/practice-log-loader';
import { loadActiveGoals, loadRecentlyAchievedGoals } from '@/lib/coachhelm/v3/goals/loader';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { loadPlayerHelmGate, loadProposals, playerTeam, roundsToGo, topInsights } from './coachhelm';
import { playerDiveCore } from './coachhelm-dive';
import { coachDiveCore, loadCoachPlayerStanding, type ChCoachPlayerScope } from './coachhelm-player';
import { firstName, partitionInsights, type ChHelmLifecycle } from './coachhelm-shape';
import type { ChDeepInsight } from './coachhelm-dive-shape';
import { loadPlayerStanding, readStandingRows } from './coachhelm-standing';
import { classYearLabel, loadTeamZone, seasonStartDate } from './season';
import { readTextFor } from './coachhelm-voice';
import { fileDay, teamFigureOf, toChFileField, toChFilePlan, toChFileSg, toChFileTrack, type ChFileCards, type ChFileField, type ChFileIntent, type ChFilePlan, type ChFileRosterRow, type ChFileTrack, type ChFocusRow, type ChPlayerFile, type ChPlayerWeek } from './coachhelm-file-shape';
import type { ChViewLoad } from './coachhelm-views-shape';
import type { ChStanding } from './coachhelm-standing-shape';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const log = (where: string, err: unknown) => void logServerError(err instanceof Error ? err.message : String(err), { action: `coachhelm.file.${where}`, featureArea: 'coachhelm' });

/** The desktop rail: the team's active players, each with their top read, or the class year when there is none (CP-LNS-18). Only the reads the rail draws count as shown (CT0a). */
export async function loadFileRoster(scope: ChCoachPlayerScope): Promise<ChFileRosterRow[] | null> {
  try {
    const supabase = await createClient();
    const now = new Date();
    const tz = await loadTeamZone(supabase, scope.teamId, 'coachhelm');
    const { data, error } = await supabase.from('golf_team_members').select('player:golf_players(id, first_name, last_name, graduation_year)').eq('team_id', scope.teamId).eq('status', 'active');
    if (error) throw error;
    const rows: ChFileRosterRow[] = [];
    for (const r of data ?? []) {
      const p = (r as unknown as { player: { id: string; first_name: string | null; last_name: string | null; graduation_year: number | null } | null }).player;
      if (!p) continue;
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Player';
      rows.push({ id: p.id, name, first: firstName(name), line: classYearLabel(p.graduation_year, now, tz) ?? '' });
    }
    const tops = await topInsights(
      rows.map((r) => r.id),
      { limit: 1, drawnLater: (shown) => Promise.resolve([...shown.values()].flatMap((list) => list.slice(0, 1).map((i) => i.id))) },
    );
    return rows
      .map((r) => {
        const top = tops.get(r.id)?.[0];
        return top ? { ...r, line: readTextFor(top, true).title } : r;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    log('roster', err);
    return null;
  }
}

/** The newest focus this coach made for this player, with the first time its read was drawn on the player's own CoachHelm. Never a false tick (W-LNS-5). */
export async function loadFilePlan(scope: ChCoachPlayerScope, zone: string): Promise<ChFilePlan | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('golf_player_focus_areas')
      .select('id, title, status, created_at, started_at, updated_at, from_insight_id, drill_ids')
      .eq('player_id', scope.playerId)
      .eq('coach_id', scope.coachId)
      .in('status', ['proposed', 'active', 'in_progress', 'declined'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = (data?.[0] ?? null) as (ChFocusRow & { drill_ids: string[] | null }) | null;
    let shownAt: string | null = null;
    if (row?.from_insight_id) {
      const seen = await supabase.from('golf_insight_exposure').select('shown_at').eq('insight_id', row.from_insight_id).eq('surface', 'player_feed').gte('shown_at', row.created_at).order('shown_at').limit(1);
      if (seen.error) throw seen.error;
      shownAt = seen.data?.[0]?.shown_at ?? null;
    }
    const [goal, practice, coach] = await Promise.all([fileGoal(scope, row), filePractice(supabase, row), coachLabel(supabase, scope.coachId)]);
    return toChFilePlan(row, shownAt, goal, practice, coach, zone);
  } catch (err) {
    log('plan', err);
    return null;
  }
}

/** A goal the coach may see: coach-made or shared (RLS `goals_coach_view`), never a player's private one (lenses PR 0). */
async function fileGoal(scope: ChCoachPlayerScope, row: { from_insight_id: string | null } | null): Promise<Goal | null> {
  const [active, done] = await Promise.all([loadActiveGoals(scope.playerId), loadRecentlyAchievedGoals(scope.playerId)]);
  const mine = [...active, ...done].filter((g) => g.player_id === scope.playerId && (g.creator_role === 'coach' || g.shared_with_coach));
  return mine.find((g) => row?.from_insight_id && g.origin_insight_id === row.from_insight_id) ?? mine[0] ?? null;
}

async function filePractice(supabase: Supabase, row: { id: string; drill_ids: string[] | null } | null): Promise<ChFilePlan['practice']> {
  if (!row || !isFlagEnabled('coachhelm_focus_area_practice_log')) return null;
  try {
    const log7 = await loadFocusAreaPracticeLogData(supabase, [row.id]);
    const sum = log7.practiceSummaryByFocusArea?.get(row.id);
    const drillId = row.drill_ids?.[0];
    let drill: string | null = null;
    if (drillId) {
      const d = await supabase.from('golf_drills').select('title').eq('id', drillId).maybeSingle();
      drill = d.data?.title ?? null;
    }
    if (!drill) return null;
    return { drill, count: sum?.count ?? 0 };
  } catch (err) {
    log('practice', err);
    return null;
  }
}

async function coachLabel(supabase: Supabase, coachId: string): Promise<string> {
  const { data } = await supabase.from('golf_coaches').select('full_name').eq('id', coachId).maybeSingle();
  const last = data?.full_name?.trim().split(/\s+/).pop();
  return last ? `Coach ${last}` : 'Your coach';
}

/** The last round against the team on the day, behind the team-pattern flag its loader asks for. `undefined`: the read failed. */
export async function loadFileField(scope: { teamId: string; playerId: string; lastRound: string | null }, view: { role: 'coach'; first: string } | { role: 'player' }, zone: string): Promise<ChFileField | null | undefined> {
  if (!isFlagEnabled('coachhelm_team_pattern_v1') || !scope.lastRound) return null;
  try {
    const supabase = await createClient();
    const rounds = await loadTeamFieldRounds(supabase, scope.teamId, scope.lastRound.slice(0, 10));
    if (!rounds) return undefined;
    const mine = rounds.filter((r) => r.player_id === scope.playerId).pop();
    if (!mine) return null;
    const ctx = buildFieldDayContext(rounds);
    const entry = ctx.get(mine.round_id) ?? null;
    if (!entry) return null;
    const others: number[] = [];
    const day = mine.date.slice(0, 10);
    for (const r of rounds) {
      if (r.player_id === scope.playerId || r.course_id !== mine.course_id || r.date.slice(0, 10) !== day || r.score_to_par == null) continue;
      others.push((r.score_to_par * 18) / (r.holes > 0 ? r.holes : 18));
    }
    const round = await supabase.from('golf_rounds').select('total_score, course_name').eq('id', mine.round_id).maybeSingle();
    return toChFileField(entry, view.role === 'coach' ? others : [], view, { date: mine.date, course: round.data?.course_name ?? null, score: round.data?.total_score ?? null }, zone);
  } catch (err) {
    log('field', err);
    return undefined;
  }
}

/** The coach's own plan, as written: session client, RLS `intent_coach_only`. No row is "No plan set", never `loadIntent`'s made-up default. `undefined`: the read failed. */
export async function loadFileIntent(scope: ChCoachPlayerScope): Promise<ChFileIntent | null | undefined> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('golf_coach_player_intent').select('narrative_goal, alert_posture, highlight_categories, notes, updated_at').eq('coach_id', scope.coachId).eq('player_id', scope.playerId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { aim: data.narrative_goal as ChFileIntent['aim'], alerts: data.alert_posture as ChFileIntent['alerts'], watching: data.highlight_categories ?? [], note: data.notes };
  } catch (err) {
    log('intent', err);
    return undefined;
  }
}

/** This coach's focuses on this player this season (not `ChTrackRecord`, which is team-wide). `undefined`: the read failed. */
export async function loadFileTrack(scope: ChCoachPlayerScope, zone: string): Promise<ChFileTrack | undefined> {
  try {
    const supabase = await createClient();
    const since = seasonStartDate(new Date(), zone);
    const { data, error } = await supabase.from('golf_player_focus_areas').select('id, title, outcome_status, completed_at, from_insight_id, created_at').eq('player_id', scope.playerId).eq('coach_id', scope.coachId).gte('created_at', since).order('created_at', { ascending: false });
    if (error) throw error;
    const attribution = await readAttributionForPlayer(supabase, scope.playerId);
    return toChFileTrack(data ?? [], attribution.ok ? attribution.rows : [], zone);
  } catch (err) {
    log('track', err);
    return undefined;
  }
}

/** `golf_rounds.total_penalties` for the last 8 countable rounds, oldest first (04 8 N). */
export async function loadFilePenalties(supabase: Supabase, playerId: string, zone: string): Promise<Array<{ label: string; value: number }> | null> {
  const { data, error } = await supabase.from('golf_rounds').select('round_date, total_penalties').eq('player_id', playerId).eq('status', 'completed').not('total_penalties', 'is', null).order('round_date', { ascending: false }).limit(8);
  if (error) {
    log('penalties', error);
    return null;
  }
  return (data ?? []).reverse().map((r) => ({ label: fileDay(r.round_date, zone) ?? '', value: r.total_penalties as number }));
}

/** Reads the coach dismissed, for Undo on reload (S-FILE.undo 3). A player route never ships them. */
async function loadFileDismissed(scope: ChCoachPlayerScope): Promise<ChFileCards['dismissed']> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('golf_coach_insights').select('id, title, lifecycle_state').eq('player_id', scope.playerId).eq('status', 'dismissed').order('updated_at', { ascending: false }).limit(30);
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, title: r.title ?? '', lifecycle: (r.lifecycle_state ?? 'detected') as ChHelmLifecycle }));
  } catch (err) {
    log('dismissed', err);
    return [];
  }
}

function coachCards(list: ChDeepInsight[], rows: readonly PlayerStanding[], cleared: ChFileCards['cleared']): Pick<ChFileCards, 'feat' | 'featTeam' | 'reads' | 'cleared' | 'working' | 'more'> {
  const { focus } = partitionInsights(
    list.map((d) => d.base),
    undefined,
  );
  const feat = list.find((d) => d.base.id === focus?.id) ?? list[0] ?? null;
  return { feat, featTeam: feat ? teamFigureOf(rows, feat.base.metric) : null, reads: list, cleared, working: [], more: 0 };
}

/** The Board's own caps, in the Board's order, so the lens and the player's "Your week" draw the same reads (S-FILE.lens 3). */
export function playerCards(list: ChDeepInsight[], rows: readonly PlayerStanding[]): Pick<ChFileCards, 'feat' | 'featTeam' | 'reads' | 'cleared' | 'working' | 'more' | 'dismissed'> {
  const by = new Map(list.map((d) => [d.base.id, d]));
  const { focus, also, working, more } = partitionInsights(
    list.map((d) => d.base),
    undefined,
  );
  const pick = (ids: ReadonlyArray<{ id: string }>) => ids.map((i) => by.get(i.id)).filter((d): d is ChDeepInsight => !!d);
  const feat = focus ? (by.get(focus.id) ?? null) : null;
  return { feat, featTeam: feat ? teamFigureOf(rows, feat.base.metric) : null, reads: pick(also), cleared: [], working: pick(working), more, dismissed: [] };
}

/** One coach's file on one player: one `coach_feed` set per view (W-LNS-3); the lens records nothing (W-LNS-4). */
export async function loadCoachPlayerFile(input: { scope: ChCoachPlayerScope }): Promise<ChViewLoad<ChPlayerFile>> {
  const { scope } = input;
  const { load, raw, lens } = await coachDiveCore({ scope }, { exampleRounds: true, lens: true });
  if (load.status !== 'ready') return load;
  try {
    const supabase = await createClient();
    const zone = await loadTeamZone(supabase, scope.teamId, 'coachhelm');
    const first = scope.head.first;
    const [standing, rowsRead, plan, field, intent, track, dismissed, toGo, penalties] = await Promise.all([
      loadCoachPlayerStanding({ scope, feed: [...raw.values()] }),
      readStandingRows(scope.playerId),
      loadFilePlan(scope, zone),
      loadFileField(scope, { role: 'coach', first }, zone),
      loadFileIntent(scope),
      loadFileTrack(scope, zone),
      loadFileDismissed(scope),
      roundsToGo(supabase, scope.playerId),
      loadFilePenalties(supabase, scope.playerId, zone),
    ]);
    const rows = rowsRead.ok ? rowsRead.rows : [];
    const st: ChStanding | null = standing.status === 'ready' ? standing.data : null;
    const source = { window: st?.window.label ?? 'All time', rounds: st?.rounds ?? null };
    const sg = st ? toChFileSg(st.ladder, rows, { you: false, first }, source) : null;
    const lensSg = st ? toChFileSg(st.ladder, rows, { you: true, first }, source) : null;
    // The player's own view of the same round: no dots, no card under five (SHARED-11).
    const lensField = field === null || field === undefined ? null : await loadFileField(scope, { role: 'player' }, zone);
    const cards: ChFileCards = { ...coachCards(load.data.list, rows, load.data.cleared ?? []), dismissed, sg, plan, field: field ?? null, intent: intent ?? null, track: track ?? null };
    const lensCards: ChFileCards | null = lens ? { ...playerCards(lens, rows), sg: lensSg, plan, field: lensField ?? null } : null;
    const failed: ChPlayerFile['failed'] = {
      ...(standing.status !== 'ready' ? { sg: true as const } : {}),
      ...(plan === null ? { plan: true as const } : {}),
      ...(field === undefined ? { field: true as const } : {}),
      ...(intent === undefined ? { intent: true as const } : {}),
      ...(track === undefined ? { track: true as const } : {}),
    };
    return { status: 'ready', data: { head: scope.head, cards, lens: lensCards, failed, rounds: load.data.rounds ?? st?.rounds ?? null, roundsToGo: toGo, readOn: isReadEnabled(), penalties } };
  } catch (err) {
    log('load', err);
    return { status: 'failed' };
  }
}

/** A player's own "Your week": the real feed (the exposure it records is the real Shown), only what it draws counted, with no handshake and nobody else's name or figure (S-BOARD 7, 8). */
export async function loadPlayerYourWeek(input: { playerId: string }): Promise<{ load: ChViewLoad<ChPlayerWeek> }> {
  const { playerId } = input;
  const gate = await loadPlayerHelmGate(playerId);
  if (gate.status === 'off') return { load: { status: 'off', reason: gate.reason } };
  if (gate.status === 'failed') return { load: { status: 'failed' } };
  // The Board's partition reads the feed's own order, never the Deep dive's: the lens and this page draw the same reads (S-FILE.lens 3).
  const byFeed = (list: readonly ChDeepInsight[], ids: readonly string[]) => {
    const at = new Map(ids.map((id, i) => [id, i]));
    return [...list].sort((a, b) => (at.get(a.base.id) ?? 0) - (at.get(b.base.id) ?? 0));
  };
  const { load, raw } = await playerDiveCore(
    { playerId },
    {
      drawn: (list, ids) => {
        const { focus, also, working } = partitionInsights(byFeed(list, ids).map((d) => d.base));
        return [focus, ...also, ...working].filter((i): i is NonNullable<typeof i> => !!i).map((i) => i.id);
      },
    },
  );
  if (load.status !== 'ready') return { load };
  try {
    const supabase = await createClient();
    const team = await playerTeam(supabase, playerId);
    const teamId = team?.teamId ?? null;
    const zone = teamId ? await loadTeamZone(supabase, teamId, 'coachhelm') : 'America/New_York';
    const list = byFeed(load.data.list, [...raw.keys()]);
    const [proposals, rowsRead, standing, field, toGo, penalties, last] = await Promise.all([
      loadProposals(supabase, playerId, teamId, list.map((d) => ({ id: d.base.id, title: d.base.title })), true),
      readStandingRows(playerId),
      loadPlayerStanding({ playerId, feed: () => Promise.resolve([]) }),
      newestDay(supabase, playerId).then((d) => (teamId && d ? loadFileField({ teamId, playerId, lastRound: d }, { role: 'player' }, zone) : null)),
      roundsToGo(supabase, playerId),
      loadFilePenalties(supabase, playerId, zone),
      latestFocus(supabase, playerId),
    ]);
    const rows = rowsRead.ok ? rowsRead.rows : [];
    const st = standing.status === 'ready' ? standing.data : null;
    const sg = st ? toChFileSg(st.ladder, rows, { you: true, first: '' }, { window: st.window.label, rounds: st.rounds }) : null;
    const coach = proposals.list[0]?.coachName ?? 'Your coach';
    const plan = toChFilePlan(last, null, null, null, coach, zone);
    const cards: ChFileCards = { ...playerCards(list, rows), sg, plan, field: field ?? null };
    return { load: { status: 'ready', data: { cards, proposals, rounds: load.data.rounds ?? st?.rounds ?? null, roundsToGo: toGo, readOn: isReadEnabled(), penalties, refreshed: st?.refreshed ?? null, failed: { ...(st ? {} : { sg: true as const }), ...(field === undefined ? { field: true as const } : {}) } } } };
  } catch (err) {
    log('week', err);
    return { load: { status: 'failed' } };
  }
}

async function newestDay(supabase: Supabase, playerId: string): Promise<string | null> {
  const { data } = await supabase.from('golf_rounds').select('round_date').eq('player_id', playerId).eq('status', 'completed').order('round_date', { ascending: false }).limit(1);
  return data?.[0]?.round_date ?? null;
}

async function latestFocus(supabase: Supabase, playerId: string): Promise<ChFocusRow | null> {
  const { data } = await supabase.from('golf_player_focus_areas').select('id, title, status, created_at, started_at, updated_at, from_insight_id').eq('player_id', playerId).in('status', ['proposed', 'active', 'in_progress', 'declined']).order('created_at', { ascending: false }).limit(1);
  return (data?.[0] ?? null) as ChFocusRow | null;
}

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import type { ChSgTour } from '../lib/sg';
import { homeClock, latestWithHoles, loadHomeWeek, type ChHomeClock, type ChHomeEvent, type ChHomeWeek, type ChLatestRound } from './home';
import { isFull18, lastTenFloor, loadSeasonRounds, mean, summarizePlayer, type ChRound } from './season';
import { holeRounds } from './round-scope';
import { legRows, type ChPlayerLeg } from './leg-rows';
import { replyClosedAt } from '../screens/calendar/model';
import { getPlayerHubAnnouncements } from '@/app/golf/actions/player-notifications';
import { parsePlayerHubEvents } from '@/lib/golf/player-hub-events';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { loadRoundCache, loadTourBenchmarks, seasonOnly, tourForGender, type ChRoundCache } from './stats-common';
import { formatFixed } from '../lib/format';

export { legRows } from './leg-rows';
export type { ChLegKey, ChPlayerLeg } from './leg-rows';

/**
 * Player Home (Clubhouse; design/handoff/Player - Home.html and
 * Player - Home - Mobile.html). One server read, final data on first paint.
 *
 * Rounds posted as a total only count in the scores here (the brief, the
 * scoring chart) and in none of the leg figures (Q-123). The scoring card, the
 * legs and the brief are the newest rounds in any season (Q-122); strokes
 * gained is the season's.
 *
 * The player's own rounds only: nothing here reads a teammate's scores (a
 * player is compared against the Tour, never against teammates, as on Stats). The
 * week is the team's calendar without who else is invited. Every section
 * carries its own error flag, and a figure with no source is absent, never
 * approximated.
 */

/** Rounds in the leg figures (the newest with their holes scored) and the brief's form. */
export const LEG_WINDOW = 10;
/** Scores sent for the scoring chart: 20 shown at most, and 20 before them for "vs previous". */
const SCORING_MAX = 40;

export interface ChScoringPoint {
  id: string;
  /** "Oct 12" */
  label: string;
  score: number;
  par: number | null;
}

export interface ChPlayerHome {
  /** "Good afternoon, Theo." */
  greeting: string;
  todayLabel: string;
  /** The team clock the page was read on (zone and date), for the day rollover (useHomeDayRollover). Optional for fixtures. */
  clock?: ChHomeClock;
  /** One sentence from the player's own rounds; null before their first round or when rounds didn't load. */
  brief: string | null;
  /** The coach "Message coach" opens a thread with; null opens Messages. */
  coachUserId: string | null;
  week: ChHomeWeek['week'];
  next: ChHomeEvent | null;
  today: ChHomeEvent[];
  weekNote: ChHomeWeek['weekNote'];
  latest: { rounds: ChLatestRound[]; error: boolean; holesError: boolean };
  /** Oldest to newest, 18-hole countable rounds, up to SCORING_MAX. */
  scoring: { points: ChScoringPoint[]; error: boolean };
  sgPerRound: number | null;
  /** What the strokes gained here is measured against; null when the team's own row didn't load (no baseline is claimed). */
  tour: ChSgTour;
  handicap: number | null;
  /** Null when the rounds didn't load. `cacheError`: scrambling and three-putts didn't load. */
  legs: { rows: ChPlayerLeg[]; cacheError: boolean; benchError: boolean } | null;
  /** What the coach is waiting on, as Team Hub lists it (`loadPlayerAsks`); null when any of it didn't load (the row hides). */
  asks?: ChPlayerAsks | null;
}

/**
 * What the coach is waiting on (Home's "From your coach" row), counted as Team Hub lists it for the player: replies still
 * to give (their own invitation, unanswered, that the server would still take), posts asking for an acknowledgement they
 * haven't given, and their open tasks due within a week or overdue.
 */
export interface ChPlayerAsks {
  rsvps: number;
  acks: number;
  tasksDue: number;
}

/** A task counts as due when it is due within this many days (or is overdue). */
export const ASK_TASK_DAYS = 7;

function log(read: string, error: unknown) {
  chLogServer('home', read, error);
}

const shortDate = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

export async function loadPlayerHome(input: { teamId: string; playerId: string; firstName: string }): Promise<ChPlayerHome> {
  const supabase = await createClient();
  const now = new Date();

  // Everything that can start now does, and each later read starts when the one it needs has answered, not when its siblings have:
  // the timezone, the week, the rounds, the player and the team go together; the newest rounds' cards and the leg figures follow the
  // rounds, the Tour's averages and the coach follow the team (they used to wait for the week's events and replies too).
  const clockRead = homeClock(supabase, input.teamId, now);
  // No names: a player's Home never lists who else is invited.
  // A player's week reads reply counts, never teammates' rows (migration 20261017102000).
  // Their own replies decide which meetings are theirs to see (Decision B) and carry "You're going" / "Reply needed".
  const weekRead = loadHomeWeek(supabase, { teamId: input.teamId, tz: clockRead.then((c) => c.tz), now, names: new Map(), viewer: 'player', playerId: input.playerId });
  // Its reads start now; only the tasks' "due this week" waits for the team's day.
  const asksRead = loadPlayerAsks(supabase, { teamId: input.teamId, playerId: input.playerId, now, today: clockRead.then((c) => c.day) });
  // The scoring card's Last 5 / 10 / 20, the leg figures and the brief are the player's newest rounds in any season, as Stats' Last 10 is (Q-122); the season's own figures are cut below.
  const roundsRead = loadSeasonRounds(supabase, [input.playerId], { surface: 'home', since: lastTenFloor() });
  const playerRead = Promise.resolve(supabase.from('golf_players').select('handicap_index, handicap').eq('id', input.playerId).maybeSingle());
  const teamRead = Promise.resolve(supabase.from('golf_teams').select('gender, created_by, organization_id').eq('id', input.teamId).maybeSingle());
  const fullOf = (res: Awaited<typeof roundsRead>) => (res.error ? [] : res.rounds.filter(isFull18));
  // The leg figures are hole-level: the newest rounds with their holes (a round posted as a total only has none, Q-123). The brief and the scoring chart are scores and count every round.
  const windowOf = (res: Awaited<typeof roundsRead>) => holeRounds(fullOf(res)).slice(0, LEG_WINDOW);
  const latestRead = roundsRead.then((res) => latestWithHoles(supabase, fullOf(res), () => input.firstName));
  const cacheRead = roundsRead.then((res) => {
    const window = windowOf(res);
    return window.length ? loadRoundCache(supabase, window.map((r) => r.id), 'home') : { byRound: new Map<string, ChRoundCache>(), error: false };
  });
  // Without the team's row its tour is unknown, so no benchmark is claimed (as on Stats, CH-4210).
  const benchRead = teamRead.then((team) => (team.data ? loadTourBenchmarks(supabase, tourForGender(team.data.gender), 'home') : null));
  const coachRead = teamRead.then((team) => coachFor(supabase, team.data ?? null));
  const [{ greeting, todayLabel, tz, day }, wk, roundsRes, playerRes, teamRes, latest, cache, bench, coachUserId, asks] = await Promise.all([
    clockRead,
    weekRead,
    roundsRead,
    playerRead,
    teamRead,
    latestRead,
    cacheRead,
    benchRead,
    coachRead,
    asksRead,
  ]);
  if (playerRes.error) log('player', playerRes.error);
  if (teamRes.error) log('team', teamRes.error);

  const full = fullOf(roundsRes);
  const window = windowOf(roundsRes);

  // Strokes gained is the season's ("Season, per round"; each leg's "this season").
  const season = summarizePlayer(seasonOnly(full));
  const legs = roundsRes.error ? null : { rows: legRows(window, cache.byRound, bench, season.sgLegs), cacheError: cache.error, benchError: bench === null || bench.size === 0 };

  const points: ChScoringPoint[] = full
    .slice(0, SCORING_MAX)
    .reverse()
    .map((r) => ({
      id: r.id,
      label: shortDate.format(new Date(`${r.round_date.slice(0, 10)}T12:00:00Z`)),
      score: r.total_score as number,
      par: r.score_to_par != null ? (r.total_score as number) - r.score_to_par : null,
    }));

  return {
    greeting: `${greeting}, ${input.firstName}`,
    todayLabel,
    clock: { tz, day },
    brief: roundsRes.error ? null : briefFor(full, legs?.rows ?? []),
    coachUserId,
    week: wk.week,
    // Who hasn't replied, and the invitees' ids, are the coach's (Nudge and Message); a player's page never carries them.
    // Which meetings are theirs at all (Decision B, D2-8 when their own replies fail) is decided in loadHomeWeek.
    next: wk.next ? coachOnlyOut(wk.next) : null,
    today: wk.todayEvents.map(coachOnlyOut),
    weekNote: wk.weekNote,
    latest: { rounds: latest.rounds, error: roundsRes.error, holesError: latest.holesError },
    scoring: { points, error: roundsRes.error },
    sgPerRound: season.sgPerRound,
    tour: teamRes.data ? tourForGender(teamRes.data.gender) : null,
    handicap: playerRes.data?.handicap_index ?? playerRes.data?.handicap ?? null,
    legs,
    asks,
  };
}

const coachOnlyOut = ({ awaiting: _a, inviteeIds: _i, ...e }: ChHomeEvent): ChHomeEvent => e;

/**
 * The user id of the coach who created the team (golf_teams.created_by is a
 * golf_coaches.id, not a user id), else the organisation's first coach with an
 * account; null when neither loads.
 */
async function coachFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  team: { created_by: string | null; organization_id: string | null } | null,
): Promise<string | null> {
  if (!team?.organization_id) return null;
  const { data, error } = await supabase.from('golf_coaches').select('id, user_id').eq('organization_id', team.organization_id).not('user_id', 'is', null).limit(50);
  if (error) {
    log('coaches', error);
    return null;
  }
  const coaches = (data ?? []).filter((c): c is { id: string; user_id: string } => !!c.user_id);
  return (coaches.find((c) => c.id === team.created_by) ?? coaches[0])?.user_id ?? null;
}

/** "Your last three rounds average 70.0. Off the tee is gaining you 0.8 strokes a round." From the player's own rounds only. */
export function briefFor(full: ChRound[], legs: ChPlayerLeg[]): string | null {
  const scores = full.map((r) => r.total_score).filter((v): v is number => v != null);
  if (!scores.length) return null;
  const last = scores.slice(0, 3);
  const words = ['', 'round', 'two rounds', 'three rounds'];
  const first =
    last.length === 1 ? `Your last round was ${last[0]}.` : `Your last ${words[last.length]} average ${(mean(last) as number).toFixed(1)}.`;
  const withSg = legs.filter((l): l is ChPlayerLeg & { sg: number } => l.sg != null).sort((a, b) => b.sg - a.sg);
  const best = withSg[0];
  if (!best) return first;
  if (best.sg > 0.05) return `${first} ${best.label} is gaining you ${formatFixed(best.sg, 1)} strokes a round.`;
  const worst = withSg[withSg.length - 1]!;
  return worst.sg < -0.05 ? `${first} ${worst.label} is costing the most, ${formatFixed(Math.abs(worst.sg), 1)} strokes a round.` : first;
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * The counts behind "From your coach" (ChPlayerAsks), from Team Hub's own player reads: the hub's events
 * (get_player_hub_events, the same window) with the reply rules respondToEvent enforces (replyClosedAt, as the hub's replyIsClosed), the hub's
 * announcements (get_player_hub_announcements), and the player's task assignments. Any read failing returns null
 * (logged): the row hides rather than undercounting.
 */
export async function loadPlayerAsks(supabase: Client, input: { teamId: string; playerId: string; now: Date; today: string | Promise<string> }): Promise<ChPlayerAsks | null> {
  const since = new Date(input.now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [eventsRes, annRes, assignRes] = await Promise.all([
    supabase.rpc('get_player_hub_events', { p_team_id: input.teamId, p_player_id: input.playerId, p_since: since }),
    getPlayerHubAnnouncements(input.teamId, input.playerId).catch((err: unknown) => ({ success: false as const, error: err instanceof Error ? err.message : 'failed' })),
    supabase.from('golf_task_assignments').select('task_id, status').eq('player_id', input.playerId).limit(1000),
  ]);
  const parsed = eventsRes.error ? null : parsePlayerHubEvents(eventsRes.data);
  if (!parsed?.ok) {
    log('asksEvents', eventsRes.error ?? (parsed && !parsed.ok ? parsed.reason : 'no events'));
    return null;
  }
  if (!annRes.success) {
    log('asksAnnouncements', 'error' in annRes ? annRes.error : 'failed');
    return null;
  }
  if (assignRes.error) {
    log('asksTasks', assignRes.error);
    return null;
  }
  // Only their own invitations, still unanswered (null: not invited, nothing to reply to).
  const waiting = [...new Set(parsed.rows.filter((e) => e.event_type !== 'class' && e.rsvp_status === 'pending').map((e) => e.event_id))];
  const openTasks = [...new Set((assignRes.data ?? []).filter((a) => a.status !== 'completed').map((a) => a.task_id))];
  const [rules, tasks] = await Promise.all([
    Promise.all(chunkIds(waiting).map((ids) => supabase.from('golf_events').select('id, status, cancelled_at, all_day, start_time, rsvp_deadline, requires_rsvp').in('id', ids))),
    Promise.all(chunkIds(openTasks).map((ids) => supabase.from('golf_tasks').select('id, due_date').in('id', ids).eq('team_id', input.teamId))),
  ]);
  const ruleErr = rules.find((r) => r.error)?.error;
  const taskErr = tasks.find((r) => r.error)?.error;
  if (ruleErr || taskErr) {
    log(ruleErr ? 'asksReplyRules' : 'asksTaskDates', ruleErr ?? taskErr);
    return null;
  }
  const nowMs = input.now.getTime();
  const rsvps = rules.flatMap((r) => r.data ?? []).filter((e) => !replyClosedAt(e, nowMs)).length;
  const acks = (annRes.data ?? []).filter((a) => a.requires_acknowledgement && !a.has_player_acknowledged).length;
  const horizon = addDaysYmd(await input.today, ASK_TASK_DAYS);
  const tasksDue = tasks.flatMap((r) => r.data ?? []).filter((t) => !!t.due_date && t.due_date.slice(0, 10) <= horizon).length;
  return { rsvps, acks, tasksDue };
}

function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * CoachHelm chat: where the person is, checked and said in one line.
 *
 * The browser says which screen the chat was opened from and what is selected there (`screen-schema.ts`). None of it
 * is trusted. Here every id is checked against the signed-in person's own team, through their own session client (so
 * row-level security applies as well), and what survives is written as one short line for the model:
 *
 *   Today is Tue 10 Nov 2026. The coach is on Stats, looking at Avery Lane over the last 10 rounds.
 *
 * The engine appends that line as a system message after the user's message. It is never part of the prompt or a tool
 * definition: it changes every turn, and a changed prefix would invalidate the conversation's stored thinking.
 *
 * What the line may hold:
 *   - the date, in the team's timezone;
 *   - the screen's name from the app map;
 *   - for a coach: a roster player's name, a round's date, course and score, an event's or qualifier's or plan's own
 *     title and date. All of it is on the screen the coach is looking at.
 *   - for a player: the screen, the window, and their own round's date and course. No name, and no title somebody
 *     else typed: a player's line can never name a teammate.
 *   - never an id, never an e-mail address.
 *
 * Text that came from the database (a course name, an event title) was typed by a person, possibly a player, and this
 * line is read by the model as the app speaking. So it is cut to a short run of ordinary characters and quoted
 * (`clean`), and a Messages thread is named only when it is the team chat or the coach made it themself.
 *
 * Nothing here throws. A context that does not parse, an id that is not theirs or a read that fails only makes the
 * line shorter; the turn runs either way.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { askTables } from '../ask-db';
import type { CoachChatContext } from '../context';
import { isPlayerContext, type PlayerChatContext } from '../engine/tool';
import { placeForScreen, type AppPlace, type AppRole } from './app-map';
import { parseScreenContext, type ScreenContextInput, type ScreenId, type ScreenWindow } from './screen-schema';

type Sb = SupabaseClient<Database>;
type Who = CoachChatContext | PlayerChatContext;

/** What the screen context came to after the checks. Ids are kept for server code (a tool may use them); the line never prints one. */
export interface ResolvedScreen {
  screen: ScreenId;
  place: AppPlace | null;
  /** A coach: the roster player selected. A player: themself, when the screen is about a player at all. */
  player: { id: string; name: string } | null;
  round: { id: string; player_id: string; player_name: string | null; date: string; course: string | null; score: number | null } | null;
  event: { id: string; title: string | null; type: string | null; start: string } | null;
  qualifier: { id: string; name: string | null; start: string | null } | null;
  plan: { id: string; title: string | null; due_on: string | null } | null;
  thread: { id: string; title: string | null; team_chat: boolean } | null;
  tournament: { id: string; name: string | null; start: string | null } | null;
  window: ScreenWindow | null;
  /** Which fields the browser sent that did not pass (field names only), for a test or a log line. */
  dropped: string[];
}

export interface TurnContext {
  /** The system-message line. Always at least the date. */
  line: string;
  /** Null when the browser sent nothing usable. */
  screen: ResolvedScreen | null;
}

const WINDOW_WORDS: Record<ScreenWindow, string> = { last5: 'the last 5 rounds', last10: 'the last 10 rounds', last20: 'the last 20 rounds', season: 'this season', qualifiers: 'qualifying rounds' };
const EVENT_WORDS: Record<string, string> = { practice: 'practice', tournament: 'tournament', qualifier: 'qualifier', meeting: 'meeting', travel: 'travel day', other: 'event' };

/**
 * A person's text made safe to quote in the app's own voice: letters, digits and plain punctuation, one line, short.
 * Text holding an e-mail address or an id is not quoted at all.
 */
export function clean(text: string | null | undefined, max = 60): string | null {
  if (!text) return null;
  if (/@/.test(text) || /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)) return null;
  const out = text
    .replace(/[^\p{L}\p{N} .,'’&()/+#-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!out) return null;
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out;
}

const fmtDay = (at: Date, timeZone: string, weekday = true): string =>
  new Intl.DateTimeFormat('en-GB', { ...(weekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(at).replace(/,/g, '');
/** A calendar date column (`YYYY-MM-DD`) is a day, not an instant: it is formatted as written, in no timezone. */
const fmtDate = (day: string | null | undefined): string | null => {
  if (!day || !/^\d{4}-\d{2}-\d{2}/.test(day)) return null;
  const at = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(at.getTime()) ? null : fmtDay(at, 'UTC', false);
};

/** An instant as a day in a timezone; a timezone the runtime does not know is read as UTC, and an instant that is not one is null. */
function safeDay(at: Date | string, timeZone: string): string | null {
  const when = typeof at === 'string' ? new Date(at) : at;
  if (Number.isNaN(when.getTime())) return null;
  try {
    return fmtDay(when, timeZone);
  } catch {
    return fmtDay(when, 'UTC');
  }
}

/** "Today is Tue 10 Nov 2026." in the team's timezone. */
export function todayLine(now: Date, timeZone: string): string {
  return `Today is ${safeDay(now, timeZone) ?? fmtDay(new Date(), 'UTC')}.`;
}

async function one<T>(run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await run();
    return error || !data ? null : (data as T);
  } catch {
    return null;
  }
}

/**
 * Check what the browser sent against the signed-in person's own team. An id that is not theirs is dropped, never
 * trusted, and never the reason a turn fails.
 */
export async function resolveScreenContext(sb: Sb, who: Who, input: ScreenContextInput | null): Promise<ResolvedScreen | null> {
  if (!input) return null;
  const me = isPlayerContext(who) ? who.player_id : null;
  const role: AppRole = me ? 'player' : 'coach';
  const tournaments = isFlagEnabled('golf_tournaments_v1');
  const dropped: string[] = [];
  const onRoster = (id: string | null | undefined) => (id ? (who.roster.find((p) => p.id === id) ?? null) : null);

  // A player: only themself, whatever was sent. A coach: only a player on their active roster.
  let player: ResolvedScreen['player'] = null;
  if (input.player_id) {
    const found = me ? (input.player_id === me ? onRoster(me) : null) : onRoster(input.player_id);
    if (found) player = { id: found.id, name: found.name };
    else dropped.push('player_id');
  }

  const [round, event, qualifier, plan, thread, tournament] = await Promise.all([
    input.round_id
      ? one<{ id: string; player_id: string; team_id: string | null; round_date: string; course_name: string | null; total_score: number | null }>(() =>
          sb.from('golf_rounds').select('id, player_id, team_id, round_date, course_name, total_score').eq('id', input.round_id as string).maybeSingle(),
        )
      : null,
    input.event_id ? one<{ id: string; team_id: string; title: string; event_type: string; start_time: string }>(() => sb.from('golf_events').select('id, team_id, title, event_type, start_time').eq('id', input.event_id as string).eq('team_id', who.team_id).maybeSingle()) : null,
    input.qualifier_id ? one<{ id: string; team_id: string; name: string; start_date: string }>(() => sb.from('golf_qualifiers').select('id, team_id, name, start_date').eq('id', input.qualifier_id as string).eq('team_id', who.team_id).maybeSingle()) : null,
    input.plan_id
      ? one<{ id: string; team_id: string; title: string; due_on: string | null }>(() => askTables(sb).from('golf_practice_plans').select('id, team_id, title, due_on').eq('id', input.plan_id as string).eq('team_id', who.team_id).maybeSingle())
      : null,
    input.thread_id
      ? one<{ id: string; team_id: string | null; title: string | null; created_by: string; is_team_chat: boolean | null }>(() =>
          sb.from('golf_conversations').select('id, team_id, title, created_by, is_team_chat').eq('id', input.thread_id as string).eq('team_id', who.team_id).maybeSingle(),
        )
      : null,
    input.tournament_id && tournaments
      ? one<{ id: string; team_id: string; name: string; start_date: string }>(() => sb.from('golf_tournaments').select('id, team_id, name, start_date').eq('id', input.tournament_id as string).eq('team_id', who.team_id).maybeSingle())
      : null,
  ]);

  // The filter in the query is not the check: the row is compared again here, so a client that ignored a filter (or a policy wider than the screen) cannot pass a row through.
  const mine = <T extends { team_id: string | null }>(row: T | null): T | null => (row && row.team_id === who.team_id ? row : null);

  let resolvedRound: ResolvedScreen['round'] = null;
  if (input.round_id) {
    const owner = round ? (me ? (round.player_id === me ? onRoster(me) : null) : onRoster(round.player_id)) : null;
    // A round filed under another team is not this team's to name, even for a player on both rosters.
    if (round && owner && (round.team_id === null || round.team_id === who.team_id)) {
      resolvedRound = { id: round.id, player_id: round.player_id, player_name: owner.name, date: round.round_date, course: clean(round.course_name, 48), score: typeof round.total_score === 'number' ? round.total_score : null };
    } else dropped.push('round_id');
  }

  const ev = mine(event);
  if (input.event_id && !ev) dropped.push('event_id');
  const q = mine(qualifier);
  if (input.qualifier_id && !q) dropped.push('qualifier_id');
  const pl = mine(plan);
  if (input.plan_id && !pl) dropped.push('plan_id');
  const th = mine(thread);
  if (input.thread_id && !th) dropped.push('thread_id');
  const tn = mine(tournament);
  if (input.tournament_id && !tn) dropped.push('tournament_id');

  // A thread's title is typed by whoever made the thread. Only the coach's own titles and the team chat are named.
  const threadTitle = th && !me && th.created_by === who.user_id ? clean(th.title) : null;

  return {
    screen: input.screen,
    place: placeForScreen(role, input.screen, input.tab ?? null, { tournaments }),
    player,
    round: resolvedRound,
    event: ev ? { id: ev.id, title: clean(ev.title), type: ev.event_type ?? null, start: ev.start_time } : null,
    qualifier: q ? { id: q.id, name: clean(q.name), start: q.start_date ?? null } : null,
    plan: pl ? { id: pl.id, title: clean(pl.title), due_on: pl.due_on ?? null } : null,
    thread: th ? { id: th.id, title: threadTitle, team_chat: th.is_team_chat === true } : null,
    tournament: tn ? { id: tn.id, name: clean(tn.name), start: tn.start_date ?? null } : null,
    window: input.window ?? null,
    dropped,
  };
}

const quoted = (s: string | null): string => (s ? ` “${s}”` : '');
const on = (day: string | null): string => (day ? ` on ${day}` : '');

/** What is selected, in words. A coach's version may name people and titles; a player's never does. */
function selectionWords(who: Who, r: ResolvedScreen): string | null {
  const player = isPlayerContext(who);
  const zone = who.timezone;
  if (r.round) {
    const whose = player ? 'their own round' : `${r.round.player_name ?? 'a player'}’s round`;
    const score = !player && r.round.score !== null ? ` (${r.round.score})` : '';
    return `${whose}${on(fmtDate(r.round.date))}${r.round.course ? ` at ${r.round.course}` : ''}${score}`;
  }
  if (r.event) {
    const kind = EVENT_WORDS[r.event.type ?? ''] ?? 'event';
    const day = safeDay(r.event.start, zone);
    return player ? `a ${kind}${on(day)}` : `the ${kind}${quoted(r.event.title)}${on(day)}`;
  }
  if (r.qualifier) return player ? `a qualifier${r.qualifier.start ? ` starting ${fmtDate(r.qualifier.start)}` : ''}` : `the qualifier${quoted(r.qualifier.name)}${r.qualifier.start ? ` starting ${fmtDate(r.qualifier.start)}` : ''}`;
  if (r.tournament) return player ? `a tournament${r.tournament.start ? ` starting ${fmtDate(r.tournament.start)}` : ''}` : `the tournament${quoted(r.tournament.name)}${r.tournament.start ? ` starting ${fmtDate(r.tournament.start)}` : ''}`;
  if (r.plan) return player ? `a practice plan${r.plan.due_on ? ` for ${fmtDate(r.plan.due_on)}` : ''}` : `the practice plan${quoted(r.plan.title)}${r.plan.due_on ? ` for ${fmtDate(r.plan.due_on)}` : ''}`;
  if (r.thread) return r.thread.team_chat ? 'the team chat' : player ? 'a thread' : `${r.thread.title ? `the thread${quoted(r.thread.title)}` : 'a thread'}`;
  if (r.player) {
    const whom = player ? 'their own figures' : r.player.name;
    return r.window ? `${whom} over ${WINDOW_WORDS[r.window]}` : whom;
  }
  if (r.window) return WINDOW_WORDS[r.window];
  return null;
}

/** The one line. With no usable screen it is the date alone. */
export function renderTurnContext(who: Who, screen: ResolvedScreen | null, now: Date = new Date()): string {
  const today = todayLine(now, who.timezone);
  if (!screen || !screen.place) return today;
  const person = isPlayerContext(who) ? 'The player' : 'The coach';
  const looking = selectionWords(who, screen);
  return `${today} ${person} is on ${screen.place.name}${looking ? `, looking at ${looking}` : ''}.`;
}

/**
 * What the engine calls once per turn with the request body's `screen` value, whatever it is. Never throws.
 */
export async function turnContext(sb: Sb, who: Who, raw: unknown, now: Date = new Date()): Promise<TurnContext> {
  try {
    const screen = await resolveScreenContext(sb, who, parseScreenContext(raw));
    return { line: renderTurnContext(who, screen, now), screen };
  } catch {
    return { line: todayLine(now, who.timezone), screen: null };
  }
}

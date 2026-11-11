/**
 * CoachHelm chat: what a task card says, read by the server.
 *
 * The rule (engine/CONTRACT_NOTES.md, "PLANS"): the model's input is intent, and the card is the truth. Everything a
 * coach checks before Confirm is resolved here, in `plan`, against the database with the signed-in session client:
 * who is reached (ids and names, the count taken from the list), who is named but will not be reached and why, the
 * words a recipient gets, what is there now and will be replaced. `commit` reads the same things again and refuses,
 * without writing, when they no longer match what the coach approved.
 *
 * Words. Where the app sends through a function that only formats (`generatePushPayload`), that function is called
 * here. Where the words sit inside a sender (a server action, a `notify…` helper), they are repeated below and
 * `__tests__/card-words.test.ts` reads the sender's source and fails when the two part ways.
 *
 * No admin client in this file. A read that fails throws `CardReadError`: a card built on a read that did not happen
 * would be a guess, so there is no card.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { checkGoalTarget, GOAL_RULE_MESSAGES, PRE_START_BASELINE_DAYS, preStartBaseline } from '@/lib/coachhelm/v3/goals/goal-rules';
import { loadPlayerWindowRounds } from '@/lib/coachhelm/v3/goals/window-metric';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { practiceTables } from '@/lib/golf/practice-db';
import { tourTable } from '@/lib/golf/tournaments-tables';
import { generatePushPayload } from '@/lib/notifications/push';
import { diffVersions, parsePlanBody, parseVersionBody, pathFor, validatePlan, type PlanBodyV2 } from '../practice-plan/model';
import { askTables } from './ask-db';
import type { ActionProposal } from './action-types';
import type { CardDelivery, CardNotReached, CardPerson, CardUndo } from './card-types';
import { CoachContextError, requireRosterPlayer, type CoachChatContext } from './context';

type Sb = SupabaseClient<Database>;

/** A read the card needs did not happen. The message is the coach's. */
export class CardReadError extends Error {}

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
export const nameList = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

// ---------------------------------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------------------------------

/** A roster player as the card saw them: whether they have an account decides whether anything sent can reach them. */
export interface SeenPlayer {
  id: string;
  name: string;
  account: boolean;
}

export const NO_ACCOUNT = 'no account yet';

/**
 * The named players, in roster order, each checked against the active roster and marked with whether they have an
 * account. A player with none has nowhere for a notification to go: every sender in the app drops them, so the card
 * names them first.
 */
export async function seenPlayers(sb: Sb, ctx: CoachChatContext, ids: readonly string[]): Promise<SeenPlayer[]> {
  const unique = [...new Set(ids)];
  for (const id of unique) requireRosterPlayer(ctx, id);
  if (unique.length === 0) return [];
  const { data, error } = await sb.from('golf_players').select('id, user_id').in('id', unique);
  if (error) throw new CardReadError('Who can be told could not be read just now, so nothing was prepared. Try again in a moment.');
  const withAccount = new Set((data ?? []).filter((p) => Boolean(p.user_id)).map((p) => p.id));
  return ctx.roster.filter((p) => unique.includes(p.id)).map((p) => ({ id: p.id, name: p.name, account: withAccount.has(p.id) }));
}

export const asPeople = (seen: readonly SeenPlayer[]): CardPerson[] => seen.map((p) => ({ id: p.id, name: p.name, role: 'player' as const }));
export const reached = (seen: readonly SeenPlayer[]): CardPerson[] => asPeople(seen.filter((p) => p.account));
export const notReached = (seen: readonly SeenPlayer[]): CardNotReached[] => seen.filter((p) => !p.account).map((p) => ({ id: p.id, name: p.name, role: 'player' as const, reason: NO_ACCOUNT }));
export const affectsOf = (seen: readonly Pick<SeenPlayer, 'id' | 'name'>[]): ActionProposal['affects'] => seen.map((p) => ({ kind: 'player' as const, id: p.id, label: p.name }));

/** What a card that sends says about who gets it: the two lists and the facts that go with them. Empty when nothing is sent. */
export function reachOf(seen: readonly SeenPlayer[], sends: boolean): { recipients: CardPerson[]; not_reached: CardNotReached[] } {
  return sends ? { recipients: reached(seen), not_reached: notReached(seen) } : { recipients: [], not_reached: [] };
}

/**
 * At commit: has anyone on the stored card left the roster, or gained or lost an account? Then the card's "who" is no
 * longer true. Returns the sentence the coach reads, or null. Throws `CardReadError` when the check itself could not run.
 */
export async function peopleChanged(sb: Sb, ctx: CoachChatContext, seen: readonly SeenPlayer[], what: string): Promise<string | null> {
  if (seen.length === 0) return null;
  const gone = seen.filter((p) => !ctx.roster.some((r) => r.id === p.id));
  if (gone.length) return `${nameList(gone.map((p) => p.name))} ${gone.length === 1 ? 'is' : 'are'} no longer on your roster, so this card is out of date. ${what} Ask for it again.`;
  const { data, error } = await sb.from('golf_players').select('id, user_id').in('id', seen.map((p) => p.id));
  if (error) throw new CardReadError('Who this reaches could not be checked just now.');
  const withAccount = new Set((data ?? []).filter((p) => Boolean(p.user_id)).map((p) => p.id));
  const moved = seen.filter((p) => p.account !== withAccount.has(p.id));
  if (moved.length) return `Who can be told changed after this card was made (${nameList(moved.map((p) => p.name))}). ${what} Ask for it again.`;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The words a player receives
// ---------------------------------------------------------------------------------------------------------------------

export const SETTINGS_NOTE = 'Each player’s own notification settings decide which of these reach them.';
/** The date a sender prints when it formats a plain day itself (`qualifier-actions.ts`, `tasks.ts`). Kept as the same expression, so the same runtime prints the same words. */
export const longDay = (day: string): string => new Date(day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/**
 * One event that asks for replies: `fanOutEventInvitation` (lib/calendar/fan-out.ts). The push goes through
 * `generatePushPayload`, which is called here; the bell row is the fan-out's own two lines, with the date as the action
 * hands it over (the event's day as written, `dateLabel: validatedData.startDate`); the email's subject is the template's.
 */
export function eventInviteDelivery(e: { title: string; date: string; location: string | null }): CardDelivery {
  const push = generatePushPayload('event_rsvp_reminder', { eventName: e.title });
  return {
    channels: ['push', 'in_app', 'email'],
    title: push.title,
    body: push.body,
    variants: [{ channel: 'in_app', title: `New event: ${e.title}`, body: `${e.date}${e.location ? ` at ${e.location}` : ''}` }],
    note: `The email’s subject is “RSVP needed: ${e.title}”, and it gives the date${e.location ? ' and the place' : ''}. ${SETTINGS_NOTE}`,
  };
}

/** A repeating practice that asks for replies (`recurring-events.ts`): the same push, and the bell row quoted. */
export function seriesInviteDelivery(p: { title: string; start_date: string; location: string | null }): CardDelivery {
  const push = generatePushPayload('event_rsvp_reminder', { eventName: p.title });
  return {
    channels: ['push', 'in_app', 'email'],
    title: push.title,
    body: push.body,
    variants: [{ channel: 'in_app', title: `New event: ${p.title}`, body: `${p.start_date}${p.location ? ` at ${p.location}` : ''}` }],
    note: `One notice for the series, not one per date. The email names the practice, its first date and its place. ${SETTINGS_NOTE}`,
  };
}

/** A new qualifier (`createGolfQualifier`): push through `generatePushPayload`; the bell row is `notifyQualifierCreated`'s. */
export function qualifierDelivery(name: string, startDate: string): CardDelivery {
  const push = generatePushPayload('qualifier_created', { qualifierName: name, startDate: longDay(startDate) });
  return { channels: ['push', 'in_app', 'email'], title: push.title, body: push.body, variants: [{ channel: 'in_app', title: 'New qualifier', body: `${name} starts ${longDay(startDate)}` }], note: `The email says the same. ${SETTINGS_NOTE}` };
}

/** The title a goal is saved with, and so the body of its notice. */
export const goalTitleOf = (label: string, days: number): string => `${label}, ${days}-day goal`;
/** A coach-assigned goal (`notifyCoachAssignedGoal`, v3/notifications/notify.ts). */
export function goalDelivery(goalTitle: string): CardDelivery {
  return { channels: ['in_app', 'push'], title: 'New goal from your coach', body: goalTitle, note: SETTINGS_NOTE };
}

/** A proposed focus area (`notifyDevPlanAssigned`, lib/notifications/index.ts). `coachName` is the coach's own name on file, or "Your Coach". */
export function focusDelivery(coachName: string | null | undefined, title: string): CardDelivery {
  return { channels: ['in_app', 'email'], title: 'New focus area', body: `${coachName?.trim() || 'Your Coach'} assigned "${title}"`, note: `Sent only to a player whose account has an email address. ${SETTINGS_NOTE}` };
}

/** A new task (`notifyTaskAssigned`, lib/notifications/index.ts; the due date as `createTask` formats it). */
export function taskDelivery(title: string, dueDate: string | null | undefined): CardDelivery {
  return { channels: ['in_app', 'email'], title: 'New task', body: dueDate ? `${title}, due ${longDay(dueDate)}` : title, note: `Sent only to a player whose account has an email address. The email adds the task’s details. ${SETTINGS_NOTE}` };
}

/** A team update (`createEnrichedAnnouncement`): the push through `generatePushPayload`; in the app it is the update itself, title and words. */
export function announcementDelivery(title: string, body: string): CardDelivery {
  const push = generatePushPayload('team_announcement', { title });
  return { channels: ['push', 'in_app', 'email'], title: push.title, body: push.body, variants: [{ channel: 'in_app', title, body }], note: `The email carries the same title and words. ${SETTINGS_NOTE}` };
}

/** The coach's own name on file, for a notice that signs with it. Null when it could not be read: the sender then signs "Your Coach" only if the name is really empty, so the card must not guess. */
export async function coachNameOf(sb: Sb, ctx: CoachChatContext): Promise<string> {
  const { data, error } = await sb.from('golf_coaches').select('full_name').eq('id', ctx.coach_id).maybeSingle();
  if (error) throw new CardReadError('Your name on file could not be read just now, so the notice could not be shown. Try again in a moment.');
  return data?.full_name?.trim() || 'Your Coach';
}

// ---------------------------------------------------------------------------------------------------------------------
// Undo, and who can see it
// ---------------------------------------------------------------------------------------------------------------------

const UNDO_AFTER: Record<string, string> = {
  create_event: 'After it saves, change or delete it in the Calendar.',
  create_recurring_practice: 'After it saves, change or delete the practices in the Calendar.',
  add_blocked_time: 'After it saves, remove it in the Calendar.',
  add_team_break: 'After it saves, a coach can remove the break where it is listed.',
  save_team_term: 'After it saves, change the term’s dates in Settings.',
  create_trip: 'After it saves, change or delete it in Travel.',
  create_qualifier: 'After it saves, change it in Qualifiers. Players have already been told.',
  create_goal: 'After it saves, change or close the goal on the player’s page. The player has already been told.',
  create_focus_area: 'After it saves, change or close it on the player’s page. The player has already been told.',
  create_task: 'After it saves, change or delete it in Tasks. Players have already been told.',
  create_team_announcement: 'Once it is sent it cannot be recalled.',
  add_round_note: 'After it saves, edit the note on the round.',
  set_availability_note: 'After it saves, change or clear the note on the Roster.',
  create_recruit: 'After it saves, change or remove the recruit in Recruiting.',
  create_drill: 'After it saves, change or archive the drill in the drill bank.',
  publish_artifact: 'After it publishes, remove it in Documents.',
  publish_practice_plan: 'After it publishes, take the plan down from its page. The people on this card have already been told.',
  send_message: 'After it sends, delete the message in Messages. People may already have read it.',
  set_lineup: 'After it saves, change the lineup on the tournament until it is locked.',
};

/** Whether a card can be taken back, and where. Every task but locking a lineup is held for the Undo window first. */
export const undoFor = (tool: string): CardUndo => ({ window: true, after: UNDO_AFTER[tool] ?? 'After it saves, change it in the app.' });

// ---------------------------------------------------------------------------------------------------------------------
// A tournament's lineup (set_lineup, lock_lineup)
// ---------------------------------------------------------------------------------------------------------------------

export type SeatRole = 'lineup' | 'alternate' | 'individual';
export interface SeenSeat {
  player_id: string;
  name: string;
  role: SeatRole;
  slot: number | null;
}
export interface SeenTournament {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  version: number;
  locked_at: string | null;
  substitutions: boolean;
  seats: SeenSeat[];
}

const ROLE_ORDER: Record<SeatRole, number> = { lineup: 0, alternate: 1, individual: 2 };
export const sortSeats = <T extends { role: SeatRole; slot: number | null; name: string }>(seats: readonly T[]): T[] =>
  [...seats].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.slot ?? 99) - (b.slot ?? 99) || a.name.localeCompare(b.name));
export const seatLine = (s: Pick<SeenSeat, 'name' | 'role' | 'slot'>): string => (s.role === 'lineup' ? `${s.slot ?? '—'}. ${s.name}` : s.role === 'alternate' ? `Alternate: ${s.name}` : `Individual: ${s.name}`);
/** One string that is the same exactly when two lineups are the same, whatever order the rows came in. */
export const seatsKey = (seats: readonly Pick<SeenSeat, 'player_id' | 'role' | 'slot'>[]): string => seats.map((s) => `${s.player_id}:${s.role}:${s.slot ?? ''}`).sort().join('|');
export const tournamentDates = (t: Pick<SeenTournament, 'start_date' | 'end_date'>): string => (t.end_date && t.end_date !== t.start_date ? `${t.start_date} to ${t.end_date}` : t.start_date);

/** The tournament and the lineup saved on it now, only if it is on the coach's own team. */
export async function seenTournament(sb: Sb, ctx: CoachChatContext, tournamentId: string): Promise<SeenTournament> {
  const { data: t, error } = await tourTable(sb, 'golf_tournaments').select('id, team_id, name, start_date, end_date, version, lineup_locked_at, substitutions').eq('id', tournamentId).eq('team_id', ctx.team_id).maybeSingle();
  if (error) throw new CardReadError('The tournament could not be read just now, so nothing was prepared. Try again in a moment.');
  const row = t as { id: string; team_id: string; name: string; start_date: string; end_date: string; version: number; lineup_locked_at: string | null; substitutions: boolean } | null;
  if (!row || row.team_id !== ctx.team_id) throw new CoachContextError('That tournament is not on your team. Find it with the tournaments reader first.', 403);
  const { data: entries, error: entriesError } = await tourTable(sb, 'golf_tournament_entries').select('player_id, role, slot').eq('tournament_id', row.id);
  if (entriesError) throw new CardReadError('The lineup saved on that tournament could not be read just now, so nothing was prepared. Try again in a moment.');
  const seats = sortSeats(
    ((entries ?? []) as Array<{ player_id: string; role: SeatRole; slot: number | null }>).map((e) => ({ player_id: e.player_id, name: ctx.roster.find((p) => p.id === e.player_id)?.name ?? 'A player no longer on your roster', role: e.role, slot: e.slot ?? null })),
  );
  return { id: row.id, name: row.name, start_date: row.start_date, end_date: row.end_date, version: Number(row.version), locked_at: row.lineup_locked_at ?? null, substitutions: row.substitutions === true, seats };
}

// ---------------------------------------------------------------------------------------------------------------------
// A Messages thread (send_message)
// ---------------------------------------------------------------------------------------------------------------------

export interface SeenThread {
  id: string;
  title: string;
  /** Everyone in the thread but the coach, by name. */
  members: CardPerson[];
  /** Members who are neither on the active roster nor on the staff list the coach can read: counted, not named. */
  others: number;
  last: string | null;
}

/** The thread as it is: its title, its other members by name, its last message. Only a thread on the coach's team that the coach is in. */
export async function seenThread(sb: Sb, ctx: CoachChatContext, conversationId: string): Promise<SeenThread> {
  const { data, error } = await sb.from('golf_conversations').select('id, title, team_id, golf_conversation_participants(user_id)').eq('id', conversationId).eq('team_id', ctx.team_id).maybeSingle();
  if (error) throw new CardReadError('That thread could not be read just now, so nothing was prepared. Try again in a moment.');
  if (!data || data.team_id !== ctx.team_id) throw new CoachContextError('That thread is not on your team. Find it with find_thread first.', 403);
  const userIds = ((data.golf_conversation_participants ?? []) as Array<{ user_id: string }>).map((p) => p.user_id);
  if (!userIds.includes(ctx.user_id)) throw new CoachContextError('You are not in that thread, so you cannot send to it.', 403);
  const otherIds = userIds.filter((id) => id !== ctx.user_id);
  if (otherIds.length === 0) throw new CardReadError('Nobody else is in that thread, so there is nobody to send to.');
  const [players, coaches, last] = await Promise.all([
    sb.from('golf_players').select('id, user_id').in('user_id', otherIds),
    sb.from('golf_coaches').select('id, user_id, full_name').in('user_id', otherIds),
    sb.from('golf_messages').select('content, created_at, is_deleted').eq('conversation_id', data.id).order('created_at', { ascending: false }).limit(1),
  ]);
  if (players.error || coaches.error) throw new CardReadError('Who is in that thread could not be read just now, so nothing was prepared. Try again in a moment.');
  const named = new Map<string, CardPerson>();
  for (const p of players.data ?? []) {
    const onRoster = ctx.roster.find((r) => r.id === p.id);
    if (p.user_id && onRoster) named.set(p.user_id, { id: p.id, name: onRoster.name, role: 'player' });
  }
  for (const c of coaches.data ?? []) if (c.user_id && !named.has(c.user_id)) named.set(c.user_id, { id: c.id, name: c.full_name?.trim() || 'A coach', role: 'coach' });
  const members = otherIds.flatMap((id) => (named.has(id) ? [named.get(id) as CardPerson] : []));
  const lastRow = last.error ? null : (last.data ?? [])[0];
  const title = data.title?.trim() || (members.length ? nameList(members.map((m) => m.name)) : 'This thread');
  return { id: data.id, title, members, others: otherIds.length - members.length, last: lastRow && !lastRow.is_deleted ? lastRow.content.slice(0, 500) : null };
}

export const threadKey = (t: Pick<SeenThread, 'members' | 'others'>): string => `${t.members.map((m) => m.id).sort().join(',')}+${t.others}`;
/** "6 people in Travel squad: Eli Brandt, … and 1 more", the count taken from the list. */
export function threadReach(t: SeenThread): { count: number; names: string[]; line: string } {
  const count = t.members.length + t.others;
  const names = [...t.members.map((m) => m.name), ...(t.others ? [`${t.others} more`] : [])];
  return { count, names, line: `${plural(count, 'person', 'people')} in ${t.title}: ${nameList(names)}` };
}

// ---------------------------------------------------------------------------------------------------------------------
// A round (add_round_note) and an availability note (set_availability_note)
// ---------------------------------------------------------------------------------------------------------------------

export interface SeenRound {
  course: string | null;
  date: string | null;
  score: number | null;
}

/** The round the note goes on, only if it is that roster player's own. */
export async function seenRound(sb: Sb, ctx: CoachChatContext, roundId: string, playerId: string): Promise<SeenRound> {
  const player = requireRosterPlayer(ctx, playerId);
  const { data, error } = await sb.from('golf_rounds').select('id, player_id, course_name, round_date, total_score').eq('id', roundId).maybeSingle();
  if (error) throw new CardReadError('That round could not be read just now, so nothing was prepared. Try again in a moment.');
  if (!data || data.player_id !== player.id) throw new CoachContextError(`That round is not one of ${player.name}’s. Find it with the rounds reader first.`, 403);
  return { course: data.course_name ?? null, date: data.round_date ?? null, score: data.total_score ?? null };
}
export const roundLine = (r: SeenRound): string => [r.course ?? 'Course not recorded', r.date ?? 'date not recorded', r.score == null ? 'no score yet' : `${r.score}`].join(' · ');

/** The coach-only availability note saved for a player now: its words, '' when there is none. Throws when it could not be read. */
export async function availabilityNoteNow(sb: Sb, ctx: CoachChatContext, playerId: string): Promise<string> {
  const { data, error } = await askTables(sb).from('golf_player_availability_coach_notes').select('note').eq('team_id', ctx.team_id).eq('player_id', playerId).maybeSingle();
  if (error) throw new CardReadError('The note already saved for that player could not be read just now, so nothing was prepared. Try again in a moment.');
  return String((data as { note?: string | null } | null)?.note ?? '').trim();
}

// ---------------------------------------------------------------------------------------------------------------------
// A goal's starting point (create_goal)
// ---------------------------------------------------------------------------------------------------------------------

export interface SeenGoalBase {
  /** Where the player stands on this stat over the rounds a new goal is measured from; null when there are none. */
  current: number | null;
  unit: string;
  better: 'up' | 'down';
}

/**
 * The baseline `createGoal` will measure (the same two functions, the same window), read with the coach's own client.
 * A target on the wrong side of it is refused here with the action's own sentence, before a card exists.
 */
export async function seenGoalBase(sb: Sb, playerId: string, metricId: string, target: number): Promise<SeenGoalBase> {
  const cfg = getMetricRenderConfig(metricId);
  const direction = cfg?.direction ?? 'higher_better';
  const startedAt = new Date().toISOString();
  let current: number | null;
  try {
    const rounds = await loadPlayerWindowRounds(sb, playerId, new Date(Date.parse(startedAt) - PRE_START_BASELINE_DAYS * 86_400_000).toISOString(), startedAt);
    current = preStartBaseline(metricId as Parameters<typeof preStartBaseline>[0], rounds, startedAt);
  } catch {
    throw new CardReadError('Where the player stands on that stat could not be read just now, so nothing was prepared. Try again in a moment.');
  }
  const rule = checkGoalTarget({ baseline: current, target, direction });
  if (rule) throw new CardReadError(GOAL_RULE_MESSAGES[rule]);
  return { current: current == null ? null : Math.round(current * 100) / 100, unit: String(cfg?.unit ?? ''), better: direction === 'lower_better' ? 'down' : 'up' };
}

// ---------------------------------------------------------------------------------------------------------------------
// Publishing a practice plan (publish_practice_plan)
// ---------------------------------------------------------------------------------------------------------------------

export interface SeenPublish {
  plan_id: string;
  version: number;
  title: string;
  first_publish: boolean;
  /** "Thursday, Nov 12 · 3:00 PM", from the plan's event in the team's zone; null when the plan has no event. */
  when: string | null;
  where: string;
  /** Everyone told, players first, each with their own notice. Empty when a republish changes wording only (nobody is told). */
  people: Array<CardPerson & { body: string }>;
  not_reached: CardNotReached[];
  notice_title: string;
  /** The Team chat post, word for word; null when it is not posted. */
  chat_post: string | null;
}

const inZone = (iso: string, zone: string, opts: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: zone }).format(new Date(iso));
/** A player's own first-stop line, as `firstStopNotices` in `practice-publish.ts` writes it. */
export function firstStopLine(body: PlanBodyV2, playerId: string | null, eventStart: Date, time: string): string {
  const first = playerId ? pathFor(body, playerId, eventStart)[0] : undefined;
  const group = playerId ? body.groups.find((g) => g.players.includes(playerId)) : undefined;
  return first ? `${time} · You start on ${first.place}${group ? ` with Group ${group.name}` : ''}` : `${time} · Open the plan to see where you start`;
}
/** The Team chat post, built once at plan time and sent as stored. */
export const planChatPost = (title: string, when: string | null, baseUrl: string, planId: string): string => `${title} is published.${when ? ` ${when}.` : ''} ${baseUrl}/golf/dashboard/practice/plan/${planId}`;

/**
 * What publishing this plan does, worked out from the plan itself the way `publishPracticePlan` and its database
 * function do: who is told (`golf_practice_plan_recipients`: the plan's players who are active with an account, and
 * staff coaches assigned to a block or station, never the caller), and each one's own notice.
 */
export async function seenPublish(sb: Sb, ctx: CoachChatContext, planId: string, opts: { teamChat: boolean; baseUrl: string }): Promise<SeenPublish> {
  const db = practiceTables(sb);
  const { data: plan, error } = await db.from('golf_practice_plans').select('id, team_id, title, body, event_id, version, published_version, active_variant').eq('id', planId).maybeSingle();
  if (error) throw new CardReadError('The plan could not be read just now, so nothing was prepared. Try again in a moment.');
  const row = plan as { id: string; team_id: string; title: string | null; body: unknown; event_id: string | null; version: number; published_version: number | null; active_variant?: 'main' | 'rain' | null } | null;
  if (!row || row.team_id !== ctx.team_id) throw new CoachContextError('That plan is not one of your team’s. Ask the coach to press Publish on the plan.', 403);
  const body = parsePlanBody(row.body);
  if (!body) throw new CardReadError('This plan was saved in a newer form, so it cannot be published from here.');
  const { data: event, error: eventError } = row.event_id ? await sb.from('golf_events').select('start_time, end_time, team_id').eq('id', row.event_id).maybeSingle() : { data: null, error: null };
  if (eventError) throw new CardReadError('The plan’s practice could not be read just now, so nothing was prepared. Try again in a moment.');
  const zone = ctx.timezone;
  const eventStart = event ? new Date(event.start_time) : new Date();
  const check = validatePlan(body, { eventStart, eventEnd: event?.end_time ? new Date(event.end_time) : undefined, zone });
  if (check.errors.length) throw new CardReadError(check.errors.length === 1 ? check.errors[0]!.message : `Fix ${check.errors.length} problems in the plan before it can be published.`);

  const startIso = event?.start_time ?? null;
  const word = inZone(startIso ?? new Date().toISOString(), zone, { weekday: 'long' });
  const time = inZone(startIso ?? new Date().toISOString(), zone, { hour: 'numeric', minute: '2-digit' });
  const when = startIso ? `${inZone(startIso, zone, { weekday: 'long', month: 'short', day: 'numeric' })} · ${time}` : null;
  const first = row.published_version == null;

  // Who: the plan's players on the active roster, and staff coaches set on a block or station of the layout that is live.
  const players = await seenPlayers(sb, ctx, body.players.filter((id) => ctx.roster.some((p) => p.id === id)));
  const layout = (row.active_variant === 'rain' ? body.variants.rain : body.variants.main) ?? body.variants.main;
  const coachIds = [...new Set(layout.blocks.flatMap((b) => [b.coach, ...(b.kind === 'stations' ? b.stations.map((s) => s.coach) : [])]).filter((c): c is string => typeof c === 'string' && c !== ctx.coach_id))];
  let coaches: CardPerson[] = [];
  const coachesOut: CardNotReached[] = [];
  if (coachIds.length) {
    const [staff, rows] = await Promise.all([sb.from('golf_team_coach_staff').select('coach_id').eq('team_id', ctx.team_id).in('coach_id', coachIds), sb.from('golf_coaches').select('id, user_id, full_name').in('id', coachIds)]);
    if (staff.error || rows.error) throw new CardReadError('The coaches on this plan could not be read just now, so nothing was prepared. Try again in a moment.');
    const onStaff = new Set((staff.data ?? []).map((s) => s.coach_id));
    for (const c of rows.data ?? []) {
      if (!onStaff.has(c.id)) continue;
      const person: CardPerson = { id: c.id, name: c.full_name?.trim() || 'A coach', role: 'coach' };
      if (c.user_id) coaches.push(person);
      else coachesOut.push({ ...person, reason: NO_ACCOUNT });
    }
    coaches = coaches.sort((a, b) => a.name.localeCompare(b.name));
  }

  let people: SeenPublish['people'];
  let noticeTitle: string;
  if (first) {
    noticeTitle = `Practice plan for ${word}`;
    people = [...reached(players).map((p) => ({ ...p, body: firstStopLine(body, p.id, eventStart, time) })), ...coaches.map((c) => ({ ...c, body: firstStopLine(body, null, eventStart, time) }))];
  } else {
    noticeTitle = `${word}’s plan changed`;
    const { data: live, error: liveError } = await db.from('golf_practice_plan_versions').select('body').eq('plan_id', row.id).eq('version', row.published_version).maybeSingle();
    const prev = liveError ? null : parseVersionBody((live as { body?: unknown } | null)?.body);
    const diff = prev ? diffVersions(prev, body, eventStart, zone) : null;
    const line = diff?.changes[0]?.line ?? 'Open the plan to see what changed';
    // A republish that changes wording only tells nobody (`notified = !changes?.wordingOnly`).
    people = diff?.wordingOnly ? [] : [...reached(players), ...coaches].map((p) => ({ ...p, body: line }));
  }
  const title = row.title?.trim() || 'Practice plan';
  return {
    plan_id: row.id,
    version: Number(row.version),
    title,
    first_publish: first,
    when,
    where: body.place?.trim() ?? '',
    people,
    not_reached: people.length ? [...notReached(players), ...coachesOut] : [],
    notice_title: noticeTitle,
    chat_post: opts.teamChat ? planChatPost(title, when, opts.baseUrl, row.id) : null,
  };
}

/** Everything about a publish that a coach approved, as one string: if it differs at commit, the card is no longer true. */
export const publishKey = (p: SeenPublish): string => JSON.stringify([p.version, p.title, p.when, p.where, p.notice_title, p.people.map((x) => [x.id, x.body]), p.not_reached.map((x) => x.id), p.chat_post]);

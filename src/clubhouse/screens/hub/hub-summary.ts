import type { ChHubAnnouncement, ChHubDay, ChHubLedgerRow, ChHubRsvp, ChHubTask, ChHubTrip, ChRsvp, ChTeamHub } from '../../data/hub';
import type { ChHubTab } from '../../lib/hub-tabs';
import { pluralWord } from '../../lib/plural';

/**
 * What Team Hub says about itself in one line under its title, and the rules behind Home's widgets (the player's queue,
 * the week's first day, Waiting on's order).
 * Pure: everything is read from what the page already loaded, so the server render and the client agree, and a unit test
 * can pin the rules. Figures that are zero drop out; a figure whose read failed is left out, never shown as zero.
 */

export interface StripItem {
  key: string;
  before?: string;
  n?: number;
  after: string;
  /** The tab the figure opens. */
  tab?: ChHubTab;
  /** Something is late: the figure takes the warning ink (never red; red is under par). */
  warn?: boolean;
}


export interface StripInput {
  role: ChTeamHub['role'];
  players: number;
  rsvps: ChHubRsvp[];
  /** The player's replies this visit, over what loaded. */
  replies: ReadonlyMap<string, ChRsvp>;
  announcements: ChHubAnnouncement[];
  isAcked: (a: ChHubAnnouncement) => boolean;
  tasks: ChHubTask[];
  isDone: (t: ChHubTask) => boolean;
  nextTrip: ChHubTrip | null;
  pulse: ChTeamHub['pulse'];
}

export function hubStrip(i: StripInput): StripItem[] {
  const coach = i.role === 'coach';
  const out: StripItem[] = [];
  const openTasks = i.tasks.filter((t) => !i.isDone(t));
  const overdue = openTasks.filter((t) => t.status === 'overdue').length;
  const tasksAfter = ` ${pluralWord(openTasks.length, 'task', 'tasks')} open${overdue === 0 ? '' : overdue === openTasks.length ? ', all overdue' : `, ${overdue} overdue`}`;
  if (coach) {
    if (i.players > 0) out.push({ key: 'players', n: i.players, after: ` ${pluralWord(i.players, 'player', 'players')}` });
    const quiet = i.rsvps.reduce((n, r) => n + (r.counts?.none ?? 0), 0);
    if (quiet > 0) out.push({ key: 'replies', n: quiet, after: ` ${pluralWord(quiet, 'reply', 'replies')} due this week`, tab: 'home' });
    const waiting = i.announcements.filter((a) => a.needAck && a.recipients > 0 && a.ackCount < a.recipients).length;
    if (waiting > 0) out.push({ key: 'acks', n: waiting, after: ` ${pluralWord(waiting, 'post', 'posts')} awaiting acknowledgement`, tab: 'ann' });
    if (i.nextTrip?.inDays != null) out.push({ key: 'trip', before: 'next trip in ', n: i.nextTrip.inDays, after: pluralWord(i.nextTrip.inDays, ' day', ' days'), tab: 'travel' });
    if (openTasks.length > 0) out.push({ key: 'tasks', n: openTasks.length, after: tasksAfter, tab: 'tasks', warn: overdue > 0 });
    if (i.pulse && i.pulse.players > 0 && i.pulse.active14 === 0) out.push({ key: 'pulse', after: 'no rounds in 14 days' });
    return out;
  }
  const mine = (r: ChHubRsvp) => i.replies.get(r.eventId) ?? r.mine ?? 'pending';
  const due = i.rsvps.filter((r) => mine(r) === 'pending').length;
  if (due > 0) out.push({ key: 'replies', n: due, after: ` ${pluralWord(due, 'reply', 'replies')} due`, tab: 'home' });
  const toAck = i.announcements.filter((a) => a.needAck && !i.isAcked(a)).length;
  if (toAck > 0) out.push({ key: 'acks', n: toAck, after: ` ${pluralWord(toAck, 'post', 'posts')} to acknowledge`, tab: 'ann' });
  if (i.nextTrip?.mine && i.nextTrip.inDays != null) out.push({ key: 'trip', before: 'traveling in ', n: i.nextTrip.inDays, after: pluralWord(i.nextTrip.inDays, ' day', ' days'), tab: 'travel' });
  if (openTasks.length > 0) out.push({ key: 'tasks', n: openTasks.length, after: tasksAfter, tab: 'tasks', warn: overdue > 0 });
  return out;
}

/** The tab figures that ask for attention: posts awaiting acknowledgement and tasks late, for either role. */
export function tabAttention(i: StripInput): Partial<Record<ChHubTab, number>> {
  const strip = hubStrip(i);
  const n = (key: string) => strip.find((s) => s.key === key)?.n ?? 0;
  return { ann: n('acks'), tasks: i.tasks.filter((t) => !i.isDone(t) && t.status === 'overdue').length };
}

// ── Home's widgets ──────────────────────────────────────────────────────────

/** What a player owes, as one list: the replies, posts and tasks the page loaded as open, soonest and latest first. */
export type QueueItem = { kind: 'reply'; key: string; r: ChHubRsvp } | { kind: 'post'; key: string; a: ChHubAnnouncement } | { kind: 'task'; key: string; t: ChHubTask };

/**
 * The player's queue is decided from what loaded, not from this visit's answers, so a row stays where it is once it is
 * answered (it shows the answer) instead of jumping out from under the pointer; `left` counts what is still open now.
 * Late tasks lead the tasks, then the soonest due.
 */
export function queueOf(
  i: Pick<StripInput, 'rsvps' | 'replies' | 'announcements' | 'isAcked' | 'tasks' | 'isDone'> & {
    loadedAcked: (a: ChHubAnnouncement) => boolean;
    /** The post Home's post tile already shows with its Got it: not asked twice. */
    shownPost?: string | null;
  },
): { items: QueueItem[]; left: number } {
  const replies: QueueItem[] = i.rsvps.filter((r) => (r.mine ?? 'pending') === 'pending').map((r) => ({ kind: 'reply', key: `r:${r.eventId}`, r }));
  const posts: QueueItem[] = i.announcements.filter((a) => a.needAck && !i.loadedAcked(a) && a.id !== i.shownPost).map((a) => ({ kind: 'post', key: `a:${a.id}`, a }));
  const rank = (t: ChHubTask) => (t.status === 'overdue' ? 0 : 1);
  const tasks: QueueItem[] = i.tasks
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .map((t) => ({ kind: 'task', key: `t:${t.id}`, t }));
  const items = [...replies, ...posts, ...tasks];
  const open = (q: QueueItem) =>
    q.kind === 'reply' ? (i.replies.get(q.r.eventId) ?? q.r.mine ?? 'pending') === 'pending' : q.kind === 'post' ? !i.isAcked(q.a) : !i.isDone(q.t);
  return { items, left: items.filter(open).length };
}

/** The week tile opens on the first day with something on it (today when today has), else today. */
export function firstBusyDay(days: ChHubDay[]): number {
  const i = days.findIndex((d) => d.events.length > 0 || d.trip);
  return i < 0 ? 0 : i;
}

export type LedgerKey = 'owed' | 'name' | 'replies' | 'posts' | 'tasks' | 'rounds';

/** Everything a player owes; a list that didn't load counts nothing (its cell says so). */
export const owedBy = (r: ChHubLedgerRow) => (r.replies?.length ?? 0) + (r.posts?.length ?? 0) + (r.tasks?.length ?? 0);
const lateBy = (r: ChHubLedgerRow) => r.tasks?.filter((t) => t.late).length ?? 0;

/**
 * Waiting on's order. The default puts whoever owes the most first (late tasks break a tie); a column sorts by its own
 * figure, most first, and a second press turns it round. A column that didn't load sorts last either way. Rounds sort
 * fewest first by default: the player who hasn't played is the one to ask about.
 */
export function ledgerSorted(rows: ChHubLedgerRow[], key: LedgerKey, flipped = false): ChHubLedgerRow[] {
  const byName = (a: ChHubLedgerRow, b: ChHubLedgerRow) => a.name.localeCompare(b.name);
  if (key === 'name') return [...rows].sort((a, b) => (flipped ? -1 : 1) * byName(a, b));
  const value = (r: ChHubLedgerRow): number | null =>
    key === 'owed' ? owedBy(r) : key === 'rounds' ? (r.rounds ? r.rounds.n : null) : (r[key]?.length ?? null);
  // Most first, except rounds (fewest first); flipped turns either round.
  const sign = (key === 'rounds' ? 1 : -1) * (flipped ? -1 : 1);
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va == null || vb == null) return va == null && vb == null ? byName(a, b) : va == null ? 1 : -1;
    return sign * (va - vb) || lateBy(b) - lateBy(a) || byName(a, b);
  });
}

/** The Tasks board's figures, from the per-task completion the coach's read already carries. */
export interface TaskFigures {
  done: number;
  left: number;
  overdue: number;
  /** Tasks nobody has finished that are past due. */
  untouched: number;
}

export function taskFigures(rows: ChHubTask[], isDone: (t: ChHubTask) => boolean): TaskFigures | null {
  const known = rows.filter((t) => t.done != null);
  if (!rows.length || known.length < rows.length) return null;
  const done = known.reduce((n, t) => n + t.done![0], 0);
  const total = known.reduce((n, t) => n + t.done![1], 0);
  const late = rows.filter((t) => !isDone(t) && t.status === 'overdue');
  return { done, left: Math.max(0, total - done), overdue: late.length, untouched: late.filter((t) => t.done![0] === 0).length };
}

import type { ChHubAnnouncement, ChHubDay, ChHubLedgerRow, ChHubRsvp, ChHubTask, ChRsvp, ChTeamHub } from '../../data/hub';
import type { ChHubTab } from '../../lib/hub-tabs';
import { pluralWord } from '../../lib/plural';

/**
 * What Team Hub says under its title (what the team owes, as figures), and the rules behind Home's widgets (the player's queue,
 * the week's first day, Waiting on's order).
 * Pure: everything is read from what the page already loaded, so the server render and the client agree, and a unit test
 * can pin the rules. Figures that are zero drop out; a figure whose read failed is left out, never shown as zero.
 */

export interface StripItem {
  key: 'replies' | 'acks' | 'tasks';
  n: number;
  /** The words after the figure: with it, a sentence ("3 replies due"), which is the figure's name to a screen reader. */
  after: string;
  /** The tab the figure opens. */
  tab: ChHubTab;
  /** Something is late: the figure takes the warning ink (never red; red is under par). */
  warn?: boolean;
}


export interface StripInput {
  role: ChTeamHub['role'];
  rsvps: ChHubRsvp[];
  /** The player's replies this visit, over what loaded. */
  replies: ReadonlyMap<string, ChRsvp>;
  announcements: ChHubAnnouncement[];
  isAcked: (a: ChHubAnnouncement) => boolean;
  tasks: ChHubTask[];
  isDone: (t: ChHubTask) => boolean;
}

/**
 * W20 (12 Nov): the figures under the title are what the team owes, at most three, never a sentence of five links. The
 * roster's size, the next trip (Home's trip card says it, large) and the roster's quiet (Waiting on's foot says it) are
 * gone. Tasks count the overdue ones when any are, as the Tasks tab's badge does, else the open ones. Replies are due
 * over the week strip's seven days, so they are "due", not "due this week".
 */
export function hubStrip(i: StripInput): StripItem[] {
  const coach = i.role === 'coach';
  const out: StripItem[] = [];
  const openTasks = i.tasks.filter((t) => !i.isDone(t));
  const overdue = openTasks.filter((t) => t.status === 'overdue').length;
  if (coach) {
    const quiet = i.rsvps.reduce((n, r) => n + (r.counts?.none ?? 0), 0);
    if (quiet > 0) out.push({ key: 'replies', n: quiet, after: ` ${pluralWord(quiet, 'reply', 'replies')} due`, tab: 'home' });
    const waiting = i.announcements.filter((a) => a.needAck && a.recipients > 0 && a.ackCount < a.recipients).length;
    if (waiting > 0) out.push({ key: 'acks', n: waiting, after: ` ${pluralWord(waiting, 'post', 'posts')} awaiting acknowledgement`, tab: 'ann' });
  } else {
    const mine = (r: ChHubRsvp) => i.replies.get(r.eventId) ?? r.mine ?? 'pending';
    const due = i.rsvps.filter((r) => mine(r) === 'pending').length;
    if (due > 0) out.push({ key: 'replies', n: due, after: ` ${pluralWord(due, 'reply', 'replies')} due`, tab: 'home' });
    const toAck = i.announcements.filter((a) => a.needAck && !i.isAcked(a)).length;
    if (toAck > 0) out.push({ key: 'acks', n: toAck, after: ` ${pluralWord(toAck, 'post', 'posts')} to acknowledge`, tab: 'ann' });
  }
  if (overdue > 0) out.push({ key: 'tasks', n: overdue, after: ` ${pluralWord(overdue, 'task', 'tasks')} overdue`, tab: 'tasks', warn: true });
  else if (openTasks.length > 0) out.push({ key: 'tasks', n: openTasks.length, after: ` ${pluralWord(openTasks.length, 'task', 'tasks')} open`, tab: 'tasks' });
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

/**
 * The Tasks board's figures, from the per-task completion the coach's read already carries. Two units, never mixed in one
 * line: tasks (open, overdue, complete: what the strip and the tab's badge count) and assignments, one task for one player
 * (done and left: how far the team has got through them).
 */
export interface TaskFigures {
  /** Tasks not yet done by everyone they were set for. */
  open: number;
  /** Open tasks past their due day. */
  overdue: number;
  /** Tasks every assignee has done. */
  complete: number;
  /** Assignments done. */
  done: number;
  /** Assignments still to do. */
  left: number;
  /** Overdue tasks no player has finished. */
  untouched: number;
}

/** The board's line about late work, in tasks; null when nothing overdue is untouched. */
export function untouchedLine(f: Pick<TaskFigures, 'overdue' | 'untouched'>): string | null {
  if (f.untouched === 0) return null;
  if (f.overdue === 1) return 'No player has finished the overdue task.';
  return f.untouched === f.overdue ? `No player has finished any of the ${f.overdue} overdue tasks.` : `No player has finished ${f.untouched} of the ${f.overdue} overdue tasks.`;
}

export function taskFigures(rows: ChHubTask[], isDone: (t: ChHubTask) => boolean): TaskFigures | null {
  const known = rows.filter((t) => t.done != null);
  if (!rows.length || known.length < rows.length) return null;
  const done = known.reduce((n, t) => n + t.done![0], 0);
  const total = known.reduce((n, t) => n + t.done![1], 0);
  const open = rows.filter((t) => !isDone(t));
  const late = open.filter((t) => t.status === 'overdue');
  return { open: open.length, overdue: late.length, complete: rows.length - open.length, done, left: Math.max(0, total - done), untouched: late.filter((t) => t.done![0] === 0).length };
}

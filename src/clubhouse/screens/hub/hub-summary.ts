import type { ChHubAnnouncement, ChHubRsvp, ChHubTask, ChHubTrip, ChRsvp, ChTeamHub } from '../../data/hub';
import type { ChHubTab } from '../../lib/hub-tabs';

/**
 * What Team Hub says about itself in one line under its title, and the one thing its first tab leads with (the band).
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

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

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
  const tasksAfter = ` ${plural(openTasks.length, 'task', 'tasks')} open${overdue === 0 ? '' : overdue === openTasks.length ? ', all overdue' : `, ${overdue} overdue`}`;
  if (coach) {
    if (i.players > 0) out.push({ key: 'players', n: i.players, after: ` ${plural(i.players, 'player', 'players')}` });
    const quiet = i.rsvps.reduce((n, r) => n + (r.counts?.none ?? 0), 0);
    if (quiet > 0) out.push({ key: 'replies', n: quiet, after: ` ${plural(quiet, 'reply', 'replies')} due this week`, tab: 'home' });
    const waiting = i.announcements.filter((a) => a.needAck && a.recipients > 0 && a.ackCount < a.recipients).length;
    if (waiting > 0) out.push({ key: 'acks', n: waiting, after: ` ${plural(waiting, 'post', 'posts')} awaiting acknowledgement`, tab: 'ann' });
    if (i.nextTrip?.inDays != null) out.push({ key: 'trip', before: 'next trip in ', n: i.nextTrip.inDays, after: plural(i.nextTrip.inDays, ' day', ' days'), tab: 'travel' });
    if (openTasks.length > 0) out.push({ key: 'tasks', n: openTasks.length, after: tasksAfter, tab: 'tasks', warn: overdue > 0 });
    if (i.pulse && i.pulse.players > 0 && i.pulse.active14 === 0) out.push({ key: 'pulse', after: 'no rounds in 14 days' });
    return out;
  }
  const mine = (r: ChHubRsvp) => i.replies.get(r.eventId) ?? r.mine ?? 'pending';
  const due = i.rsvps.filter((r) => mine(r) === 'pending').length;
  if (due > 0) out.push({ key: 'replies', n: due, after: ` ${plural(due, 'reply', 'replies')} due`, tab: 'home' });
  const toAck = i.announcements.filter((a) => a.needAck && !i.isAcked(a)).length;
  if (toAck > 0) out.push({ key: 'acks', n: toAck, after: ` ${plural(toAck, 'post', 'posts')} to acknowledge`, tab: 'ann' });
  if (i.nextTrip?.mine && i.nextTrip.inDays != null) out.push({ key: 'trip', before: 'traveling in ', n: i.nextTrip.inDays, after: plural(i.nextTrip.inDays, ' day', ' days'), tab: 'travel' });
  if (openTasks.length > 0) out.push({ key: 'tasks', n: openTasks.length, after: tasksAfter, tab: 'tasks', warn: overdue > 0 });
  return out;
}

/** The tab figures that ask for attention: posts awaiting acknowledgement and tasks late, for either role. */
export function tabAttention(i: StripInput): Partial<Record<ChHubTab, number>> {
  const strip = hubStrip(i);
  const n = (key: string) => strip.find((s) => s.key === key)?.n ?? 0;
  return { ann: n('acks'), tasks: i.tasks.filter((t) => !i.isDone(t) && t.status === 'overdue').length };
}

// ── The band ────────────────────────────────────────────────────────────────

export type BandAction =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'jump'; label: string; target: string }
  | { kind: 'edit-trip'; label: string; trip: ChHubTrip };

export interface BandFact {
  label: string;
  value?: string;
  /** Late or short of replies: the amber on green, never red. */
  warn?: boolean;
}

export interface Band {
  /** What decided it, for the test and the data attribute. */
  kind: 'trip-soon' | 'event' | 'trip' | 'none';
  eyebrow: string;
  title: string;
  body: string | null;
  facts: BandFact[];
  action: BandAction | null;
}

const departs = (days: number) => (days <= 0 ? 'departs today' : days === 1 ? 'departs tomorrow' : `departs in ${days} days`);

function tripBand(t: ChHubTrip, role: ChTeamHub['role'], kind: 'trip-soon' | 'trip'): Band {
  const facts = ([
    t.depart ? { label: 'Departs', value: t.depart } : null,
    t.hotel ? { label: 'Stay', value: t.hotel } : { label: 'Stay', value: 'not set' },
    t.back ? { label: 'Home', value: t.back } : null,
    role === 'player' ? { label: 'You', value: t.mine == null ? '—' : t.mine ? 'Traveling' : 'Not traveling' } : t.travelerCount != null ? { label: 'Travelers', value: String(t.travelerCount) } : null,
  ] as Array<BandFact | null>).filter((f): f is BandFact => !!f);
  return {
    kind,
    eyebrow: `Next trip · ${t.inDays != null ? departs(t.inDays) : t.dates}`,
    title: t.name,
    body: [t.destination, t.dates].filter(Boolean).join(' · ') || null,
    facts,
    action: role === 'coach' ? { kind: 'edit-trip', label: 'Edit trip', trip: t } : null,
  };
}

export interface BandInput {
  role: ChTeamHub['role'];
  rsvps: ChHubRsvp[];
  replies: ReadonlyMap<string, ChRsvp>;
  /** Trips still to come, soonest first. */
  upcoming: ChHubTrip[];
  /** Every trip, for the last one when nothing is ahead. */
  trips: ChHubTrip[];
}

/**
 * Home's band is decided in data, never in layout, so two things never compete for the page's one dark surface:
 * a trip leaving within two days; then the next event that takes replies (a player's first one that still needs theirs);
 * then the next trip; then a quiet page that says so and names its next step.
 */
export function homeBand(i: BandInput): Band {
  const coach = i.role === 'coach';
  const trip = i.upcoming[0] ?? null;
  if (trip && trip.inDays != null && trip.inDays <= 2) return tripBand(trip, i.role, 'trip-soon');
  const owed = (r: ChHubRsvp) => (i.replies.get(r.eventId) ?? r.mine ?? 'pending') === 'pending';
  // A player is led to the soonest event that still needs their reply; a coach, or a player all caught up, to the soonest.
  const ev = (!coach && i.rsvps.find(owed)) || i.rsvps[0];
  if (ev) {
    const answer = i.replies.get(ev.eventId) ?? ev.mine ?? 'pending';
    const c = ev.counts;
    const waiting = !coach && answer === 'pending';
    return {
      kind: 'event',
      eyebrow: `${waiting ? 'Needs your reply' : 'Next up'} · ${ev.weekday} ${ev.day}`,
      title: ev.title,
      body: ev.meta || null,
      facts: coach && c
        ? [
            { label: 'going', value: String(c.going) },
            { label: 'maybe', value: String(c.maybe) },
            { label: 'can’t', value: String(c.no) },
            { label: 'no reply', value: String(c.none), warn: c.none > 0 },
          ]
        : [],
      action: waiting
        ? { kind: 'jump', label: 'Reply below', target: 'ch-hb-rsvp' }
        : { kind: 'link', label: 'Open event', href: `/golf/dashboard/calendar?date=${ev.date}&event=${ev.eventId}` },
    };
  }
  if (trip) return tripBand(trip, i.role, 'trip');
  const last = [...i.trips].reverse().find((t) => !t.upcoming);
  return {
    kind: 'none',
    eyebrow: 'Next up',
    title: coach ? 'Nothing on the calendar' : 'Nothing scheduled yet',
    body: coach ? 'Add an event with replies on and players answer here, so you see who is coming before you set out.' : 'New events and trips from your coaches show here as soon as they are planned.',
    facts: last ? [{ label: 'Last trip', value: `${last.name} · ${last.dates}` }] : [],
    action: coach ? { kind: 'link', label: 'Create event', href: '/golf/dashboard/calendar?new=1' } : null,
  };
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

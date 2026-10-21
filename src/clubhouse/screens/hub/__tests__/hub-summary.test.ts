import { describe, expect, it } from 'vitest';
import type { ChHubAnnouncement, ChHubRsvp, ChHubTask, ChHubTrip, ChRsvp } from '../../../data/hub';
import { homeBand, hubStrip, tabAttention, taskFigures, type BandInput, type StripInput } from '../hub-summary';

const rsvp = (over: Partial<ChHubRsvp> = {}): ChHubRsvp => ({
  eventId: 'e1',
  title: 'Team dinner',
  date: '2026-10-16',
  weekday: 'Thu',
  day: 16,
  meta: '7:30 PM · Carolina Inn',
  mandatory: false,
  mine: 'pending',
  counts: null,
  ...over,
});
const task = (over: Partial<ChHubTask> = {}): ChHubTask => ({ id: 't1', title: 'Waiver', detail: null, dueDate: '2026-10-17', due: 'Fri 17', status: 'pending', done: null, ...over });
const ann = (over: Partial<ChHubAnnouncement> = {}): ChHubAnnouncement =>
  ({ id: 'a1', title: 'Pairings', needAck: true, acked: false, ackCount: 5, recipients: 6, ...over }) as ChHubAnnouncement;
const trip = (over: Partial<ChHubTrip> = {}): ChHubTrip =>
  ({
    id: 'tr1',
    name: 'Carolina Fall Invitational',
    destination: 'Pine Needles',
    dates: 'Mon 3 – Wed 5 Nov',
    depart: 'Mon · 12:00 PM',
    hotel: 'Mid Pines Inn',
    back: 'Wed · 5:00 PM',
    travelerCount: 5,
    mine: true,
    upcoming: true,
    inDays: 20,
    ...over,
  }) as ChHubTrip;

const strip = (over: Partial<StripInput> = {}): StripInput => ({
  role: 'coach',
  players: 6,
  rsvps: [],
  replies: new Map<string, ChRsvp>(),
  announcements: [],
  isAcked: (a) => a.acked,
  tasks: [],
  isDone: (t) => t.status === 'completed',
  nextTrip: null,
  pulse: { rounds30: 30, active14: 5, players: 6 },
  ...over,
});
const text = (i: StripInput) => hubStrip(i).map((s) => `${s.before ?? ''}${s.n ?? ''}${s.after}`);

describe('hubStrip', () => {
  it('a coach’s line names the team, replies due, posts awaiting, the next trip and the tasks open', () => {
    const lines = text(
      strip({
        rsvps: [rsvp({ counts: { going: 4, maybe: 0, no: 0, none: 2 } }), rsvp({ eventId: 'e2', counts: { going: 5, maybe: 0, no: 0, none: 1 } })],
        announcements: [ann()],
        nextTrip: trip({ inDays: 6 }),
        tasks: [task(), task({ id: 't2', status: 'overdue' })],
      }),
    );
    expect(lines).toEqual(['6 players', '3 replies due this week', '1 post awaiting acknowledgement', 'next trip in 6 days', '2 tasks open, 1 overdue']);
  });

  it('a figure that is zero leaves the line, and a failed read is never said as zero', () => {
    expect(text(strip({ players: 0, pulse: null }))).toEqual([]);
    expect(text(strip({ announcements: [ann({ ackCount: 6 }), ann({ id: 'a2', needAck: false })] }))).toEqual(['6 players']);
  });

  it('says every open task is overdue when they all are, and takes the warning ink', () => {
    const items = hubStrip(strip({ tasks: [task({ status: 'overdue' }), task({ id: 't2', status: 'overdue' })] }));
    const tasks = items.find((s) => s.key === 'tasks')!;
    expect(`${tasks.n}${tasks.after}`).toBe('2 tasks open, all overdue');
    expect(tasks.warn).toBe(true);
    expect(tasks.tab).toBe('tasks');
  });

  it('a done task is not open, whatever its status said', () => {
    expect(text(strip({ tasks: [task({ status: 'overdue' })], isDone: () => true }))).toEqual(['6 players']);
  });

  it('speaks of the roster’s quiet only when players exist and none has played in 14 days', () => {
    expect(text(strip({ pulse: { rounds30: 0, active14: 0, players: 6 } }))).toContain('no rounds in 14 days');
    expect(text(strip({ pulse: { rounds30: 0, active14: 0, players: 0 } }))).not.toContain('no rounds in 14 days');
    expect(text(strip({ pulse: { rounds30: 9, active14: 2, players: 6 } }))).not.toContain('no rounds in 14 days');
  });

  it('a player’s line counts the replies still pending after what they answered this visit, and the posts they have not acknowledged', () => {
    const player = strip({
      role: 'player',
      rsvps: [rsvp(), rsvp({ eventId: 'e2', mine: 'accepted' }), rsvp({ eventId: 'e3' })],
      replies: new Map<string, ChRsvp>([['e3', 'tentative']]),
      announcements: [ann(), ann({ id: 'a2', acked: true })],
      nextTrip: trip({ inDays: 1 }),
      tasks: [task()],
    });
    expect(text(player)).toEqual(['1 reply due', '1 post to acknowledge', 'traveling in 1 day', '1 task open']);
  });

  it('a player is not told about a trip they are not on', () => {
    expect(text(strip({ role: 'player', nextTrip: trip({ mine: false }) }))).toEqual([]);
    expect(text(strip({ role: 'player', nextTrip: trip({ mine: null }) }))).toEqual([]);
  });
});

describe('tabAttention', () => {
  it('counts the posts awaiting acknowledgement and the open tasks that are late, for either role', () => {
    const base = { announcements: [ann()], tasks: [task({ status: 'overdue' }), task({ id: 't2' })] };
    expect(tabAttention(strip(base))).toEqual({ ann: 1, tasks: 1 });
    expect(tabAttention(strip({ ...base, role: 'player' }))).toEqual({ ann: 1, tasks: 1 });
    expect(tabAttention(strip({ ...base, isDone: () => true }))).toEqual({ ann: 1, tasks: 0 });
  });
});

const band = (over: Partial<BandInput> = {}): BandInput => ({ role: 'coach', rsvps: [], replies: new Map<string, ChRsvp>(), upcoming: [], trips: [], ...over });

describe('homeBand', () => {
  it('a trip leaving within two days beats an event, and says when it leaves', () => {
    const b = homeBand(band({ rsvps: [rsvp()], upcoming: [trip({ inDays: 1 })] }));
    expect(b).toMatchObject({ kind: 'trip-soon', title: 'Carolina Fall Invitational', eyebrow: 'Next trip · departs tomorrow' });
    expect(b.action).toMatchObject({ kind: 'edit-trip' });
    expect(homeBand(band({ upcoming: [trip({ inDays: 0 })] })).eyebrow).toBe('Next trip · departs today');
    expect(homeBand(band({ upcoming: [trip({ inDays: 2 })] })).kind).toBe('trip-soon');
  });

  it('an event beats a trip that is further out, and a coach sees the replies as figures', () => {
    const b = homeBand(band({ rsvps: [rsvp({ counts: { going: 4, maybe: 1, no: 0, none: 1 } })], upcoming: [trip({ inDays: 3 })] }));
    expect(b.kind).toBe('event');
    expect(b.facts).toEqual([
      { label: 'going', value: '4' },
      { label: 'maybe', value: '1' },
      { label: 'can’t', value: '0' },
      { label: 'no reply', value: '1', warn: true },
    ]);
    expect(b.action).toEqual({ kind: 'link', label: 'Open event', href: '/golf/dashboard/calendar?date=2026-10-16&event=e1' });
  });

  it('a player whose reply is still owed is sent to the reply, and one who answered to the event', () => {
    const owed = homeBand(band({ role: 'player', rsvps: [rsvp()] }));
    expect(owed.eyebrow).toBe('Needs your reply · Thu 16');
    expect(owed.action).toEqual({ kind: 'jump', label: 'Reply below', target: 'ch-hb-rsvp' });
    expect(owed.facts).toEqual([]);
    const answered = homeBand(band({ role: 'player', rsvps: [rsvp()], replies: new Map<string, ChRsvp>([['e1', 'accepted']]) }));
    expect(answered.eyebrow).toBe('Next up · Thu 16');
    expect(answered.action).toMatchObject({ kind: 'link' });
  });

  it('a player is led to the soonest event still owed a reply, even when an earlier one is answered', () => {
    const b = homeBand(band({ role: 'player', rsvps: [rsvp({ eventId: 'e1', mine: 'accepted' }), rsvp({ eventId: 'e2', title: 'Recovery nine', weekday: 'Fri', day: 17 })] }));
    expect(b).toMatchObject({ title: 'Recovery nine', eyebrow: 'Needs your reply · Fri 17' });
    // A coach, and a player with nothing owed, get the soonest.
    expect(homeBand(band({ rsvps: [rsvp({ eventId: 'e1', mine: 'accepted' }), rsvp({ eventId: 'e2' })] })).title).toBe('Team dinner');
    expect(homeBand(band({ role: 'player', rsvps: [rsvp({ mine: 'accepted', title: 'First' }), rsvp({ eventId: 'e2', mine: 'declined', title: 'Second' })] })).title).toBe('First');
  });

  it('with no event the next trip leads, a player has no edit, and the facts are the plan', () => {
    const b = homeBand(band({ role: 'player', upcoming: [trip()], trips: [trip()] }));
    expect(b.kind).toBe('trip');
    expect(b.action).toBeNull();
    expect(b.facts).toEqual([
      { label: 'Departs', value: 'Mon · 12:00 PM' },
      { label: 'Stay', value: 'Mid Pines Inn' },
      { label: 'Home', value: 'Wed · 5:00 PM' },
      { label: 'You', value: 'Traveling' },
    ]);
  });

  it('a stay that is not set says so rather than dropping the row', () => {
    expect(homeBand(band({ upcoming: [trip({ hotel: null })] })).facts).toContainEqual({ label: 'Stay', value: 'not set' });
  });

  it('a quiet page says so, names its next step for a coach, and recalls the last trip', () => {
    const coach = homeBand(band({ trips: [trip({ upcoming: false, inDays: null })] }));
    expect(coach).toMatchObject({ kind: 'none', title: 'Nothing on the calendar', action: { kind: 'link', label: 'Create event' } });
    expect(coach.facts).toEqual([{ label: 'Last trip', value: 'Carolina Fall Invitational · Mon 3 – Wed 5 Nov' }]);
    const player = homeBand(band({ role: 'player' }));
    expect(player).toMatchObject({ kind: 'none', title: 'Nothing scheduled yet', action: null, facts: [] });
  });
});

describe('taskFigures', () => {
  const done = (t: ChHubTask) => t.status === 'completed';
  it('sums completions across every assignment and counts what is late and untouched', () => {
    const rows = [task({ done: [0, 6], status: 'overdue' }), task({ id: 't2', done: [4, 6] }), task({ id: 't3', done: [3, 5], status: 'overdue' }), task({ id: 't4', done: [6, 6], status: 'completed' })];
    expect(taskFigures(rows, done)).toEqual({ done: 13, left: 10, overdue: 2, untouched: 1 });
  });

  it('is absent when any task’s completion did not load, or there are no tasks', () => {
    expect(taskFigures([task({ done: [1, 2] }), task({ id: 't2', done: null })], done)).toBeNull();
    expect(taskFigures([], done)).toBeNull();
  });
});

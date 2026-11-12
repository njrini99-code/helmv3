import { describe, expect, it } from 'vitest';
import type { ChHubAnnouncement, ChHubDay, ChHubLedgerRow, ChHubRsvp, ChHubTask, ChRsvp } from '../../../data/hub';
import { firstBusyDay, hubStrip, ledgerSorted, owedBy, queueOf, tabAttention, taskFigures, untouchedLine, type StripInput } from '../hub-summary';

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
const strip = (over: Partial<StripInput> = {}): StripInput => ({
  role: 'coach',
  rsvps: [],
  replies: new Map<string, ChRsvp>(),
  announcements: [],
  isAcked: (a) => a.acked,
  tasks: [],
  isDone: (t) => t.status === 'completed',
  ...over,
});
const text = (i: StripInput) => hubStrip(i).map((s) => `${s.n}${s.after}`);

// W20 (12 Nov): the head said five figures as a sentence of links (players, replies, posts, the next trip, tasks). It
// now says what the team owes, at most three figures, each opening its tab.
describe('hubStrip', () => {
  it('a coach’s figures are the replies due, the posts awaiting acknowledgement and the overdue tasks', () => {
    const lines = text(
      strip({
        rsvps: [rsvp({ counts: { going: 4, maybe: 0, no: 0, none: 2 } }), rsvp({ eventId: 'e2', counts: { going: 5, maybe: 0, no: 0, none: 1 } })],
        announcements: [ann()],
        tasks: [task(), task({ id: 't2', status: 'overdue' })],
      }),
    );
    expect(lines).toEqual(['3 replies due', '1 post awaiting acknowledgement', '1 task overdue']);
    expect(hubStrip(strip({ rsvps: [rsvp({ counts: { going: 4, maybe: 0, no: 0, none: 2 } })], announcements: [ann()], tasks: [task()] })).map((s) => s.key)).toEqual(['replies', 'acks', 'tasks']);
  });

  it('never says the roster’s size, the next trip or the roster’s quiet: Home’s trip card and Waiting on say those', () => {
    expect(text(strip())).toEqual([]);
  });

  it('a figure that is zero leaves the line', () => {
    expect(text(strip({ announcements: [ann({ ackCount: 6 }), ann({ id: 'a2', needAck: false })] }))).toEqual([]);
  });

  it('counts the open tasks when none is overdue, and the overdue ones in the warning ink when any is', () => {
    const open = hubStrip(strip({ tasks: [task(), task({ id: 't2' })] })).find((s) => s.key === 'tasks')!;
    expect(`${open.n}${open.after}`).toBe('2 tasks open');
    expect(open.warn).toBeFalsy();
    const late = hubStrip(strip({ tasks: [task({ status: 'overdue' }), task({ id: 't2', status: 'overdue' }), task({ id: 't3' })] })).find((s) => s.key === 'tasks')!;
    expect(`${late.n}${late.after}`).toBe('2 tasks overdue');
    expect(late.warn).toBe(true);
    expect(late.tab).toBe('tasks');
  });

  it('a done task is not open, whatever its status said', () => {
    expect(text(strip({ tasks: [task({ status: 'overdue' })], isDone: () => true }))).toEqual([]);
  });

  it('a player’s figures count the replies still pending after what they answered this visit, and the posts they have not acknowledged', () => {
    const player = strip({
      role: 'player',
      rsvps: [rsvp(), rsvp({ eventId: 'e2', mine: 'accepted' }), rsvp({ eventId: 'e3' })],
      replies: new Map<string, ChRsvp>([['e3', 'tentative']]),
      announcements: [ann(), ann({ id: 'a2', acked: true })],
      tasks: [task()],
    });
    expect(text(player)).toEqual(['1 reply due', '1 post to acknowledge', '1 task open']);
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

const row = (over: Partial<ChHubLedgerRow> = {}): ChHubLedgerRow => ({ id: 'p', name: 'Pat', replies: [], posts: [], tasks: [], rounds: { n: 5, recent: true }, ...over });
const day = (date: string, events = 0, tripName: string | null = null): ChHubDay => ({
  date,
  weekday: 'Tue',
  day: Number(date.slice(8)),
  trip: tripName,
  events: Array.from({ length: events }, (_, i) => ({ id: `${date}-${i}`, title: 'Practice', time: '3:30 PM', place: null, kind: 'practice' })),
});

describe('queueOf', () => {
  const base = { rsvps: [], replies: new Map<string, ChRsvp>(), announcements: [], isAcked: (a: ChHubAnnouncement) => a.acked, loadedAcked: (a: ChHubAnnouncement) => a.acked, tasks: [], isDone: (t: ChHubTask) => t.status === 'completed' };
  it('lists the replies owed, the posts to acknowledge and the open tasks, late tasks first then the soonest due', () => {
    const q = queueOf({
      ...base,
      rsvps: [rsvp(), rsvp({ eventId: 'e2', mine: 'accepted' })],
      announcements: [ann(), ann({ id: 'a2', needAck: false }), ann({ id: 'a3', acked: true })],
      tasks: [task({ id: 'soon', dueDate: '2026-10-15' }), task({ id: 'late', status: 'overdue', dueDate: '2026-10-20' }), task({ id: 'done', status: 'completed' }), task({ id: 'none', dueDate: null })],
    });
    expect(q.items.map((x) => x.key)).toEqual(['r:e1', 'a:a1', 't:late', 't:soon', 't:none']);
    expect(q.left).toBe(5);
  });

  it('an answer given this visit keeps its row and leaves the count', () => {
    const q = queueOf({ ...base, rsvps: [rsvp()], replies: new Map<string, ChRsvp>([['e1', 'accepted']]), announcements: [ann()], isAcked: () => true, tasks: [task()], isDone: () => true });
    expect(q.items).toHaveLength(3);
    expect(q.left).toBe(0);
  });
});

describe('firstBusyDay', () => {
  it('opens on the first day with an event or a trip, else today', () => {
    expect(firstBusyDay([day('2026-10-14'), day('2026-10-15', 2), day('2026-10-16', 1)])).toBe(1);
    expect(firstBusyDay([day('2026-10-14'), day('2026-10-15', 0, 'Carolina Fall Invitational')])).toBe(1);
    expect(firstBusyDay([day('2026-10-14'), day('2026-10-15')])).toBe(0);
  });
});

describe('ledgerSorted', () => {
  const rows = [
    row({ id: 'a', name: 'Ava', tasks: [{ id: 't', title: 'Form', late: true }] }),
    row({ id: 'j', name: 'Jonah', replies: [{ id: 'r', title: 'Dinner' }], posts: [{ id: 'p', title: 'Pairings' }], rounds: { n: 0, recent: false } }),
    row({ id: 'e', name: 'Eli', tasks: [{ id: 't', title: 'Form', late: false }] }),
    row({ id: 'x', name: 'Xan', replies: null, posts: null, tasks: null, rounds: null }),
  ];
  const ids = (r: ChHubLedgerRow[]) => r.map((x) => x.id).join('');
  it('opens on whoever owes the most, a late task breaking a tie', () => {
    expect(ids(ledgerSorted(rows, 'owed'))).toBe('jaex');
    expect(owedBy(rows[1]!)).toBe(2);
  });
  it('a column sorts most first and turns round on a second press; one that did not load sorts last both ways', () => {
    expect(ids(ledgerSorted(rows, 'replies'))).toBe('jaex');
    expect(ids(ledgerSorted(rows, 'replies', true))).toBe('aejx');
    expect(ids(ledgerSorted(rows, 'name'))).toBe('aejx');
    expect(ids(ledgerSorted(rows, 'name', true))).toBe('xjea');
  });
  it('rounds sort fewest first, so the player who has not played leads', () => {
    expect(ids(ledgerSorted(rows, 'rounds'))[0]).toBe('j');
    expect(ids(ledgerSorted(rows, 'rounds')).at(-1)).toBe('x');
  });
});

describe('untouchedLine', () => {
  it('says it in tasks, one, all or some of them', () => {
    expect(untouchedLine({ overdue: 2, untouched: 0 })).toBeNull();
    expect(untouchedLine({ overdue: 1, untouched: 1 })).toBe('No player has finished the overdue task.');
    expect(untouchedLine({ overdue: 9, untouched: 9 })).toBe('No player has finished any of the 9 overdue tasks.');
    expect(untouchedLine({ overdue: 9, untouched: 4 })).toBe('No player has finished 4 of the 9 overdue tasks.');
  });
});

describe('taskFigures', () => {
  const done = (t: ChHubTask) => t.status === 'completed';
  it('sums completions across every assignment and counts what is late and untouched', () => {
    const rows = [task({ done: [0, 6], status: 'overdue' }), task({ id: 't2', done: [4, 6] }), task({ id: 't3', done: [3, 5], status: 'overdue' }), task({ id: 't4', done: [6, 6], status: 'completed' })];
    expect(taskFigures(rows, done)).toEqual({ open: 3, overdue: 2, complete: 1, done: 13, left: 10, untouched: 1 });
  });

  it('is absent when any task’s completion did not load, or there are no tasks', () => {
    expect(taskFigures([task({ done: [1, 2] }), task({ id: 't2', done: null })], done)).toBeNull();
    expect(taskFigures([], done)).toBeNull();
  });
});

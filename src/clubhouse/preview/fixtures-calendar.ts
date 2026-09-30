import type { ChCalendarData } from '../data/calendar';
import type { ChCalEvent, ChCalType, ChRsvp } from '../screens/calendar/model';

/**
 * The handoff's calendar sample (design/handoff/cal-data.js): October 2026,
 * the week of Sun 12 – Sat 18, today Tue 14 at 2:40 PM, Eastern time.
 */
const people = [
  { id: 'theo', name: 'Theo Marchetti', year: 'Senior' },
  { id: 'sofia', name: 'Sofia Alvarez', year: 'Senior' },
  { id: 'ava', name: 'Ava Lindqvist', year: 'Junior' },
  { id: 'jonah', name: 'Jonah Okafor', year: 'Sophomore' },
  { id: 'eli', name: 'Eli Brandt', year: 'Junior' },
  { id: 'priya', name: 'Priya Natarajan', year: 'Freshman' },
];
const all = people.map((p) => p.id);

/** [accepted, maybe, declined, pending] counts, assigned in roster order (pending last). */
function replies(ids: string[], [a, m, d]: [number, number, number, number]): Record<string, ChRsvp> {
  const out: Record<string, ChRsvp> = {};
  ids.forEach((id, i) => (out[id] = i < a ? 'accepted' : i < a + m ? 'maybe' : i < a + m + d ? 'declined' : 'pending'));
  return out;
}

type Raw = {
  id: string;
  date: number;
  start?: number;
  end?: number;
  allDay?: boolean;
  type: ChCalType;
  title: string;
  location?: string;
  people?: string[];
  rsvp?: [number, number, number, number];
  recurring?: string;
  notes?: string;
  owner?: string;
  instructor?: string;
  pattern?: string;
};

const RAW: Raw[] = [
  { id: 'e1', date: 12, start: 8, end: 12.5, type: 'tournament', title: 'Team round', location: 'Oakmont Country Club', people: all, rsvp: [6, 0, 0, 0] },
  { id: 'e2', date: 13, start: 6.5, end: 7.5, type: 'practice', title: 'Strength', location: 'Weight room', people: all, rsvp: [5, 1, 0, 0], recurring: 'Weekly on Mon, Wed' },
  { id: 'e3', date: 13, start: 15.5, end: 17.5, type: 'practice', title: 'Range and wedges', location: 'Practice range', people: all, rsvp: [6, 0, 0, 0], recurring: 'Every weekday' },
  { id: 'c1', date: 14, start: 9, end: 10.25, type: 'class', title: 'STAT 201', owner: 'priya', location: 'Hanes Hall 120', instructor: 'Dr. L. Osei', pattern: 'Tue, Thu · Fall 2026' },
  { id: 'c2', date: 14, start: 13, end: 14.25, type: 'class', title: 'ECON 101', owner: 'jonah', location: 'Gardner Hall 008', instructor: 'Prof. M. Hart', pattern: 'Tue, Thu · Fall 2026' },
  { id: 'e4', date: 14, start: 15.5, end: 17, type: 'practice', title: 'Short-game block', location: 'Practice green', people: all, rsvp: [6, 0, 0, 0], recurring: 'Every weekday', notes: 'Bunker ladder, then up-and-down pairs. Bring 20 balls.' },
  { id: 'e5', date: 14, start: 16.75, end: 17.5, type: 'meeting', title: '1:1 with Jonah', location: 'Range bay 4', people: ['jonah'], rsvp: [1, 0, 0, 0], notes: 'Approach from 125–150 yards. Bring launch monitor.' },
  { id: 'e6', date: 14, start: 17.5, end: 18.25, type: 'practice', title: 'Putting ladder', location: 'Green 2', people: ['priya', 'ava'], rsvp: [2, 0, 0, 0] },
  { id: 'e7', date: 14, start: 18.25, end: 18.75, type: 'meeting', title: 'Parent call', location: 'Phone · Natarajan family', people: [] },
  { id: 'e8', date: 15, start: 6.5, end: 7.5, type: 'practice', title: 'Strength', location: 'Weight room', people: all, rsvp: [6, 0, 0, 0], recurring: 'Weekly on Mon, Wed' },
  { id: 'c3', date: 15, start: 11, end: 12.25, type: 'class', title: 'BIOL 110', owner: 'eli', location: 'Wilson Hall 107', instructor: 'Dr. A. Ruiz', pattern: 'Mon, Wed · Fall 2026' },
  { id: 'e9', date: 15, start: 13.5, end: 14.25, type: 'meeting', title: 'Travel briefing', location: 'Team room', people: all, rsvp: [5, 0, 0, 1] },
  { id: 'c4', date: 15, start: 15, end: 16.25, type: 'class', title: 'CHEM 102 lab', owner: 'eli', location: 'Kenan Labs 210', instructor: 'Dr. P. Chan', pattern: 'Wed · Fall 2026' },
  { id: 'e10', date: 15, start: 15.5, end: 17.5, type: 'practice', title: 'Course prep · 9 holes', location: 'Finley GC', people: all, rsvp: [4, 1, 0, 1] },
  { id: 'e11', date: 16, allDay: true, type: 'qualifier', title: 'Qualifier · Pinehurst No. 2', location: 'Pinehurst, NC', people: all, rsvp: [5, 0, 0, 1] },
  { id: 'e12', date: 16, start: 6.25, end: 8, type: 'travel', title: 'Bus to Pinehurst', location: 'Leaves Finley lot', people: all, rsvp: [5, 0, 0, 1] },
  { id: 'e13', date: 17, start: 13, end: 14, type: 'meeting', title: 'Round review', location: 'Team room', people: all, rsvp: [0, 0, 0, 6] },
  { id: 'e14', date: 17, start: 15.5, end: 17, type: 'practice', title: 'Recovery nine', location: 'Finley GC', people: all, rsvp: [3, 2, 0, 1] },
  { id: 'e15', date: 20, start: 15.5, end: 17.5, type: 'practice', title: 'Range and wedges', location: 'Practice range', people: all, rsvp: [0, 0, 0, 6] },
  { id: 'e16', date: 22, start: 15.5, end: 17.5, type: 'practice', title: 'Course prep', location: 'Finley GC', people: all, rsvp: [0, 0, 0, 6] },
  { id: 'e17', date: 25, start: 7, end: 17, type: 'tournament', title: 'Tar Heel Invitational · R1', location: 'Finley GC', people: all, rsvp: [0, 0, 0, 6] },
  { id: 'e18', date: 26, start: 7, end: 17, type: 'tournament', title: 'Tar Heel Invitational · R2', location: 'Finley GC', people: all, rsvp: [0, 0, 0, 6] },
  { id: 'e19', date: 7, start: 15.5, end: 17.5, type: 'practice', title: 'Range and wedges', location: 'Practice range', people: all, rsvp: [6, 0, 0, 0] },
  { id: 'e20', date: 9, start: 13, end: 14, type: 'meeting', title: 'Lineup meeting', location: 'Team room', people: all, rsvp: [6, 0, 0, 0] },
  { id: 'e21', date: 3, start: 7, end: 17, type: 'tournament', title: 'Wolfpack Classic', location: 'Lonnie Poole GC', people: all, rsvp: [6, 0, 0, 0] },
  { id: 'e22', date: 29, start: 13, end: 14, type: 'meeting', title: 'Fall review', location: 'Team room', people: all, rsvp: [0, 0, 0, 6] },
];

// Eli is invited to course prep while in lab: the rsvp order puts his pending reply last.
const ORDER = ['theo', 'sofia', 'ava', 'jonah', 'priya', 'eli'];

const events: ChCalEvent[] = RAW.map((r) => {
  const date = `2026-10-${String(r.date).padStart(2, '0')}`;
  const invitees = (r.people ?? []).length === all.length ? ORDER : (r.people ?? []);
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    date,
    start: r.allDay ? null : (r.start ?? null),
    end: r.allDay ? null : (r.end ?? null),
    allDay: !!r.allDay,
    location: r.location ?? null,
    notes: r.notes ?? null,
    recurring: r.recurring ?? null,
    people: invitees,
    rsvp: r.rsvp ? replies(invitees, r.rsvp) : {},
    owner: r.owner ?? null,
    busyOnly: false,
    instructor: r.instructor ?? null,
    pattern: r.pattern ?? null,
    canEdit: r.type !== 'class',
    cancelled: false,
    seriesId: r.recurring ? `s-${r.title}` : null,
    startIso: `${date}T12:00:00Z`,
    span: null,
  };
});

const busy: ChCalEvent[] = [
  { id: 'b1', type: 'busy', title: 'Recruiting call', date: '2026-10-15', start: 9, end: 10, allDay: false, location: null, notes: 'Two juniors from Charlotte', recurring: null, people: [], rsvp: {}, owner: null, busyOnly: false, instructor: null, pattern: null, canEdit: true, cancelled: false, seriesId: null, startIso: '2026-10-15T12:00:00Z', span: null },
  ...['2026-10-12', '2026-10-19', '2026-10-26'].map((d) => ({ id: 'b2', type: 'busy' as const, title: 'Staff meeting', date: d, start: 12, end: 13, allDay: false, location: null, notes: null, recurring: 'Weekly on Mon', people: [], rsvp: {}, owner: null, busyOnly: false, instructor: null, pattern: null, canEdit: true, cancelled: false, seriesId: null, startIso: '2026-10-12T12:00:00Z', span: null })),
];

export const PREVIEW_CALENDAR: ChCalendarData = {
  role: 'coach',
  teamId: 'preview-team',
  busyError: false,
  viewerPlayerId: null,
  teamName: 'Varsity',
  timezone: 'America/New_York',
  zoneLabel: 'Eastern time',
  today: '2026-10-14',
  nowHour: 14 + 40 / 60,
  view: 'week',
  anchor: '2026-10-14',
  range: { from: '2026-09-27', to: '2026-11-25' },
  events: [...events, ...busy],
  people,
  eventsError: false,
  firstRun: false,
  rsvpError: false,
  classesError: false,
  settingsError: false,
};

/** Jonah's view: team events he's invited to, only his own class, no roster tools. */
export const PREVIEW_CALENDAR_PLAYER: ChCalendarData = {
  ...PREVIEW_CALENDAR,
  role: 'player',
  viewerPlayerId: 'jonah',
  events: events
    .filter((e) => (e.type === 'class' ? e.owner === 'jonah' : e.type !== 'busy'))
    .map((e) => ({ ...e, canEdit: false, rsvp: e.id === 'e13' ? { ...e.rsvp, jonah: 'pending' } : e.rsvp })),
  people: people.filter((p) => p.id === 'jonah'),
};

export const PREVIEW_CALENDAR_EMPTY: ChCalendarData = { ...PREVIEW_CALENDAR, events: [] };
/** CH-6308: a team that has never scheduled anything. */
export const PREVIEW_CALENDAR_FIRST: ChCalendarData = { ...PREVIEW_CALENDAR, events: [], firstRun: true };
export const PREVIEW_CALENDAR_FAILED: ChCalendarData = { ...PREVIEW_CALENDAR, events: [], eventsError: true };
export const PREVIEW_CALENDAR_PARTIAL: ChCalendarData = { ...PREVIEW_CALENDAR, rsvpError: true, classesError: true, events: events.filter((e) => e.type !== 'class').map((e) => ({ ...e, rsvp: {} })) };

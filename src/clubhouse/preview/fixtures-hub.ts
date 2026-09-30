import type { ChHubAnnouncement, ChHubTrip, ChTeamHub } from '../data/hub';

/** Team Hub sample data: design/handoff/hub-data.js (Varsity, the week of 14 October). */

const PLAYERS: Array<[string, string]> = [
  ['theo', 'Theo Marchetti'],
  ['sofia', 'Sofia Alvarez'],
  ['ava', 'Ava Lindqvist'],
  ['jonah', 'Jonah Okafor'],
  ['eli', 'Eli Brandt'],
  ['priya', 'Priya Natarajan'],
];

const ANNS: ChHubAnnouncement[] = [
  {
    id: 'a1',
    title: 'Pairings and tee times for Thursday',
    body: 'First group off at 8:42. Warm-up on the range from 7:30. Bring your yardage book and two dozen balls. Pairings PDF is in Documents.',
    by: 'Maya Reyes',
    byRole: 'Head coach',
    when: 'Today 2:28 PM',
    createdAt: '2026-10-14T18:28:00Z',
    needAck: true,
    acked: false,
    ackCount: 5,
    recipients: 6,
    documentCount: 1,
  },
  { id: 'a2', title: 'Short-game block moves to Green 2', body: 'Maintenance on the practice green through Friday. Same time, 3:30.', by: 'Dan Whitfield', byRole: 'Assistant coach', when: 'Yesterday', createdAt: '2026-10-13T15:00:00Z', needAck: false, acked: false, ackCount: 6, recipients: 6, documentCount: 0 },
  { id: 'a3', title: 'Team dinner after the qualifier', body: 'Carolina Inn, 7:30 PM on Thursday. Parents welcome, RSVP by Wednesday.', by: 'Maya Reyes', byRole: 'Head coach', when: 'Oct 9', createdAt: '2026-10-09T15:00:00Z', needAck: false, acked: false, ackCount: 4, recipients: 6, documentCount: 0 },
];

const TRIPS: ChHubTrip[] = [
  {
    id: 'cfi',
    name: 'Carolina Fall Invitational',
    destination: 'Pine Needles · Southern Pines, NC',
    dates: 'Mon 3 – Wed 5 Nov',
    departDate: '2026-11-03',
    depart: 'Mon 12:00 PM',
    from: 'Finley lot',
    back: 'Wed · 5:00 PM',
    hotel: 'Mid Pines Inn',
    transport: 'bus',
    notes: 'Practice round Monday at 3:30. Round 1 Tuesday 8:10, round 2 Wednesday 7:50.',
    uniform: 'Navy polo Tuesday, white Wednesday',
    gear: 'Rain gear, two dozen balls, yardage book',
    rooms: 'Theo and Eli · Sofia and Ava · Priya',
    flight: null,
    eventId: 'e-cfi',
    travelers: ['Theo Marchetti', 'Sofia Alvarez', 'Ava Lindqvist', 'Eli Brandt', 'Priya Natarajan'],
    travelerCount: 5,
    mine: true,
    upcoming: true,
  },
  {
    id: 'sea',
    name: 'Seahawk Intercollegiate',
    destination: 'Country Club of Landfall · Wilmington, NC',
    dates: 'Fri 14 – Sun 16 Nov',
    departDate: '2026-11-14',
    depart: 'Fri 11:00 AM',
    from: 'Finley lot',
    back: 'Sun',
    hotel: 'Hotel Ballast',
    transport: 'bus',
    notes: null,
    uniform: null,
    gear: null,
    rooms: null,
    flight: null,
    eventId: 'e-sea',
    travelers: ['Theo Marchetti', 'Sofia Alvarez', 'Ava Lindqvist', 'Jonah Okafor', 'Priya Natarajan'],
    travelerCount: 5,
    mine: false,
    upcoming: true,
  },
];

const BASE = {
  teamId: 't1',
  teamName: 'Varsity',
  playersError: false,
  season: 'Fall 2026',
  announcements: { rows: ANNS, error: false },
  trips: { rows: TRIPS, error: false },
  documents: {
    error: false,
    folders: [
      {
        name: 'Carolina Fall Invitational',
        files: [
          { id: 'd1', title: 'Pairings and tee times', type: 'PDF', size: '84 KB', date: 'Oct 14' },
          { id: 'd2', title: 'Hotel confirmation', type: 'PDF', size: '61 KB', date: 'Oct 13' },
          { id: 'd3', title: 'Travel waiver', type: 'PDF', size: '46 KB', date: 'Oct 10' },
        ],
      },
      {
        name: 'Team',
        files: [
          { id: 'd4', title: 'Fall 2026 schedule', type: 'PDF', size: '120 KB', date: 'Aug 20' },
          { id: 'd5', title: 'Team handbook', type: 'PDF', size: '1.2 MB', date: 'Aug 18' },
          { id: 'd6', title: 'Practice plan · week 9', type: 'DOC', size: '32 KB', date: 'Oct 12' },
        ],
      },
      { name: 'Compliance', files: [{ id: 'd7', title: 'NCAA hours log', type: 'XLS', size: '58 KB', date: 'Oct 13' }] },
    ],
  },
  updates: {
    error: false,
    rows: [
      { id: 'n1', title: 'Coach Reyes posted', body: 'Pairings for Thursday are up', href: '/golf/dashboard/team-hub?tab=ann', when: 'Today 2:28 PM', unread: true },
      { id: 'n2', title: 'Travel updated', body: 'Carolina Fall Invitational · hotel confirmed', href: '/golf/dashboard/team-hub?tab=travel', when: 'Today 1:40 PM', unread: true },
      { id: 'n3', title: 'Task due tomorrow', body: 'Sign travel waiver', href: null, when: 'Today 11:02 AM', unread: true },
      { id: 'n4', title: 'Qualifier standings moved', body: 'You’re 4th · 2 shots inside the line', href: '/golf/dashboard/my-qualifiers', when: 'Yesterday', unread: false },
      { id: 'n5', title: 'New document', body: 'Local rules · Pinehurst No. 2', href: null, when: 'Yesterday', unread: false },
    ],
  },
};

export const PREVIEW_HUB_PLAYER: ChTeamHub = {
  ...BASE,
  role: 'player',
  viewerPlayerId: 'theo',
  players: [],
  rsvps: {
    error: false,
    rows: [
      { eventId: 'r1', title: 'Course prep · 9 holes', date: '2026-10-15', weekday: 'Wed', day: 15, meta: '3:30 PM · Finley GC', mandatory: false, mine: 'accepted', counts: null },
      { eventId: 'r2', title: 'Team dinner', date: '2026-10-16', weekday: 'Thu', day: 16, meta: '7:30 PM · Carolina Inn', mandatory: false, mine: 'pending', counts: null },
      { eventId: 'r3', title: 'Recovery nine', date: '2026-10-17', weekday: 'Fri', day: 17, meta: '3:30 PM · Finley GC', mandatory: true, mine: 'pending', counts: null },
    ],
  },
  tasks: {
    error: false,
    rows: [
      { id: 't1', title: 'Sign travel waiver', detail: 'Carolina Fall Invitational', dueDate: '2026-10-17', due: 'Fri 17', status: 'pending', done: null },
      { id: 't2', title: 'Post two practice rounds', detail: 'Qualifier eligibility', dueDate: '2026-10-15', due: 'Tomorrow', status: 'pending', done: null },
      { id: 't3', title: 'Upload class schedule', detail: 'Fall term', dueDate: '2026-10-01', due: 'Oct 1', status: 'completed', done: null },
    ],
  },
};

export const PREVIEW_HUB_COACH: ChTeamHub = {
  ...BASE,
  role: 'coach',
  viewerPlayerId: null,
  players: PLAYERS.map(([id, name]) => ({ id, name })),
  announcements: { rows: ANNS.map((a) => ({ ...a, acked: false })), error: false },
  rsvps: {
    error: false,
    rows: [
      { eventId: 'r1', title: 'Course prep · 9 holes', date: '2026-10-15', weekday: 'Wed', day: 15, meta: '3:30 PM · Finley GC', mandatory: false, mine: null, counts: { going: 4, maybe: 1, no: 0, none: 1 } },
      { eventId: 'r2', title: 'Team dinner', date: '2026-10-16', weekday: 'Thu', day: 16, meta: '7:30 PM · Carolina Inn', mandatory: false, mine: null, counts: { going: 4, maybe: 0, no: 1, none: 1 } },
      { eventId: 'r3', title: 'Recovery nine', date: '2026-10-17', weekday: 'Fri', day: 17, meta: '3:30 PM · Finley GC', mandatory: true, mine: null, counts: { going: 3, maybe: 2, no: 0, none: 1 } },
    ],
  },
  tasks: {
    error: false,
    rows: [
      { id: 't1', title: 'Sign travel waiver', detail: 'Carolina Fall Invitational', dueDate: '2026-10-17', due: 'Fri 17', status: 'pending', done: [3, 5] },
      { id: 't2', title: 'Post two practice rounds', detail: 'Qualifier eligibility', dueDate: '2026-10-15', due: 'Tomorrow', status: 'pending', done: [4, 6] },
      { id: 't3', title: 'Upload class schedule', detail: 'Fall term', dueDate: '2026-10-01', due: 'Oct 1', status: 'completed', done: [6, 6] },
    ],
  },
};

const empty = (d: ChTeamHub): ChTeamHub => ({
  ...d,
  rsvps: { rows: [], error: false },
  announcements: { rows: [], error: false },
  trips: { rows: [], error: false },
  tasks: { rows: [], error: false },
  documents: { folders: [], error: false },
  updates: { rows: [], error: false },
});
export const PREVIEW_HUB_PLAYER_EMPTY = empty(PREVIEW_HUB_PLAYER);
export const PREVIEW_HUB_COACH_EMPTY = empty(PREVIEW_HUB_COACH);

const failed = (d: ChTeamHub): ChTeamHub => ({
  ...d,
  players: [],
  playersError: d.role === 'coach',
  rsvps: { rows: [], error: true },
  announcements: { rows: [], error: true },
  trips: { rows: [], error: true },
  tasks: { rows: [], error: true },
  documents: { folders: [], error: true },
  updates: { rows: [], error: true },
});
export const PREVIEW_HUB_PLAYER_FAILED = failed(PREVIEW_HUB_PLAYER);
export const PREVIEW_HUB_COACH_FAILED = failed(PREVIEW_HUB_COACH);

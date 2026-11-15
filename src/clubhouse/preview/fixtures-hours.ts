import type { ChHoursData } from '../data/hours';
import type { ChHoursEventIn } from '../screens/calendar/hours/model';
import { DEFAULT_HOURS_SETTINGS } from '../screens/calendar/hours/rules';

/**
 * Practice hours (F-03) for the preview and the page's tests: a Division I week in season, Mon 9 to Sun 15 Nov 2026,
 * with a two-day tournament and the practice round the day before it. Test evidence only, never shown as the product
 * (the real-data rule, 15 Nov 2026): the page itself is checked on staging's real teams.
 */

const PEOPLE = [
  { id: 'ava', name: 'Ava Lindqvist', year: 'Jr' },
  { id: 'theo', name: 'Theo Marchetti', year: 'So' },
  { id: 'mila', name: 'Mila Okafor', year: 'Sr' },
  { id: 'jonah', name: 'Jonah Reyes', year: 'Fr' },
  { id: 'nora', name: 'Nora Castellanos', year: 'So' },
];
const TRAVELLING = ['ava', 'theo', 'mila'];
const HOME = ['jonah', 'nora'];

const ev = (over: Partial<ChHoursEventIn> & { id: string; date: string; title: string }): ChHoursEventIn => ({
  type: 'practice',
  start: 14,
  end: 17,
  allDay: false,
  location: null,
  people: [],
  rsvp: {},
  cancelled: false,
  span: null,
  invitedList: false,
  ...over,
});

const PINEHURST = { from: '2026-11-13', to: '2026-11-14' };

const EVENTS: ChHoursEventIn[] = [
  ev({ id: 'h-mon', date: '2026-11-09', title: 'Team practice', start: 14, end: 18, location: 'Finley GC' }),
  ev({ id: 'h-theo', date: '2026-11-09', title: 'Short game with Theo', type: 'meeting', start: 19, end: 21, people: ['theo'], invitedList: true }),
  ev({ id: 'h-tue', date: '2026-11-10', title: 'Team practice', start: 14, end: 17.5, location: 'Finley GC' }),
  ev({ id: 'h-wed', date: '2026-11-11', title: 'Team practice', start: 14, end: 17, location: 'Finley GC' }),
  ev({
    id: 'h-meet',
    date: '2026-11-11',
    title: 'Travel briefing',
    type: 'meeting',
    start: 18,
    end: 19,
    people: [...PEOPLE.map((p) => p.id)],
    invitedList: true,
  }),
  ev({ id: 'h-pr', date: '2026-11-12', title: 'Practice round', start: 9, end: 14, location: 'Pinehurst No. 8', people: TRAVELLING, invitedList: true }),
  ev({ id: 'h-trv', date: '2026-11-12', title: 'Travel to Pinehurst', type: 'travel', start: 15, end: 18, people: TRAVELLING, invitedList: true }),
  ev({ id: 'h-home', date: '2026-11-14', title: 'Practice at home', allDay: true, start: null, end: null, people: HOME, invitedList: true }),
  ...['2026-11-13', '2026-11-14'].map((d) =>
    ev({
      id: 'h-inv',
      date: d,
      title: 'Pinehurst Invitational',
      type: 'tournament',
      allDay: true,
      start: null,
      end: null,
      location: 'Pinehurst No. 8',
      people: TRAVELLING,
      invitedList: true,
      span: PINEHURST,
    }),
  ),
];

export const PREVIEW_HOURS: ChHoursData = {
  role: 'coach',
  teamId: '00000000-0000-4000-8000-000000000001',
  teamName: 'Demo University Golf',
  timezone: 'America/New_York',
  today: '2026-11-11',
  days: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'],
  settings: DEFAULT_HOURS_SETTINGS,
  untimedHours: null,
  settingsFrom: 'division',
  storeMissing: false,
  events: EVENTS,
  people: PEOPLE,
  // Mila missed Wednesday's practice.
  marks: { 'h-wed': { mila: 'no_show' } },
  adjustments: {},
  eventsError: false,
  membersError: false,
  partial: false,
};

/** Jonah's own week: the calendar holds only what he is on, and the people list is him alone. */
export const PREVIEW_HOURS_PLAYER: ChHoursData = {
  ...PREVIEW_HOURS,
  role: 'player',
  people: PEOPLE.filter((p) => p.id === 'jonah'),
  events: EVENTS.filter((e) => !e.invitedList || e.people.includes('jonah')).map((e) => ({ ...e, people: e.people.filter((p) => p === 'jonah') })),
  marks: {},
};

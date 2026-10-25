import { describe, expect, it } from 'vitest';
import {
  autoScrollSpeed,
  autoScrollStep,
  barPill,
  clashSummary,
  clashesAt,
  columnAt,
  draggable,
  durationLabel,
  hourAt,
  moveAcrossDays,
  movePill,
  moveSpan,
  moveTarget,
  resizePill,
  resizeSpan,
  resizeTarget,
  seriesScopes,
  snapTime,
} from '../screens/calendar/drag-model';
import { movePayload, toHHMM } from '../screens/calendar/move-write';
import { whoHears, whoHearsLine } from '../screens/calendar/who-hears';
import type { ChCalEvent, ChCalPerson } from '../screens/calendar/model';

const D = '2026-10-14';
function ev(over: Partial<ChCalEvent> & { id: string }): ChCalEvent {
  return {
    type: 'practice',
    title: over.id,
    date: D,
    start: 9,
    end: 10,
    allDay: false,
    location: null,
    notes: null,
    recurring: null,
    people: [],
    rsvp: {},
    rsvpRequired: false,
    owner: null,
    busyOnly: false,
    instructor: null,
    pattern: null,
    canEdit: true,
    cancelled: false,
    seriesId: null,
    startIso: `${D}T13:00:00Z`,
    span: null,
    ...over,
  } as ChCalEvent;
}
const people = new Map<string, ChCalPerson>(
  [
    ['priya', 'Priya Shah'],
    ['jonah', 'Jonah Kim'],
    ['ava', 'Ava Lindqvist'],
    ['eli', 'Eli Brandt'],
  ].map(([id, name]) => [id!, { id: id!, name: name! } as ChCalPerson]),
);

describe('snap and edges', () => {
  it('snaps to quarters, or 5 minutes with Alt', () => {
    expect(snapTime(9.1)).toBe(9);
    expect(snapTime(9.13)).toBe(9.25);
    expect(snapTime(9.06, 5 / 60)).toBeCloseTo(9.0833, 4);
  });
  it('reads the hour from the pointer against the grid rect, not a dy from the start', () => {
    expect(hourAt(326, 300, 52, 6)).toBe(6.5);
    // The grid scrolled 52px up under a still pointer: an hour later.
    expect(hourAt(326, 248, 52, 6)).toBe(7.5);
  });
  it('a move keeps its length, follows the pointer less the grab, and stops inside the grid', () => {
    expect(moveTarget({ start: 9, end: 10 }, 9.5, 0, { from: 6, to: 21 })).toEqual({ start: 9.5, end: 10.5 });
    // Grabbed 30 minutes in: the start trails the pointer by that.
    expect(moveTarget({ start: 9, end: 10 }, 10.1, 0.5, { from: 6, to: 21 })).toEqual({ start: 9.5, end: 10.5 });
    expect(moveTarget({ start: 9, end: 10 }, 30, 0, { from: 6, to: 21 })).toEqual({ start: 20, end: 21 });
    expect(moveTarget({ start: 9, end: 10 }, 1, 0, { from: 6, to: 21 })).toEqual({ start: 6, end: 7 });
  });
  it('a resize moves one edge, keeps 15 minutes, and never passes 0:00 or 24:00', () => {
    expect(resizeTarget({ start: 9, end: 10 }, 'end', 10.25, { from: 6, to: 21 })).toEqual({ start: 9, end: 10.25 });
    expect(resizeTarget({ start: 9, end: 10 }, 'end', 8, { from: 6, to: 21 })).toEqual({ start: 9, end: 9.25 });
    expect(resizeTarget({ start: 9, end: 10 }, 'start', 11, { from: 6, to: 21 })).toEqual({ start: 9.75, end: 10 });
    expect(resizeTarget({ start: 22, end: 23 }, 'end', 26, { from: 0, to: 24 })).toEqual({ start: 22, end: 24 });
    expect(resizeTarget({ start: 1, end: 2 }, 'start', -2, { from: 0, to: 24 })).toEqual({ start: 0, end: 2 });
  });
  it('the column under a point, clamped', () => {
    expect(columnAt(52 + 150, { left: 0, width: 52 + 700 }, 52, 7)).toBe(1);
    expect(columnAt(-10, { left: 0, width: 752 }, 52, 7)).toBe(0);
    expect(columnAt(5000, { left: 0, width: 752 }, 52, 7)).toBe(6);
  });
});

describe('days and spans', () => {
  it('moves by calendar dates across a clock change', () => {
    expect(moveAcrossDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(moveAcrossDays('2026-03-08', -1)).toBe('2026-03-07');
  });
  it('spans move whole and resize to at least one day', () => {
    expect(moveSpan({ from: '2026-10-17', to: '2026-10-19' }, 1)).toEqual({ from: '2026-10-18', to: '2026-10-20' });
    expect(resizeSpan({ from: '2026-10-17', to: '2026-10-19' }, 'to', -5)).toEqual({ from: '2026-10-17', to: '2026-10-17' });
    expect(resizeSpan({ from: '2026-10-17', to: '2026-10-19' }, 'from', -1)).toEqual({ from: '2026-10-16', to: '2026-10-19' });
  });
});

describe('clashes', () => {
  const moved = ev({ id: 'mv', people: ['priya', 'jonah', 'ava'] });
  const meeting = ev({ id: 'tm', title: 'Team meeting', type: 'meeting', start: 15, end: 16, people: ['priya', 'jonah'] });
  const lift = ev({ id: 'lf', title: 'Lift', start: 15.5, end: 16.5, people: ['ava'] });
  const c1 = ev({ id: 'c1', type: 'class', title: 'STAT 201', start: 15, end: 16, owner: 'priya' });
  const c2 = ev({ id: 'c2', type: 'class', title: 'ECON 101', start: 15, end: 16, owner: 'jonah' });
  it('names an event and counts the rest; counts classes with first names up to two', () => {
    const all = [moved, meeting, lift, c1, c2];
    const at = { date: D, start: 15, end: 16 };
    const hits = clashesAt(moved, at, all);
    expect([...hits].sort()).toEqual(['c1', 'c2', 'lf', 'tm']);
    expect(clashSummary(moved, new Set(['tm']), all, people)).toEqual({ line: 'Clashes with Team meeting', players: 2 });
    expect(clashSummary(moved, new Set(['tm', 'lf']), all, people)).toEqual({ line: 'Clashes with Team meeting and 1 more', players: 3 });
    expect(clashSummary(moved, new Set(['c1', 'c2']), all, people).line).toBe('2 in class · Priya, Jonah');
  });
  it('three or more in class are counted only; a long name is cut at 28', () => {
    const many = ['priya', 'jonah', 'ava', 'eli'].map((o, i) => ev({ id: `k${i}`, type: 'class', owner: o }));
    const e = ev({ id: 'x', people: ['priya', 'jonah', 'ava', 'eli'] });
    expect(clashSummary(e, new Set(many.map((m) => m.id)), many, people).line).toBe('4 in class');
    const long = ev({ id: 'lg', title: 'Pinehurst Invitational Practice Round', people: ['priya'] });
    expect(clashSummary(e, new Set(['lg']), [long], people).line).toBe('Clashes with Pinehurst Invitational Pract…');
    expect(clashSummary(e, new Set(), [], people)).toEqual({ line: null, players: 0 });
  });
});

describe('auto-scroll, in px per second', () => {
  it('720 at the edge, 180 halfway, 0 at the inner side', () => {
    expect(autoScrollSpeed(0, 56)).toBe(720);
    expect(autoScrollSpeed(28, 56)).toBe(180);
    expect(autoScrollSpeed(56, 56)).toBe(0);
  });
  it('steps by the frame time, capped at 50ms', () => {
    expect(autoScrollStep(0, 56, 16)).toBeCloseTo(11.52, 2);
    expect(autoScrollStep(0, 56, 500)).toBe(36);
  });
});

describe('labels', () => {
  it('durations', () => {
    expect(durationLabel(2.5)).toBe('2 hr 30 min');
    expect(durationLabel(0.25)).toBe('15 min');
    expect(durationLabel(1)).toBe('1 hr');
    expect(durationLabel(1.25)).toBe('1 hr 15 min');
  });
  it('the pill: same day, another day, resize, bars', () => {
    expect(movePill({ date: D }, { date: D, start: 16, end: 18 }, '12')).toBe('4:00 – 6:00 PM');
    expect(movePill({ date: D }, { date: '2026-10-15', start: 16, end: 18 }, '12')).toBe('Thu 15 · 4:00 – 6:00 PM');
    expect(movePill({ date: D }, { date: D, start: 16, end: 18 }, '24')).toBe('16:00 – 18:00');
    expect(resizePill('end', { start: 15.5, end: 18.5 }, '12')).toBe('Ends 6:30 PM · 3 hr');
    expect(resizePill('start', { start: 15, end: 17.5 }, '12')).toBe('Starts 3:00 PM · 2 hr 30 min');
    expect(barPill({ from: '2026-10-17', to: '2026-10-19' })).toBe('Sat 17 – Mon 19');
  });
});

describe('what drags', () => {
  it('a coach’s editable team event; a run or all-day is a bar; nothing else', () => {
    expect(draggable(ev({ id: 'a' }), true)).toBe('timed');
    expect(draggable(ev({ id: 'a' }), false)).toBeNull();
    expect(draggable(ev({ id: 'a', type: 'class' }), true)).toBeNull();
    expect(draggable(ev({ id: 'a', type: 'busy' }), true)).toBeNull();
    expect(draggable(ev({ id: 'a', cancelled: true }), true)).toBeNull();
    expect(draggable(ev({ id: 'a', canEdit: false }), true)).toBeNull();
    expect(draggable(ev({ id: 'a', allDay: true, start: null, end: null }), true)).toBe('bar');
    expect(draggable(ev({ id: 'a', span: { from: D, to: '2026-10-16', start: 7, end: 16.5 } }), true)).toBe('bar');
    expect(draggable(ev({ id: 'a', seriesId: 's1' }), true)).toBe('timed');
    expect(draggable(ev({ id: 'a', type: 'tournament', round: { tournamentId: 't', roundNo: 1, lockedAt: '2026-10-01T00:00:00Z' } }), true)).toBeNull();
  });
  it('a series offers both scopes on a time change, only this event on a day change', () => {
    expect(seriesScopes({ seriesId: 's' }, { date: D }, { date: D })).toEqual(['this', 'thisAndFuture']);
    expect(seriesScopes({ seriesId: 's' }, { date: D }, { date: '2026-10-15' })).toEqual(['this']);
    expect(seriesScopes({ seriesId: null }, { date: D }, { date: D })).toEqual([]);
  });
});

describe('the write', () => {
  it('gives each date its own offset and a run its end offset; 24:00 is the next day', () => {
    expect(toHHMM(13.75)).toBe('13:45');
    const p = movePayload({ e: ev({ id: 'a' }), to: { date: '2026-11-01', start: 0.5, end: 2 }, kind: 'move', scope: 'single', expectedUpdatedAt: 'v' }, 'America/New_York');
    // Offsets are minutes west of UTC (Date.getTimezoneOffset), as the server reads them.
    expect(p).toMatchObject({ startDate: '2026-11-01', startTime: '00:30', endTime: '02:00', timezoneOffset: 240 });
    expect(movePayload({ e: ev({ id: 'a' }), to: { date: D, start: 23, end: 24 }, kind: 'resize', scope: 'single', expectedUpdatedAt: null }, 'America/New_York')).toMatchObject({ endDate: '2026-10-15', endTime: '00:00' });
    const run = ev({ id: 'r', span: { from: '2026-10-31', to: '2026-11-02', start: 7, end: 16.5 } });
    expect(movePayload({ e: run, to: { from: '2026-10-31', to: '2026-11-02' }, kind: 'bar', scope: 'single', expectedUpdatedAt: null }, 'America/New_York')).toMatchObject({ startTime: '07:00', endTime: '16:30', timezoneOffset: 240, endTimezoneOffset: 300 });
  });
});

describe('who hears', () => {
  it('only an event that asks for replies tells its invitees', () => {
    expect(whoHearsLine(whoHears({ rsvpRequired: true, people: ['jonah'] }, people))).toBe('Jonah will be told.');
    expect(whoHearsLine(whoHears({ rsvpRequired: true, people: Array(9).fill('ava') }, people))).toBe('9 players will be told.');
    expect(whoHearsLine(whoHears({ rsvpRequired: false, people: ['jonah'] }, people))).toBeNull();
  });
});

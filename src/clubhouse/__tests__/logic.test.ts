import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { formatSigned, formatToPar, formatFixed, initials, MINUS, NO_DATA } from '../lib/format';
import { classYearLabel, formStatus } from '../data/home';
import { friendlyReason } from '../lib/use-action';
import { activeNavItem, isRebuilt, rebuiltHref } from '../shell/nav';

describe('format', () => {
  it('writes to-par with E, a true minus and a dash for no data', () => {
    expect(formatToPar(0)).toBe('E');
    expect(formatToPar(3)).toBe('+3');
    expect(formatToPar(-2)).toBe(`${MINUS}2`);
    expect(formatToPar(-0.44, 1)).toBe(`${MINUS}0.4`);
    expect(formatToPar(0.04, 1)).toBe('E');
    expect(formatToPar(null)).toBe(NO_DATA);
  });
  it('keeps null, zero and signed values distinct', () => {
    expect(formatSigned(null)).toBe(NO_DATA);
    expect(formatSigned(0)).toBe('0.0');
    expect(formatSigned(1.84)).toBe('+1.8');
    expect(formatSigned(-0.9)).toBe(`${MINUS}0.9`);
    expect(formatFixed(undefined)).toBe(NO_DATA);
  });
  it('makes monograms', () => {
    expect(initials('Theo Marchetti')).toBe('TM');
    expect(initials('Priya van der Natarajan')).toBe('PN');
    expect(initials('Cher')).toBe('C');
  });
});

describe('home logic', () => {
  const oct = new Date('2026-10-14T12:00:00Z');
  it('labels class years against the academic year in progress', () => {
    expect(classYearLabel(2027, oct)).toBe('Senior');
    expect(classYearLabel(2030, oct)).toBe('Freshman');
    expect(classYearLabel(2032, oct)).toBe('Class of 2032');
    expect(classYearLabel(null, oct)).toBeNull();
  });
  it('reads form from the newer half against the older half', () => {
    expect(formStatus([72, 73])).toBe('early');
    expect(formStatus([75, 75, 74, 73, 72, 72])).toBe('improving');
    expect(formStatus([72, 72, 73, 74, 75, 74, 75])).toBe('slipping');
    expect(formStatus([72, 72, 71, 72, 71, 71, 72])).toBe('steady');
  });
});

describe('user-facing errors', () => {
  it('passes short readable reasons and hides technical ones', () => {
    expect(friendlyReason('That player already left the team')).toBe('That player already left the team.');
    expect(friendlyReason('duplicate key value violates unique constraint "x"')).toBeNull();
    expect(friendlyReason('PGRST116: JSON object requested')).toBeNull();
    expect(friendlyReason('Not authenticated')).toMatch(/Sign in again/);
    expect(friendlyReason(undefined)).toBeNull();
  });
});

describe('nav', () => {
  it('picks the most specific item and gates unbuilt links', () => {
    expect(activeNavItem('/golf/dashboard')?.id).toBe('home');
    expect(activeNavItem('/golf/dashboard/roster/abc')?.id).toBe('roster');
    expect(isRebuilt('/golf/dashboard/')).toBe(true);
    expect(rebuiltHref('/golf/dashboard/stats?player=1')).toBe('/golf/dashboard/stats?player=1');
    expect(rebuiltHref('/golf/dashboard/rounds')).toBeNull();
    // Players share Stats but not the coach Home or Roster.
    expect(isRebuilt('/golf/dashboard', 'player')).toBe(false);
    expect(isRebuilt('/golf/dashboard/roster', 'player')).toBe(false);
    expect(isRebuilt('/golf/dashboard/stats', 'player')).toBe(true);
    expect(isRebuilt('/golf/dashboard/calendar', 'player')).toBe(true);
    expect(isRebuilt('/golf/dashboard/messages', 'player')).toBe(true);
    expect(isRebuilt('/golf/dashboard/lineups', 'player')).toBe(false);
    expect(activeNavItem('/golf/dashboard/stats', 'player')?.label).toBe('My stats');
  });
});

import { attentionFor } from '../data/roster';
import { summarizePlayer, type ChRound } from '../data/season';

const round = (id: string, date: string, score: number, extra: Partial<ChRound> = {}): ChRound => ({
  id, player_id: 'p', course_name: 'Finley GC', tees_played: null, round_date: date, round_type: null,
  total_score: score, score_to_par: score - 72, front_nine: null, back_nine: null, holes_played: 18,
  total_putts: 30, total_gir: 10, total_gir_possible: 18, total_fairways_hit: 7, total_fairways: 14,
  strokes_gained_total: null, strokes_gained_tee: null, strokes_gained_approach: null,
  strokes_gained_around_green: null, strokes_gained_putting: null, ...extra,
});

describe('roster attention', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  it('flags a quiet player only while the team is posting', () => {
    const s = summarizePlayer([round('a', '2026-10-01', 74), round('b', '2026-09-28', 75)]);
    expect(attentionFor(s, now, true)).toEqual({ tone: 'warning', text: 'No rounds in 13 days' });
    expect(attentionFor(s, now, false)).toBeNull();
  });
  it('flags scoring up by 1.5 or more', () => {
    const s = summarizePlayer(['76', '76', '75', '73', '72', '72'].map((x, i) => round(`r${i}`, `2026-10-1${3 - Math.min(i, 3)}`, Number(x))));
    expect(attentionFor(s, now, false)?.text).toMatch(/^Scoring up/);
  });
  it('praises four straight rounds under a player’s average', () => {
    const scores = [70, 71, 70, 71, 76, 77, 76, 77];
    const s = summarizePlayer(scores.map((x, i) => round(`r${i}`, `2026-10-${String(13 - i).padStart(2, '0')}`, x)));
    expect(attentionFor(s, now, false)).toEqual({ tone: 'positive', text: '4 rounds under average' });
  });
  it('keeps strokes gained null below three rounds with SG', () => {
    const s = summarizePlayer([round('a', '2026-10-01', 72, { strokes_gained_total: 1 }), round('b', '2026-09-30', 72, { strokes_gained_total: 2 })]);
    expect(s.sgPerRound).toBeNull();
    expect(s.sgRounds).toBe(2);
  });
});

describe('stats windows', async () => {
  const { parseWindow, roundsInWindow, previousWindow, rate, tourForGender, weekOf } = await import('../data/stats-common');
  const round = (i: number, type = 'practice', holes = 18) =>
    ({ id: `r${i}`, player_id: 'p', round_date: '2026-09-01', round_type: type, holes_played: holes, total_score: 73, score_to_par: 1 }) as never;

  it('defaults an unknown window to the last 10', () => {
    expect(parseWindow(undefined)).toBe('last10');
    expect(parseWindow('nonsense')).toBe('last10');
    expect(parseWindow('qualifiers')).toBe('qualifiers');
  });

  it('keeps 18-hole rounds and reads both qualifier spellings', () => {
    const rounds = [round(1, 'Qualifier'), round(2, 'qualifying'), round(3), round(4, 'qualifier', 9)];
    expect(roundsInWindow(rounds, 'qualifiers').map((r: { id: string }) => r.id)).toEqual(['r1', 'r2']);
    expect(roundsInWindow(Array.from({ length: 14 }, (_, i) => round(i)), 'last10')).toHaveLength(10);
  });

  it('has a previous window only for the last 10, and only with 3 or more rounds', () => {
    expect(previousWindow(Array.from({ length: 12 }, (_, i) => round(i)), 'last10')).toBeNull();
    expect(previousWindow(Array.from({ length: 13 }, (_, i) => round(i)), 'last10')).toHaveLength(3);
    expect(previousWindow(Array.from({ length: 30 }, (_, i) => round(i)), 'season')).toBeNull();
  });

  it('weights rates by attempts, never by averaging percentages', () => {
    const rows = [
      { greens_hit: 1, greens_total: 2 },
      { greens_hit: 9, greens_total: 18 },
      { greens_hit: null, greens_total: 18 },
    ] as never[];
    expect(rate(rows, 'greens_hit' as never, 'greens_total' as never)).toBe(50);
    expect(rate([], 'greens_hit' as never, 'greens_total' as never)).toBeNull();
  });

  it('benchmarks a women’s team against the LPGA and weeks start Monday', () => {
    expect(tourForGender('womens')).toBe('lpga');
    expect(tourForGender(null)).toBe('pga');
    expect(weekOf('2026-09-27')).toBe('2026-09-21');
    expect(weekOf('2026-09-21')).toBe('2026-09-21');
  });
});

describe('calendar model', async () => {
  const M = await import('../screens/calendar/model');
  const ev = (id: string, start: number, end: number, extra: Partial<import('../screens/calendar/model').ChCalEvent> = {}) =>
    ({ id, type: 'practice', title: id, date: '2026-10-14', start, end, allDay: false, location: null, notes: null, recurring: null, people: [], rsvp: {}, owner: null, busyOnly: false, instructor: null, pattern: null, canEdit: true, cancelled: false, seriesId: null, startIso: '2026-10-14T12:00:00Z', span: null, ...extra }) as import('../screens/calendar/model').ChCalEvent;

  it('builds weeks from Sunday and whole-week month grids', () => {
    expect(M.weekDates('2026-10-14')[0]).toBe('2026-10-11');
    const cells = M.monthCells('2026-10-14');
    expect(cells.length % 7).toBe(0);
    expect(cells[0]).toEqual({ date: '2026-09-27', out: true });
    expect(cells.filter((c) => !c.out)).toHaveLength(31);
    expect(M.addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('writes times the way a coach says them', () => {
    expect(M.fmtHour(14.5)).toBe('2:30 PM');
    expect(M.rangeLabel({ allDay: false, start: 15.5, end: 17 })).toBe('3:30 – 5:00 PM');
    expect(M.rangeLabel({ allDay: false, start: 11, end: 13 })).toBe('11:00 AM – 1:00 PM');
    expect(M.viewTitle('week', '2026-10-14')).toEqual({ main: 'Oct 11 – 17', year: '2026' });
    expect(M.viewTitle('week', '2026-09-30').main).toBe('Sep 27 – Oct 3');
  });

  it('splits overlapping events into lanes per cluster', () => {
    const out = M.layoutLanes([ev('a', 15.5, 17), ev('b', 16.75, 17.5), ev('c', 17.5, 18)]);
    const by = Object.fromEntries(out.map((l) => [l.e.id, l]));
    expect(by.a).toMatchObject({ lane: 0, lanes: 2 });
    expect(by.b).toMatchObject({ lane: 1, lanes: 2 });
    expect(by.c).toMatchObject({ lane: 0, lanes: 1 });
  });

  it('finds a class overlap once, on the team event, and skips declined players', () => {
    const events = [
      ev('lab', 15, 16.25, { type: 'class', owner: 'eli' }),
      ev('prep', 15.5, 17.5, { people: ['eli', 'ava'] }),
      ev('late', 16, 17, { people: ['ava'], rsvp: { ava: 'declined' } }),
    ];
    const found = M.findOverlaps(events);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ eventId: 'prep', withId: 'lab', who: 'eli', from: 15.5, to: 16.25 });
  });

  it('offers open times that avoid everyone’s busy blocks', () => {
    const events = [ev('lab', 7, 16.25, { type: 'class', owner: 'eli' })];
    const open = M.openTimes(events, ['eli'], '2026-10-14', 1, undefined, 15.5);
    expect(open[0]).toEqual([16.25, 17.25]);
    expect(open.every(([s]) => s >= 16.25)).toBe(true);
    // Closest to the current start first, then shown in time order.
    const later = M.openTimes([ev('mid', 12, 13, { type: 'class', owner: 'eli' })], ['eli'], '2026-10-14', 1, undefined, 12);
    expect(later).toHaveLength(3);
    expect(later.every(([s, e]) => e <= 12 || s >= 13)).toBe(true);
    expect(later.some(([s]) => s === 13)).toBe(true);
  });
});

describe('messages model', async () => {
  const M = await import('../screens/messages/model');
  const TZ = 'America/New_York';
  const NOW = '2026-10-14T18:40:00Z';
  const m = (id: string, senderId: string, at: string) => ({ id, senderId, text: id, at, mine: senderId === 'me', seen: false, failed: null, edited: false, deleted: false, hasAttachments: false });

  it('labels rail times by distance from today, in the team zone', () => {
    expect(M.railTime('2026-10-14T18:31:00Z', NOW, TZ)).toBe('2:31 PM');
    expect(M.railTime('2026-10-13T20:10:00Z', NOW, TZ)).toBe('Yesterday');
    expect(M.railTime('2026-10-11T21:02:00Z', NOW, TZ)).toBe('Sun');
    expect(M.railTime('2026-10-01T12:00:00Z', NOW, TZ)).toBe('Oct 1');
    // 11:30 PM Eastern on the 13th is already the 14th in UTC: still yesterday for the team.
    expect(M.railTime('2026-10-14T03:30:00Z', NOW, TZ)).toBe('Yesterday');
    expect(M.railTime(null, NOW, TZ)).toBe('');
  });

  it('sorts conversations into today, this week and earlier', () => {
    expect(M.sectionOf('2026-10-14T13:00:00Z', NOW, TZ)).toBe('today');
    expect(M.sectionOf('2026-10-09T13:00:00Z', NOW, TZ)).toBe('week');
    expect(M.sectionOf('2026-10-02T13:00:00Z', NOW, TZ)).toBe('earlier');
  });

  it('groups a sender’s run within five minutes and puts day separators between days', () => {
    const items = M.threadItems(
      [m('a', 'dan', '2026-10-13T22:20:00Z'), m('b', 'dan', '2026-10-13T22:22:00Z'), m('c', 'dan', '2026-10-13T22:40:00Z'), m('d', 'me', '2026-10-14T17:52:00Z')],
      NOW,
      TZ,
    );
    expect(items.map((i) => (i.kind === 'day' ? i.label : `${i.m.id}${i.first ? 'F' : ''}${i.last ? 'L' : ''}`))).toEqual(['Yesterday', 'aF', 'bL', 'cFL', 'Today', 'dFL']);
  });

  it('filters by unread, groups and search across title and preview', () => {
    const c = (id: string, extra: object) => ({ id, group: false, title: id, subtitle: '', memberIds: [], memberCount: 2, unread: 0, lastAt: null, lastSenderId: null, lastText: '', creatorId: null, ...extra });
    const list = [c('Varsity team', { group: true, unread: 3 }), c('Jonah Okafor', { lastText: 'Can we push to 5?' }), c('Dan', {})];
    expect(M.filterConvs(list, 'unread', '').map((x) => x.id)).toEqual(['Varsity team']);
    expect(M.filterConvs(list, 'groups', '').map((x) => x.id)).toEqual(['Varsity team']);
    expect(M.filterConvs(list, 'all', 'push').map((x) => x.id)).toEqual(['Jonah Okafor']);
  });
});

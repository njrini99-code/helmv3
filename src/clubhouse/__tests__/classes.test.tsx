import { LazyMotion, domAnimation } from 'framer-motion';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Classes (P012): every numbered state in docs/clubhouse/catalog/classes.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const report = vi.hoisted(() => vi.fn());
vi.mock('../lib/track', () => ({ chReport: report, chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/classes' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const actions = vi.hoisted(() => ({ sync: vi.fn(), remove: vi.fn(), extract: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-sync', () => ({ syncClassToCalendar: actions.sync, removeClassFromCalendar: actions.remove }));
vi.mock('@/app/golf/actions/schedule-image', () => ({ extractClassesFromScheduleImage: actions.extract }));
type Call = { table: string; op: string; args: unknown[]; filters: Array<[string, unknown[]]> };
const client = vi.hoisted(() => ({ log: [] as Call[], answers: {} as Record<string, unknown> }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const rec: Call = { table, op: 'select', args: [], filters: [] };
      client.log.push(rec);
      const answer = () => {
        const a = client.answers[`${table}.${rec.op}`];
        return { data: null, error: null, ...((typeof a === 'function' ? a(rec) : a) as object) };
      };
      const chain: object = new Proxy(
        {},
        {
          get(_, key: string) {
            if (key === 'then') return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer()).then(ok, bad);
            if (key === 'single' || key === 'maybeSingle') return () => Promise.resolve(answer());
            return (...args: unknown[]) => {
              if (key === 'insert' || key === 'update' || key === 'delete') {
                rec.op = key;
                rec.args = args;
              } else rec.filters.push([key, args]);
              return chain;
            };
          },
        },
      );
      return chain;
    },
  }),
}));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));
const flag = vi.hoisted(() => ({ on: true }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: () => flag.on }));
vi.mock('@/app/golf/(dashboard)/dashboard/classes/LegacyClassesPage', () => ({ default: () => <p>The current classes page</p> }));

import GolfClassesPage from '@/app/golf/(dashboard)/dashboard/classes/page';
import ClassesLoading from '@/app/golf/(dashboard)/dashboard/classes/loading';
import { parseSemesterDates } from '@/lib/golf/semester';
import { loadClasses } from '../data/classes';
import {
  addDays,
  calendarGap,
  checkDraft,
  classNameOf,
  conflictFlag,
  conflictsOf,
  dayToken,
  draftOf,
  eventWhen,
  groupConflicts,
  importKey,
  inputFromDraft,
  inTerm,
  lookAt,
  nextMonday,
  orderClasses,
  overlapsAmong,
  parseClassName,
  parseCredits,
  syncStartFor,
  tabParts,
  termOn,
  termOptions,
  timeRange,
  toChClasses,
  toImportRow,
  toTeamEvent,
  upcomingMeetings,
  weekDates,
  type ChClass,
  type ChClassesPage,
  type ChClassInput,
  type ChClassRow,
  type ChImportRow,
} from '../data/classes-shape';
import { ClubhouseClassesRoute } from '../routes/classes';
import { ClassesNoTeam } from '../screens/classes/ClassesNoTeam';
import { ClassesSkeleton } from '../screens/classes/ClassesSkeleton';
import { ClassesView } from '../screens/classes/ClassesView';
import { CH_SLOW_SAVE_AFTER } from '../lib/use-action';
import { classifyReadError, readScheduleLive, screenFile } from '../screens/classes/import-read';
import { createLiveClassesWrites, newClassId, syncDataOf, type ChClassesWrites } from '../screens/classes/writes';
import { ClubhouseMarker } from '../shell/context';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import {
  PREVIEW_CLASS_ROWS,
  PREVIEW_CLASSES,
  PREVIEW_CLASSES_CLEAR,
  PREVIEW_CLASSES_EMPTY,
  PREVIEW_CLASSES_FAILED,
  PREVIEW_CLASSES_MIXED,
  PREVIEW_CLASSES_PARTIAL,
  PREVIEW_PARSED,
  PREVIEW_SCHEDULE_TEXT,
} from '../preview/fixtures-classes';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}

/** The row the database would send back for a saved class. */
const rowFor = (id: string, i: ChClassInput, over: Partial<ChClassRow> = {}): ChClassRow => ({
  id,
  class_name: classNameOf(i.code, i.name),
  instructor: i.instructor || null,
  days: i.days,
  start_time: i.start || null,
  end_time: i.end || null,
  building: i.building || null,
  room: i.room || null,
  credits: i.credits,
  color: '#3B82F6',
  notes: i.notes || null,
  semester: i.semester || null,
  created_at: '2026-10-14T15:00:00Z',
  ...over,
});

type Fakes = { [K in keyof ChClassesWrites]: ReturnType<typeof vi.fn> };
function fakeWrites(over: Partial<ChClassesWrites> = {}): ChClassesWrites & Fakes {
  let n = 0;
  return {
    save: vi.fn(async (input: ChClassInput, editing) => ({
      success: true,
      data: { row: rowFor(editing?.id ?? `n${++n}`, input, editing ? { color: editing.color, created_at: '2026-08-21T14:00:00Z' } : {}) },
    })),
    remove: vi.fn(async () => ({ success: true })),
    sync: vi.fn(async () => ({ success: true })),
    importRows: vi.fn(async (rows: ChImportRow[]) => ({ success: true, data: { rows: rows.map((r, i) => rowFor(`i${i}`, { ...r, semester: r.semester || 'Fall 2026' })), skipped: [] as string[] } })),
    read: vi.fn(async () => ({ ok: true as const, rows: PREVIEW_PARSED.map(toImportRow), warnings: [] as string[] })),
    ...over,
  } as ChClassesWrites & Fakes;
}
function show(data: ChClassesPage = PREVIEW_CLASSES, over: Partial<ChClassesWrites> = {}) {
  const writes = fakeWrites(over);
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <ClassesView data={data} writes={writes} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return writes;
}
const card = (name: RegExp | string) => screen.getByRole('button', { name });
const names = () => [...document.querySelectorAll('.ch-cl-card .ch-cl-card__name')].map((n) => n.textContent);

beforeEach(() => {
  hapticSpy.mockClear();
  report.mockClear();
  router.refresh.mockClear();
  logServer.mockClear();
  actions.sync.mockReset();
  actions.remove.mockReset();
  actions.extract.mockReset();
  client.log.length = 0;
  client.answers = {};
});
afterEach(() => {
  tables.current = {};
});

// ---------------------------------------------------------------------------
// The pure steps
// ---------------------------------------------------------------------------

describe('Classes shaping', () => {
  it('names: a code-shaped first part is the code, anything else is all name, and the stored form round-trips', () => {
    expect(parseClassName('STAT 201 - Probability and Statistics')).toEqual({ code: 'STAT 201', name: 'Probability and Statistics' });
    expect(parseClassName('Intro to Python 2 - Part 1')).toEqual({ code: '', name: 'Intro to Python 2 - Part 1' });
    expect(parseClassName('Golf Performance Lab')).toEqual({ code: '', name: 'Golf Performance Lab' });
    expect(classNameOf('STAT 201', 'Probability')).toBe('STAT 201 - Probability');
    expect(classNameOf('', 'Intro to Python 2 - Part 1')).toBe('Intro to Python 2 - Part 1');
    expect(tabParts({ code: 'STAT 201', name: 'x' })).toEqual({ top: 'STAT', bottom: '201' });
  });

  it('classes come in the order the week unfolds; a class with no fixed meeting is last; tones follow the order added', () => {
    const list = toChClasses(PREVIEW_CLASS_ROWS);
    expect(list.map((c) => c.code)).toEqual(['ECON 310', 'ENGL 105', 'STAT 201', 'BUSI 401', 'EXSS 188']);
    expect(Object.fromEntries(list.map((c) => [c.code, c.tone]))).toEqual({ 'STAT 201': 'mist', 'ECON 310': 'clay', 'BUSI 401': 'sand', 'ENGL 105': 'stone', 'EXSS 188': 'sage' });
    // Online and no-days classes come last, by name; a Saturday class after the weekdays. The order they were added still sets the tone.
    expect(PREVIEW_CLASSES_MIXED.classes.list.map((c) => c.code)).toEqual(['GEOG 110', 'ECON 310', 'STAT 201', 'BUSI 401', 'MUSC 140', 'ART 101', 'CSCI 110']);
    // A class added later takes the next tone without moving the others.
    const later = orderClasses([...list, { ...list[0]!, id: 'z', code: 'NEW 1', createdAt: '2026-10-01T00:00:00Z' }]);
    expect(later.find((c) => c.id === 'z')!.tone).toBe('mist');
    expect(later.find((c) => c.code === 'EXSS 188')!.tone).toBe('sage');
  });

  it('the term is the one in progress, its week counted from its first day, and the next one before it starts', () => {
    expect(termOn('2026-10-14')).toMatchObject({ label: 'Fall 2026', start: '2026-08-20', end: '2026-12-15', week: 8, weeks: 17, startsIn: null });
    expect(termOn('2026-08-18')).toMatchObject({ label: 'Fall 2026', week: null, startsIn: 2, progress: 0 });
    expect(termOn('2026-08-20')!.week).toBe(1);
    expect(termOn('2026-10-14')!.progress).toBeCloseTo(55 / 117, 5);
  });

  it('a class saved with no term counts as this term; one from another term does not', () => {
    const term = { label: 'Fall 2026' };
    expect([inTerm({ semester: null }, term), inTerm({ semester: 'fall  2026' }, term), inTerm({ semester: 'Spring 2026' }, term)]).toEqual([true, true, false]);
    expect(termOptions('Fall 2026')).toEqual(['Summer 2026', 'Fall 2026', 'Winter 2026', 'Spring 2027', 'Summer 2027']);
    expect(termOptions('Fall 2026', 'Spring 2025')).toContain('Spring 2025');
    // A row saved before the term column was filled is edited in the current term, so the form isn't refused for it.
    const untermed = toChClasses([{ ...PREVIEW_CLASS_ROWS[0]!, semester: null }])[0]!;
    expect(draftOf(untermed, 'Fall 2026').semester).toBe('Fall 2026');
    expect(draftOf({ ...untermed, semester: 'Spring 2026' }, 'Fall 2026').semester).toBe('Spring 2026');
  });

  it('the week runs Monday to Sunday around today; days and dates agree', () => {
    expect(weekDates('2026-10-14')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
    expect(weekDates('2026-10-18')[0]).toBe('2026-10-12');
    expect(dayToken('2026-10-15')).toBe('Th');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(nextMonday('2026-10-14')).toBe('2026-10-19');
    expect(nextMonday('2026-10-12')).toBe('2026-10-19');
    expect(nextMonday('2026-10-18')).toBe('2026-10-19');
  });

  it('team events: a class meeting is never one, nor a cancelled event; times are read in the team zone and all-day dates are not zoned', () => {
    const base = {
      id: 'e',
      title: 'Practice',
      event_type: 'practice',
      start_time: '2026-10-15T10:15:00Z',
      end_time: '2026-10-16T00:00:00Z',
      all_day: false,
      status: 'scheduled',
      location: ' Finley GC ',
      description: null,
    };
    expect(toTeamEvent({ ...base, event_type: 'class' }, 'America/New_York')).toBeNull();
    expect(toTeamEvent({ ...base, description: 'Credits: 3 [class:abc]' }, 'America/New_York')).toBeNull();
    expect(toTeamEvent({ ...base, status: 'cancelled' }, 'America/New_York')).toBeNull();
    expect(toTeamEvent(base, 'America/New_York')).toMatchObject({ startDate: '2026-10-15', startMin: 375, endDate: '2026-10-15', endMin: 1200, allDay: false, where: 'Finley GC' });
    expect(toTeamEvent({ ...base, end_time: null }, 'America/Chicago')).toMatchObject({ startMin: 315, endMin: 315 });
    expect(toTeamEvent({ ...base, all_day: true, start_time: '2026-10-15T00:00:00Z', end_time: '2026-10-17T00:00:00Z' }, 'America/Los_Angeles')).toMatchObject({
      startDate: '2026-10-15',
      endDate: '2026-10-17',
      allDay: true,
    });
  });

  it('overlaps: the trip meets the two Thursday classes and no practice meets a class; a class with no times can overlap nothing', () => {
    const { list } = PREVIEW_CLASSES.classes;
    const hits = conflictsOf(list, PREVIEW_CLASSES.week.events, PREVIEW_CLASSES.week.dates);
    expect(hits.map((h) => [h.date, h.event.id, list.find((c) => c.id === h.classId)!.code])).toEqual([
      ['2026-10-15', 'e4', 'STAT 201'],
      ['2026-10-15', 'e4', 'BUSI 401'],
    ]);
    expect(conflictsOf(list, PREVIEW_CLASSES_CLEAR.week.events, PREVIEW_CLASSES_CLEAR.week.dates)).toEqual([]);
    expect(conflictsOf([{ id: 'x', days: ['Th'], start: null, end: null }], PREVIEW_CLASSES.week.events, PREVIEW_CLASSES.week.dates)).toEqual([]);
    const groups = groupConflicts(hits, list);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.classes.map((c) => c.code)).toEqual(['STAT 201', 'BUSI 401']);
    expect(eventWhen(groups[0]!.event, '2026-10-15')).toBe('6:15 AM–8:00 PM');
    expect(conflictFlag(hits.slice(0, 1))).toBe('Overlaps Pinehurst qualifier Thu');
    expect(conflictFlag(hits)).toBe('Overlaps 2 team events');
    expect(conflictFlag([])).toBeNull();
  });

  it('a trip over several days fills the days between its ends, and an all-day event fills its day', () => {
    const trip = { id: 't', title: 'Away', type: 'travel', startDate: '2026-10-14', startMin: 12 * 60, endDate: '2026-10-16', endMin: 9 * 60, allDay: false, where: null };
    const { list } = PREVIEW_CLASSES.classes;
    const hits = conflictsOf(list, [trip], PREVIEW_CLASSES.week.dates).map((h) => `${h.date} ${list.find((c) => c.id === h.classId)!.code}`);
    // From Wednesday noon: ENGL (13:25) but not ECON (before noon). All of Thursday. Until Friday 9:00: EXSS (8:00), but not ENGL (13:25).
    expect(hits).toEqual(['2026-10-14 ENGL 105', '2026-10-15 STAT 201', '2026-10-15 BUSI 401', '2026-10-16 EXSS 188']);
    expect(eventWhen(trip, '2026-10-14')).toBe('From 12:00 PM');
    expect(eventWhen(trip, '2026-10-15')).toBe('All day');
    const allDay = { ...trip, allDay: true, startDate: '2026-10-13', endDate: '2026-10-13' };
    expect(conflictsOf(list, [allDay], PREVIEW_CLASSES.week.dates).map((h) => list.find((c) => c.id === h.classId)!.code)).toEqual(['STAT 201', 'BUSI 401']);
  });

  it('overlaps among classes: shared days and overlapping times; the same schedule is exact', () => {
    const stat = PREVIEW_CLASSES.classes.list.find((c) => c.code === 'STAT 201')!;
    const draft = (days: string[], start: string, end: string) => ({ id: 'new', days, start, end });
    expect(overlapsAmong(draft(['T', 'Th'], '09:00', '10:15'), [stat])).toMatchObject([{ exact: true, days: ['T', 'Th'] }]);
    expect(overlapsAmong(draft(['T'], '10:00', '11:00'), [stat])).toMatchObject([{ exact: false, days: ['T'] }]);
    expect(overlapsAmong(draft(['T'], '10:15', '11:00'), [stat])).toEqual([]);
    expect(overlapsAmong(draft(['W'], '09:00', '10:15'), [stat])).toEqual([]);
    expect(overlapsAmong(draft([], '09:00', '10:15'), [stat])).toEqual([]);
  });

  it('CH-12101 CH-12102 CH-12103 a class needs its course code, name and term', () => {
    const blank = { ...draftOf(null, ''), semester: '' };
    expect(checkDraft(blank, [], null).map((i) => [i.code, i.field])).toEqual([
      ['CH-12101', 'code'],
      ['CH-12102', 'name'],
      ['CH-12103', 'semester'],
    ]);
    expect(checkDraft({ ...blank, code: 'GEOG 110', name: 'Global', semester: 'Fall 2026' }, [], null)).toEqual([]);
    expect(checkDraft({ ...blank, code: '  ', name: 'Global', semester: 'Fall 2026' }, [], null).map((i) => i.code)).toEqual(['CH-12101']);
  });

  it('CH-12104 CH-12105 the times are both or neither, and it ends after it starts', () => {
    const ok = { ...draftOf(null, 'Fall 2026'), code: 'X 1', name: 'X' };
    expect(checkDraft({ ...ok, start: '10:00', end: '09:00' }, [], null).map((i) => i.code)).toEqual(['CH-12104']);
    expect(checkDraft({ ...ok, start: '10:00', end: '10:00' }, [], null).map((i) => i.code)).toEqual(['CH-12104']);
    expect(checkDraft({ ...ok, start: '10:00', end: '' }, [], null).map((i) => i.code)).toEqual(['CH-12105']);
    expect(checkDraft({ ...ok, start: '', end: '11:00' }, [], null).map((i) => i.code)).toEqual(['CH-12105']);
    expect(checkDraft({ ...ok, start: '10:00', end: '11:00' }, [], null)).toEqual([]);
    expect(checkDraft(ok, [], null)).toEqual([]);
  });

  it('CH-12106 credits are a whole number from 0 to 12, or blank', () => {
    const ok = { ...draftOf(null, 'Fall 2026'), code: 'X 1', name: 'X' };
    for (const bad of ['13', '-1', '2.5', 'three', '100']) expect(checkDraft({ ...ok, credits: bad }, [], null).map((i) => i.code)).toEqual(['CH-12106']);
    for (const good of ['', '0', '3', '12', ' 4 ']) expect(checkDraft({ ...ok, credits: good }, [], null)).toEqual([]);
    expect(parseCredits('')).toEqual({ ok: true, value: null });
    expect(parseCredits('4')).toEqual({ ok: true, value: 4 });
  });

  it('CH-12107 a class at exactly another class’s days and times is refused, unless it is that class being edited', () => {
    const stat = PREVIEW_CLASSES.classes.list.find((c) => c.code === 'STAT 201')!;
    const same = { ...draftOf(null, 'Fall 2026'), code: 'X 1', name: 'X', days: ['T', 'Th'], start: '09:00', end: '10:15' };
    expect(checkDraft(same, [stat], null).map((i) => [i.code, i.field])).toEqual([['CH-12107', 'duplicate']]);
    expect(checkDraft(same, [stat], null)[0]!.message).toContain('STAT 201 already meets at exactly this time');
    expect(checkDraft(same, [stat], stat.id)).toEqual([]);
    expect(checkDraft({ ...same, end: '10:30' }, [stat], null)).toEqual([]);
  });

  it('a draft becomes the input a save takes: trimmed, days in order, credits a number', () => {
    const d = { ...draftOf(null, 'Fall 2026'), code: ' GEOG 110 ', name: ' Global ', days: ['W', 'M', 'Sa'], credits: '3', room: ' 111 ' };
    expect(inputFromDraft(d)).toMatchObject({ code: 'GEOG 110', name: 'Global', days: ['M', 'W', 'Sa'], credits: 3, room: '111' });
    expect(timeRange('11:30', '12:45')).toBe('11:30 AM–12:45 PM');
    expect(timeRange('09:00', '10:15')).toBe('9:00–10:15 AM');
    expect(timeRange('', '10:15')).toBeNull();
  });

  it('the next meetings run from today to the end of the term, at most as many as asked', () => {
    expect(upcomingMeetings({ days: ['T', 'Th'], start: '09:00' }, '2026-10-14', '2026-12-15', 3)).toEqual(['2026-10-15', '2026-10-20', '2026-10-22']);
    expect(upcomingMeetings({ days: ['W'], start: '09:00' }, '2026-10-14', '2026-10-20', 4)).toEqual(['2026-10-14']);
    expect(upcomingMeetings({ days: [], start: '09:00' }, '2026-10-14', '2026-12-15', 4)).toEqual([]);
  });

  it('121502 CH-12002 a class goes on the calendar from next Monday only when that is inside its own term and leaves the term standing; otherwise from the term’s own window', () => {
    // In this term, with weeks left; a class saved with no term is in the current one.
    expect(syncStartFor('Fall 2026', 'Fall 2026', '2026-10-14')).toBe('2026-10-19');
    expect(syncStartFor(null, 'Fall 2026', '2026-10-14')).toBe('2026-10-19');
    // Next term, read in October: the sync refuses a start outside the term ("Could not determine semester dates").
    expect(syncStartFor('Spring 2027', 'Fall 2026', '2026-10-14')).toBeUndefined();
    expect(parseSemesterDates('Spring 2027', '2026-10-19')).toBeNull();
    // Fall, read in early summer: a start before the term begins makes the sync re-derive Summer, so a Fall class was put on a Summer window.
    expect(syncStartFor('Fall 2026', 'Summer 2026', '2026-07-08')).toBeUndefined();
    expect(parseSemesterDates('Fall 2026', '2026-07-13')).toEqual({ start: '2026-07-13', end: '2026-08-15' });
    expect(syncStartFor('Fall 2026', 'Summer 2026', '2026-07-20')).toBeUndefined();
    // The last weeks of a term: under 21 days left, which the sync reads as another term, so the term's own window is used.
    expect(syncStartFor('Fall 2026', 'Fall 2026', '2026-11-25')).toBeUndefined();
    expect(parseSemesterDates('Fall 2026', '2026-11-30')?.end).not.toBe('2026-12-15');
    // A label that is not a term has no window.
    expect(syncStartFor('Fall', 'Fall 2026', '2026-10-14')).toBeUndefined();
    // Whenever a start is offered, the sync's window for it is exactly the class's own term.
    expect(parseSemesterDates('Fall 2026', syncStartFor('Fall 2026', 'Fall 2026', '2026-10-14'))).toEqual({ start: '2026-10-19', end: '2026-12-15' });
  });

  it('120516 CH-12107 a class is only the same as another in its own term: last spring’s class at the same days and times does not refuse this fall’s', () => {
    const stat = PREVIEW_CLASSES.classes.list.find((c) => c.code === 'STAT 201')!;
    const same = { ...draftOf(null, 'Fall 2026'), code: 'X 1', name: 'X', days: ['T', 'Th'], start: '09:00', end: '10:15' };
    const spring = { ...stat, id: 'sp', semester: 'Spring 2026' };
    expect(checkDraft(same, [spring], null, 'Fall 2026')).toEqual([]);
    expect(checkDraft({ ...same, semester: 'Spring 2026' }, [spring], null, 'Fall 2026').map((i) => i.code)).toEqual(['CH-12107']);
    // A class saved with no term is in the current term: it refuses a draft in this term, and not one in next term.
    const untermed = { ...stat, id: 'nt', semester: null };
    expect(checkDraft(same, [untermed], null, 'Fall 2026').map((i) => i.code)).toEqual(['CH-12107']);
    expect(checkDraft({ ...same, semester: 'Spring 2027' }, [untermed], null, 'Fall 2026')).toEqual([]);
  });

  it('CH-12304 a class with days and no full time is not on the calendar for want of a time, and one with no days for want of days', () => {
    const stat = PREVIEW_CLASSES.classes.list.find((c) => c.code === 'STAT 201')!;
    expect(calendarGap(stat)).toBeNull();
    expect(calendarGap({ ...stat, start: null, end: null })).toBe('time');
    expect(calendarGap({ ...stat, end: null })).toBe('time');
    expect(calendarGap({ ...stat, start: null })).toBe('time');
    expect(calendarGap({ ...stat, days: [] })).toBe('days');
    expect(calendarGap({ ...stat, days: [], start: null, end: null })).toBe('days');
  });

  it('a parsed class needs a look when it has no days or no time, and a location with no building becomes the building', () => {
    expect([lookAt({ days: ['M'], start_time: '09:00' }), lookAt({ days: [], start_time: '09:00' }), lookAt({ days: ['M'], start_time: '' }), lookAt({ days: [], start_time: '' })]).toEqual([
      null,
      'No meeting days found',
      'No time found',
      'No days or time found',
    ]);
    const rows = PREVIEW_PARSED.map(toImportRow);
    expect(rows.map((r) => r.code)).toEqual(['GEOG 110', 'MATH 232', 'ART 101', 'PHIL 150', 'STAT 201']);
    expect(rows.find((r) => r.code === 'PHIL 150')!.look).toBe('No days or time found');
    expect(rows.find((r) => r.code === 'GEOG 110')).toMatchObject({ days: ['M', 'W'], start: '15:30', end: '16:45', look: null });
    expect(toImportRow({ ...PREVIEW_PARSED[0]!, building: '', room: '', location: 'Hall 1' })).toMatchObject({ building: 'Hall 1', room: '' });
    // A room with no building isn't taken for one.
    expect(toImportRow({ ...PREVIEW_PARSED[0]!, building: '', room: '111', location: 'Hall 1 111' })).toMatchObject({ building: '', room: '111' });
    expect(importKey('STAT 201 - X', null)).toBe('STAT 201 - X|||');
    // The same class in another term is another class.
    expect(importKey('STAT 201 - X', 'Fall 2026')).toBe('STAT 201 - X|||Fall 2026');
    expect(importKey('STAT 201 - X', 'Fall 2026')).not.toBe(importKey('STAT 201 - X', 'Spring 2027'));
  });
});

// ---------------------------------------------------------------------------
// The loader
// ---------------------------------------------------------------------------

describe('Classes loader', () => {
  const filter = (f: Array<[string, unknown[]]>, op: string, col: string) => f.find(([k, a]) => k === op && a[0] === col)?.[1][1];
  const trip = {
    id: 'e4',
    title: 'Pinehurst qualifier',
    event_type: 'travel',
    start_time: '2026-10-15T10:15:00Z',
    end_time: '2026-10-16T00:00:00Z',
    all_day: false,
    status: 'scheduled',
    location: 'Pinehurst No. 2',
    description: null,
  };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T16:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('reads the player’s own classes and the team’s events, in the team’s zone, and shapes both', async () => {
    let classFilters: Array<[string, unknown[]]> = [];
    let eventFilters: Array<[string, unknown[]]> = [];
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_player_classes: (f) => {
        classFilters = f;
        return { data: PREVIEW_CLASS_ROWS };
      },
      golf_events: (f) => {
        eventFilters = f;
        return {
          data: [
            trip,
            { ...trip, id: 'cls', event_type: 'class', description: 'Credits: 3 [class:abc]' },
            { ...trip, id: 'gone', status: 'cancelled' },
            { ...trip, id: 'mon', event_type: 'practice', title: 'Practice', start_time: '2026-10-12T19:30:00Z', end_time: '2026-10-12T21:30:00Z' },
          ],
        };
      },
    };
    const d = await loadClasses({ playerId: 'p1', teamId: 't1' });
    expect(d.todayIso).toBe('2026-10-14');
    expect(d.term).toMatchObject({ label: 'Fall 2026', week: 8 });
    expect(d.classes.error).toBe(false);
    expect(d.classes.list.map((c) => c.code)).toEqual(['ECON 310', 'ENGL 105', 'STAT 201', 'BUSI 401', 'EXSS 188']);
    expect(d.classes.list.find((c) => c.code === 'STAT 201')).toMatchObject({
      name: 'Probability and Statistics',
      days: ['T', 'Th'],
      start: '09:00',
      end: '10:15',
      location: 'Hanes Hall 120',
      credits: 3,
      semester: 'Fall 2026',
    });
    expect(d.week.dates[0]).toBe('2026-10-12');
    expect(d.week.error).toBe(false);
    // The class meeting and the cancelled event are not the team's week.
    expect(d.week.events.map((e) => e.id)).toEqual(['e4', 'mon']);
    expect(d.week.events[0]).toMatchObject({ startDate: '2026-10-15', startMin: 375, endMin: 1200 });
    expect(d.week.events[1]).toMatchObject({ startDate: '2026-10-12', startMin: 930, endMin: 1050 });
    // Scoped to the player, and to the team's events that are not classes.
    expect(filter(classFilters, 'eq', 'player_id')).toBe('p1');
    expect(filter(eventFilters, 'eq', 'team_id')).toBe('t1');
    expect(filter(eventFilters, 'neq', 'event_type')).toBe('class');
  });

  it('“today” is the team’s day: in the evening in New York it is already tomorrow in UTC, and the week follows the team', async () => {
    vi.setSystemTime(new Date('2026-10-18T02:00:00Z'));
    tables.current = { golf_team_settings: { data: { timezone: 'America/New_York' } }, golf_player_classes: { data: [] }, golf_events: { data: [] } };
    const d = await loadClasses({ playerId: 'p1', teamId: 't1' });
    expect(d.todayIso).toBe('2026-10-17');
    expect(d.week.dates[0]).toBe('2026-10-12');
  });

  it('CH-12201 a failed classes read is an error, logged, never an empty schedule', async () => {
    tables.current = { golf_team_settings: { data: null }, golf_player_classes: { error: { message: 'boom' } }, golf_events: { data: [] } };
    const d = await loadClasses({ playerId: 'p1', teamId: 't1' });
    expect(d.classes).toEqual({ list: [], error: true });
    expect(logServer).toHaveBeenCalledWith('classes', 'classes', expect.anything(), 'calendar');
    expect(d.week.error).toBe(false);
  });

  it('CH-12202 a failed events read is its own error: the classes load, and no overlap is claimed', async () => {
    tables.current = { golf_team_settings: { data: null }, golf_player_classes: { data: PREVIEW_CLASS_ROWS }, golf_events: { error: { message: 'boom' } } };
    const d = await loadClasses({ playerId: 'p1', teamId: 't1' });
    expect(d.week).toMatchObject({ error: true, events: [] });
    expect(d.classes.list).toHaveLength(5);
    expect(logServer).toHaveBeenCalledWith('classes', 'events', expect.anything(), 'calendar');
  });
});

describe('Classes route and page', () => {
  const inProviders = (node: React.ReactNode) =>
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>{node}</ToastProvider>
      </LazyMotion>,
    );

  it('is for players: a coach session renders nothing here', async () => {
    session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1' }, player: null };
    expect(await ClubhouseClassesRoute()).toBeNull();
  });

  it('CH-12305 a player on no team gets the no-team page, with the way to join, and nothing to add', async () => {
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: 'p1' } };
    teamOf.current = null;
    inProviders((await ClubhouseClassesRoute())!);
    await expectCode('CH-12305', /You aren't on a team yet/);
    expect(screen.getByRole('link', { name: 'Open team settings' }).getAttribute('href')).toBe('/golf/dashboard/settings?section=team');
    expect(screen.queryByRole('button', { name: /Add|Import/ })).toBeNull();
  });

  it('120101 a player on a team sees their classes, read on the server', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T16:00:00Z'));
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: 'p1' } };
    teamOf.current = { role: 'player', teamId: 't1', playerId: 'p1' };
    tables.current = { golf_team_settings: { data: { timezone: 'America/New_York' } }, golf_player_classes: { data: PREVIEW_CLASS_ROWS }, golf_events: { data: [] } };
    inProviders((await ClubhouseClassesRoute())!);
    vi.useRealTimers();
    expect(screen.getByRole('heading', { level: 1, name: 'Classes' })).toBeTruthy();
    expect(names()).toEqual(['Intermediate Macroeconomics', 'Writing in the Disciplines', 'Probability and Statistics', 'Corporate Finance', 'Golf Performance Lab']);
  });

  it('the page gives a Clubhouse player the new screen and everyone else the current page', async () => {
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: 'p1' } };
    flag.on = true;
    expect((await GolfClassesPage()) as { type: unknown }).toMatchObject({ type: ClubhouseClassesRoute });
    flag.on = false;
    expect((await GolfClassesPage()) as { type: unknown }).not.toMatchObject({ type: ClubhouseClassesRoute });
    flag.on = true;
    session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1' }, player: null };
    expect((await GolfClassesPage()) as { type: unknown }).not.toMatchObject({ type: ClubhouseClassesRoute });
    // A coach who also has a player profile is still a coach here: Classes is the player's page.
    session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1' }, player: { id: 'p9' } };
    expect((await GolfClassesPage()) as { type: unknown }).not.toMatchObject({ type: ClubhouseClassesRoute });
    session.current = null;
    expect((await GolfClassesPage()) as { type: unknown }).not.toMatchObject({ type: ClubhouseClassesRoute });
  });

  it('CH-12401 the route skeleton holds the page shape and says it is loading', async () => {
    render(<ClassesSkeleton />);
    await expectCode('CH-12401');
    expect(screen.getByRole('main', { name: 'Loading your classes' }).getAttribute('aria-busy')).toBe('true');
    expect(document.querySelectorAll('.ch-cl-deck .ch-skel')).toHaveLength(4);
  });

  it('the no-team page draws without the router (it is a server component)', () => {
    inProviders(<ClassesNoTeam />);
    expect(screen.getByRole('heading', { level: 1, name: 'Classes' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// The live writes
// ---------------------------------------------------------------------------

describe('Classes live writes', () => {
  const live = () => createLiveClassesWrites({ playerId: 'p1', teamId: 't1', term: 'Fall 2026' });
  const input = (over: Partial<ChClassInput> = {}): ChClassInput => ({
    code: 'GEOG 110',
    name: 'Global Environmental Change',
    instructor: ' Dr. J. Alvarez ',
    days: ['W', 'M'],
    start: '15:30',
    end: '16:45',
    building: 'Carroll Hall',
    room: ' 111 ',
    credits: 3,
    semester: 'Fall 2026',
    notes: '',
    ...over,
  });
  const saved = rowFor('new-1', input());
  const last = (op: string, table = 'golf_player_classes') => client.log.filter((c) => c.table === table && c.op === op).at(-1)!;

  it('saves a class as the current page does: "CODE - Name", NULL for a missing time, the days in order, the term written once', async () => {
    client.answers['golf_player_classes.insert'] = { data: saved };
    const res = await live().save(input({ start: '', end: '', semester: '  ' }), null, 'new-1');
    expect(res).toMatchObject({ success: true, data: { row: { id: 'new-1' } } });
    const c = last('insert');
    expect(c.args[0]).toMatchObject({
      player_id: 'p1',
      team_id: 't1',
      class_name: 'GEOG 110 - Global Environmental Change',
      instructor: 'Dr. J. Alvarez',
      days: ['M', 'W'],
      start_time: null,
      end_time: null,
      building: 'Carroll Hall',
      room: '111',
      credits: 3,
      semester: 'Fall 2026',
      notes: null,
    });
    expect((c.args[0] as { color: string }).color).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('120609 an edit updates only that player’s row, keeps its color, and a row a policy hides is a failure, not "saved"', async () => {
    const cls = toChClasses([PREVIEW_CLASS_ROWS[0]!])[0]!;
    client.answers['golf_player_classes.update'] = { data: [PREVIEW_CLASS_ROWS[0]] };
    expect(await live().save(input(), cls, 'new-1')).toMatchObject({ success: true });
    const c = last('update');
    expect(c.filters).toEqual(
      expect.arrayContaining([
        ['eq', ['id', cls.id]],
        ['eq', ['player_id', 'p1']],
      ]),
    );
    expect((c.args[0] as { color: string }).color).toBe('#3B82F6');
    client.answers['golf_player_classes.update'] = { data: [] };
    expect(await live().save(input(), cls, 'new-1')).toMatchObject({ success: false, error: expect.stringContaining('Nothing was saved') });
    client.answers['golf_player_classes.update'] = { error: { message: 'denied' } };
    expect(await live().save(input(), cls, 'new-1')).toEqual({ success: false, error: 'denied' });
    client.answers['golf_player_classes.insert'] = { error: { message: 'no' } };
    expect(await live().save(input(), null, 'new-1')).toEqual({ success: false, error: 'no' });
  });

  it('removing takes the class off the calendar first, and the class row only if that worked', async () => {
    actions.remove.mockResolvedValueOnce({ success: false, error: 'events locked' });
    const w = live();
    expect(await w.remove('k1')).toMatchObject({ success: false, error: expect.stringContaining('events locked. The class was kept') });
    expect(client.log.filter((c) => c.op === 'delete')).toHaveLength(0);
    actions.remove.mockRejectedValueOnce(new Error('network'));
    expect(await w.remove('k1')).toMatchObject({ success: false, error: expect.stringContaining('The class was kept') });
    expect(report).toHaveBeenCalled();
    actions.remove.mockResolvedValueOnce({ success: true });
    expect(await w.remove('k1')).toEqual({ success: true });
    expect(last('delete').filters).toEqual(
      expect.arrayContaining([
        ['eq', ['id', 'k1']],
        ['eq', ['player_id', 'p1']],
      ]),
    );
    actions.remove.mockResolvedValueOnce({ success: true });
    client.answers['golf_player_classes.delete'] = { error: { message: 'gone wrong' } };
    // Off the calendar already: the answer says so, for the page's flag and hint.
    expect(await w.remove('k1')).toEqual({ success: false, error: 'It is off your calendar but still on your schedule. Try again to finish removing it.', data: { offCalendar: true } });
  });

  it('the sync gets the class as the current importer sends it: the stored term, the caller’s zone and offset, and the start date when there is one', async () => {
    actions.sync.mockResolvedValue({ success: true });
    const cls = toChClasses([PREVIEW_CLASS_ROWS[0]!])[0]!;
    await live().sync({ ...cls, semester: null }, { semesterStartDate: '2026-10-19' });
    const [data, id, playerId, teamId] = actions.sync.mock.calls[0]!;
    expect(data).toMatchObject({
      id: cls.id,
      course_code: 'STAT 201',
      course_name: 'Probability and Statistics',
      instructor: 'Dr. L. Osei',
      days: ['T', 'Th'],
      start_time: '09:00',
      end_time: '10:15',
      location: 'Hanes Hall 120',
      building: 'Hanes Hall',
      room: '120',
      credits: 3,
      semester: 'Fall 2026',
      semesterStartDate: '2026-10-19',
      color: '#3B82F6',
      notes: '',
    });
    expect(data.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(data.timezoneOffset).toBe(new Date().getTimezoneOffset());
    expect([id, playerId, teamId]).toEqual([cls.id, 'p1', 't1']);
    expect(syncDataOf(cls, 'Fall 2026')).not.toHaveProperty('semesterStartDate');
    expect(syncDataOf({ ...cls, semester: 'Spring 2026' }, 'Fall 2026').semester).toBe('Spring 2026');
  });

  it('120610 a sync that fails, throws, or writes nothing for a class that has meetings is a failure; for an online class it is not', async () => {
    const cls = toChClasses([PREVIEW_CLASS_ROWS[0]!])[0]!;
    const online = { ...cls, days: [], start: null, end: null };
    actions.sync.mockResolvedValueOnce({ success: false, error: 'Could not determine semester dates' });
    expect(await live().sync(cls)).toEqual({ success: false, error: 'Could not determine semester dates' });
    actions.sync.mockRejectedValueOnce(new Error('network'));
    expect(await live().sync(cls)).toMatchObject({ success: false, error: expect.stringContaining('did not finish') });
    expect(report).toHaveBeenCalled();
    actions.sync.mockResolvedValueOnce({ success: true, noMeetings: true, noMeetingsReason: 'The term has no days left' });
    expect(await live().sync(cls)).toEqual({ success: false, error: 'The term has no days left' });
    // An online class has no time to put on the calendar: it is taken off it, not synced (a sync would default it to 08:00 to 09:00).
    actions.remove.mockResolvedValueOnce({ success: true });
    expect(await live().sync(online)).toEqual({ success: true });
    expect(actions.remove).toHaveBeenCalledWith(online.id);
    expect(actions.sync).toHaveBeenCalledTimes(3);
  });

  it('120515 an import skips what is already on the schedule, reads before it writes, and stops when it cannot read', async () => {
    const rows = PREVIEW_PARSED.map(toImportRow);
    client.answers['golf_player_classes.select'] = { data: [{ class_name: 'STAT 201 - Probability and Statistics', semester: 'Fall 2026' }] };
    client.answers['golf_player_classes.insert'] = (rec: Call) => ({
      data: (rec.args[0] as Array<{ class_name: string }>).map((r, i) => rowFor(`n${i}`, { ...inputOfRow(r), code: r.class_name.split(' - ')[0]! })),
    });
    const w = live();
    const res = await w.importRows(rows.map((r) => ({ ...r, semester: 'Fall 2026' })));
    const inserted = last('insert').args[0] as Array<{ class_name: string; semester: string; player_id: string; team_id: string }>;
    expect(inserted.map((r) => r.class_name)).toEqual(['GEOG 110 - Global Environmental Change', 'MATH 232 - Linear Algebra', 'ART 101 - Drawing', 'PHIL 150 - Ethics']);
    expect(inserted.every((r) => r.player_id === 'p1' && r.team_id === 't1' && r.semester === 'Fall 2026')).toBe(true);
    expect(res).toMatchObject({ success: true, data: { skipped: ['STAT 201 - Probability and Statistics'] } });
    client.log.length = 0;
    client.answers['golf_player_classes.select'] = { error: { message: 'read failed' } };
    expect(await w.importRows(rows)).toMatchObject({ success: false, error: expect.stringContaining('read failed') });
    expect(client.log.filter((c) => c.op === 'insert')).toHaveLength(0);
    client.answers['golf_player_classes.select'] = { data: rows.map((r) => ({ class_name: classNameOf(r.code, r.name), semester: 'Fall 2026' })) };
    expect(await w.importRows(rows.map((r) => ({ ...r, semester: 'Fall 2026' })))).toMatchObject({ success: true, data: { rows: [], skipped: expect.any(Array) } });
    expect(client.log.filter((c) => c.op === 'insert')).toHaveLength(0);
    // The same class in another term is another class: it is imported.
    client.answers['golf_player_classes.select'] = { data: [{ class_name: 'STAT 201 - Probability and Statistics', semester: 'Spring 2026' }] };
    const other = await w.importRows(rows.filter((r) => r.code === 'STAT 201').map((r) => ({ ...r, semester: 'Fall 2026' })));
    expect(other).toMatchObject({ success: true, data: { skipped: [] } });
    expect(client.log.filter((c) => c.op === 'insert')).toHaveLength(1);
  });

  it('CH-12307 an import skips a class already saved with no term: the page reads it as the current term, so it is the same class; in next term it is not', async () => {
    const stat = PREVIEW_PARSED.filter((p) => p.course_code === 'STAT 201').map(toImportRow);
    client.answers['golf_player_classes.select'] = { data: [{ class_name: 'STAT 201 - Probability and Statistics', semester: null }] };
    const w = live();
    const res = await w.importRows(stat.map((r) => ({ ...r, semester: 'Fall 2026' })));
    expect(res).toMatchObject({ success: true, data: { rows: [], skipped: ['STAT 201 - Probability and Statistics'] } });
    // The stored row it matched comes back, so a page that never saw it (a lost answer) can show and sync it.
    expect((res as { data?: { known?: Array<{ class_name: string }> } }).data?.known?.map((r) => r.class_name)).toEqual(['STAT 201 - Probability and Statistics']);
    expect(client.log.filter((c) => c.op === 'insert')).toHaveLength(0);
    // A blank term is no term.
    client.answers['golf_player_classes.select'] = { data: [{ class_name: 'STAT 201 - Probability and Statistics', semester: '  ' }] };
    expect(await w.importRows(stat.map((r) => ({ ...r, semester: 'Fall 2026' })))).toMatchObject({ data: { rows: [] } });
    expect(client.log.filter((c) => c.op === 'insert')).toHaveLength(0);
    // The current term is the page's, not next term's.
    await w.importRows(stat.map((r) => ({ ...r, semester: 'Spring 2027' })));
    expect(client.log.filter((c) => c.op === 'insert')).toHaveLength(1);
  });

  it('CH-12307 a schedule that lists a class twice saves it once, and names the repeat as skipped', async () => {
    const stat = PREVIEW_PARSED.filter((p) => p.course_code === 'STAT 201').map(toImportRow);
    client.answers['golf_player_classes.select'] = { data: [] };
    const w = live();
    const twice = [...stat, ...stat].map((r) => ({ ...r, semester: 'Fall 2026' }));
    const res = await w.importRows(twice);
    expect(res).toMatchObject({ success: true, data: { skipped: ['STAT 201 - Probability and Statistics'] } });
    const inserts = client.log.filter((c) => c.op === 'insert');
    expect(inserts).toHaveLength(1);
    expect((inserts[0]!.args![0] as unknown[]).length).toBe(stat.length);
  });

  it('121404 CH-12001 a class is inserted under the id the page made, and a retry after a lost answer reaches that row instead of adding a second copy', async () => {
    client.answers['golf_player_classes.insert'] = { data: saved };
    expect(await live().save(input(), null, 'id-77')).toMatchObject({ success: true, data: { row: { id: 'new-1' } } });
    expect(last('insert').args[0]).toMatchObject({ id: 'id-77', player_id: 'p1', team_id: 't1' });
    // The first attempt stored the row and its answer was lost: the same id now collides. That class is saved, so it is updated in place.
    client.log.length = 0;
    client.answers['golf_player_classes.insert'] = { error: { code: '23505', message: 'duplicate key value violates unique constraint "golf_player_classes_pkey"' } };
    client.answers['golf_player_classes.update'] = { data: [saved] };
    expect(await live().save(input({ room: '112' }), null, 'id-77')).toMatchObject({ success: true, data: { row: { id: 'new-1' } } });
    expect(client.log.filter((c) => c.op === 'insert')).toHaveLength(1);
    const upd = last('update');
    expect(upd.filters).toEqual(
      expect.arrayContaining([
        ['eq', ['id', 'id-77']],
        ['eq', ['player_id', 'p1']],
      ]),
    );
    expect(upd.args[0]).toMatchObject({ room: '112' });
    // The color the first attempt chose stays.
    expect(upd.args[0]).not.toHaveProperty('color');
    // Any other failure is still a failure, and a colliding row that is not the player's is not "saved".
    client.answers['golf_player_classes.insert'] = { error: { code: '42501', message: 'denied' } };
    expect(await live().save(input(), null, 'id-77')).toEqual({ success: false, error: 'denied' });
    client.answers['golf_player_classes.insert'] = { error: { code: '23505', message: 'duplicate key' } };
    client.answers['golf_player_classes.update'] = { data: [] };
    expect(await live().save(input(), null, 'id-77')).toMatchObject({ success: false, error: expect.stringContaining('Nothing was saved') });
  });

  it('CH-12001 a new row id is a version 4 UUID, made from the browser’s random source even where randomUUID is missing', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newClassId()).toMatch(uuid);
    expect(newClassId()).not.toBe(newClassId());
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    try {
      expect(newClassId()).toMatch(uuid);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('121503 CH-12002 CH-12304 a class with days and no start or no end is taken off the calendar, not synced: the server would put it there from 08:00 to 09:00', async () => {
    const cls = toChClasses([PREVIEW_CLASS_ROWS[0]!])[0]!;
    actions.remove.mockResolvedValue({ success: true });
    for (const times of [
      { start: null, end: null },
      { start: '09:00', end: null },
      { start: null, end: '10:15' },
    ])
      expect(await live().sync({ ...cls, ...times })).toEqual({ success: true });
    expect(actions.sync).not.toHaveBeenCalled();
    expect(actions.remove.mock.calls).toEqual([[cls.id], [cls.id], [cls.id]]);
    // A removal that fails is a failed sync: the class is flagged and Retry tries again.
    actions.remove.mockResolvedValueOnce({ success: false, error: 'events locked' });
    expect(await live().sync({ ...cls, start: null, end: null })).toEqual({ success: false, error: 'events locked' });
    actions.remove.mockRejectedValueOnce(new Error('network'));
    expect(await live().sync({ ...cls, start: null, end: null })).toMatchObject({ success: false, error: expect.stringContaining('did not finish') });
    // With both times it is synced as before.
    actions.sync.mockResolvedValueOnce({ success: true });
    expect(await live().sync(cls)).toEqual({ success: true });
    expect(actions.sync).toHaveBeenCalledTimes(1);
  });

  it('a file is screened before anything is sent: type and size; and the vision action’s sentences pick the error view', () => {
    expect(screenFile({ name: 'a.png', type: 'image/png', size: 1000 })).toEqual({ ok: true, kind: 'image' });
    expect(screenFile({ name: 'IMG_1.HEIC', type: '', size: 1000 })).toEqual({ ok: true, kind: 'image' });
    expect(screenFile({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toEqual({ ok: true, kind: 'pdf' });
    expect(screenFile({ name: 'a.txt', type: 'text/plain', size: 1000 })).toEqual({ ok: true, kind: 'text' });
    expect(screenFile({ name: 'a.docx', type: 'application/msword', size: 1000 })).toEqual({ ok: false, kind: 'unsupported' });
    expect(screenFile({ name: 'a.png', type: 'image/png', size: 13 * 1024 * 1024 })).toEqual({ ok: false, kind: 'tooLarge' });
    expect(classifyReadError("This doesn't look like a class schedule (it reads as: receipt).")).toBe('notSchedule');
    expect(classifyReadError('That image is too large to process. Please upload an image under 12MB.')).toBe('tooLarge');
    expect(classifyReadError('Unsupported image type. Please upload a PNG, JPG, or WebP screenshot.')).toBe('unsupported');
    expect(classifyReadError('The image reader timed out.')).toBe('fault');
    expect(classifyReadError(undefined)).toBe('none');
  });
});

/** An insert payload back to the input it came from, for the fake database's answer. */
function inputOfRow(r: { class_name: string; instructor?: string | null; days?: string[]; semester?: string | null }): ChClassInput {
  return { code: '', name: r.class_name, instructor: r.instructor ?? '', days: r.days ?? [], start: '', end: '', building: '', room: '', credits: null, semester: r.semester ?? '', notes: '' };
}

// ---------------------------------------------------------------------------
// On screen
// ---------------------------------------------------------------------------

describe('Classes, on screen', () => {
  it('CH-12801 the page is labelled "Classes", and every class is one button named for what it is and when it meets', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Classes' })).toBeTruthy();
    expect(screen.getByRole('main').getAttribute('aria-labelledby')).toBe('ch-cl-title');
    // What the read policy allows: the coach can read the class, teammates can't.
    expect(screen.getByText('What your coach sees')).toBeTruthy();
    expect(screen.getByText(/Your coach can see your classes, when they meet and where.*Your teammates don.t see them\./)).toBeTruthy();
    expect(screen.getByText('Fall 2026 · Aug 20 – Dec 15')).toBeTruthy();
    expect(names()).toEqual(['Intermediate Macroeconomics', 'Writing in the Disciplines', 'Probability and Statistics', 'Corporate Finance', 'Golf Performance Lab']);
    expect(card(/^STAT 201, Probability and Statistics, Tue, Thu 9:00–10:15 AM$/)).toBeTruthy();
    expect(card(/^EXSS 188, Golf Performance Lab, Fri 8:00–9:15 AM$/)).toBeTruthy();
    const stat = card(/^STAT 201/);
    expect(within(stat).getByText('Dr. L. Osei')).toBeTruthy();
    expect(within(stat).getByText('Hanes Hall 120')).toBeTruthy();
    expect(within(stat).getByText('3 cr')).toBeTruthy();
  });

  it('CH-12803 the term overview is one labelled group: the week, the credits, and the end of term; its drawing is hidden', () => {
    show();
    const tb = screen.getByRole('region', { name: 'Fall 2026, week 8 of 17, 13 credits · 5 classes, ends Dec 15' });
    expect(tb.querySelector('.ch-cl-tb__wk')!.getAttribute('aria-hidden')).toBe('true');
    expect(tb.querySelector('.ch-cl-tb__bar')!.getAttribute('aria-hidden')).toBe('true');
    expect([...tb.querySelectorAll('.ch-cl-tb__bar i')].map((i) => i.getAttribute('title'))).toEqual(['ECON 310 · 3 cr', 'ENGL 105 · 3 cr', 'STAT 201 · 3 cr', 'BUSI 401 · 3 cr', 'EXSS 188 · 1 cr']);
    // The line is today: 55 of 117 days through the term.
    expect(parseFloat((tb.querySelector('.ch-cl-tb__fill') as HTMLElement).style.width)).toBeCloseTo((55 / 117) * 100, 3);
  });

  it('CH-12802 each card’s week strip is hidden from screen readers and shows the start under each day the class meets', () => {
    show();
    const strip = card(/^STAT 201/).querySelector('.ch-cl-card__week')!;
    expect(strip.getAttribute('aria-hidden')).toBe('true');
    expect([...strip.children].map((d) => d.textContent)).toEqual(['M', 'T9:00', 'W', 'T9:00', 'F']);
    // Today is Wednesday the 14th: its box is marked, and Tuesday and Thursday are the days the class meets.
    expect([...strip.children].map((d) => d.className.trim())).toEqual(['', 'is-on', 'is-today', 'is-on', '']);
  });
});

// ---------------------------------------------------------------------------
// The page's states
// ---------------------------------------------------------------------------

/** A button in the page header, not the sheets' footers. */
const headerButton = (name: string) => within(document.querySelector('.ch-cl-h') as HTMLElement).getByRole('button', { name });

describe('Classes, states', () => {
  it('CH-12301 no classes yet: the first-run page offers the import first and the add second, and none of the rest of the page', async () => {
    const user = userEvent.setup();
    show(PREVIEW_CLASSES_EMPTY);
    await expectCode(
      'CH-12301',
      /Add your class schedule.*Import a screenshot of your schedule and we'll add every class\. Your coach can see when you're busy, so practice and travel get planned around class\./,
    );
    expect(document.querySelector('.ch-cl-h__a')).toBeNull();
    expect(document.querySelector('.ch-cl-tb')).toBeNull();
    expect(document.querySelector('.ch-cl-deck')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add a class' }));
    expect(await screen.findByRole('dialog', { name: 'Add a class' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Import schedule' }));
    expect(await screen.findByRole('dialog', { name: 'Import schedule' })).toBeTruthy();
  });

  it('120407 CH-12201 the classes do not load: it says so with a way to ask again, never "no classes", and offers no add or import', async () => {
    const user = userEvent.setup();
    show(PREVIEW_CLASSES_FAILED);
    await expectCode('CH-12201', /Your classes didn't load.*Nothing is lost\. Your classes are still saved; try again in a moment\./);
    expect(code('CH-12301')).toBeNull();
    expect(document.querySelector('.ch-cl-h__a')).toBeNull();
    expect(document.querySelector('.ch-cl-tb')).toBeNull();
    await user.click(within(code('CH-12201') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('CH-12201 a failed read is never drawn beside classes: with the error set the notice replaces the deck, and Add and Import are not offered', () => {
    show({ ...PREVIEW_CLASSES, classes: { list: PREVIEW_CLASSES.classes.list, error: true } });
    expect(code('CH-12201')).not.toBeNull();
    expect(document.querySelector('.ch-cl-deck')).toBeNull();
    expect(document.querySelector('.ch-cl-h__a')).toBeNull();
  });

  it('CH-12202 the team’s events do not load: the classes show, the overlap card says it cannot tell, and no overlap is claimed anywhere', async () => {
    const user = userEvent.setup();
    show(PREVIEW_CLASSES_PARTIAL);
    await expectCode('CH-12202', /The team's events didn't load.*Overlaps with practice and travel can't be checked right now/);
    expect(names()).toHaveLength(5);
    expect(document.querySelector('.ch-cl-tb__over')).toBeNull();
    expect(document.querySelectorAll('.ch-cl-card .ch-cl-flag')).toHaveLength(0);
    expect(screen.queryByText('Nothing overlaps this week')).toBeNull();
    await user.click(within(code('CH-12202') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The sheet doesn't claim an overlap either.
    await user.click(card(/^BUSI 401/));
    const sheet = await screen.findByRole('dialog', { name: 'Corporate Finance' });
    expect(within(sheet).queryByText(/Overlaps/)).toBeNull();
  });

  it('CH-12203 a section that crashes while drawing is contained: the classes and the rest of the page stay', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A term with no end to its weeks can't be drawn as a line: only the overview throws.
    show({ ...PREVIEW_CLASSES, term: { ...PREVIEW_CLASSES.term, weeks: Infinity } });
    await expectCode('CH-12203', /The term overview couldn.t be shown\./);
    expect(names()).toHaveLength(5);
    expect(screen.getByText('A team event overlaps your classes')).toBeTruthy();
    quiet.mockRestore();
  });

  it('this week’s overlaps: the trip meets the two Thursday classes, on the overview, the two cards and the side card', () => {
    show();
    expect(document.querySelector('.ch-cl-tb__over')!.textContent).toBe('2overlaps with the team this week');
    expect(document.querySelector('.ch-cl-tb__over')!.className).toContain('has-any');
    const flags = (name: RegExp) => [...card(name).querySelectorAll('.ch-cl-flag')].map((f) => f.textContent);
    expect(flags(/^STAT 201/)).toEqual(['Overlaps Pinehurst qualifier Thu']);
    expect(flags(/^BUSI 401/)).toEqual(['Overlaps Pinehurst qualifier Thu']);
    expect(flags(/^ECON 310/)).toEqual([]);
    const side = screen.getByRole('region', { name: 'A team event overlaps your classes' });
    expect(within(side).getByText('Pinehurst qualifier')).toBeTruthy();
    expect(within(side).getAllByText('Overlap')).toHaveLength(2);
    expect(within(side).getByText(/^Thu, Oct 15 · 6:15 AM–8:00 PM · Pinehurst No\. 2$/)).toBeTruthy();
    expect(within(side).getByText('STAT 201')).toBeTruthy();
    expect(within(side).getByText('BUSI 401')).toBeTruthy();
    // Overlaps are amber, never red: nothing here carries the danger class.
    expect(document.querySelector('.ch-cl-over .ch-cl-danger')).toBeNull();
  });

  it('CH-12302 nothing overlaps this week: the side card says so, the overview counts none, and no card is flagged', async () => {
    show(PREVIEW_CLASSES_CLEAR);
    await expectCode('CH-12302', /Nothing overlaps this week.*None of your classes meets over practice, travel or another team event\./);
    expect(document.querySelector('.ch-cl-tb__over')!.textContent).toBe('0overlaps with the team this week');
    expect(document.querySelector('.ch-cl-tb__over')!.className).not.toContain('has-any');
    expect(document.querySelectorAll('.ch-cl-card .ch-cl-flag')).toHaveLength(0);
  });

  it('CH-12303 CH-12304 an online class says it has no fixed meeting; times with no days say what is missing and that it is not on the calendar', () => {
    show(PREVIEW_CLASSES_MIXED);
    const online = card(/^CSCI 110/);
    expect(online.getAttribute('aria-label')).toBe('CSCI 110, Intro to Programming, no fixed meeting');
    expect(within(online).getByText('Online or arranged. No fixed meeting.').getAttribute('data-ch-code')).toBe('CH-12303');
    expect(online.querySelector('.ch-cl-card__week')).toBeNull();
    const noDays = card(/^ART 101/);
    expect(within(noDays).getByText('Add the days this class meets.')).toBeTruthy();
    const flag = noDays.querySelector('[data-ch-code="CH-12304"]')!;
    expect(flag.textContent).toBe('No meeting days, not on your calendar');
    expect(flag.getAttribute('title')).toMatch(/Times are set but no days/);
    expect(online.querySelector('[data-ch-code="CH-12304"]')).toBeNull();
  });

  it('120102 a class from another term is named for it and kept out of this term’s figures; one with no term counts as this term; a weekend class draws seven days', () => {
    show(PREVIEW_CLASSES_MIXED);
    expect(within(card(/^GEOG 110/)).getByText('Spring 2026')).toBeTruthy();
    expect(within(card(/^STAT 201/)).queryByText('Fall 2026')).toBeNull();
    // STAT, ECON, BUSI, CSCI, ART and the one with no term: 3 + 3 + 3 + 3 + 2 + 1 credits.
    expect(screen.getByRole('region', { name: /^Fall 2026, week 8 of 17, 15 credits · 6 classes, ends Dec 15$/ })).toBeTruthy();
    expect(card(/^MUSC 140/).querySelectorAll('.ch-cl-card__week > span')).toHaveLength(7);
    expect(card(/^STAT 201/).querySelectorAll('.ch-cl-card__week > span')).toHaveLength(5);
  });

  it('a class from another term is never counted as overlapping this week’s practice, even when its days and times would', () => {
    // Monday 3:30 to 4:30 PM meets Monday's practice, but the class is Spring 2026's.
    const spring = rowFor('c0000000-0000-4000-8000-000000000099', {
      code: 'GEOG 110',
      name: 'Global Environmental Change',
      instructor: '',
      days: ['M'],
      start: '15:30',
      end: '16:30',
      building: '',
      room: '',
      credits: 3,
      semester: 'Spring 2026',
      notes: '',
    });
    show({ ...PREVIEW_CLASSES, classes: { list: toChClasses([...PREVIEW_CLASS_ROWS, spring]), error: false } });
    expect(document.querySelector('.ch-cl-tb__over')!.textContent).toBe('2overlaps with the team this week');
    expect([...card(/^GEOG 110/).querySelectorAll('.ch-cl-flag')]).toHaveLength(0);
    expect(within(screen.getByRole('region', { name: 'A team event overlaps your classes' })).queryByText('GEOG 110')).toBeNull();
  });

  it('120103 opening a class shows when and where it meets and its next meetings; the one that overlaps the trip says so; nothing the table has no column for is drawn', async () => {
    const user = userEvent.setup();
    show();
    await user.click(card(/^STAT 201/));
    const sheet = await screen.findByRole('dialog', { name: 'Probability and Statistics' });
    expect(within(sheet).getByText('STAT 201 · 3 credits · Fall 2026')).toBeTruthy();
    const facts = Object.fromEntries([...sheet.querySelectorAll('.ch-cl-facts > div')].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent]));
    expect(facts).toEqual({ When: 'Tue, Thu · 9:00–10:15 AM', Where: 'Hanes Hall 120', Instructor: 'Dr. L. Osei', Term: 'Fall 2026' });
    const meets = [...sheet.querySelectorAll('.ch-cl-meet li')].map((li) => li.textContent);
    expect(meets).toEqual(['Thu, Oct 15Overlaps Pinehurst qualifier', 'Tue, Oct 20Upcoming', 'Thu, Oct 22Upcoming', 'Tue, Oct 27Upcoming']);
    // The board's grade, deadline and share switch have no column: they are not drawn.
    expect(within(sheet).queryByText(/grade|deadline|share/i)).toBeNull();
    expect(within(sheet).queryByRole('switch')).toBeNull();
  });

  it('every control goes somewhere: the Add tile opens the same sheet as the header, and a card only ever opens its class', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: /^Add a class/ }));
    expect(await screen.findByRole('dialog', { name: 'Add a class' })).toBeTruthy();
    expect(document.querySelectorAll('a[href]')).toHaveLength(0);
  });
});

describe('Classes, on the phone', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  /** The shell's phone top bar, where the page's PhoneTop renders. */
  function SlotHost() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} data-testid="phone-top" />;
  }

  it('draws the phone bar with the way back to More, and the same classes and actions', async () => {
    const user = userEvent.setup();
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <SlotHost />
              <ClassesView data={PREVIEW_CLASSES} writes={fakeWrites()} />
            </div>
          </PhoneChromeProvider>
        </ToastProvider>
      </LazyMotion>,
    );
    expect(document.querySelector('.ch-cl')!.className).toContain('is-phone');
    const top = screen.getByTestId('phone-top');
    expect(within(top).getByRole('heading', { level: 1, name: 'Classes' })).toBeTruthy();
    await user.click(within(top).getByRole('button', { name: 'Back to More' }));
    expect(router.back.mock.calls.length + router.push.mock.calls.length).toBeGreaterThan(0);
    expect(names()).toHaveLength(5);
    await user.click(headerButton('Add class'));
    expect(await screen.findByRole('dialog', { name: 'Add a class' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Add, edit and remove
// ---------------------------------------------------------------------------

const STAT_ID = 'c0000000-0000-4000-8000-000000000001';
const sheet = () => screen.getByRole('dialog', { name: /^(Add a class|Edit class)$/ });
const field = (label: string) => within(sheet()).getByLabelText(label) as HTMLInputElement;
const setField = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const day = (d: string) => within(sheet()).getByRole('button', { name: d });
const submitForm = (user: ReturnType<typeof userEvent.setup>) => user.click(within(sheet()).getByRole('button', { name: /^(Add class|Save changes)$/ }));
/** The Add sheet, filled in as the board's example: GEOG 110, Monday and Wednesday. */
async function fillGeog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(headerButton('Add class'));
  await screen.findByRole('dialog', { name: 'Add a class' });
  setField('Course code', 'geog 110');
  setField('Course name', 'Global Environmental Change');
  setField('Credits', '3');
  // Out of order on purpose: the class is saved with its days in the week's order.
  await user.click(day('Wed'));
  await user.click(day('Mon'));
  setField('Starts', '15:30');
  setField('Ends', '16:45');
}
const ORDER_WITH_GEOG = ['Intermediate Macroeconomics', 'Writing in the Disciplines', 'Global Environmental Change', 'Probability and Statistics', 'Corporate Finance', 'Golf Performance Lab'];
const failing = <T,>(first: T, then: (...a: never[]) => unknown) =>
  vi
    .fn()
    .mockResolvedValueOnce(first)
    .mockImplementation(then as never);

describe('Classes, add and edit', () => {
  it('120901 CH-12001 adding a class saves it once as typed, adds it in the order the week unfolds, closes the sheet, and puts it on the calendar; overlaps warn while typing and do not block', async () => {
    const user = userEvent.setup();
    const w = show();
    await fillGeog(user);
    expect(field('Course code').value).toBe('GEOG 110');
    await expectCode('CH-12109', /Overlaps the team.*Practice on Mon.*Practice on Wed.*This week\. Your coach can see your classes\./);
    await submitForm(user);
    await waitFor(() => expect(w.save).toHaveBeenCalledTimes(1));
    const [input, editing] = w.save.mock.calls[0]!;
    expect(input).toMatchObject({ code: 'GEOG 110', name: 'Global Environmental Change', days: ['M', 'W'], start: '15:30', end: '16:45', credits: 3, semester: 'Fall 2026' });
    expect(editing).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(names()).toEqual(ORDER_WITH_GEOG);
    expect(await screen.findByText('Class added')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
    await waitFor(() => expect(w.sync).toHaveBeenCalledTimes(1));
    expect(w.sync.mock.calls[0]![0]).toMatchObject({ id: 'n1', code: 'GEOG 110', days: ['M', 'W'] });
    // Practice on Monday and Wednesday now meets the new class: the card and the overview say so.
    expect([...card(/^GEOG 110/).querySelectorAll('.ch-cl-flag')].map((f) => f.textContent)).toEqual(['Overlaps 2 team events']);
    expect(document.querySelector('.ch-cl-tb__over')!.textContent).toBe('4overlaps with the team this week');
  });

  it('CH-12804 a refused save says what is wrong beside the field, marks it invalid, and moves focus to the first one; nothing is sent', async () => {
    const user = userEvent.setup();
    const w = show();
    await user.click(headerButton('Add class'));
    await submitForm(user);
    expect(w.save).not.toHaveBeenCalled();
    await expectCode('CH-12101', /^Add the course code, for example STAT 201\.$/);
    await expectCode('CH-12102', /^Add the course name\.$/);
    const codeBox = field('Course code');
    expect(codeBox.getAttribute('aria-invalid')).toBe('true');
    expect(codeBox.getAttribute('aria-describedby')).toBe(code('CH-12101')!.id);
    expect(code('CH-12101')!.getAttribute('role')).toBe('alert');
    expect(document.activeElement).toBe(codeBox);
    // Once refused, each field answers as it is fixed.
    setField('Course code', 'GEOG 110');
    await waitFor(() => expect(code('CH-12101')).toBeNull());
    expect(code('CH-12102')).not.toBeNull();
    expect(field('Course code').getAttribute('aria-invalid')).toBeNull();
  });

  it('CH-12104 CH-12105 CH-12106 the times are both or neither and end after they start, and the credits are a whole number', async () => {
    const user = userEvent.setup();
    const w = show();
    await user.click(headerButton('Add class'));
    setField('Course code', 'GEOG 110');
    setField('Course name', 'Global Environmental Change');
    setField('Starts', '10:00');
    await submitForm(user);
    await expectCode('CH-12105', /^Add both a start and an end time, or leave both empty\.$/);
    expect(document.activeElement).toBe(field('Starts'));
    setField('Ends', '09:00');
    await expectCode('CH-12104', /^Ends must be after it starts\.$/);
    expect(code('CH-12105')).toBeNull();
    setField('Ends', '11:00');
    setField('Credits', 'three');
    await expectCode('CH-12106', /^Credits is a whole number from 0 to 12\.$/);
    expect(field('Credits').getAttribute('aria-invalid')).toBe('true');
    await submitForm(user);
    expect(w.save).not.toHaveBeenCalled();
  });

  it('CH-12107 CH-12108 a class at exactly another’s days and times is refused; one that only overlaps is warned about and saves', async () => {
    const user = userEvent.setup();
    const w = show();
    await user.click(headerButton('Add class'));
    setField('Course code', 'MATH 232');
    setField('Course name', 'Linear Algebra');
    await user.click(day('Tue'));
    await user.click(day('Thu'));
    setField('Starts', '09:00');
    setField('Ends', '10:15');
    await submitForm(user);
    await expectCode('CH-12107', /STAT 201 already meets at exactly this time\. Change the days or times, or edit that class\./);
    expect(document.activeElement).toBe(within(sheet()).getByRole('group', { name: 'Days' }));
    expect(w.save).not.toHaveBeenCalled();
    expect(code('CH-12108')).toBeNull();
    setField('Ends', '10:30');
    await waitFor(() => expect(code('CH-12107')).toBeNull());
    await expectCode('CH-12108', /Overlaps another class.*STAT 201 on Tue, Thu\./);
    await submitForm(user);
    await waitFor(() => expect(w.save).toHaveBeenCalledTimes(1));
  });

  it('editing opens on the class as saved, saves only that class, and updates it in place', async () => {
    const user = userEvent.setup();
    const w = show();
    await user.click(card(/^STAT 201/));
    await user.click(within(await screen.findByRole('dialog', { name: 'Probability and Statistics' })).getByRole('button', { name: 'Edit class' }));
    const form = await screen.findByRole('dialog', { name: 'Edit class' });
    expect(within(form).getByText('Repeats weekly until Dec 15, the end of the term.')).toBeTruthy();
    expect([
      field('Course code').value,
      field('Course name').value,
      field('Credits').value,
      field('Starts').value,
      field('Ends').value,
      field('Building').value,
      field('Room').value,
      field('Instructor').value,
    ]).toEqual(['STAT 201', 'Probability and Statistics', '3', '09:00', '10:15', 'Hanes Hall', '120', 'Dr. L. Osei']);
    expect([day('Mon'), day('Tue'), day('Wed'), day('Thu'), day('Fri')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'true', 'false']);
    setField('Room', '121');
    await submitForm(user);
    await waitFor(() => expect(w.save).toHaveBeenCalledTimes(1));
    const [input, editing] = w.save.mock.calls[0]!;
    expect(input).toMatchObject({ code: 'STAT 201', room: '121', days: ['T', 'Th'] });
    expect(editing).toMatchObject({ id: STAT_ID });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(card(/^STAT 201/)).getByText('Hanes Hall 121')).toBeTruthy();
    expect(names()).toHaveLength(5);
    expect(await screen.findByText('Class updated')).toBeTruthy();
    await waitFor(() => expect(w.sync).toHaveBeenCalledTimes(1));
    expect(w.sync.mock.calls[0]![0]).toMatchObject({ id: STAT_ID, room: '121' });
  });

  it('CH-12502 a form with changes asks before it is thrown away, and keeps what was typed if the answer is to keep editing; an untouched form just closes', async () => {
    const user = userEvent.setup();
    const w = show();
    await user.click(headerButton('Add class'));
    await user.click(within(sheet()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).toBeNull();

    await user.click(headerButton('Add class'));
    setField('Course code', 'MATH 232');
    await user.click(within(sheet()).getByRole('button', { name: 'Cancel' }));
    await expectCode('CH-12502', /Discard your changes\?.*What you typed here isn't saved\./);
    expect(screen.queryByRole('dialog', { name: 'Add a class' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(await screen.findByRole('dialog', { name: 'Add a class' })).toBeTruthy();
    expect(field('Course code').value).toBe('MATH 232');
    hapticSpy.mockClear();
    await user.click(within(sheet()).getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(w.save).not.toHaveBeenCalled();
    // The next time it opens it is blank again.
    await user.click(headerButton('Add class'));
    expect(field('Course code').value).toBe('');
  });

  it('CH-12703 choosing a day is a selection tap, and days come off as they go on', async () => {
    const user = userEvent.setup();
    show();
    await user.click(headerButton('Add class'));
    hapticSpy.mockClear();
    await user.click(day('Fri'));
    expect(day('Fri').getAttribute('aria-pressed')).toBe('true');
    await user.click(day('Fri'));
    expect(day('Fri').getAttribute('aria-pressed')).toBe('false');
    expect(hapticSpy.mock.calls.map((c) => c[0])).toEqual(['select', 'select']);
  });

  it('CH-12701 opening a class is a selection tap', async () => {
    const user = userEvent.setup();
    show();
    await user.click(card(/^ECON 310/));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(await screen.findByRole('dialog', { name: 'Intermediate Macroeconomics' })).toBeTruthy();
  });
});

describe('Classes, writes that fail', () => {
  it('121201 CH-12001 a save that fails says so in the sheet, keeps what was typed, sends nothing to the calendar, and Retry saves it', async () => {
    const user = userEvent.setup();
    const base = fakeWrites();
    // A reason no one should read: the hint takes its place.
    const save = failing({ success: false, error: 'new row violates row-level security policy' }, (input: ChClassInput, editing: ChClass | null, id: string) => base.save(input, editing, id));
    const w = show(PREVIEW_CLASSES, { save });
    await fillGeog(user);
    await submitForm(user);
    await expectCode('CH-12001', /Couldn't add GEOG 110.*Nothing was changed\. Check your connection and try again\./);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    // The toast is in the open sheet, so Retry is where the person is looking.
    expect(sheet().contains(code('CH-12001'))).toBe(true);
    expect(field('Course name').value).toBe('Global Environmental Change');
    expect(names()).toHaveLength(5);
    expect(w.sync).not.toHaveBeenCalled();
    await user.click(within(code('CH-12001') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(names()).toEqual(ORDER_WITH_GEOG));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![0]).toEqual(save.mock.calls[0]![0]);
    await waitFor(() => expect(w.sync).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CH-12002 a class that saved but did not reach the calendar is kept and flagged, and Retry syncs it without saving it a second time', async () => {
    const user = userEvent.setup();
    const sync = failing({ success: false, error: 'Could not determine semester dates' }, () => Promise.resolve({ success: true }));
    const w = show(PREVIEW_CLASSES, { sync });
    await fillGeog(user);
    await submitForm(user);
    await expectCode('CH-12002', /GEOG 110 is saved, but not on your calendar.*GEOG 110: Could not determine semester dates\. Retry to try again\./);
    // The save itself worked and says so; only the calendar failed, so there is no "couldn't add" toast.
    expect(screen.getByText('Class added')).toBeTruthy();
    expect(code('CH-12001')).toBeNull();
    expect(names()).toEqual(ORDER_WITH_GEOG);
    expect(w.save).toHaveBeenCalledTimes(1);
    expect(within(card(/^GEOG 110/)).getByText('Not on your calendar')).toBeTruthy();
    expect(document.querySelector('.ch-cl-sync.is-failed')!.textContent).toContain('1 class is not on your calendar');
    await user.click(within(code('CH-12002') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(card(/^GEOG 110/)).queryByText('Not on your calendar')).toBeNull());
    expect(document.querySelector('.ch-cl-sync')).toBeNull();
    // The class was never inserted again.
    expect(w.save).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[1]![0]).toMatchObject({ id: 'n1' });
  });

  it('a failed sync is retried from the header, and from the class itself', async () => {
    const user = userEvent.setup();
    const sync = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'Could not determine semester dates' })
      .mockResolvedValueOnce({ success: false, error: 'Could not determine semester dates' })
      .mockResolvedValue({ success: true });
    show(PREVIEW_CLASSES, { sync });
    await fillGeog(user);
    await submitForm(user);
    await expectCode('CH-12002');
    await user.click(within(document.querySelector('.ch-cl-sync.is-failed') as HTMLElement).getByRole('button', { name: 'Retry sync' }));
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
    // Still failing: the class stays flagged, and its sheet has the way to try again.
    await waitFor(() => expect(document.querySelector('.ch-cl-sync.is-failed')).not.toBeNull());
    await user.click(card(/^GEOG 110/));
    const detail = await screen.findByRole('dialog', { name: 'Global Environmental Change' });
    expect(within(detail).getByText('Not on your calendar')).toBeTruthy();
    expect(within(detail).getByText(/The last sync failed, so your coach won't see this class on the team calendar yet\./)).toBeTruthy();
    await user.click(within(detail).getByRole('button', { name: 'Retry sync' }));
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(within(detail).queryByText('Not on your calendar')).toBeNull());
    expect(document.querySelector('.ch-cl-sync')).toBeNull();
  });

  it('CH-12403 while a class goes on the calendar the header says so, and says nothing once it has', async () => {
    const user = userEvent.setup();
    let finish: (v: { success: boolean }) => void = () => {};
    const sync = vi.fn(() => new Promise<{ success: boolean }>((r) => (finish = r)));
    show(PREVIEW_CLASSES, { sync });
    await fillGeog(user);
    await submitForm(user);
    await expectCode('CH-12403', /Adding to your calendar…/);
    expect(code('CH-12403')!.getAttribute('role')).toBe('status');
    await act(async () => finish({ success: true }));
    await waitFor(() => expect(code('CH-12403')).toBeNull());
  });

  it('CH-12002 a class saved while an import is still going on the calendar is flagged, not dropped, and the header Retry puts it there', async () => {
    const user = userEvent.setup();
    const held = later<{ success: boolean }>();
    // The imported classes' sync stays running; anything else syncs at once.
    const sync = vi.fn((c: ChClass) => (c.id.startsWith('i') ? held.promise : Promise.resolve({ success: true })));
    const w = show(PREVIEW_CLASSES, { sync, read: vi.fn(async () => ({ ok: true as const, rows: PREVIEW_PARSED.slice(0, 4).map(toImportRow), warnings: [] })) });
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Import 4 classes' }));
    await screen.findByRole('dialog', { name: 'Schedule imported' });
    await user.click(inSheet().getByRole('button', { name: 'View classes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expectCode('CH-12403');
    // Edit STAT 201 while that import is still being put on the calendar.
    await user.click(card(/^STAT 201/));
    await user.click(within(await screen.findByRole('dialog', { name: 'Probability and Statistics' })).getByRole('button', { name: 'Edit class' }));
    await screen.findByRole('dialog', { name: 'Edit class' });
    setField('Room', '121');
    await submitForm(user);
    expect(await screen.findByText('Class updated')).toBeTruthy();
    expect(w.sync.mock.calls.map((c) => c[0].id)).not.toContain(STAT_ID);
    await waitFor(() => expect(within(card(/^STAT 201/)).getByText('Not on your calendar')).toBeTruthy());
    await act(async () => held.resolve({ success: true }));
    await waitFor(() => expect(document.querySelector('.ch-cl-sync.is-failed')).not.toBeNull());
    expect(document.querySelector('.ch-cl-sync.is-failed')!.textContent).toContain('1 class is not on your calendar');
    await user.click(within(document.querySelector('.ch-cl-sync.is-failed') as HTMLElement).getByRole('button', { name: 'Retry sync' }));
    await waitFor(() => expect(w.sync.mock.calls.map((c) => c[0].id)).toContain(STAT_ID));
    await waitFor(() => expect(document.querySelector('.ch-cl-sync')).toBeNull());
    expect(within(card(/^STAT 201/)).queryByText('Not on your calendar')).toBeNull();
  });

  it('CH-12501 CH-12702 removing a class warns first, then asks what goes; Keep it sends nothing, and a yes removes it from the schedule', async () => {
    const user = userEvent.setup();
    const w = show();
    await user.click(card(/^STAT 201/));
    hapticSpy.mockClear();
    await user.click(within(await screen.findByRole('dialog', { name: 'Probability and Statistics' })).getByRole('button', { name: 'Remove class' }));
    expect(hapticSpy.mock.calls.map((c) => c[0])[0]).toBe('warning');
    await expectCode('CH-12501', /Remove this class\?.*STAT 201 comes off your schedule and your calendar\. This can't be undone\./);
    expect(screen.queryByRole('dialog', { name: 'Probability and Statistics' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(w.remove).not.toHaveBeenCalled();
    expect(names()).toContain('Probability and Statistics');
    await user.click(card(/^STAT 201/));
    await user.click(within(await screen.findByRole('dialog', { name: 'Probability and Statistics' })).getByRole('button', { name: 'Remove class' }));
    await user.click(await screen.findByRole('button', { name: 'Remove class' }));
    await waitFor(() => expect(w.remove).toHaveBeenCalledWith(STAT_ID));
    await waitFor(() => expect(names()).not.toContain('Probability and Statistics'));
    expect(await screen.findByText('STAT 201 removed')).toBeTruthy();
    expect(hapticSpy).toHaveBeenLastCalledWith('success');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.ch-cl-tb__over')!.textContent).toBe('1overlap with the team this week');
  });

  it('CH-12003 a remove that fails keeps the class and the question, says so, and Retry removes it', async () => {
    const user = userEvent.setup();
    const remove = failing({ success: false, error: "Couldn't take this class off your calendar: events locked. The class was kept so you can try again." }, () => Promise.resolve({ success: true }));
    show(PREVIEW_CLASSES, { remove });
    await user.click(card(/^STAT 201/));
    await user.click(within(await screen.findByRole('dialog', { name: 'Probability and Statistics' })).getByRole('button', { name: 'Remove class' }));
    await user.click(await screen.findByRole('button', { name: 'Remove class' }));
    await expectCode('CH-12003', /Couldn't remove STAT 201.*The class was kept so you can try again\./);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(names()).toContain('Probability and Statistics');
    expect(screen.getByRole('dialog', { name: 'Remove this class?' })).toBeTruthy();
    await user.click(within(code('CH-12003') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(names()).not.toContain('Probability and Statistics'));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CH-12003 a remove that took the class off the calendar but could not delete it says so and flags it', async () => {
    const user = userEvent.setup();
    const remove = vi.fn(() => Promise.resolve({ success: false, error: 'It is off your calendar but still on your schedule. Try again to finish removing it.', data: { offCalendar: true } }));
    show(PREVIEW_CLASSES, { remove });
    await user.click(card(/^STAT 201/));
    await user.click(within(await screen.findByRole('dialog', { name: 'Probability and Statistics' })).getByRole('button', { name: 'Remove class' }));
    await user.click(await screen.findByRole('button', { name: 'Remove class' }));
    await expectCode('CH-12003', /off your calendar but still on your schedule/);
    expect(code('CH-12003')!.textContent).not.toMatch(/still on your schedule and your calendar/);
    expect(within(card(/^STAT 201/)).getByText('Not on your calendar')).toBeTruthy();
  });

  it('removing the last class returns to the first-run page', async () => {
    const user = userEvent.setup();
    show(page1());
    await user.click(card(/^STAT 201/));
    await user.click(within(await screen.findByRole('dialog', { name: 'Probability and Statistics' })).getByRole('button', { name: 'Remove class' }));
    await user.click(await screen.findByRole('button', { name: 'Remove class' }));
    await expectCode('CH-12301');
    expect(document.querySelector('.ch-cl-h__a')).toBeNull();
  });
});

/** A page with STAT 201 alone. */
const page1 = (): ChClassesPage => ({ ...PREVIEW_CLASSES, classes: { list: PREVIEW_CLASSES.classes.list.filter((c) => c.code === 'STAT 201'), error: false } });

// ---------------------------------------------------------------------------
// Import a schedule
// ---------------------------------------------------------------------------

const later = <T,>() => {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const importSheet = () => screen.getByRole('dialog', { name: /^(Import schedule|Review your schedule|Schedule imported|Nothing new to import)$/ });
const inSheet = () => within(importSheet());
const fileInput = () => screen.getByLabelText('Choose a schedule file') as HTMLInputElement;
const chooseFile = (name: string, type: string, size = 1000) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(fileInput(), { target: { files: [file] } });
  return file;
};
async function openImport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(headerButton('Import schedule'));
  await screen.findByRole('dialog', { name: 'Import schedule' });
}
/** Pasted text, read by the page's own reader (a fake one in these tests). */
async function pasteAndRead(user: ReturnType<typeof userEvent.setup>, text = PREVIEW_SCHEDULE_TEXT) {
  await user.click(inSheet().getByRole('radio', { name: 'Paste text' }));
  fireEvent.change(inSheet().getByLabelText('Paste your schedule'), { target: { value: text } });
  await user.click(inSheet().getByRole('button', { name: 'Read schedule' }));
}
const reviewSummary = () => Object.fromEntries([...importSheet().querySelectorAll('.ch-cl-rv__sum > div')].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent]));

describe('Classes, import', () => {
  it('CH-12110 CH-12402 CH-12705 pasted text: nothing to read is refused; then it says it is reading, and the rows come back for review', async () => {
    const user = userEvent.setup();
    const answer = later<Awaited<ReturnType<ChClassesWrites['read']>>>();
    const w = show(PREVIEW_CLASSES, { read: vi.fn(() => answer.promise) });
    await openImport(user);
    expect(inSheet().getByText('Screenshot, upload or paste your class schedule')).toBeTruthy();
    hapticSpy.mockClear();
    await user.click(inSheet().getByRole('radio', { name: 'Paste text' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    await user.click(inSheet().getByRole('button', { name: 'Read schedule' }));
    await expectCode('CH-12110', /^Paste your schedule text first\.$/);
    expect(inSheet().getByLabelText('Paste your schedule').getAttribute('aria-invalid')).toBe('true');
    expect(w.read).not.toHaveBeenCalled();
    fireEvent.change(inSheet().getByLabelText('Paste your schedule'), { target: { value: PREVIEW_SCHEDULE_TEXT } });
    expect(code('CH-12110')).toBeNull();
    await user.click(inSheet().getByRole('button', { name: 'Read schedule' }));
    await expectCode('CH-12402', /Reading your schedule….*Finding course codes, days, times and rooms/);
    expect(code('CH-12402')!.getAttribute('role')).toBe('status');
    expect(w.read).toHaveBeenCalledWith({ kind: 'text', text: PREVIEW_SCHEDULE_TEXT });
    await act(async () => answer.resolve({ ok: true, rows: PREVIEW_PARSED.map(toImportRow), warnings: ['One class had no room.'] }));
    expect(await screen.findByRole('dialog', { name: 'Review your schedule' })).toBeTruthy();
    expect(reviewSummary()).toEqual({ Classes: '5', Credits: '15', 'Days a week': '5', 'Need a look': '1' });
    expect(within(importSheet().querySelector('.ch-cl-clash') as HTMLElement).getByText('Worth a look')).toBeTruthy();
    const rows = [...importSheet().querySelectorAll('.ch-cl-rv__r')];
    expect(rows.map((r) => r.querySelector('.ch-cl-rv__b > b')!.textContent)).toEqual(['Global Environmental Change', 'Linear Algebra', 'Drawing', 'Ethics', 'Probability and Statistics']);
    expect(rows[0]!.querySelector('.ch-cl-rv__b > span')!.textContent).toBe('Mon, Wed · 3:30–4:45 PM · Carroll Hall 111');
    expect(rows[3]!.querySelector('.ch-cl-rv__b > span')!.textContent).toBe('No days · No time');
    expect(rows[3]!.textContent).toContain('No days or time found. Add it from the class after importing.');
    expect(rows[3]!.className).toContain('is-check');
    // Nothing is saved until the person says so.
    expect(w.importRows).not.toHaveBeenCalled();
  });

  it('the review: a class can come off it and the button counts what is left; with none left there is nothing to import; Start over goes back', async () => {
    const user = userEvent.setup();
    show();
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    expect(inSheet().getByRole('button', { name: 'Import 5 classes' })).toBeTruthy();
    await user.click(inSheet().getByRole('button', { name: 'Remove STAT 201' }));
    expect(inSheet().getByRole('button', { name: 'Import 4 classes' })).toBeTruthy();
    for (const c of ['GEOG 110', 'MATH 232', 'ART 101']) await user.click(inSheet().getByRole('button', { name: `Remove ${c}` }));
    expect(inSheet().getByRole('button', { name: 'Import 1 class' })).toBeTruthy();
    await user.click(inSheet().getByRole('button', { name: 'Remove PHIL 150' }));
    expect(inSheet().getByText('Every class was removed')).toBeTruthy();
    expect((inSheet().getByRole('button', { name: 'Import 0 classes' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(inSheet().getByRole('button', { name: 'Start over' }));
    expect(await screen.findByRole('dialog', { name: 'Import schedule' })).toBeTruthy();
  });

  it('CH-12109 an import saves the reviewed rows, puts each on the calendar from next Monday, and says how many, until when, and what overlaps the team', async () => {
    const user = userEvent.setup();
    const w = show();
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Remove STAT 201' }));
    await user.click(inSheet().getByRole('button', { name: 'Import 4 classes' }));
    expect(await screen.findByRole('dialog', { name: 'Schedule imported' })).toBeTruthy();
    expect(w.importRows).toHaveBeenCalledTimes(1);
    expect(w.importRows.mock.calls[0]![0].map((r: ChImportRow) => r.code)).toEqual(['GEOG 110', 'MATH 232', 'ART 101', 'PHIL 150']);
    await waitFor(() => expect(w.sync).toHaveBeenCalledTimes(4));
    // The current importer's start: the Monday after today (Wednesday the 14th), so a schedule read mid-term doesn't add meetings already held.
    for (const call of w.sync.mock.calls) expect(call[1]).toEqual({ semesterStartDate: '2026-10-19' });
    expect(w.sync.mock.calls.map((c) => c[0].code).sort()).toEqual(['ART 101', 'GEOG 110', 'MATH 232', 'PHIL 150']);
    expect(inSheet().getByText('4 classes imported')).toBeTruthy();
    // PHIL 150 has no days: it is saved, and the result says it isn't on the calendar and why, rather than "they're on your calendar".
    expect(inSheet().getByText("3 of 4 are on your calendar and repeat weekly until Dec 15. Not on your calendar: PHIL 150 (no meeting days). Open the class to add what's missing.")).toBeTruthy();
    expect([...importSheet().querySelectorAll('.ch-cl-ok__chips span')].map((s) => s.textContent)).toEqual(['GEOG 110', 'MATH 232', 'ART 101', 'PHIL 150']);
    await expectCode('CH-12109', /3 overlaps with the team this week\.GEOG 110 meets over Practice; GEOG 110 meets over Practice/);
    expect(hapticSpy).toHaveBeenCalledWith('success');
    await user.click(inSheet().getByRole('button', { name: 'View classes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(names()).toHaveLength(9);
    // The sheet opens at the beginning next time.
    await openImport(user);
    expect(inSheet().getByRole('radio', { name: 'Screenshot or file' })).toBeTruthy();
  });

  it('CH-12004 an import that does not save says so, keeps the review, and Retry imports it', async () => {
    const user = userEvent.setup();
    const base = fakeWrites();
    const importRows = failing({ success: false, error: 'new row violates row-level security policy' }, (rows: ChImportRow[]) => base.importRows(rows));
    const w = show(PREVIEW_CLASSES, { importRows });
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Import 5 classes' }));
    await expectCode('CH-12004', /Couldn't import your schedule.*Nothing was saved\. Check your connection and try again\./);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(screen.getByRole('dialog', { name: 'Review your schedule' })).toBeTruthy();
    expect(names()).toHaveLength(5);
    expect(w.sync).not.toHaveBeenCalled();
    await user.click(within(code('CH-12004') as HTMLElement).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('dialog', { name: 'Schedule imported' })).toBeTruthy();
    expect(importRows).toHaveBeenCalledTimes(2);
  });

  it('CH-12307 a schedule that is already all there imports nothing, syncs nothing, and says why', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_CLASSES, { importRows: vi.fn(async () => ({ success: true as const, data: { rows: [], skipped: ['STAT 201 - Probability and Statistics'] } })) });
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Import 5 classes' }));
    expect(await screen.findByRole('dialog', { name: 'Nothing new to import' })).toBeTruthy();
    await expectCode('CH-12307', /Already on your schedule.*That class is already on your schedule, so nothing was imported\. Remove the existing entry first to import again\./);
    expect(w.sync).not.toHaveBeenCalled();
    expect(names()).toHaveLength(5);
    // The import itself succeeded once; a sync of nothing doesn't succeed a second time.
    expect(hapticSpy.mock.calls.filter(([feel]) => feel === 'success')).toHaveLength(1);
  });

  it('CH-12307 an import retried after its answer was lost shows and syncs the classes the first attempt saved; a class the page already had stays skipped', async () => {
    const user = userEvent.setup();
    const geog = { code: 'GEOG 110', name: 'Global Environmental Change', instructor: '', days: ['M', 'W'], start: '15:30', end: '16:45', building: 'Carroll Hall', room: '111', credits: 3, semester: 'Fall 2026', notes: '' } as unknown as ChClassInput;
    const lost = rowFor('lost-1', geog);
    const had = PREVIEW_CLASSES.classes.list[0]!;
    const importRows = vi.fn(async () => ({
      success: true as const,
      data: { rows: [], skipped: [lost.class_name, classNameOf(had.code, had.name)], known: [lost, rowFor(had.id, { ...geog, code: had.code, name: had.name } as ChClassInput)] },
    }));
    const w = show(PREVIEW_CLASSES, { importRows });
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Import 5 classes' }));
    await waitFor(() => expect(names()).toContain('Global Environmental Change'));
    await waitFor(() => expect(w.sync).toHaveBeenCalledTimes(1));
    expect((w.sync.mock.calls[0] as unknown as [{ id: string }])[0].id).toBe('lost-1');
    expect(names().filter((n) => n === had.name)).toHaveLength(1);
  });

  it('CH-12002 an import whose calendar sync partly fails keeps every class, names the one that did not sync, and Retry syncs again', async () => {
    const user = userEvent.setup();
    let broken = true;
    const sync = vi.fn(async (c: { code: string }) => (broken && c.code === 'MATH 232' ? { success: false, error: 'Could not determine semester dates' } : { success: true }));
    show(PREVIEW_CLASSES, { sync });
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Remove STAT 201' }));
    await user.click(inSheet().getByRole('button', { name: 'Import 4 classes' }));
    await expectCode('CH-12002', /1 of 4 classes are saved, but not on your calendar.*MATH 232: Could not determine semester dates\. Retry to try again\./);
    expect(
      await inSheet().findByText("Some didn't reach your calendar. Use Retry sync on the Classes page. Not on your calendar: PHIL 150 (no meeting days). Open the class to add what's missing."),
    ).toBeTruthy();
    expect(document.querySelector('.ch-cl-sync.is-failed')!.textContent).toContain('1 class is not on your calendar');
    broken = false;
    await user.click(within(code('CH-12002') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(document.querySelector('.ch-cl-sync')).toBeNull());
    expect(
      await inSheet().findByText("3 of 4 are on your calendar and repeat weekly until Dec 15. Not on your calendar: PHIL 150 (no meeting days). Open the class to add what's missing."),
    ).toBeTruthy();
  });

  it('CH-12111 CH-12112 a file is refused before anything is sent: too large, or a kind the reader cannot take', async () => {
    const user = userEvent.setup();
    const w = show();
    await openImport(user);
    chooseFile('big.png', 'image/png', 13 * 1024 * 1024);
    await expectCode('CH-12111', /That file is too large.*Use a file under 12 MB\. A screenshot of the schedule page is usually under 2 MB\./);
    expect(code('CH-12111')!.getAttribute('role')).toBe('alert');
    expect(hapticSpy).toHaveBeenCalledWith('error');
    await user.click(inSheet().getByRole('button', { name: 'Choose another file' }));
    chooseFile('schedule.docx', 'application/msword');
    await expectCode('CH-12112', /We can't read that file type.*Use a PNG, JPG or WebP screenshot, a PDF or a TXT file, or paste the text\./);
    expect(w.read).not.toHaveBeenCalled();
    await user.click(inSheet().getByRole('button', { name: 'Paste text instead' }));
    expect(inSheet().getByLabelText('Paste your schedule')).toBeTruthy();
  });

  it('CH-12113 CH-12114 what the reader answers picks the view: not a schedule, or no classes in it', async () => {
    const user = userEvent.setup();
    const read = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, kind: 'notSchedule', message: "This doesn't look like a class schedule (it reads as: receipt)." })
      .mockResolvedValueOnce({ ok: false, kind: 'none', message: "We read it but couldn't find course codes or times." });
    show(PREVIEW_CLASSES, { read });
    await openImport(user);
    chooseFile('receipt.png', 'image/png');
    await expectCode('CH-12113', /This doesn't look like a class schedule.*it reads as: receipt/);
    expect(read).toHaveBeenCalledWith({ kind: 'file', file: expect.objectContaining({ name: 'receipt.png' }) });
    await user.click(inSheet().getByRole('button', { name: 'Choose another file' }));
    chooseFile('blank.png', 'image/png');
    await expectCode('CH-12114', /No classes found.*We read it but couldn't find course codes or times\./);
    await user.click(inSheet().getByRole('button', { name: 'Paste text' }));
    expect(inSheet().getByLabelText('Paste your schedule')).toBeTruthy();
  });

  it('CH-12204 a reader that fails says so and offers the paste', async () => {
    const user = userEvent.setup();
    show(PREVIEW_CLASSES, { read: vi.fn().mockRejectedValue(new Error('boom')) });
    await openImport(user);
    chooseFile('schedule.png', 'image/png');
    await expectCode('CH-12204', /Reading the schedule didn't finish.*Your schedule can still be added with Paste text\./);
    await user.click(inSheet().getByRole('button', { name: 'Paste text instead' }));
    expect(inSheet().getByLabelText('Paste your schedule')).toBeTruthy();
  });

  it('CH-12805 the drop zone is a real button that opens the file picker, and a dropped file is read', async () => {
    const user = userEvent.setup();
    const w = show();
    await openImport(user);
    const zone = inSheet().getByRole('button', { name: /Drop your schedule here/ });
    const open = vi.spyOn(fileInput(), 'click').mockImplementation(() => {});
    await user.click(zone);
    expect(open).toHaveBeenCalledTimes(1);
    const file = new File(['x'], 'week.png', { type: 'image/png' });
    fireEvent.dragOver(zone);
    expect(zone.className).toContain('is-over');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(w.read).toHaveBeenCalledWith({ kind: 'file', file }));
    expect(await screen.findByRole('dialog', { name: 'Review your schedule' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Network and slow
// ---------------------------------------------------------------------------

describe('Classes, offline and slow', () => {
  let line: ReturnType<typeof vi.spyOn> | null = null;
  const goOffline = () => (line = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false));
  afterEach(() => {
    line?.mockRestore();
    line = null;
    vi.useRealTimers();
  });

  it('CH-1903 a write while offline is refused with what was being done, sends nothing, and Retry works once back online', async () => {
    const user = userEvent.setup();
    const w = show();
    await user.click(card(/^STAT 201/));
    await user.click(within(await screen.findByRole('dialog', { name: 'Probability and Statistics' })).getByRole('button', { name: 'Edit class' }));
    await screen.findByRole('dialog', { name: 'Edit class' });
    setField('Room', '121');
    goOffline();
    await submitForm(user);
    await expectCode('CH-1903', /Couldn't update STAT 201: you're offline/);
    expect(w.save).not.toHaveBeenCalled();
    expect(within(sheet()).getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(field('Room').value).toBe('121');
    line!.mockReturnValue(true);
    await user.click(within(code('CH-1903') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(w.save).toHaveBeenCalledTimes(1));
  });

  it('CH-1903 removing while offline is refused too, and the class stays', async () => {
    const user = userEvent.setup();
    const w = show();
    await user.click(card(/^STAT 201/));
    await user.click(within(await screen.findByRole('dialog', { name: 'Probability and Statistics' })).getByRole('button', { name: 'Remove class' }));
    goOffline();
    await user.click(await screen.findByRole('button', { name: 'Remove class' }));
    await expectCode('CH-1903', /Couldn't remove STAT 201: you're offline/);
    expect(w.remove).not.toHaveBeenCalled();
    expect(names()).toContain('Probability and Statistics');
  });

  it('CH-12002 a class saved just as the connection went is still marked as not on the calendar', async () => {
    const user = userEvent.setup();
    const base = fakeWrites();
    const w = show(PREVIEW_CLASSES, {
      save: vi.fn(async (...a: Parameters<ChClassesWrites['save']>) => {
        const r = await base.save(...a);
        // The class is stored; the network drops before the calendar is told.
        goOffline();
        return r;
      }),
    });
    await fillGeog(user);
    await submitForm(user);
    await expectCode('CH-1903', /GEOG 110 is saved, but not on your calendar: you're offline/);
    await waitFor(() => expect(within(card(/^GEOG 110/)).getByText('Not on your calendar')).toBeTruthy());
    expect(w.sync).not.toHaveBeenCalled();
    expect(document.querySelector('.ch-cl-sync.is-failed')!.textContent).toContain('1 class is not on your calendar');
  });

  it('CH-1902 a save that is slow says so once, and the button says it is working', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const answer = later<{ success: boolean }>();
    const w = show(PREVIEW_CLASSES, { save: vi.fn(() => answer.promise as never) });
    fireEvent.click(card(/^STAT 201/));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Probability and Statistics' })).getByRole('button', { name: 'Edit class' }));
    await screen.findByRole('dialog', { name: 'Edit class' });
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Save changes' }));
    expect(w.save).toHaveBeenCalledTimes(1);
    expect((within(sheet()).getByRole('button', { name: 'Saving' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => void vi.advanceTimersByTime(CH_SLOW_SAVE_AFTER + 10));
    await expectCode('CH-1902', /Still saving/);
    // A second tap while it runs sends nothing more.
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Saving' }));
    expect(w.save).toHaveBeenCalledTimes(1);
    await act(async () => answer.resolve({ success: false }));
  });

  it('CH-12901 a screenshot needs a connection: offline it says so and Try again reads it once back; pasted text and a TXT file do not need one', async () => {
    const user = userEvent.setup();
    const w = show();
    await openImport(user);
    goOffline();
    const file = chooseFile('week.png', 'image/png');
    await expectCode('CH-12901', /You're offline.*Reading a screenshot needs a connection\. Reconnect and try again, or paste the text, which works offline\./);
    expect(w.read).not.toHaveBeenCalled();
    line!.mockReturnValue(true);
    await user.click(inSheet().getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(w.read).toHaveBeenCalledWith({ kind: 'file', file }));
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Start over' }));
    await screen.findByRole('dialog', { name: 'Import schedule' });
    line!.mockReturnValue(false);
    w.read.mockClear();
    chooseFile('week.txt', 'text/plain');
    await waitFor(() => expect(w.read).toHaveBeenCalledTimes(1));
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Start over' }));
    await pasteAndRead(user);
    await waitFor(() => expect(w.read).toHaveBeenCalledTimes(2));
  });

  it('CH-12902 a read that is slow says so once; closing the sheet while it runs drops the answer, and the sheet opens at the beginning', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const answer = later<Awaited<ReturnType<ChClassesWrites['read']>>>();
    const w = show(PREVIEW_CLASSES, { read: vi.fn(() => answer.promise) });
    fireEvent.click(headerButton('Import schedule'));
    await screen.findByRole('dialog', { name: 'Import schedule' });
    fireEvent.click(inSheet().getByRole('radio', { name: 'Paste text' }));
    fireEvent.change(inSheet().getByLabelText('Paste your schedule'), { target: { value: PREVIEW_SCHEDULE_TEXT } });
    fireEvent.click(inSheet().getByRole('button', { name: 'Read schedule' }));
    await expectCode('CH-12402');
    expect(code('CH-12902')).toBeNull();
    await act(async () => void vi.advanceTimersByTime(CH_SLOW_SAVE_AFTER + 10));
    await expectCode('CH-12902', /This is taking longer than usual\. Keep this open\./);
    fireEvent.click(within(importSheet()).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // An answer that comes in after the sheet was closed is dropped: it draws nothing and buzzes nothing.
    hapticSpy.mockClear();
    await act(async () => answer.resolve({ ok: false, kind: 'fault', message: 'late' }));
    expect(hapticSpy).not.toHaveBeenCalledWith('error');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(headerButton('Import schedule'));
    expect(await screen.findByRole('dialog', { name: 'Import schedule' })).toBeTruthy();
    expect(inSheet().getByRole('radio', { name: 'Screenshot or file' })).toBeTruthy();
    expect(w.read).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Review fixes
// ---------------------------------------------------------------------------

/** A class row for HIST 210 (Tuesday, no time) unless said otherwise. */
const rowIn = (n: number, over: Partial<ChClassInput> = {}): ChClassRow =>
  rowFor(`c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, {
    code: 'HIST 210',
    name: 'World History',
    instructor: '',
    days: ['T'],
    start: '',
    end: '',
    building: '',
    room: '',
    credits: 3,
    semester: 'Fall 2026',
    notes: '',
    ...over,
  });
/** The board's page with more classes among them. */
const pageWith = (...extra: ChClassRow[]): ChClassesPage => ({ ...PREVIEW_CLASSES, classes: { list: toChClasses([...PREVIEW_CLASS_ROWS, ...extra]), error: false } });
const factsOf = (root: HTMLElement) => Object.fromEntries([...root.querySelectorAll('.ch-cl-facts > div')].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent]));

describe('Classes, calendar sync in the background', () => {
  it('121501 CH-12403 CH-12002 a saved class goes on the calendar in the background: the sheet is free meanwhile, and a class saved then is flagged with no toast, and Retry sync puts it there', async () => {
    const user = userEvent.setup();
    const held = later<{ success: boolean }>();
    const w = show(PREVIEW_CLASSES, { sync: vi.fn((c: ChClass) => (c.code === 'GEOG 110' ? held.promise : Promise.resolve({ success: true }))) });
    await fillGeog(user);
    await submitForm(user);
    expect(await screen.findByText('Class added')).toBeTruthy();
    await expectCode('CH-12403', /Adding to your calendar…/);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Add class again while the first is still going on the calendar: it works, and Cancel closes it.
    await user.click(headerButton('Add class'));
    await screen.findByRole('dialog', { name: 'Add a class' });
    expect((within(sheet()).getByRole('button', { name: 'Add class' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(within(sheet()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(headerButton('Add class'));
    await screen.findByRole('dialog', { name: 'Add a class' });
    setField('Course code', 'MATH 232');
    setField('Course name', 'Linear Algebra');
    await submitForm(user);
    await waitFor(() => expect(w.save).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Another sync was running, so MATH 232 was not sent to the calendar: flagged, and no error toast (the flag and the header's Retry sync are the way back).
    await waitFor(() => expect(within(card(/^MATH 232/)).getByText('Not on your calendar')).toBeTruthy());
    expect(code('CH-12002')).toBeNull();
    expect(w.sync).toHaveBeenCalledTimes(1);
    await act(async () => held.resolve({ success: true }));
    await waitFor(() => expect(document.querySelector('.ch-cl-sync.is-failed')).not.toBeNull());
    await user.click(within(document.querySelector('.ch-cl-sync.is-failed') as HTMLElement).getByRole('button', { name: 'Retry sync' }));
    await waitFor(() => expect(w.sync.mock.calls.map((c) => c[0].code)).toContain('MATH 232'));
    await waitFor(() => expect(document.querySelector('.ch-cl-sync')).toBeNull());
  });

  it('CH-12403 an import goes on the calendar in the background: the result shows at once, and a second import can be sent while the calendar is still being told', async () => {
    const user = userEvent.setup();
    const held = later<{ success: boolean }>();
    show(PREVIEW_CLASSES, { sync: vi.fn(() => held.promise), read: vi.fn(async () => ({ ok: true as const, rows: PREVIEW_PARSED.slice(0, 4).map(toImportRow), warnings: [] })) });
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Import 4 classes' }));
    expect(await screen.findByRole('dialog', { name: 'Schedule imported' })).toBeTruthy();
    expect(inSheet().getByText('Adding them to your calendar…')).toBeTruthy();
    await user.click(inSheet().getByRole('button', { name: 'View classes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    expect((inSheet().getByRole('button', { name: 'Import 4 classes' }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => held.resolve({ success: true }));
  });

  it('CH-12002 an import puts each class on the calendar from its own start: next Monday inside this term, the whole term for next term’s class; a Retry starts each where it did', async () => {
    const user = userEvent.setup();
    let broken = true;
    const sync = vi.fn(async () => (broken ? { success: false, error: 'Could not determine semester dates' } : { success: true }));
    const read = vi.fn(async () => ({ ok: true as const, rows: [toImportRow(PREVIEW_PARSED[0]!), { ...toImportRow(PREVIEW_PARSED[1]!), semester: 'Spring 2027' }], warnings: [] }));
    const w = show(PREVIEW_CLASSES, { sync, read });
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Import 2 classes' }));
    await expectCode('CH-12002');
    const starts = () => Object.fromEntries(w.sync.mock.calls.map((c) => [c[0].code, c[1]]));
    expect(starts()).toEqual({ 'GEOG 110': { semesterStartDate: '2026-10-19' }, 'MATH 232': undefined });
    broken = false;
    w.sync.mockClear();
    await user.click(within(document.querySelector('.ch-cl-sync.is-failed') as HTMLElement).getByRole('button', { name: 'Retry sync' }));
    await waitFor(() => expect(w.sync).toHaveBeenCalledTimes(2));
    expect(starts()).toEqual({ 'GEOG 110': { semesterStartDate: '2026-10-19' }, 'MATH 232': undefined });
    // Each class repeats until the end of its own term, not one date for both.
    expect(await inSheet().findByText("They're on your calendar and repeat weekly until the end of their terms, Dec 15 and May 15.")).toBeTruthy();
  });

  it('CH-12002 a schedule read in early summer for the fall goes on the calendar for the whole fall, never from a summer start', async () => {
    const user = userEvent.setup();
    const w = show({ todayIso: '2026-07-08', term: termOn('2026-07-08')!, classes: { list: [], error: false }, week: { dates: weekDates('2026-07-08'), events: [], error: false } });
    await user.click(screen.getByRole('button', { name: 'Import schedule' }));
    await screen.findByRole('dialog', { name: 'Import schedule' });
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Import 5 classes' }));
    await waitFor(() => expect(w.sync).toHaveBeenCalledTimes(5));
    for (const call of w.sync.mock.calls) expect(call[1]).toBeUndefined();
    expect(await inSheet().findByText(/^4 of 5 are on your calendar and repeat weekly until Dec 15\./)).toBeTruthy();
  });

  it('a class saved is synced from its whole term, so a re-sync never removes the meetings already held; the header’s Retry does the same', async () => {
    const user = userEvent.setup();
    const sync = vi.fn().mockResolvedValueOnce({ success: false, error: 'Could not determine semester dates' }).mockResolvedValue({ success: true });
    const w = show(PREVIEW_CLASSES, { sync });
    await fillGeog(user);
    await submitForm(user);
    await expectCode('CH-12002');
    await user.click(within(document.querySelector('.ch-cl-sync.is-failed') as HTMLElement).getByRole('button', { name: 'Retry sync' }));
    await waitFor(() => expect(w.sync).toHaveBeenCalledTimes(2));
    for (const call of w.sync.mock.calls) expect(call[1]).toBeUndefined();
  });
});

describe('Classes, review fixes on screen', () => {
  it('CH-12303 CH-12304 a class with days and no time says so on its card and in its sheet, and is not on the calendar for want of a time', async () => {
    const user = userEvent.setup();
    show(pageWith(rowIn(95)));
    const c = card(/^HIST 210/);
    expect(c.getAttribute('aria-label')).toBe('HIST 210, World History, Tue, no time set');
    expect(within(c).getByText('Add the time this class meets.')).toBeTruthy();
    expect(within(c).getByText('No meeting time, not on your calendar')).toBeTruthy();
    // It is not "online or arranged" (CH-12303), and it has days (CH-12304).
    expect(c.querySelector('[data-ch-code="CH-12303"], [data-ch-code="CH-12304"]')).toBeNull();
    await user.click(c);
    const detail = await screen.findByRole('dialog', { name: 'World History' });
    expect(factsOf(detail)).toMatchObject({ When: 'Tue · No time set', Calendar: 'Not on your calendar: no time set' });
    expect(detail.querySelector('.ch-cl-meet')).toBeNull();
  });

  it('CH-12303 CH-12304 a class with days and a start but no end reads the same way: no time set, not on the calendar, no week strip and no meetings listed', async () => {
    const user = userEvent.setup();
    show(pageWith(rowIn(93, { start: '09:00' })));
    const c = card(/^HIST 210/);
    expect(c.getAttribute('aria-label')).toBe('HIST 210, World History, Tue, no time set');
    expect(c.querySelector('.ch-cl-card__week')).toBeNull();
    expect(within(c).getByText('Add the time this class meets.')).toBeTruthy();
    expect(within(c).getByText('No meeting time, not on your calendar')).toBeTruthy();
    await user.click(c);
    const detail = await screen.findByRole('dialog', { name: 'World History' });
    expect(factsOf(detail)).toMatchObject({ When: 'Tue · No time set', Calendar: 'Not on your calendar: no time set' });
    expect(detail.querySelector('.ch-cl-meet')).toBeNull();
  });

  it('CH-12004 CH-12109 the import result says which classes are not on the calendar and why, and counts only the ones that are', async () => {
    const user = userEvent.setup();
    const hist = toImportRow({ ...PREVIEW_PARSED[0]!, id: 'p9', course_code: 'HIST 210', course_name: 'World History', days: ['T'], start_time: '', end_time: '' });
    const w = show(PREVIEW_CLASSES, { read: vi.fn(async () => ({ ok: true as const, rows: [toImportRow(PREVIEW_PARSED[0]!), hist, toImportRow(PREVIEW_PARSED[3]!)], warnings: [] })) });
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Import 3 classes' }));
    expect(
      await inSheet().findByText(
        "1 of 3 is on your calendar and repeats weekly until Dec 15. Not on your calendar: HIST 210 (no time set) and PHIL 150 (no meeting days). Open the class to add what's missing.",
      ),
    ).toBeTruthy();
    expect(w.sync).toHaveBeenCalledTimes(3);
  });

  it('CH-12109 an import of classes that are all off the calendar does not say they are on it', async () => {
    const user = userEvent.setup();
    show(PREVIEW_CLASSES, { read: vi.fn(async () => ({ ok: true as const, rows: [toImportRow(PREVIEW_PARSED[3]!)], warnings: [] })) });
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Import 1 class' }));
    const result = await inSheet().findByText(/^Not on your calendar: PHIL 150 \(no meeting days\)\./);
    expect(result.textContent).not.toMatch(/on your calendar and repeat/);
  });

  it('CH-12109 the import result counts overlaps with this week’s practice only for classes in this term', async () => {
    const user = userEvent.setup();
    // GEOG 110 meets Monday and Wednesday at 3:30 PM, over practice; in Spring 2027 it meets no practice this week.
    show(PREVIEW_CLASSES, { read: vi.fn(async () => ({ ok: true as const, rows: [{ ...toImportRow(PREVIEW_PARSED[0]!), semester: 'Spring 2027' }], warnings: [] })) });
    await openImport(user);
    await pasteAndRead(user);
    await screen.findByRole('dialog', { name: 'Review your schedule' });
    await user.click(inSheet().getByRole('button', { name: 'Import 1 class' }));
    expect(await inSheet().findByText('1 class imported')).toBeTruthy();
    expect(code('CH-12109')).toBeNull();
  });

  it('CH-12107 CH-12108 the form’s overlap checks count only classes in the term it is set to', async () => {
    const user = userEvent.setup();
    // A class in next term at the same days and times as the draft below.
    const w = show(pageWith(rowIn(96, { code: 'GEOG 110', name: 'Global Environmental Change', days: ['M', 'W'], start: '10:00', end: '11:00', semester: 'Spring 2027' })));
    await user.click(headerButton('Add class'));
    await screen.findByRole('dialog', { name: 'Add a class' });
    setField('Course code', 'X 1');
    setField('Course name', 'X');
    await user.click(day('Mon'));
    await user.click(day('Wed'));
    setField('Starts', '10:00');
    setField('Ends', '11:00');
    // In Fall 2026 it overlaps ECON 310 (10:10 to 11:25), and not next spring's GEOG 110 that meets at exactly this time.
    await expectCode('CH-12108', /ECON 310 on Mon, Wed/);
    expect(code('CH-12108')!.textContent).not.toMatch(/GEOG 110/);
    // Set to Spring 2027 it is GEOG 110's term: the exact match is refused, and this fall's ECON 310 no longer counts.
    fireEvent.change(field('Term'), { target: { value: 'Spring 2027' } });
    await waitFor(() => expect(code('CH-12108')).toBeNull());
    await submitForm(user);
    await expectCode('CH-12107', /GEOG 110 already meets at exactly this time/);
    expect(w.save).not.toHaveBeenCalled();
    // Back in Fall 2026 the same days and times are nobody's exact match, so it saves.
    fireEvent.change(field('Term'), { target: { value: 'Fall 2026' } });
    await waitFor(() => expect(code('CH-12107')).toBeNull());
    await submitForm(user);
    await waitFor(() => expect(w.save).toHaveBeenCalledTimes(1));
  });

  it('CH-12109 the form’s team overlap is this week’s, so a class set to another term meets none of it', async () => {
    const user = userEvent.setup();
    show();
    await user.click(headerButton('Add class'));
    await screen.findByRole('dialog', { name: 'Add a class' });
    await user.click(day('Mon'));
    setField('Starts', '15:30');
    setField('Ends', '16:45');
    await expectCode('CH-12109', /Overlaps the team.*Practice on Mon/);
    fireEvent.change(field('Term'), { target: { value: 'Spring 2027' } });
    await waitFor(() => expect(code('CH-12109')).toBeNull());
    fireEvent.change(field('Term'), { target: { value: 'Fall 2026' } });
    await expectCode('CH-12109', /Practice on Mon/);
  });

  it('CH-12703 a class saved on a weekend day shows it in the form, so it can be taken off', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_CLASSES_MIXED);
    await user.click(card(/^MUSC 140/));
    await user.click(within(await screen.findByRole('dialog', { name: 'Ensemble' })).getByRole('button', { name: 'Edit class' }));
    await screen.findByRole('dialog', { name: 'Edit class' });
    const days = within(sheet()).getByRole('group', { name: 'Days' });
    expect([...days.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(day('Sat').getAttribute('aria-pressed')).toBe('true');
    await user.click(day('Sat'));
    expect(day('Sat').getAttribute('aria-pressed')).toBe('false');
    await submitForm(user);
    await waitFor(() => expect(w.save).toHaveBeenCalledTimes(1));
    expect(w.save.mock.calls[0]![0].days).toEqual([]);
    // A class with no weekend day offers the weekdays only.
    await user.click(card(/^STAT 201/));
    await user.click(within(await screen.findByRole('dialog', { name: 'Probability and Statistics' })).getByRole('button', { name: 'Edit class' }));
    await screen.findByRole('dialog', { name: 'Edit class' });
    expect(within(sheet()).getByRole('group', { name: 'Days' }).querySelectorAll('button')).toHaveLength(5);
  });

  it('a class in next term lists its next meetings from its term’s first day, not from today', async () => {
    const user = userEvent.setup();
    show(pageWith(rowIn(94, { code: 'GEOG 110', name: 'Global Environmental Change', days: ['T', 'Th'], start: '09:00', end: '10:15', semester: 'Spring 2027' })));
    await user.click(card(/^GEOG 110/));
    const detail = await screen.findByRole('dialog', { name: 'Global Environmental Change' });
    expect([...detail.querySelectorAll('.ch-cl-meet li')].map((li) => li.textContent)).toEqual(['Tue, Jan 19Upcoming', 'Thu, Jan 21Upcoming', 'Tue, Jan 26Upcoming', 'Thu, Jan 28Upcoming']);
  });

  it('CH-12001 a failed save and its Retry, and another tap on Add in the same sheet, carry one row id; the next sheet gets a new one', async () => {
    const user = userEvent.setup();
    const base = fakeWrites();
    const bad = { success: false, error: 'new row violates row-level security policy' };
    const save = vi
      .fn()
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce(bad)
      .mockImplementation((i: ChClassInput, e: ChClass | null, id: string) => base.save(i, e, id));
    show(PREVIEW_CLASSES, { save });
    await fillGeog(user);
    await submitForm(user);
    await expectCode('CH-12001');
    // Tapped again in the same sheet: the row the first attempt may have stored is the one this reaches.
    await submitForm(user);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await user.click(within(code('CH-12001') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(names()).toEqual(ORDER_WITH_GEOG));
    const ids = save.mock.calls.map((c) => c[2]);
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(ids).size).toBe(1);
    // A new sheet is a new class.
    await user.click(headerButton('Add class'));
    await screen.findByRole('dialog', { name: 'Add a class' });
    setField('Course code', 'MATH 232');
    setField('Course name', 'Linear Algebra');
    await submitForm(user);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(4));
    expect(save.mock.calls[3]![2]).not.toBe(ids[0]);
  });

  it('CH-12401 the route’s loading skeleton is the player’s inside Clubhouse; a coach there, and anyone outside it, gets the Fairway one', () => {
    const inShell = (shellRole: 'coach' | 'player') => (
      <ClubhouseMarker role={shellRole}>
        <ClassesLoading />
      </ClubhouseMarker>
    );
    const player = render(inShell('player'));
    expect(code('CH-12401')).not.toBeNull();
    expect(screen.queryByText('Loading classes…')).toBeNull();
    player.unmount();
    const coach = render(inShell('coach'));
    expect(code('CH-12401')).toBeNull();
    expect(screen.getByText('Loading classes…')).toBeTruthy();
    coach.unmount();
    render(<ClassesLoading />);
    expect(code('CH-12401')).toBeNull();
    expect(screen.getByText('Loading classes…')).toBeTruthy();
  });
});

describe('Classes reader', () => {
  it('pasted text is read with the current parser: a portal table gives its classes, and text with no class in it says so', async () => {
    const r = await readScheduleLive({ kind: 'text', text: PREVIEW_SCHEDULE_TEXT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.code)).toEqual(['STAT 201', 'ECON 310']);
    expect(r.rows[0]).toMatchObject({
      name: 'Probability and Statistics',
      instructor: 'Dr. L. Osei',
      days: ['T', 'Th'],
      start: '09:00',
      end: '10:15',
      building: 'Hanes Hall',
      room: '120',
      credits: 3,
      look: null,
    });
    expect(await readScheduleLive({ kind: 'text', text: 'hello there' })).toMatchObject({ ok: false, kind: 'none' });
  });

  it('a TXT file is read the same way; a file it cannot take is refused with the reason', async () => {
    const txt = new File([PREVIEW_SCHEDULE_TEXT], 'week.txt', { type: 'text/plain' });
    expect(await readScheduleLive({ kind: 'file', file: txt })).toMatchObject({ ok: true });
    const bad = new File(['x'], 'week.docx', { type: 'application/msword' });
    expect(await readScheduleLive({ kind: 'file', file: bad })).toMatchObject({ ok: false, kind: 'unsupported' });
    const big = new File(['x'], 'week.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 13 * 1024 * 1024 });
    expect(await readScheduleLive({ kind: 'file', file: big })).toMatchObject({ ok: false, kind: 'tooLarge' });
  });
});

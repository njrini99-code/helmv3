import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-14 change marks on the Calendar: a changed event shows the new value with the old one struck and a small badge;
 * the detail opens on what changed, who and when, with Got it for this device. Mocks as in calendar.test.tsx.
 *
 * CH-6023 (a stored mark this version cannot read) is catalogued in docs/clubhouse/catalog/calendar.md and named here and in
 * calendar.test.tsx.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
const a = vi.hoisted(() => ({ ok: vi.fn(), getEventDocuments: vi.fn(), getCalendarFeeds: vi.fn(), getAttendanceReport: vi.fn(), getDocuments: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ createGolfEvent: a.ok, updateGolfEvent: a.ok, deleteGolfEvent: a.ok, deleteGolfEventPermanently: a.ok, respondToEvent: a.ok }));
vi.mock('@/app/golf/actions/calendar-blocked-time', () => ({ addCoachBlockedTime: a.ok, deleteCoachBlockedTime: a.ok }));
vi.mock('@/app/golf/actions/recurring-events', () => ({ createRecurringEvent: a.ok, deleteRecurringEvent: a.ok, editRecurringEvent: a.ok }));
vi.mock('@/app/golf/actions/calendar-feeds', () => ({ getCalendarFeeds: a.getCalendarFeeds, createCalendarFeed: a.ok, regenerateCalendarFeed: a.ok, deleteCalendarFeed: a.ok }));
vi.mock('@/app/golf/actions/event-documents', () => ({ getEventDocuments: a.getEventDocuments, attachDocumentToEvent: a.ok, detachDocumentFromEvent: a.ok }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: a.getDocuments }));
vi.mock('@/app/golf/actions/attendance', () => ({ getAttendanceReport: a.getAttendanceReport, markAttendance: a.ok }));
vi.mock('@/app/golf/actions/travel', () => ({ getItineraryForEvent: () => Promise.resolve({ success: true, data: null }) }));

import type { ChCalendarData } from '../data/calendar';
import type { MarkEntries } from '../lib/marks-cookie';
import { Calendar } from '../screens/calendar/Calendar';
import { EventPeekCard } from '../screens/calendar/peek';
import { buildChangeMarks, type ChangeRow } from '../screens/calendar/change-view';
import type { ChCalEvent } from '../screens/calendar/model';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_CALENDAR } from '../preview/fixtures-calendar';
import './dialog-polyfill';

const TZ = 'America/New_York';
// Wednesday 14 October 2026, 2:40 PM Eastern.
const NOW = Date.parse('2026-10-14T18:40:00Z');
const AT = '2026-10-14T18:14:00.000Z';
const SESSION = '6f1c2a90-aaaa-4bbb-8ccc-000000000001';

/** The travel briefing on Thu 15 October in the team room, 1:00 to 1:45 PM until the coach moved it 30 minutes later. */
const base = { start_time: '2026-10-15T17:00:00Z', end_time: '2026-10-15T17:45:00Z', all_day: false, location: 'Team room', title: 'Travel briefing', event_type: 'meeting', cancelled: false };
const stored = (over: Record<string, unknown> = {}) => ({ v: 1, id: SESSION, first_at: AT, at: AT, by: 'c1', by_names: ['Maya Reyes'], from: base, fields: ['end_time', 'start_time'], ...over });
const row = (over: Partial<ChangeRow> = {}): ChangeRow => ({
  id: 'e9',
  start_time: '2026-10-15T17:30:00Z',
  end_time: '2026-10-15T18:15:00Z',
  all_day: false,
  location: 'Team room',
  title: 'Travel briefing',
  event_type: 'meeting',
  status: 'confirmed',
  change: stored(),
  ...over,
});
const built = (rows: ChangeRow[], coachId: string | null = 'c1') => buildChangeMarks(rows, { timeZone: TZ, nowMs: NOW, coachId });

/** The preview week with the marks the loader would build for these rows, and the event fields the rows changed (`patch`). */
function withMarks(rows: ChangeRow[], data: Partial<ChCalendarData> = {}, marks: MarkEntries = [], patch: Partial<ChCalEvent> = {}): ChCalendarData {
  const { marks: byId, movedAway } = buildChangeMarks(rows, { timeZone: TZ, nowMs: NOW, coachId: 'c1', range: PREVIEW_CALENDAR.range });
  return {
    ...PREVIEW_CALENDAR,
    anchor: '2026-10-15',
    movedAway,
    events: PREVIEW_CALENDAR.events.map((e): ChCalEvent => (byId.has(e.id) ? { ...e, ...patch, change: byId.get(e.id)!, cancelled: rows.find((r) => r.id === e.id)?.status === 'cancelled' } : e)),
    marks,
    ...data,
  };
}

/** A browser that reports what has been on screen when a case says so; jsdom has none, and without one a mark counts as seen at once. */
function stubObserver() {
  const callbacks: Array<(entries: Array<{ isIntersecting: boolean; target: Element }>) => void> = [];
  const watched: Element[] = [];
  class IO {
    constructor(cb: (entries: Array<{ isIntersecting: boolean; target: Element }>) => void) {
      callbacks.push(cb);
    }
    observe(el: Element) {
      watched.push(el);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', IO);
  return { callbacks, watched };
}

const tree = (data: ChCalendarData, props: { initialEvent?: string } = {}) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <Calendar data={data} {...props} />
      </div>
    </ToastProvider>
  </LazyMotion>
);
function wrap(data: ChCalendarData, props: { initialEvent?: string } = {}) {
  return render(tree(data, props));
}

const clearCookie = () => {
  document.cookie = 'ch_marks=; path=/; max-age=0';
};

beforeEach(() => {
  hapticSpy.mockClear();
  clearCookie();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  a.getEventDocuments.mockResolvedValue({ success: true, data: [] });
  a.getCalendarFeeds.mockResolvedValue({ success: true, data: [] });
  a.getDocuments.mockResolvedValue({ success: true, data: [] });
  a.getAttendanceReport.mockResolvedValue({ success: true, data: { attendance: [] } });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  clearCookie();
});

describe('the marks the loader builds', () => {
  it('a live mark carries the words, the old values and who made it', () => {
    const m = built([row()]).marks.get('e9')!;
    expect(m).toMatchObject({ id: SESSION, kind: 'time', badge: 'Moved', byMe: true, partial: false, rowMark: true, count: 1, was: { time: '1:00 PM' } });
    expect(m.title).toBe('Travel briefing moved to 1:30 PM (was 1:00 PM)');
    expect(m.panelLine1).toBe('Moved from 1:00 PM');
    expect(m.panelLine2).toBe('By you · 2:14 PM');
    expect(built([row()], 'someone-else').marks.get('e9')!.panelLine2).toBe('By Coach Reyes · 2:14 PM');
  });

  it('a mark past 72 hours, one on an event that has ended, a class row and an empty mark show nothing', () => {
    expect(built([row({ change: stored({ at: '2026-10-10T18:14:00.000Z' }) })]).marks.size).toBe(0);
    expect(built([row({ start_time: '2026-10-13T17:30:00Z', end_time: '2026-10-13T18:15:00Z', change: stored({ at: '2026-10-13T18:00:00.000Z' }) })]).marks.size).toBe(0);
    expect(built([row({ event_type: 'class' })]).marks.size).toBe(0);
    expect(built([row({ change: null }), row({ id: 'e11', change: {} })]).marks.size).toBe(0);
  });

  it('rows carry the mark only for events within 14 days; the detail still says what changed', () => {
    const far = row({ start_time: '2026-11-20T17:30:00Z', end_time: '2026-11-20T18:15:00Z', change: stored({ from: { ...base, start_time: '2026-11-20T17:00:00Z', end_time: '2026-11-20T17:45:00Z' } }) });
    expect(built([far]).marks.get('e9')!.rowMark).toBe(false);
  });

  it('CH-6023 a mark that cannot be read is reported and shows a bare Changed badge with no struck values', () => {
    const { marks, unreadable } = built([row({ change: stored({ v: 2, from: undefined }) })]);
    expect(unreadable).toEqual(['e9']);
    expect(marks.get('e9')).toMatchObject({ partial: true, badge: 'Changed', panelLine1: 'Changed', was: {}, panelRows: [] });
    // Nothing to show when even its time is unreadable.
    expect(built([row({ change: { v: 2 } })]).marks.size).toBe(0);
  });

  it('a series edited together shares one session and one sentence', () => {
    const rows = ['2026-10-19', '2026-10-21'].map((d, i) =>
      row({ id: `s${i}`, start_time: `${d}T20:00:00Z`, end_time: `${d}T22:00:00Z`, change: stored({ from: { ...base, start_time: `${d}T19:00:00Z`, end_time: `${d}T21:00:00Z` } }) }),
    );
    const { marks } = built(rows);
    expect(marks.get('s0')!.title).toBe('Travel briefing: 2 dates moved to 4:00 PM (was 3:00 PM)');
    expect(marks.get('s1')!.count).toBe(2);
  });
});

describe('on the phone', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });
  const rowButton = () => screen.getByRole('button', { name: /^Travel briefing, 1:30 PM to 2:15 PM/ });

  it('the day row shows the old time struck under the title, a Moved badge, and says so in its name', () => {
    wrap(withMarks([row()]));
    const r = rowButton();
    expect(r.getAttribute('aria-label')).toMatch(/, moved, was 1:00 PM$/);
    const was = r.querySelector('s.ch-was')!;
    expect(was.textContent).toBe('was 1:00 PM');
    expect(was.closest('.ch-calm-ev__b')!.textContent).toContain('Team room');
    expect(within(r).getByText('Moved')).toBeTruthy();
  });

  it('a place change reads new first and the old struck after; a rename puts the old name first', () => {
    const onlyPlace = { start_time: '2026-10-15T17:30:00Z', end_time: '2026-10-15T18:15:00Z' };
    wrap(withMarks([row({ location: 'Practice range', change: stored({ from: { ...base, ...onlyPlace }, fields: ['location'] }) })], {}, [], { location: 'Practice range' }));
    const r = screen.getByRole('button', { name: /^Travel briefing, 1:30 PM to 2:15 PM/ });
    expect(r.getAttribute('aria-label')).toMatch(/, moved to Practice range, was Team room$/);
    expect(r.querySelector('.ch-calm-ev__sub')!.textContent).toBe('Practice range was Team room');
    cleanup();
    wrap(withMarks([row({ title: 'Team call', change: stored({ from: { ...base, ...onlyPlace }, fields: ['title'] }) })], {}, [], { title: 'Team call' }));
    const renamed = screen.getByRole('button', { name: /^Team call, 1:30 PM to 2:15 PM/ });
    expect(renamed.getAttribute('aria-label')).toMatch(/, renamed, was Travel briefing$/);
    expect(renamed.querySelector('.ch-calm-ev__sub')!.textContent).toBe('was Travel briefing · Team room');
  });

  it('the strike is pending until this device has seen it, and already done on the first frame after', () => {
    stubObserver();
    try {
      wrap(withMarks([row()]));
      expect(rowButton().querySelector('s.ch-was')!.getAttribute('data-draw')).toBe('pending');
      cleanup();
      wrap(withMarks([row()], {}, [['6f1c2a90', 's']]));
      expect(rowButton().querySelector('s.ch-was')!.getAttribute('data-draw')).toBe('done');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('once a mark has been 60% on screen the device records it (the observer only records; the draw is CSS)', async () => {
    const io = stubObserver();
    try {
      wrap(withMarks([row()]));
      await waitFor(() => expect(io.watched.length).toBeGreaterThan(0));
      expect(document.cookie).not.toContain('ch_marks=6f1c2a90');
      io.callbacks[0]!([{ isIntersecting: true, target: io.watched[0]! }]);
      await waitFor(() => expect(rowButton().querySelector('s.ch-was')!.getAttribute('data-draw')).toBe('done'));
      expect(document.cookie).toContain('ch_marks=6f1c2a90:s');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('with no observer (an old WebView) a mark counts as seen at once, so nothing waits on it', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    try {
      wrap(withMarks([row()]));
      await waitFor(() => expect(rowButton().querySelector('s.ch-was')!.getAttribute('data-draw')).toBe('done'));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Reply beats Moved: a player who still owes a reply sees Reply, with the change in the name', () => {
    const data = withMarks([row({ id: 'e13', title: 'Round review', event_type: 'meeting', location: 'Team room', start_time: '2026-10-17T17:00:00Z', end_time: '2026-10-17T18:00:00Z', change: stored({ from: { ...base, title: 'Round review', event_type: 'meeting', location: 'Team room', start_time: '2026-10-17T16:00:00Z', end_time: '2026-10-17T17:00:00Z' } }) })], {
      anchor: '2026-10-17',
      role: 'player',
      viewerPlayerId: 'jonah',
    });
    const player = { ...data, events: data.events.map((e) => (e.id === 'e13' ? { ...e, rsvp: { jonah: 'pending' as const }, people: ['jonah'], canEdit: false } : e)) };
    wrap(player);
    const r = screen.getByRole('button', { name: /^Round review/ });
    expect(within(r).getByText('Reply')).toBeTruthy();
    expect(within(r).queryByText('Moved')).toBeNull();
    expect(r.getAttribute('aria-label')).toMatch(/needs your reply, moved, was 12:00 PM$/);
  });

  it('a cancelled event shows a Cancelled badge, its title struck, and no struck time', () => {
    wrap(withMarks([row({ status: 'cancelled', change: stored({ fields: ['cancelled'], from: { ...base, start_time: '2026-10-15T17:30:00Z', end_time: '2026-10-15T18:15:00Z' } }) })]));
    const r = screen.getByRole('button', { name: /^Travel briefing, 1:30 PM to 2:15 PM.*, cancelled/ });
    expect(r.className).toContain('is-cancelled');
    expect(within(r).getByText('Cancelled')).toBeTruthy();
    expect(r.querySelector('s.ch-was')).toBeNull();
    expect(r.querySelector('.ch-calm-ev__sub')!.textContent).toBe('Cancelled · Team room');
  });

  it('the detail opens on what changed; Got it hides it here and in the row, survives a reload, and Show it again brings it back', async () => {
    const user = userEvent.setup();
    wrap(withMarks([row()]));
    await user.click(rowButton());
    const note = await screen.findByRole('note', { name: 'What changed' });
    expect(within(note).getByText('Moved from 1:00 PM')).toBeTruthy();
    expect(within(note).getByText('By you · 2:14 PM')).toBeTruthy();

    await user.click(within(note).getByRole('button', { name: 'Got it. Hide this change on this device.' }));
    expect(hapticSpy).toHaveBeenCalledWith('success');
    await waitFor(() => expect(screen.queryByRole('note', { name: 'What changed' })).toBeNull());
    expect(screen.getByText('Change hidden on this device.')).toBeTruthy();
    expect(document.cookie).toContain('ch_marks=6f1c2a90:g');
    // The row is exactly today's row again.
    expect(screen.getAllByRole('button', { name: /^Travel briefing, 1:30 PM to 2:15 PM/ }).every((b) => !b.querySelector('s.ch-was') && !/moved/.test(b.getAttribute('aria-label')!))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Show the change again' }));
    expect(await screen.findByRole('note', { name: 'What changed' })).toBeTruthy();
    // It was already seen: it comes back without drawing a second time.
    expect(document.cookie).toContain('ch_marks=6f1c2a90:s');
    expect(screen.getAllByRole('button', { name: /^Travel briefing/ }).some((b) => b.querySelector('s.ch-was')?.getAttribute('data-draw') === 'done')).toBe(true);
  });

  it('a device that cleared the change paints it cleared on the first frame', () => {
    wrap(withMarks([row()], {}, [['6f1c2a90', 'g']]));
    expect(rowButton().querySelector('s.ch-was')).toBeNull();
    expect(rowButton().getAttribute('aria-label')).not.toMatch(/moved/);
  });

  it('a cancellation is never hidden: no Got it, the reason is quoted', async () => {
    const user = userEvent.setup();
    wrap(withMarks([row({ status: 'cancelled', cancellation_reason: 'Course closed for aeration', change: stored({ fields: ['cancelled'], from: { ...base, start_time: '2026-10-15T17:30:00Z', end_time: '2026-10-15T18:15:00Z' } }) })]));
    await user.click(screen.getByRole('button', { name: /^Travel briefing, 1:30 PM to 2:15 PM/ }));
    const note = await screen.findByRole('note', { name: 'What changed' });
    expect(within(note).getByText('Cancelled')).toBeTruthy();
    expect(within(note).getByText('Course closed for aeration')).toBeTruthy();
    expect(within(note).queryByRole('button', { name: /Got it/ })).toBeNull();
  });

  it('a long-cancelled event with no live mark still says when and why', async () => {
    const user = userEvent.setup();
    const data = withMarks([]);
    const cancelled = { ...data, events: data.events.map((e) => (e.id === 'e9' ? { ...e, cancelled: true, cancelNote: { line: 'Cancelled Mon 7:02 PM', reason: 'Rain' } } : e)) };
    wrap(cancelled);
    await user.click(screen.getByRole('button', { name: /^Travel briefing, 1:30 PM to 2:15 PM/ }));
    const note = await screen.findByRole('note', { name: 'What changed' });
    expect(within(note).getByText('Cancelled Mon 7:02 PM')).toBeTruthy();
    expect(within(note).getByText('Rain')).toBeTruthy();
  });

  it('with no changes the day is exactly as it was: no note, no badge, no struck value', async () => {
    wrap(withMarks([]));
    expect(document.querySelector('s.ch-was')).toBeNull();
    expect(screen.queryByText('Moved')).toBeNull();
  });

  it('a reader hears the old value as "was 3:00 PM"', () => {
    wrap(withMarks([row()]));
    expect(rowButton().querySelector('s.ch-was .ch-sr-only')!.textContent).toBe('was ');
  });
});

describe('the change panel for several fields', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  it('lists the time, day and place beside what they were, the old values struck', async () => {
    const user = userEvent.setup();
    wrap(
      withMarks(
        [row({ location: 'Practice range', start_time: '2026-10-16T20:00:00Z', end_time: '2026-10-16T22:00:00Z', change: stored({ fields: ['end_time', 'location', 'start_time'] }) })],
        { anchor: '2026-10-16' },
        [],
        { date: '2026-10-16', start: 16, end: 18, location: 'Practice range' },
      ),
    );
    await user.click(screen.getByRole('button', { name: /^Travel briefing, 4:00 PM to 6:00 PM/ }));
    const note = await screen.findByRole('note', { name: 'What changed' });
    expect(within(note).getByText('Changed')).toBeTruthy();
    expect([...note.querySelectorAll('dl > div')].map((d) => d.textContent)).toEqual([
      'Time4:00 to 6:00 PM was 1:00 to 1:45 PM',
      'DayFri 16 October was Thu 15 October',
      'PlacePractice range was Team room',
    ]);
  });
});

describe('contrast and the banned stripe (P-14 7.3)', () => {
  const STYLES = join(process.cwd(), 'src/clubhouse/styles');
  const tokens = readFileSync(join(STYLES, 'tokens.css'), 'utf8');
  type RGB = [number, number, number];
  const hex = (h: string): RGB => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16)) as RGB;
  const lum = (c: RGB) => {
    const [r, g, b] = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (x: RGB, y: RGB) => {
    const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  const token = (name: string, theme: 'light' | 'dark'): RGB => {
    const from = theme === 'light' ? 0 : tokens.indexOf("[data-fw-theme='dark']");
    const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens.slice(from));
    if (!m) throw new Error(`--${name} (${theme}) is not a hex`);
    return hex(m[1]!);
  };

  it.each(['light', 'dark'] as const)('the struck value and the panel text read at 4.5:1 or more on every surface they sit on (%s)', (theme) => {
    for (const bg of ['ch-sheet-bg', 'ch-workspace', 'ch-bg-subtle', 'ch-bg-page']) {
      expect(ratio(token('ch-ink-500', theme), token(bg, theme)), `ink-500 on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(token('ch-ink-600', theme), token('ch-bg-subtle', theme)), 'panel caption').toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('ch-ink-900', theme), token('ch-bg-subtle', theme)), 'panel title').toBeGreaterThanOrEqual(4.5);
  });

  it('no rule of the feature draws a left border, a left stripe or an inset accent', () => {
    const calendar = readFileSync(join(STYLES, 'calendar.css'), 'utf8');
    const ui = readFileSync(join(STYLES, 'ui.css'), 'utf8');
    const mine = [calendar.slice(calendar.indexOf('/* P-14 change marks.')), ui.slice(ui.indexOf('/* P-14 change marks:'))].join('\n');
    expect(mine.length).toBeGreaterThan(500);
    expect(mine).not.toMatch(/border-(left|inline-start)/);
    expect(mine).not.toMatch(/box-shadow:\s*inset\s+-?\d+(\.\d+)?px\s+0\s+0/);
  });

  it('only transform and opacity animate: no layout property transitions or keyframes in the feature', () => {
    const calendar = readFileSync(join(STYLES, 'calendar.css'), 'utf8');
    const ui = readFileSync(join(STYLES, 'ui.css'), 'utf8');
    const mine = [calendar.slice(calendar.indexOf('/* P-14 change marks.')), ui.slice(ui.indexOf('/* P-14 change marks:'))].join('\n');
    expect(mine).not.toMatch(/transition:[^;]*\b(height|width|top|left|margin|padding)\b/);
    for (const kf of mine.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)) expect(kf[1]).not.toMatch(/\b(height|width|top|left|margin|padding)\b/);
  });
});

/** Recovery nine on Sat 17 October, 3:30 to 5:00 PM at Finley GC (a tall block); the coach moved it 30 minutes later from 3:00 PM. */
const rec = {
  id: 'e14',
  title: 'Recovery nine',
  event_type: 'practice',
  location: 'Finley GC',
  start_time: '2026-10-17T19:30:00Z',
  end_time: '2026-10-17T21:00:00Z',
};
const recFrom = { ...base, title: 'Recovery nine', event_type: 'practice', location: 'Finley GC', start_time: '2026-10-17T19:00:00Z', end_time: '2026-10-17T20:30:00Z' };
const recRow = (over: Partial<ChangeRow> = {}): ChangeRow => ({ ...rec, all_day: false, status: 'confirmed', change: stored({ from: recFrom }), ...over });

describe('on the desktop', () => {
  const block = () => screen.getByRole('button', { name: /^Recovery nine, 3:30 – 5:00 PM/ });

  it('a tall block carries the old time struck as the last part of its time line, and says so in its name', () => {
    wrap(withMarks([recRow()], { anchor: '2026-10-14' }));
    const b = block();
    expect(b.getAttribute('aria-label')).toMatch(/, moved, was 3:00 PM\. Alt and the arrow keys/);
    const line = b.querySelector('.ch-ev__m')!;
    const last = line.lastElementChild!;
    expect(last.className).toBe('ch-ev__was');
    expect(last.textContent).toBe('was 3:00 PM');
    expect(line.textContent).toContain('Finley GC');
  });

  it('a short block, which has no room for text, wears a glyph in the top-right slot', () => {
    wrap(withMarks([row()], { anchor: '2026-10-14' }));
    const b = screen.getByRole('button', { name: /^Travel briefing, 1:30 – 2:15 PM/ });
    expect(b.querySelector('.ch-ev__chg')).not.toBeNull();
    expect(b.querySelector('s.ch-was')).toBeNull();
  });

  it('a place changed on a tall block reads the new place with the old struck after it', () => {
    wrap(withMarks([recRow({ location: 'Practice range', change: stored({ from: { ...recFrom, start_time: rec.start_time, end_time: rec.end_time }, fields: ['location'] }) })], { anchor: '2026-10-14' }, [], { location: 'Practice range' }));
    const b = screen.getByRole('button', { name: /^Recovery nine, 3:30 – 5:00 PM/ });
    expect(b.querySelector('.ch-ev__m')!.textContent).toMatch(/Practice range.*was Finley GC$/);
  });

  it('where it was: a hairline and "Was 3:00 PM" at the old start, while the block is hovered or focused, gone when it is not', async () => {
    const user = userEvent.setup();
    wrap(withMarks([recRow()], { anchor: '2026-10-14' }));
    expect(document.querySelector('.ch-oldslot')).toBeNull();
    await user.hover(block());
    const line = document.querySelector<HTMLElement>('.ch-oldslot')!;
    expect(line.textContent).toBe('Was 3:00 PM');
    expect(line.getAttribute('aria-hidden')).toBe('true');
    // The grid opens at 6 AM, 52px an hour: 3 PM is nine hours down.
    expect(line.style.top).toBe('468px');
    await user.unhover(block());
    expect(document.querySelector('.ch-oldslot')).toBeNull();
    act(() => block().focus());
    expect(document.querySelector('.ch-oldslot')).not.toBeNull();
    act(() => block().blur());
    expect(document.querySelector('.ch-oldslot')).toBeNull();
  });

  it('a block that was selected keeps the line, and Got it takes it away with the mark', async () => {
    const user = userEvent.setup();
    wrap(withMarks([recRow()], { anchor: '2026-10-14' }));
    await user.click(block());
    expect(document.querySelector('.ch-oldslot')).not.toBeNull();
    const note = await screen.findByRole('note', { name: 'What changed' });
    await user.click(within(note).getByRole('button', { name: 'Got it. Hide this change on this device.' }));
    await waitFor(() => expect(document.querySelector('.ch-oldslot')).toBeNull());
    expect(block().querySelector('s.ch-was')).toBeNull();
  });

  it('a cancelled block has its title struck, says cancelled, and does not dim', () => {
    wrap(withMarks([recRow({ status: 'cancelled', change: stored({ fields: ['cancelled'], from: { ...recFrom, start_time: rec.start_time, end_time: rec.end_time } }) })], { anchor: '2026-10-14' }));
    const b = screen.getByRole('button', { name: /^Recovery nine, 3:30 – 5:00 PM.*, cancelled/ });
    expect(b.className).toContain('is-cancelled');
    expect(b.querySelector('.ch-ev__m')!.textContent).toContain('Cancelled');
    expect(b.querySelector('s.ch-was')).toBeNull();
  });

  it('the month shows a small glyph after a changed title and counts it in the cell’s name', () => {
    wrap(withMarks([recRow()], { anchor: '2026-10-17', view: 'month' }));
    const cell = screen.getByRole('button', { name: /^Sat 17 October: .*, 1 changed$/ });
    expect(cell.querySelector('.ch-mo__chg')).not.toBeNull();
    expect(cell.textContent).not.toContain('3:00');
  });

  it('the agenda row strikes the old time before the type and shows the badge; a cancelled row says Cancelled', () => {
    wrap(withMarks([recRow(), row({ status: 'cancelled', change: stored({ id: 'aaaaaaaa-aaaa-4bbb-8ccc-000000000002', fields: ['cancelled'], from: { ...base, start_time: row().start_time, end_time: row().end_time } }) })], { anchor: '2026-10-14', view: 'agenda' }));
    const r = screen.getByText('Recovery nine').closest('.ch-ag__row')!;
    expect(r.querySelector('.ch-ag__b')!.textContent).toBe('was 3:00 PM · Practice · Finley GC');
    expect(within(r as HTMLElement).getByText('Moved')).toBeTruthy();
    const c = screen.getByText('Travel briefing').closest('.ch-ag__row')!;
    expect(c.className).toContain('is-cancelled');
    expect(within(c as HTMLElement).getByText('Cancelled')).toBeTruthy();
  });

  it('the day an event left keeps a quiet row that opens it on its new day, and not in the day’s count', async () => {
    const user = userEvent.setup();
    const moved = recRow({ start_time: '2026-10-17T19:30:00Z', end_time: '2026-10-17T21:00:00Z', change: stored({ from: { ...recFrom, start_time: '2026-10-16T19:00:00Z', end_time: '2026-10-16T20:30:00Z' } }) });
    wrap(withMarks([moved], { anchor: '2026-10-14', view: 'agenda' }));
    const away = screen.getByRole('button', { name: 'Recovery nine, moved to Saturday 17 October at 3:30 PM. Was 3:00 PM on Fri.' });
    expect(away.closest('section')!.getAttribute('aria-label')).toBe('Fri 16');
    expect(away.textContent).toContain('Moved to Sat at 3:30 PM');
    expect(away.querySelector('s.ch-was')!.textContent).toBe('was 3:00 PM');
    await user.click(away);
    expect(await screen.findByRole('note', { name: 'What changed' })).toBeTruthy();
    expect(screen.getByText('Moved from Fri 16 October at 3:00 PM')).toBeTruthy();
  });

  it('a cancelled event stays on its day: no moved-away row is made for it', () => {
    const moved = recRow({ status: 'cancelled', start_time: '2026-10-17T19:30:00Z', end_time: '2026-10-17T21:00:00Z', change: stored({ fields: ['cancelled'], from: { ...recFrom, start_time: '2026-10-17T19:30:00Z', end_time: '2026-10-17T21:00:00Z' } }) });
    expect(withMarks([moved]).movedAway).toEqual([]);
  });

  it('the peek card says what changed and who changed it, with no animation', () => {
    const data = withMarks([recRow()], {});
    const e = data.events.find((x) => x.id === 'e14')!;
    const other = buildChangeMarks([recRow()], { timeZone: TZ, nowMs: NOW, coachId: 'someone' }).marks.get('e14')!;
    render(
      <div className="ch-root" data-ui="clubhouse">
        <EventPeekCard e={{ ...e, change: other }} coach people={new Map()} />
      </div>,
    );
    expect(screen.getByText('Moved from 3:00 PM · Coach Reyes')).toBeTruthy();
  });

  it('a change that arrives while the page is open is said once, politely; what was there already and a coach’s own change are not', async () => {
    const before = withMarks([row()], { anchor: '2026-10-14' });
    const { rerender } = render(tree(before));
    const status = () => [...document.querySelectorAll('[role="status"]')].map((n) => n.textContent).join('|');
    expect(status()).toBe('');
    const other = buildChangeMarks([recRow({ change: stored({ id: '77777777-aaaa-4bbb-8ccc-000000000009', by: 'c9', from: recFrom }) })], { timeZone: TZ, nowMs: NOW, coachId: 'c1' }).marks.get('e14')!;
    const after = { ...before, events: before.events.map((e) => (e.id === 'e14' ? { ...e, change: other } : e)) };
    rerender(tree(after));
    await waitFor(() => expect(status()).toBe('Recovery nine moved to 3:30 PM. It was 3:00 PM.'));
    // The same change again says nothing new; the reader's own change is silent.
    rerender(tree({ ...after, events: after.events.slice() }));
    expect(status()).toBe('Recovery nine moved to 3:30 PM. It was 3:00 PM.');
    const own = withMarks([recRow({ change: stored({ id: '88888888-aaaa-4bbb-8ccc-000000000009', by: 'c1', from: recFrom }) })], { anchor: '2026-10-14' });
    rerender(tree({ ...own, events: own.events.map((e) => (e.id === 'e14' ? { ...e, change: { ...e.change!, liveText: 'own' } } : e)) }));
    expect(status()).not.toContain('own');
  });
});

describe('the feature’s contrast on the surfaces it sits on, from the tokens (P-14 7.3)', () => {
  const STYLES = join(process.cwd(), 'src/clubhouse/styles');
  const tokens = readFileSync(join(STYLES, 'tokens.css'), 'utf8');
  type RGBA = [number, number, number, number];
  const parse = (v: string, theme: 'light' | 'dark', depth = 0): RGBA => {
    const hex = /^#([0-9a-f]{6})$/i.exec(v.trim());
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)).concat(1) as RGBA;
    const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(v.trim());
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) : 1];
    const ref = /^var\(--([\w-]+)\)$/.exec(v.trim());
    if (ref && depth < 4) return tokenOf(ref[1]!, theme, depth + 1);
    throw new Error(`cannot read ${v}`);
  };
  function tokenOf(name: string, theme: 'light' | 'dark', depth = 0): RGBA {
    const dark = tokens.indexOf("[data-fw-theme='dark']");
    const re = new RegExp(`--${name}:\\s*([^;]+);`);
    const found = (theme === 'dark' ? re.exec(tokens.slice(dark)) : null) ?? re.exec(tokens);
    if (!found) throw new Error(`--${name} not found`);
    return parse(found[1]!, theme, depth);
  }
  const lum = ([r, g, b]: RGBA) => {
    const [x, y, z] = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * x! + 0.7152 * y! + 0.0722 * z!;
  };
  const over = (fg: RGBA, bg: RGBA): RGBA => [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3])).concat(1) as RGBA;
  const ratio = (fg: RGBA, bg: RGBA) => {
    const a = lum(over(fg, bg));
    const b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  it.each(['light', 'dark'] as const)('the struck value reads 4.5:1 on every block type, and the soft ivory on the filled competition (%s)', (theme) => {
    const t = (n: string) => tokenOf(n, theme);
    const page = t('ch-bg-page');
    const travel: RGBA = over(theme === 'light' ? [255, 255, 255, 0.5] : [255, 255, 255, 0.03], page);
    const fill = over(t('ch-green-fill-700'), page);
    expect(ratio(t('ch-ink-500'), t('ch-green-50')), 'practice').toBeGreaterThanOrEqual(4.5);
    expect(ratio(t('ch-ink-500'), t('ch-bg-surface')), 'meeting and other').toBeGreaterThanOrEqual(4.5);
    expect(ratio(t('ch-ink-500'), travel), 'travel').toBeGreaterThanOrEqual(4.5);
    expect(ratio(t('ch-on-green-ink-soft'), fill), 'tournament and qualifier').toBeGreaterThanOrEqual(4.5);
  });

  it.each(['light', 'dark'] as const)('the old-slot label and the moved-away ring are legible (%s)', (theme) => {
    const t = (n: string) => tokenOf(n, theme);
    expect(ratio(t('ch-ink-500'), t('ch-bg-surface')), 'label').toBeGreaterThanOrEqual(4.5);
    expect(ratio(t('ch-ink-500'), t('ch-workspace')), 'ring on the workspace').toBeGreaterThanOrEqual(3);
    // The phone page, which the moved-away ring sits on in light (tokens.css, the phone page ground).
    if (theme === 'light') expect(ratio(t('ch-ink-500'), [237, 233, 223, 1]), 'ring on the phone page').toBeGreaterThanOrEqual(3);
  });
});

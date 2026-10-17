import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Calendar keyboard and focus (runtime audit 2026-10-14, WebKit): A-09 the View radios' arrows, A-14 the new event's
 * first focus, A-23 the jump panel, A-24 the people picker, A-25 an event opened from the keyboard. Mocks as in
 * calendar.test.tsx.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
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
const a = vi.hoisted(() => ({
  ok: vi.fn(),
  getEventDocuments: vi.fn(),
  getCalendarFeeds: vi.fn(),
  getAttendanceReport: vi.fn(),
  getDocuments: vi.fn(),
}));
vi.mock('@/app/golf/actions/calendar-events', () => ({ createGolfEvent: a.ok, updateGolfEvent: a.ok, deleteGolfEvent: a.ok, respondToEvent: a.ok }));
vi.mock('@/app/golf/actions/calendar-blocked-time', () => ({ addCoachBlockedTime: a.ok, deleteCoachBlockedTime: a.ok }));
vi.mock('@/app/golf/actions/recurring-events', () => ({ createRecurringEvent: a.ok, deleteRecurringEvent: a.ok, editRecurringEvent: a.ok }));
vi.mock('@/app/golf/actions/calendar-feeds', () => ({ getCalendarFeeds: a.getCalendarFeeds, createCalendarFeed: a.ok, regenerateCalendarFeed: a.ok, deleteCalendarFeed: a.ok }));
vi.mock('@/app/golf/actions/event-documents', () => ({ getEventDocuments: a.getEventDocuments, attachDocumentToEvent: a.ok, detachDocumentFromEvent: a.ok }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: a.getDocuments }));
vi.mock('@/app/golf/actions/attendance', () => ({ getAttendanceReport: a.getAttendanceReport, markAttendance: a.ok }));
// The linked trip on an open event (LinkedTrip): none, unless a case says otherwise.
vi.mock('@/app/golf/actions/travel', () => ({ getItineraryForEvent: () => Promise.resolve({ success: true, data: null }) }));

import type { ChCalendarData } from '../data/calendar';
import { Calendar } from '../screens/calendar/Calendar';
import { isPastEvent } from '../screens/calendar/views';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_CALENDAR, PREVIEW_CALENDAR_PLAYER } from '../preview/fixtures-calendar';
import './dialog-polyfill';

function wrap(data: ChCalendarData, props: { initialEvent?: string; initialNew?: boolean } = {}) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Calendar data={data} {...props} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}

/**
 * Overnight polish (2026-10-15): time that has gone recedes. Ended events step back (and say "ended"), past days and
 * today's hours above the now line take a wash, and past days' month entries fade, for the coach and the player alike.
 */
const ev = (date: string, start: number | null, end: number | null, allDay = false) => ({ date, start, end, allDay }) as never;
const now = { date: '2026-10-14', hour: 14.67 } as never;

describe('isPastEvent', () => {
  it('a day before today has gone; today it has gone once it has ended; an all-day event today has not', () => {
    expect(isPastEvent(ev('2026-10-13', 9, 10), now)).toBe(true);
    expect(isPastEvent(ev('2026-10-14', 13, 14.25), now)).toBe(true);
    expect(isPastEvent(ev('2026-10-14', 14, 15), now)).toBe(false);
    expect(isPastEvent(ev('2026-10-14', null, null, true), now)).toBe(false);
    expect(isPastEvent(ev('2026-10-15', 6, 7), now)).toBe(false);
  });
});

describe.each([
  ['coach', PREVIEW_CALENDAR],
  ['player', PREVIEW_CALENDAR_PLAYER],
] as const)('the %s week', (_role, data) => {
  // The sample's own day (Wed 14 October 2026, 2:40 PM in New York), never the real clock's: late in the real week
  // every sample event has ended and none is ahead.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('steps ended events back, names them ended, and washes the past', () => {
    const { container } = wrap(data);
    const past = [...container.querySelectorAll('.ch-ev.is-past')];
    expect(past.length).toBeGreaterThan(0);
    for (const b of past) expect(b.getAttribute('aria-label')).toMatch(/, ended/);
    const ahead = [...container.querySelectorAll('.ch-ev:not(.is-past)')].filter((b) => !b.classList.contains('is-ghost'));
    expect(ahead.length).toBeGreaterThan(0);
    for (const b of ahead) expect(b.getAttribute('aria-label')).not.toMatch(/, ended/);
    expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
  });
});

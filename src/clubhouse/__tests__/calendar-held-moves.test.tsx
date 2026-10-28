import { LazyMotion, domAnimation } from 'motion/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-4 6.3-6.5, held moves: a burst is one write, Command Z undoes, every write carries the version it read, and a write
 * that comes back stale, gone or refused says so with its own number. Mocks as in calendar-past.test.tsx.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy, hapticScrub: vi.fn() }));
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
  updateGolfEvent: vi.fn(),
  editRecurringEvent: vi.fn(),
  getEventDocuments: vi.fn(),
  getCalendarFeeds: vi.fn(),
  getAttendanceReport: vi.fn(),
  getDocuments: vi.fn(),
}));
vi.mock('@/app/golf/actions/calendar-events', () => ({ createGolfEvent: a.ok, updateGolfEvent: a.updateGolfEvent, deleteGolfEvent: a.ok, respondToEvent: a.ok }));
vi.mock('@/app/golf/actions/calendar-blocked-time', () => ({ addCoachBlockedTime: a.ok, deleteCoachBlockedTime: a.ok }));
vi.mock('@/app/golf/actions/recurring-events', () => ({ createRecurringEvent: a.ok, deleteRecurringEvent: a.ok, editRecurringEvent: a.editRecurringEvent }));
vi.mock('@/app/golf/actions/calendar-feeds', () => ({ getCalendarFeeds: a.getCalendarFeeds, createCalendarFeed: a.ok, regenerateCalendarFeed: a.ok, deleteCalendarFeed: a.ok }));
vi.mock('@/app/golf/actions/event-documents', () => ({ getEventDocuments: a.getEventDocuments, attachDocumentToEvent: a.ok, detachDocumentFromEvent: a.ok }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: a.getDocuments }));
vi.mock('@/app/golf/actions/attendance', () => ({ getAttendanceReport: a.getAttendanceReport, markAttendance: a.ok }));
vi.mock('@/app/golf/actions/travel', () => ({ getItineraryForEvent: () => Promise.resolve({ success: true, data: null }) }));

import type { ChCalendarData } from '../data/calendar';
import { Calendar } from '../screens/calendar/Calendar';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_CALENDAR } from '../preview/fixtures-calendar';
import './dialog-polyfill';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
/** Travel briefing (e9) carries a version and asks for replies, so who hears is its six invitees. */
function cal(over: Partial<ChCalendarData> = {}): ChCalendarData {
  return {
    ...PREVIEW_CALENDAR,
    events: PREVIEW_CALENDAR.events.map((e) => (e.id === 'e9' ? { ...e, version: '2026-10-14 18:00:00.123456+00', rsvpRequired: true } : e)),
    ...over,
  };
}
function wrap(data: ChCalendarData) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Calendar data={data} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
const block = (name: RegExp) => screen.getAllByRole('button', { name }).find((b) => b.classList.contains('ch-ev'))!;
const nudge = (keys: { shiftKey?: boolean; key?: string } = {}) => fireEvent.keyDown(block(/^Travel briefing/), { key: 'ArrowDown', altKey: true, ...keys });
const expire = () =>
  act(async () => {
    vi.advanceTimersByTime(4000);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  a.updateGolfEvent.mockReset().mockResolvedValue({ success: true, data: { updatedAt: '2026-10-14 18:05:00.5+00' } });
  a.editRecurringEvent.mockReset().mockResolvedValue({ success: true });
  a.getEventDocuments.mockResolvedValue({ success: true, data: [] });
  a.getCalendarFeeds.mockResolvedValue({ success: true, data: [] });
  a.getAttendanceReport.mockResolvedValue({ success: true, data: [] });
  a.getDocuments.mockResolvedValue({ success: true, data: [] });
  hapticSpy.mockClear();
  router.refresh.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('P-4 held moves', () => {
  it('four nudges are one write with the final time, sent with the version the page read, untouched', async () => {
    wrap(cal());
    for (let i = 0; i < 4; i++) nudge();
    expect(screen.getByText('Moved to 2:30 PM')).toBeTruthy();
    expect(a.updateGolfEvent).not.toHaveBeenCalled();
    await expire();
    expect(a.updateGolfEvent).toHaveBeenCalledTimes(1);
    expect(a.updateGolfEvent).toHaveBeenCalledWith('e9', expect.objectContaining({ startTime: '14:30', endTime: '15:15', expectedUpdatedAt: '2026-10-14 18:00:00.123456+00' }));
  });

  it('a move of another event writes the first at once', () => {
    wrap(cal());
    nudge();
    fireEvent.keyDown(block(/^Course prep · 9 holes/), { key: 'ArrowDown', altKey: true });
    expect(a.updateGolfEvent).toHaveBeenCalledTimes(1);
    expect(a.updateGolfEvent).toHaveBeenCalledWith('e9', expect.objectContaining({ startTime: '13:45' }));
  });

  it('Command Z undoes the held move and says so; nothing is written', async () => {
    wrap(cal());
    nudge();
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect(block(/^Travel briefing/).getAttribute('aria-label')).toMatch(/1:30 – 2:15 PM/);
    expect(code('CH-6805')!.textContent).toBe('Move undone.');
    await expire();
    expect(a.updateGolfEvent).not.toHaveBeenCalled();
  });

  it('CH-6805 a completed move is said once, with its day; the notice says who will be told', () => {
    wrap(cal());
    nudge();
    expect(code('CH-6805')!.textContent).toMatch(/^Travel briefing moved to 1:45 PM, Thursday 15 October\. Undo with (Command|Control) Z\.$/);
    expect(screen.getByText('6 players will be told.')).toBeTruthy();
  });

  it('Alt+Shift+Down stretches the end 15 minutes: "Ends at 2:30 PM"', async () => {
    wrap(cal());
    nudge({ shiftKey: true });
    expect(screen.getByText('Ends at 2:30 PM')).toBeTruthy();
    await expire();
    expect(a.updateGolfEvent).toHaveBeenCalledWith('e9', expect.objectContaining({ startTime: '13:30', endTime: '14:30' }));
  });



  describe('a series (P-4 4.8, 6.4)', () => {
    const series = () => block(/^Short-game block/);
    it('a drop asks first, "This event" focused; This and following writes the rest with the version, one toast', async () => {
      wrap(cal({ events: PREVIEW_CALENDAR.events.map((e) => (e.id === 'e4' ? { ...e, version: 'vs' } : e)) }));
      fireEvent.keyDown(series(), { key: 'ArrowDown', altKey: true });
      const menu = screen.getByRole('menu', { name: 'Repeating event' });
      expect(menu).toBeTruthy();
      // Held where it would land while the question is open.
      expect(series().getAttribute('aria-label')).toMatch(/3:45 – 5:15 PM/);
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'This and following' }));
      expect(screen.getByText('Moved this and following to 3:45 PM')).toBeTruthy();
      expect(screen.getByText(/^Every Wednesday from Oct 14\./)).toBeTruthy();
      // A further nudge keeps the answer, unasked.
      fireEvent.keyDown(series(), { key: 'ArrowDown', altKey: true });
      expect(screen.queryByRole('menu', { name: 'Repeating event' })).toBeNull();
      await expire();
      expect(a.editRecurringEvent).toHaveBeenCalledTimes(1);
      expect(a.editRecurringEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e4', scope: 'thisAndFuture', expectedUpdatedAt: 'vs', updates: expect.objectContaining({ startTime: '16:00', endTime: '17:30' }) }));
      expect(a.updateGolfEvent).not.toHaveBeenCalled();
    });

    it('This event writes only that occurrence; another day offers only This event, with the reason', () => {
      wrap(cal());
      fireEvent.keyDown(series(), { key: 'ArrowRight', altKey: true });
      const later = screen.getByRole('menuitemradio', { name: 'This and following' });
      expect(later.getAttribute('aria-disabled')).toBe('true');
      expect(screen.getByText('To move the series to another day, use Edit.')).toBeTruthy();
      fireEvent.click(later);
      expect(screen.getByRole('menu', { name: 'Repeating event' })).toBeTruthy();
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'This event' }));
      expect(screen.getByText('Moved this event to 3:30 PM on Thu 15')).toBeTruthy();
    });

    it('Escape cancels: the event goes back and nothing is held', async () => {
      wrap(cal());
      fireEvent.keyDown(series(), { key: 'ArrowDown', altKey: true });
      fireEvent.keyDown(screen.getByRole('menu', { name: 'Repeating event' }), { key: 'Escape' });
      expect(screen.queryByRole('menu', { name: 'Repeating event' })).toBeNull();
      expect(series().getAttribute('aria-label')).toMatch(/3:30 – 5:00 PM/);
      await expire();
      expect(a.updateGolfEvent).not.toHaveBeenCalled();
      expect(a.editRecurringEvent).not.toHaveBeenCalled();
    });
  });

  describe('offline: the move waits for a connection, and leaving drops it', () => {
    let line: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      line = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    });
    afterEach(() => line.mockRestore());
    const reconnect = () =>
      act(async () => {
        line.mockReturnValue(true);
        window.dispatchEvent(new Event('online'));
      });

    it('staying on the page, the waiting move writes once on reconnect', async () => {
      wrap(cal());
      nudge();
      line.mockReturnValue(false);
      await expire();
      expect(screen.getByText('Waiting for a connection to save')).toBeTruthy();
      expect(a.updateGolfEvent).not.toHaveBeenCalled();
      await reconnect();
      await reconnect();
      expect(a.updateGolfEvent).toHaveBeenCalledTimes(1);
      expect(a.updateGolfEvent).toHaveBeenCalledWith('e9', expect.objectContaining({ startTime: '13:45' }));
    });

    it('a move waiting for a connection is dropped when the coach leaves: reconnecting afterwards writes nothing', async () => {
      const page = wrap(cal());
      nudge();
      line.mockReturnValue(false);
      await expire();
      expect(screen.getByText('Waiting for a connection to save')).toBeTruthy();
      const removed = vi.spyOn(window, 'removeEventListener');
      page.unmount();
      expect(removed.mock.calls.some(([type]) => type === 'online')).toBe(true);
      removed.mockRestore();
      await reconnect();
      expect(a.updateGolfEvent).not.toHaveBeenCalled();
    });

    it('a move waiting for a connection is dropped on pagehide too: a page restored from the back-forward cache writes nothing on reconnect', async () => {
      wrap(cal());
      nudge();
      line.mockReturnValue(false);
      await expire();
      expect(screen.getByText('Waiting for a connection to save')).toBeTruthy();
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      await reconnect();
      expect(a.updateGolfEvent).not.toHaveBeenCalled();
    });

    it('a move still in its Undo window when the coach leaves offline is dropped, not queued', async () => {
      const page = wrap(cal());
      nudge();
      line.mockReturnValue(false);
      page.unmount();
      await reconnect();
      await expire();
      expect(a.updateGolfEvent).not.toHaveBeenCalled();
    });

    it('leaving online still writes the held move at once, as before', () => {
      const page = wrap(cal());
      nudge();
      page.unmount();
      expect(a.updateGolfEvent).toHaveBeenCalledTimes(1);
    });
  });
});

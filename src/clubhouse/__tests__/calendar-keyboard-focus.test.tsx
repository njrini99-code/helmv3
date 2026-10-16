import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

import type { ChCalendarData } from '../data/calendar';
import { Calendar } from '../screens/calendar/Calendar';
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
const title = () => screen.getByRole('heading', { level: 1 }).textContent;
const block = (name: RegExp) => screen.getAllByRole('button', { name }).find((b) => b.classList.contains('ch-ev'))!;
const roles = [
  ['coach', PREVIEW_CALENDAR],
  ['player', PREVIEW_CALENDAR_PLAYER],
] as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
  router.push.mockClear();
  for (const f of Object.values(a)) f.mockReset();
  a.ok.mockResolvedValue({ success: true });
  a.getEventDocuments.mockResolvedValue({ success: true, data: [] });
  a.getCalendarFeeds.mockResolvedValue({ success: true, data: [] });
  a.getDocuments.mockResolvedValue({ success: true, data: [] });
  a.getAttendanceReport.mockResolvedValue({ success: true, data: { attendance: [] } });
});
afterEach(() => vi.useRealTimers());

describe.each(roles)('Calendar keyboard · %s', (_role, data) => {
  it('A-09 the arrows on the View radios change the view only; the day, week or month on show stays', async () => {
    const user = userEvent.setup();
    const replace = vi.spyOn(window.history, 'replaceState');
    try {
      wrap({ ...data, view: 'day' });
      expect(title()).toBe('Wed, 14 October');
      screen.getByRole('radio', { name: 'Day' }).focus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('radio', { name: 'Week' }).getAttribute('aria-checked')).toBe('true');
      expect(title()).toBe('Oct 11 – 17');
      expect(replace).toHaveBeenLastCalledWith(null, '', '/golf/dashboard/calendar');
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('radio', { name: 'Month' }).getAttribute('aria-checked')).toBe('true');
      expect(title()).toBe('October');
      expect(replace).toHaveBeenLastCalledWith(null, '', '/golf/dashboard/calendar?view=month');
      await user.keyboard('{ArrowLeft}');
      expect(screen.getByRole('radio', { name: 'Week' }).getAttribute('aria-checked')).toBe('true');
      expect(title()).toBe('Oct 11 – 17');
      expect(router.push).not.toHaveBeenCalled();
      // Off the radios, the arrows still step the week.
      (document.activeElement as HTMLElement).blur();
      await user.keyboard('{ArrowRight}');
      expect(title()).toBe('Oct 18 – 24');
    } finally {
      replace.mockRestore();
    }
  });

  it('A-23 the jump panel takes focus as it opens; Esc, Close and a picked day hand it back to the title, and Esc leaves the open event alone', async () => {
    const user = userEvent.setup();
    wrap(data, { initialEvent: 'e9' });
    const trigger = screen.getByRole('button', { name: /Jump to a date/ });
    await user.click(trigger);
    const panel = screen.getByRole('dialog', { name: 'Jump to a date' });
    expect(panel.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Jump to a date' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // The panel's Esc was its own: the event's panel is still open.
    expect(screen.getByRole('heading', { level: 2, name: 'Travel briefing' })).toBeTruthy();

    await user.click(trigger);
    await user.click(within(screen.getByRole('dialog', { name: 'Jump to a date' })).getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    await user.click(within(screen.getByRole('dialog', { name: 'Jump to a date' })).getByRole('button', { name: '21 October' }));
    expect(title()).toBe('Oct 18 – 24');
    expect(document.activeElement).toBe(trigger);
  });

  it('A-23 the jump panel leaves on an exit: the copy on its way out is out of the accessibility tree and takes no input', async () => {
    const user = userEvent.setup();
    wrap(data);
    await user.click(screen.getByRole('button', { name: /Jump to a date/ }));
    await user.keyboard('{Escape}');
    const leaving = document.querySelector<HTMLElement>('.ch-cal-jump');
    expect(leaving).not.toBeNull();
    expect(leaving!.getAttribute('aria-hidden')).toBe('true');
    expect(leaving!.hasAttribute('inert')).toBe(true);
    await waitFor(() => expect(document.querySelector('.ch-cal-jump')).toBeNull());
  });

  it('A-25 Enter on an event takes focus into its panel; Esc closes it and hands focus back to the event', async () => {
    const user = userEvent.setup();
    wrap(data);
    const ev = block(/^Travel briefing/);
    ev.focus();
    await user.keyboard('{Enter}');
    const heading = screen.getByRole('heading', { level: 2, name: 'Travel briefing' });
    expect(document.activeElement).toBe(heading);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('heading', { level: 2, name: 'Travel briefing' })).toBeNull();
    expect(document.activeElement).toBe(ev);
  });

  it('A-25 Back from a panel opened with the keyboard hands focus back to the event', async () => {
    const user = userEvent.setup();
    wrap(data);
    const ev = block(/^Travel briefing/);
    ev.focus();
    await user.keyboard('{Enter}');
    within(document.querySelector<HTMLElement>('aside.ch-in-wrap')!).getByRole('button', { name: 'Today' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('heading', { level: 2, name: 'Travel briefing' })).toBeNull();
    expect(document.activeElement).toBe(ev);
  });

  it('A-23 a press on the title while the jump panel is open closes it, rather than reopening it', async () => {
    const user = userEvent.setup();
    wrap(data);
    const trigger = screen.getByRole('button', { name: /Jump to a date/ });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Jump to a date' })).toBeTruthy();
    await user.click(trigger);
    expect(screen.queryByRole('dialog', { name: 'Jump to a date' })).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('A-25 a click on an event opens its panel without moving focus there', async () => {
    const user = userEvent.setup();
    wrap(data);
    await user.click(block(/^Travel briefing/));
    const heading = screen.getByRole('heading', { level: 2, name: 'Travel briefing' });
    expect(document.activeElement).not.toBe(heading);
  });
});

describe('Calendar keyboard · coach only', () => {
  it('A-14 a new event opens on its title field; an edit opens on its heading', async () => {
    const user = userEvent.setup();
    const view = wrap(PREVIEW_CALENDAR, { initialNew: true });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Event title' }));
    view.unmount();
    wrap(PREVIEW_CALENDAR, { initialEvent: 'e9' });
    await user.click(screen.getByRole('button', { name: 'Edit event' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Edit event' }));
  });

  it('A-14 on the phone a new event opens on its heading, so the keyboard does not rise over the sheet', () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    try {
      wrap(PREVIEW_CALENDAR, { initialNew: true });
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'New event' }));
    } finally {
      window.matchMedia = real;
    }
  });

  it('A-24 the people picker takes focus into its search as it opens; Esc and Done hand it back to its button, and Esc leaves the open event alone', async () => {
    const user = userEvent.setup();
    wrap(PREVIEW_CALENDAR, { initialEvent: 'e9' });
    const trigger = screen.getByRole('button', { name: /^People:/ });
    await user.click(trigger);
    const pop = screen.getByRole('dialog', { name: 'Choose people' });
    expect(document.activeElement).toBe(within(pop).getByRole('searchbox', { name: 'Find a player' }));
    // From a row (not the search, which keeps its own keys), Esc closes the picker only.
    within(pop).getByRole('button', { name: /Everyone/ }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Choose people' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole('heading', { level: 2, name: 'Travel briefing' })).toBeTruthy();

    await user.click(trigger);
    await user.click(within(screen.getByRole('dialog', { name: 'Choose people' })).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Choose people' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

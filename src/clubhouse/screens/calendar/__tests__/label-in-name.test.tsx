import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), redirect: vi.fn() }));
vi.mock('../../../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../../../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
const ok = vi.hoisted(() => vi.fn(() => Promise.resolve({ success: true, data: [] })));
vi.mock('@/app/golf/actions/calendar-events', () => ({ createGolfEvent: ok, updateGolfEvent: ok, deleteGolfEvent: ok, respondToEvent: ok }));
vi.mock('@/app/golf/actions/calendar-blocked-time', () => ({ addCoachBlockedTime: ok, deleteCoachBlockedTime: ok }));
vi.mock('@/app/golf/actions/recurring-events', () => ({ createRecurringEvent: ok, deleteRecurringEvent: ok, editRecurringEvent: ok }));
vi.mock('@/app/golf/actions/calendar-feeds', () => ({ getCalendarFeeds: ok, createCalendarFeed: ok, regenerateCalendarFeed: ok, deleteCalendarFeed: ok }));
vi.mock('@/app/golf/actions/event-documents', () => ({ getEventDocuments: ok, attachDocumentToEvent: ok, detachDocumentFromEvent: ok }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: ok }));
vi.mock('@/app/golf/actions/attendance', () => ({ getAttendanceReport: ok, markAttendance: ok }));
vi.mock('@/app/golf/actions/travel', () => ({ getItineraryForEvent: () => Promise.resolve({ success: true, data: null }) }));
// The phone layout, when a case asks for it.
const phone = vi.hoisted(() => ({ on: false }));
vi.mock('../../../lib/use-phone', async (orig) => ({ ...(await orig<object>()), useChPhone: () => phone.on }));

import type { ChCalendarData } from '../../../data/calendar';
import { Calendar } from '../Calendar';
import { ToastProvider } from '../../../ui/Toast';
import { PREVIEW_CALENDAR, PREVIEW_CALENDAR_EMPTY, PREVIEW_CALENDAR_FAILED, PREVIEW_CALENDAR_PARTIAL, PREVIEW_CALENDAR_PLAYER } from '../../../preview/fixtures-calendar';
import { accessibleName, expectLabelInName, labelMismatches } from '../../../__tests__/label-in-name';
import '../../../__tests__/dialog-polyfill';

afterEach(() => {
  cleanup();
  phone.on = false;
});

function mount(data: ChCalendarData, props: { initialEvent?: string } = {}) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Calendar frozen data={data} {...props} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}

/** Every event on screen, in each of the shapes the calendar draws one. */
const EVENTS = '.ch-ev:not([aria-hidden="true"]), .ch-ev-bar, .ch-mo__ev, .ch-mo__ribbon, .ch-calm-ev';
/** The title an event control shows: the block's or row's title line, or a chip's or bar's name. */
const drawnTitle = (el: Element) => (el.querySelector('.ch-ev__t, .ch-calm-ev__b > b, .ch-ev-bar > span:not(.ch-sr-only), .ch-mo__ev > span:not(.ch-sr-only), .ch-mo__ribbon > span:not(.ch-sr-only)')?.textContent ?? '').trim();

/**
 * SWP-03 (P2-222; WCAG 2.5.3 Label in Name, axe label-content-name-mismatch): the production audit's UI sweep found
 * Calendar's controls named in other words than they show, in every state it opened (20 on the week, 19 with an event
 * open, 17 for the player and with partial data, 8 empty, 1 failed). The day heads drew "Sun" over "11" with no space
 * between (a face of "Sun11"); the people control's face held the faces' initials; and every event, on the week, the
 * month and the phone, was named "Strength, 6:30 – 7:30 AM" over "Strength" and "6:30 AM – 7:30 AM", so a Voice Control
 * user who said what they saw reached nothing.
 */
describe('Calendar · every control is named by what it shows (SWP-03)', () => {
  const states: [string, ChCalendarData, { initialEvent?: string }?][] = [
    ['the week', { ...PREVIEW_CALENDAR, view: 'week' }],
    ['a day', { ...PREVIEW_CALENDAR, view: 'day' }],
    ['the month', { ...PREVIEW_CALENDAR, view: 'month' }],
    ['the agenda', { ...PREVIEW_CALENDAR, view: 'agenda' }],
    ['an event open', { ...PREVIEW_CALENDAR }, { initialEvent: 'e9' }],
    ['empty', PREVIEW_CALENDAR_EMPTY],
    ['failed', PREVIEW_CALENDAR_FAILED],
    ['partial', PREVIEW_CALENDAR_PARTIAL],
    ['the player', PREVIEW_CALENDAR_PLAYER],
  ];

  it.each(states)('%s, desktop: no control’s name leaves out the words on its face', (_, data, props) => {
    mount(data, props);
    expect(labelMismatches(document.body)).toEqual([]);
  });

  it.each(states)('%s, phone: no control’s name leaves out the words on its face', (_, data, props) => {
    phone.on = true;
    mount(data, props);
    expect(labelMismatches(document.body)).toEqual([]);
  });

  it.each([
    ['desktop week', false, 'week'],
    ['desktop month', false, 'month'],
    ['phone', true, 'week'],
  ] as const)('%s: each event is named by its own content, opening with the title it draws', (_, onPhone, view) => {
    phone.on = onPhone;
    mount({ ...PREVIEW_CALENDAR, view });
    const events = Array.from(document.querySelectorAll(EVENTS));
    expect(events.length).toBeGreaterThan(3);
    for (const el of events) {
      expect(el, drawnTitle(el)).not.toHaveAttribute('aria-label');
      expectLabelInName(el, drawnTitle(el));
    }
  });

  it('a week block says its time and state in words after its title; the drawn time, pill and old values are for the eye', () => {
    mount({ ...PREVIEW_CALENDAR, view: 'week' });
    const travel = screen.getByRole('button', { name: /^Travel briefing,/ });
    expect(accessibleName(travel)).toBe('Travel briefing, 1:30 – 2:15 PM. Alt and the arrow keys move it; add Shift to change its length');
    expect(travel.querySelector('.ch-ev__m')).toHaveAttribute('aria-hidden', 'true');
    const jonah = screen.getByRole('button', { name: /^1:1 with Jonah,/ });
    expect(accessibleName(jonah)).toMatch(/^1:1 with Jonah, 4:45 – 5:30 PM, schedule overlap\./);
  });

  it('a day head reads "Sun 11" as it is drawn, and its name begins there', () => {
    mount({ ...PREVIEW_CALENDAR, view: 'week' });
    const day = screen.getByRole('button', { name: /^Wed 14 October, today/ });
    expectLabelInName(day, 'Wed 14');
  });

  it('the people control is named by its words, then what it does; the faces are for the eye', () => {
    mount(PREVIEW_CALENDAR);
    const trigger = screen.getByRole('button', { name: /choose people$/ });
    expect(trigger).not.toHaveAttribute('aria-label');
    expect(accessibleName(trigger)).toBe('Everyone Team schedule · 6 players, choose people');
    expectLabelInName(trigger, 'Everyone');
    expect(trigger.querySelector('.ch-pp__stack')).toHaveAttribute('aria-hidden', 'true');
  });

  it('a phone row says its time and state after its title; its badge, place line and time column are for the eye', () => {
    phone.on = true;
    mount({ ...PREVIEW_CALENDAR, view: 'week' });
    const rows = Array.from(document.querySelectorAll('.ch-calm-ev'));
    const jonah = rows.find((r) => accessibleName(r).startsWith('1:1 with Jonah'))!;
    expect(jonah, rows.map(accessibleName).join(' | ')).toBeDefined();
    expect(accessibleName(jonah)).toBe('1:1 with Jonah, 4:45 PM to 5:30 PM, overlaps Short-game block');
    expect(jonah.querySelector('.ch-calm-ev__t')).toHaveAttribute('aria-hidden', 'true');
  });
});

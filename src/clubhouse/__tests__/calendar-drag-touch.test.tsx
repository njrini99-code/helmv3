// @vitest-environment jsdom
import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import './dialog-polyfill';

const hapticSpy = vi.hoisted(() => vi.fn());
const scrubSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy, hapticScrub: scrubSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/calendar' }));

import type { ChCalendarData } from '../data/calendar';
import { touchClaim } from '../lib/touch-claim';
import { PEEK_HOLD_MS } from '../ui/Peek';
import { CalendarPhone } from '../screens/calendar/CalendarPhone';
import { dayBounds, FOLD_MS, PHONE_HH } from '../screens/calendar/day-timeline';
import type { ChMoveTarget } from '../screens/calendar/drag-model';
import type { ChCalEvent } from '../screens/calendar/model';

/** P-4 4.7: the phone Day's hold, lift, unfold, drag, drop and fold; Adjust time; the hint; pull to refresh's yield. */

beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class FakePointer extends MouseEvent {
      pointerType: string;
      isPrimary: boolean;
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? 'mouse';
        this.isPrimary = init.isPrimary ?? true;
        this.pointerId = init.pointerId ?? 1;
      }
    }
    (window as unknown as { PointerEvent: typeof FakePointer }).PointerEvent = FakePointer;
  }
  if (typeof CSS === 'undefined' || !CSS.escape) (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s };
});

function ev(over: Partial<ChCalEvent> & { id: string }): ChCalEvent {
  return {
    type: 'practice',
    title: over.id,
    date: '2026-10-14',
    start: 15.5,
    end: 17.5,
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
    startIso: '2026-10-14T19:30:00Z',
    span: null,
    ...over,
  } as ChCalEvent;
}
const PRACTICE = ev({ id: 'Practice' });
const CLASS = ev({ id: 'ECON 101', type: 'class', start: 9, end: 10 });

function data(role: 'coach' | 'player', events: ChCalEvent[]): ChCalendarData {
  return {
    role,
    teamId: 't',
    viewerPlayerId: role === 'player' ? 'p1' : null,
    teamName: 'Team',
    timezone: 'America/New_York',
    zoneLabel: 'Eastern time',
    today: '2026-10-14',
    nowHour: 8,
    view: 'day',
    anchor: '2026-10-14',
    range: { from: '2026-10-11', to: '2026-10-24' },
    events,
    people: [],
    eventsError: false,
    firstRun: false,
    rsvpError: false,
    classesError: false,
    settingsError: false,
    busyError: false,
  };
}

type MoveFn = Mock<(e: ChCalEvent, to: ChMoveTarget, kind: 'move' | 'resize') => void>;
function phone({ role = 'coach', onMove = vi.fn() as MoveFn, onDay = vi.fn() as Mock<(d: string) => void>, events = [PRACTICE, CLASS] }: { role?: 'coach' | 'player'; onMove?: MoveFn; onDay?: Mock<(d: string) => void>; events?: ChCalEvent[] } = {}) {
  const view = render(
    <LazyMotion features={domAnimation}>
      <CalendarPhone
        data={data(role, events)}
        events={events}
        people={new Map()}
        now={{ date: '2026-10-14', hour: 8 }}
        anchor="2026-10-14"
        view="day"
        flagged={new Set()}
        selId={null}
        notices={null}
        onView={(_, d) => onDay(d)}
        onStep={() => {}}
        onOpen={() => {}}
        onNew={() => {}}
        onSubscribe={() => {}}
        onMove={role === 'coach' ? onMove : undefined}
      />
    </LazyMotion>,
  );
  const row = () => view.container.querySelector<HTMLElement>('.ch-calm-page:not(.is-side) [data-ev-id="Practice"] .ch-calm-ev')!;
  return { ...view, onMove, onDay, row };
}

let rect: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  // The timeline's grid starts at the top of the page; everything else draws at the origin.
  rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const r = { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 };
    if ((this as HTMLElement).classList?.contains('ch-calm-ev')) return { ...r, top: 300, bottom: 360, left: 4, width: 382, height: 60 } as DOMRect;
    return r as DOMRect;
  });
  window.scrollBy = vi.fn() as typeof window.scrollBy;
  try {
    window.localStorage.clear();
  } catch {
    // no storage
  }
});
afterEach(() => {
  rect.mockRestore();
  cleanup();
  vi.useRealTimers();
  hapticSpy.mockReset();
  scrubSpy.mockReset();
});

const down = (el: HTMLElement, x = 200, y = 320) => {
  fireEvent.touchStart(el, { touches: [{ clientX: x, clientY: y }] });
  fireEvent.pointerDown(el, { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: x, clientY: y });
};
const touchMove = (el: HTMLElement, x: number, y: number) => {
  fireEvent.pointerMove(el, { pointerType: 'touch', pointerId: 1, clientX: x, clientY: y });
  fireEvent.touchMove(el, { touches: [{ clientX: x, clientY: y }] });
};
const hold = (ms = PEEK_HOLD_MS) => act(() => vi.advanceTimersByTime(ms));

describe('the hold', () => {
  it('449ms does nothing; 450ms lifts with the peek’s one select tick and never press', () => {
    const { row } = phone();
    down(row());
    hold(PEEK_HOLD_MS - 1);
    expect(row().classList.contains('is-lifted')).toBe(false);
    expect(hapticSpy).not.toHaveBeenCalled();
    hold(1);
    expect(row().classList.contains('is-lifted')).toBe(true);
    expect(hapticSpy.mock.calls.filter(([k]) => k === 'select')).toHaveLength(1);
    expect(hapticSpy).not.toHaveBeenCalledWith('press');
    expect(touchClaim()).toBe('lifted');
    // No peek opened: the row is in hand.
    expect(document.querySelector('dialog.ch-peek[open]')).toBeNull();
  });

  it('a 10px move before 450ms cancels; so does a scroll', () => {
    const a = phone();
    down(a.row());
    touchMove(a.row(), 200, 332);
    hold(PEEK_HOLD_MS + 10);
    expect(a.row().classList.contains('is-lifted')).toBe(false);
    cleanup();
    const b = phone();
    down(b.row());
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    hold(PEEK_HOLD_MS + 10);
    expect(b.row().classList.contains('is-lifted')).toBe(false);
  });

  it('let go without moving: it settles and the peek opens', () => {
    const { row } = phone();
    down(row());
    hold();
    fireEvent.pointerUp(row(), { pointerType: 'touch', pointerId: 1 });
    expect(row().classList.contains('is-lifted')).toBe(false);
    expect(document.querySelector('dialog.ch-peek')?.hasAttribute('open')).toBe(true);
  });

  it('a hold within 24px of the edge is the edge swipe’s; a player row and a class never lift', () => {
    const a = phone();
    down(a.row(), 10, 320);
    hold();
    expect(a.row().classList.contains('is-lifted')).toBe(false);
    cleanup();
    const p = phone({ role: 'player' });
    down(p.row());
    hold();
    expect(p.row().classList.contains('is-lifted')).toBe(false);
    expect(p.container.querySelector('[data-ev-id="ECON 101"] .ch-calm-ev.is-movable')).toBeNull();
  });
});

describe('the drag', () => {
  it('a move after the lift unfolds the day into hours under the finger, the row staying in the document', () => {
    const { row, container } = phone();
    const touched = row();
    down(touched);
    hold();
    touchMove(touched, 200, 332);
    expect(container.querySelector('.ch-tl')).not.toBeNull();
    expect(container.querySelector('.ch-calm-dayv.is-unfolded')).not.toBeNull();
    // The row the finger is on is still mounted (WebKit sends a detached node's touchmoves nowhere).
    expect(touched.isConnected).toBe(true);
    expect(container.querySelector('[data-frozen]')).not.toBeNull();
  });

  it('each quarter ticks hapticScrub step at most once per 80ms; the drop is held and the day folds after 600ms', () => {
    const { row, container, onMove } = phone();
    const touched = row();
    down(touched);
    hold();
    touchMove(touched, 200, 332);
    const b = dayBounds([PRACTICE, CLASS], '2026-10-14');
    // The grid's top is 0 and the grab 20px into the row: a finger at y puts the start at from + (y - 20) / 64.
    const at = (h: number) => 20 + (h - b.from) * PHONE_HH;
    // The unfold placed the card (one tick); quarters crossed in the same 80ms give no more.
    touchMove(touched, 200, at(15.75));
    touchMove(touched, 200, at(16));
    touchMove(touched, 200, at(16.25));
    const steps = () => scrubSpy.mock.calls.filter(([k]) => k === 'step').length;
    expect(steps()).toBe(1);
    act(() => vi.advanceTimersByTime(100));
    touchMove(touched, 200, at(16.5));
    expect(steps()).toBe(2);
    fireEvent.touchEnd(touched);
    expect(onMove).toHaveBeenCalledWith(PRACTICE, { date: '2026-10-14', start: 16.5, end: 18.5 }, 'move');
    expect(scrubSpy).toHaveBeenCalledWith('end');
    expect(container.querySelector('.ch-tl')).not.toBeNull();
    act(() => vi.advanceTimersByTime(FOLD_MS));
    expect(container.querySelector('.ch-tl')).toBeNull();
    // The hint goes after the first successful drag.
    expect(window.localStorage.getItem('ch-cal-drag-hint')).toBe('done');
  });

  it('dropped back on its own slot: nothing is written and the fold is at once', () => {
    const { row, container, onMove } = phone();
    const touched = row();
    down(touched);
    hold();
    touchMove(touched, 200, 332);
    const b = dayBounds([PRACTICE, CLASS], '2026-10-14');
    touchMove(touched, 200, 20 + (15.5 - b.from) * PHONE_HH);
    fireEvent.touchEnd(touched);
    expect(onMove).not.toHaveBeenCalled();
    expect(container.querySelector('.ch-tl')).toBeNull();
  });
});

describe('Adjust time and the hint', () => {
  it('the peek offers Adjust time to a coach; Done holds a resize', () => {
    const { row, container, onMove } = phone();
    down(row());
    hold();
    fireEvent.pointerUp(row(), { pointerType: 'touch', pointerId: 1 });
    // The finger is already up: the peek's keys answer the very next tap.
    const adjust = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) => m.textContent?.includes('Adjust time'))!;
    expect(adjust).toBeTruthy();
    fireEvent.click(adjust);
    expect(container.querySelector('.ch-tl.is-adjust')).not.toBeNull();
    const b = dayBounds([PRACTICE, CLASS], '2026-10-14');
    const grip = container.querySelector<HTMLElement>('.ch-tl__grip.is-bottom')!;
    fireEvent.pointerDown(grip, { pointerType: 'touch', pointerId: 2, clientX: 200, clientY: (17.5 - b.from) * PHONE_HH });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: (18 - b.from) * PHONE_HH }));
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    fireEvent.click([...container.querySelectorAll('button')].find((x) => x.textContent === 'Done')!);
    expect(onMove).toHaveBeenCalledWith(PRACTICE, { date: '2026-10-14', start: 15.5, end: 18 }, 'resize');
  });

  it('“Hold an event to move it.” shows once for a coach with a movable event, and its close remembers', () => {
    const a = phone();
    expect(a.container.textContent).toContain('Hold an event to move it.');
    fireEvent.click(a.getByRole('button', { name: 'Dismiss' }));
    expect(a.container.textContent).not.toContain('Hold an event to move it.');
    cleanup();
    expect(phone().container.textContent).not.toContain('Hold an event to move it.');
    cleanup();
    window.localStorage.clear();
    expect(phone({ role: 'player' }).container.textContent).not.toContain('Hold an event to move it.');
  });
});

describe('another day', () => {
  it('a card held 500ms over a strip day goes there; the page’s day follows after the fold', () => {
    const { row, container, onMove, onDay } = phone();
    const touched = row();
    down(touched);
    hold();
    touchMove(touched, 200, 332);
    const fri = container.querySelector<HTMLElement>('.ch-wks [data-date="2026-10-16"]')!;
    const spot = vi.fn(() => fri);
    (document as unknown as { elementFromPoint: typeof spot }).elementFromPoint = spot;
    touchMove(touched, 200, 40);
    expect(fri.classList.contains('is-drop')).toBe(true);
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('.ch-tl h3')!.textContent).toMatch(/16/);
    spot.mockReturnValue(null as never);
    fireEvent.touchEnd(touched);
    expect(onMove).toHaveBeenCalledWith(PRACTICE, expect.objectContaining({ date: '2026-10-16' }), 'move');
    expect(onDay).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(FOLD_MS));
    expect(onDay).toHaveBeenCalledWith('2026-10-16');
  });

  it('the finger at the screen’s edge for 600ms turns the day, and again every 600ms', () => {
    const { row, container } = phone();
    const touched = row();
    down(touched);
    hold();
    touchMove(touched, 200, 332);
    touchMove(touched, 380, 332);
    act(() => vi.advanceTimersByTime(600));
    expect(container.querySelector('.ch-tl h3')!.textContent).toMatch(/15/);
    act(() => vi.advanceTimersByTime(600));
    expect(container.querySelector('.ch-tl h3')!.textContent).toMatch(/16/);
  });
});

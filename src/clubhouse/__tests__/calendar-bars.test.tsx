// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import type { ChCalEvent } from '../screens/calendar/model';
import { laneBars, respan } from '../screens/calendar/drag-model';
import { TimeGrid } from '../screens/calendar/views';

/** P-4 4.5: all-day events and runs over several days are one bar each in the week's lane, moved and stretched by day. */

const DAYS = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
function ev(over: Partial<ChCalEvent> & { id: string }): ChCalEvent {
  return {
    type: 'travel',
    title: over.id,
    date: '2026-10-20',
    start: null,
    end: null,
    allDay: true,
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
    startIso: '2026-10-20T00:00:00Z',
    span: null,
    ...over,
  } as ChCalEvent;
}
const RUN = respan(ev({ id: 'trip', title: 'Pinehurst trip', type: 'tournament', allDay: false, start: 6, end: 20 }), { from: '2026-10-21', to: '2026-10-23' });

let rect: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const lane = (this as HTMLElement).classList?.contains('ch-wk__allday');
    return (lane ? { top: 0, left: 0, width: 752, height: 30, right: 752, bottom: 30, x: 0, y: 0 } : { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 }) as DOMRect;
  });
});
afterEach(() => {
  rect.mockRestore();
  cleanup();
});
const x = (col: number) => 52 + col * 100 + 50;
const moveTo = (cx: number) =>
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: cx, clientY: 10 }));
  });
const up = () =>
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup'));
  });
function grid(events: ChCalEvent[], onBarMove = vi.fn()) {
  const view = render(<TimeGrid dates={DAYS} events={events} people={new Map()} now={{ date: '2026-10-19', hour: 12 }} selId={null} flagged={new Set()} onSelect={() => {}} onDay={() => {}} onBarMove={onBarMove} />);
  return { ...view, onBarMove };
}

describe('the lane', () => {
  it('a run draws once across its days with its start and end times, and leaves the time grid', () => {
    const { container } = grid(RUN);
    const bars = container.querySelectorAll('.ch-wk__allday .ch-ev-bar');
    expect(bars).toHaveLength(1);
    expect((bars[0] as HTMLElement).style.gridColumn).toBe('5 / 8');
    expect([...bars[0]!.querySelectorAll('.ch-ev-bar__t')].map((t) => t.textContent)).toEqual(['6:00 AM', '8:00 PM']);
    expect(container.querySelector('.ch-wk__grid .ch-ev')).toBeNull();
    expect(bars[0]!.getAttribute('aria-label')).toMatch(/^Pinehurst trip, Wed 21 to Fri 23\./);
  });

  it('stacks overlapping bars in rows; one that began last week is cut with a chevron and has no start grip', () => {
    const early = ev({ id: 'camp', date: '2026-10-18', span: { from: '2026-10-15', to: '2026-10-19' } });
    const bars = laneBars([early, ev({ id: 'a', date: '2026-10-19' }), ...RUN], DAYS);
    expect(bars.map((b) => [b.e.id, b.c0, b.c1, b.row])).toEqual([
      ['camp', 0, 1, 0],
      ['a', 1, 1, 1],
      ['trip', 3, 5, 0],
    ]);
    const { container } = grid([early]);
    const bar = container.querySelector('.ch-ev-bar')!;
    expect(bar.classList.contains('is-clip-start')).toBe(true);
    expect(bar.querySelector('.ch-ev-bar__grip.is-from')).toBeNull();
    expect(bar.querySelector('.ch-ev-bar__grip.is-to')).not.toBeNull();
  });
});

describe('dragging a bar', () => {
  it('moves whole days with its times kept; the pill reads the new days', () => {
    const { container, onBarMove } = grid(RUN);
    const bar = container.querySelector<HTMLElement>('.ch-ev-bar')!;
    fireEvent.pointerDown(bar, { button: 0, pointerType: 'mouse', clientX: x(3), clientY: 10 });
    moveTo(x(4));
    expect(container.querySelector('.ch-dd-pill')!.textContent).toBe('Thu 22 – Sat 24');
    expect(container.querySelector('.ch-ev-bar.is-held')).not.toBeNull();
    up();
    expect(onBarMove).toHaveBeenCalledWith(RUN[0], { from: '2026-10-22', to: '2026-10-24' });
  });

  it('the end grip moves the last day, at least one day', () => {
    const { container, onBarMove } = grid(RUN);
    const grip = container.querySelector('.ch-ev-bar__grip.is-to')!;
    fireEvent.pointerDown(grip, { button: 0, pointerType: 'mouse', clientX: x(5), clientY: 10 });
    moveTo(x(0));
    expect(container.querySelector('.ch-dd-pill')!.textContent).toBe('Now ends Wed 21');
    up();
    expect(onBarMove).toHaveBeenCalledWith(RUN[0], { from: '2026-10-21', to: '2026-10-21' });
  });

  it('Alt+Right moves a day; Alt+Shift+Right adds a last day', () => {
    const { container, onBarMove } = grid(RUN);
    const bar = container.querySelector<HTMLElement>('.ch-ev-bar')!;
    fireEvent.keyDown(bar, { key: 'ArrowRight', altKey: true });
    expect(onBarMove).toHaveBeenLastCalledWith(RUN[0], { from: '2026-10-22', to: '2026-10-24' });
    fireEvent.keyDown(bar, { key: 'ArrowRight', altKey: true, shiftKey: true });
    expect(onBarMove).toHaveBeenLastCalledWith(RUN[0], { from: '2026-10-21', to: '2026-10-24' });
  });

  it('respan lays the days out as the loader does', () => {
    expect(RUN.map((e) => [e.date, e.start, e.end])).toEqual([
      ['2026-10-21', 6, 24],
      ['2026-10-22', 0, 24],
      ['2026-10-23', 0, 20],
    ]);
    expect(respan(RUN[0]!, { from: '2026-10-21', to: '2026-10-21' })).toMatchObject([{ date: '2026-10-21', start: 6, end: 20, span: null }]);
    const allDay = respan(ev({ id: 'q' }), { from: '2026-10-20', to: '2026-10-21' });
    expect(allDay.map((e) => e.date)).toEqual(['2026-10-20', '2026-10-21']);
    expect(allDay[0]!.span).toEqual({ from: '2026-10-20', to: '2026-10-21' });
  });
});

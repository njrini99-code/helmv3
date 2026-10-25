// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scrub = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: scrub }));

import type { ChCalEvent } from '../screens/calendar/model';
import { TimeGrid } from '../screens/calendar/views';

/**
 * P-4 4.3 with a mouse: a press and 5px picks the event up; the card snaps to the quarter it would land on; the grips
 * change one edge (Alt for 5 minutes); Escape cancels; a grip never opens the event. The grid is 52px an hour from
 * 6:00, a 52px rail and seven 100px days.
 */

const DAYS = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
const E: ChCalEvent = {
  id: 'p1',
  type: 'practice',
  title: 'Practice',
  date: '2026-10-20',
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
  startIso: '2026-10-20T13:00:00Z',
  span: null,
};
const y = (h: number) => (h - 6) * 52;
const x = (col: number) => 52 + col * 100 + 50;

let rect: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  scrub.mockClear();
  rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return (this as HTMLElement).classList?.contains('ch-wk__grid') ? ({ top: 0, left: 0, width: 752, height: 780, right: 752, bottom: 780, x: 0, y: 0 } as DOMRect) : ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect);
  });
});
afterEach(() => {
  rect.mockRestore();
  cleanup();
});

function grid(onMove = vi.fn(), onSelect = vi.fn()) {
  const view = render(<TimeGrid dates={DAYS} events={[E]} people={new Map()} now={{ date: '2026-10-19', hour: 12 }} selId={null} flagged={new Set()} onSelect={onSelect} onDay={() => {}} onMove={onMove} />);
  const block = view.container.querySelector<HTMLElement>('.ch-ev[data-ev-id="p1"]')!;
  return { ...view, block, onMove, onSelect };
}
const down = (el: Element, cx: number, cy: number, extra: object = {}) => fireEvent.pointerDown(el, { button: 0, pointerType: 'mouse', clientX: cx, clientY: cy, ...extra });
const moveTo = (cx: number, cy: number, extra: object = {}) =>
  act(() => {
    window.dispatchEvent(Object.assign(new MouseEvent('pointermove', { clientX: cx, clientY: cy, ...extra }), { pointerType: 'mouse' }));
  });
const up = () =>
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup'));
  });

describe('P-4 mouse drag in the week', () => {
  it('moves by quarters and across days, with the card, the footprint and the pill; drops on release', () => {
    const { block, onMove, container } = grid();
    down(block, x(2), y(9) + 10);
    moveTo(x(2), y(9) + 12);
    // Under 5px: nothing yet.
    expect(container.querySelector('.ch-dd-card')).toBeNull();
    moveTo(x(3), y(10) + 10);
    expect(container.querySelector('.ch-ev.is-held[data-ev-id="p1"]')).not.toBeNull();
    expect(container.querySelector('.ch-dd-card .ch-ev.is-card')).not.toBeNull();
    expect(container.querySelector('.ch-dd-pill')!.textContent).toBe('Wed 21 · 10:00 – 11:00 AM');
    expect(container.querySelectorAll('.ch-wk__col')[3]!.classList.contains('is-target')).toBe(true);
    up();
    expect(onMove).toHaveBeenCalledWith(E, { date: '2026-10-21', start: 10, end: 11 }, 'move');
    expect(container.querySelector('.ch-dd-card')).toBeNull();
    expect(scrub.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['start', 'end']));
  });

  it('Escape cancels and nothing moves', () => {
    const { block, onMove, container } = grid();
    down(block, x(2), y(9) + 10);
    moveTo(x(2), y(11));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(container.querySelector('.ch-dd-card')).toBeNull();
    up();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('the bottom grip stretches the end in quarters; Alt in 5 minutes; it never opens the event', () => {
    const { block, onMove, onSelect, container } = grid();
    const bottom = block.querySelector('.ch-ev__grip.is-bottom')!;
    down(bottom, x(2), y(10) - 2);
    moveTo(x(2), y(10.5));
    expect(container.querySelector('.ch-dd-pill')!.textContent).toBe('Ends 10:30 AM · 1 hr 30 min');
    up();
    expect(onMove).toHaveBeenLastCalledWith(E, { date: '2026-10-20', start: 9, end: 10.5 }, 'resize');
    fireEvent.click(bottom);
    expect(onSelect).not.toHaveBeenCalled();

    down(block.querySelector('.ch-ev__grip.is-bottom')!, x(2), y(10) - 2);
    moveTo(x(2), y(10 + 10 / 60), { altKey: true });
    up();
    expect(onMove.mock.calls.at(-1)![1].end).toBeCloseTo(10 + 10 / 60, 5);
  });

  it('the top grip moves the start and keeps at least 15 minutes', () => {
    const { block, onMove } = grid();
    down(block.querySelector('.ch-ev__grip.is-top')!, x(2), y(9) + 2);
    moveTo(x(2), y(12));
    up();
    expect(onMove).toHaveBeenLastCalledWith(E, { date: '2026-10-20', start: 9.75, end: 10 }, 'resize');
  });
});

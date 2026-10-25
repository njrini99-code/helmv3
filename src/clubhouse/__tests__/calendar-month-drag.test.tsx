// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import type { ChCalEvent } from '../screens/calendar/model';
import { DndMonth, monthAnnouncements } from '../screens/calendar/month-dnd';

/** P-4 4.4: the desktop Month as gridcells, with ribbons, roving focus and drag to another day. */

afterEach(cleanup);
function ev(over: Partial<ChCalEvent> & { id: string }): ChCalEvent {
  return {
    type: 'qualifier',
    title: over.id,
    date: '2026-10-15',
    start: 8.7,
    end: 13,
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
    startIso: '2026-10-15T12:42:00Z',
    span: null,
    ...over,
  } as ChCalEvent;
}
const Q = ev({ id: 'Fall qualifier R2' });
const TRIP = ['2026-10-16', '2026-10-17', '2026-10-18'].map((d) => ev({ id: 'trip', title: 'Pinehurst trip', type: 'travel', date: d, allDay: true, start: null, end: null, span: { from: '2026-10-16', to: '2026-10-18' } }));

function month(onMove = vi.fn(), onBarMove = vi.fn(), coach = true) {
  const view = render(<DndMonth anchor="2026-10-14" events={[Q, ...TRIP]} now={{ date: '2026-10-14' }} selDate="2026-10-14" onPick={() => {}} onMove={onMove} onBarMove={onBarMove} coach={coach} />);
  return { ...view, onMove, onBarMove };
}

describe('the month grid', () => {
  it('is a grid of rows and gridcells; each day is a button and each chip its own button; one tab stop', () => {
    const { container } = month();
    expect(container.querySelector('[role="grid"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="row"]').length).toBeGreaterThanOrEqual(5);
    expect(container.querySelectorAll('[role="gridcell"]').length % 7).toBe(0);
    const days = [...container.querySelectorAll<HTMLButtonElement>('button.ch-mo__n')];
    expect(days.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(container.querySelector('button.ch-mo__ev.is-qualifier')).not.toBeNull();
    // No button inside a button.
    expect(container.querySelector('button button')).toBeNull();
  });

  it('a run draws once per week row as a ribbon, cut with a chevron where the week breaks', () => {
    const { container } = month();
    // Fri 16 to Sun 18: Friday and Saturday in one week, Sunday starts the next.
    const ribbons = [...container.querySelectorAll<HTMLElement>('.ch-mo__ribbon')];
    expect(ribbons.map((r) => r.style.getPropertyValue('--ch-mo-span'))).toEqual(['2', '1']);
    expect(ribbons[0]!.classList.contains('is-clip-end')).toBe(true);
    expect(ribbons[1]!.classList.contains('is-clip-start')).toBe(true);
    expect(ribbons[0]!.getAttribute('aria-label')).toBe('Pinehurst trip, Fri 16 to Sun 18');
    // The run's days show no chip of their own.
    expect(container.querySelectorAll('[data-date="2026-10-17"] .ch-mo__ev')).toHaveLength(0);
  });

  it('arrows move between days; the focused day’s chips take Tab', () => {
    const { container } = month();
    const day = container.querySelector<HTMLButtonElement>('[data-date="2026-10-14"] .ch-mo__n')!;
    day.focus();
    fireEvent.keyDown(day, { key: 'ArrowRight' });
    const next = container.querySelector<HTMLButtonElement>('[data-date="2026-10-15"] .ch-mo__n')!;
    expect(next.tabIndex).toBe(0);
    expect(container.querySelector<HTMLButtonElement>('[data-date="2026-10-15"] .ch-mo__ev')!.tabIndex).toBe(0);
  });

  it('Alt+Right moves a chip a day and keeps its time; a player gets no drag', () => {
    const { container, onMove } = month();
    fireEvent.keyDown(container.querySelector('.ch-mo__ev.is-qualifier')!, { key: 'ArrowRight', altKey: true });
    expect(onMove).toHaveBeenCalledWith(Q, { date: '2026-10-16', start: 8.7, end: 13 }, 'move');
    cleanup();
    const p = month(vi.fn(), vi.fn(), false);
    expect(p.container.querySelector('.is-draggable')).toBeNull();
  });

  it('CH-6806 says what is picked up, where it is over, where it lands, and a cancel', () => {
    const a = monthAnnouncements('12');
    const active = { id: 'chip', data: { current: { e: Q } } } as never;
    expect(a.onDragStart({ active })).toBe('Picked up Fall qualifier R2, Thursday 15 October. Arrow keys choose a day, Space drops, Escape cancels.');
    expect(a.onDragOver({ active, over: { id: '2026-10-16' } } as never)).toBe('Over Friday 16 October.');
    expect(a.onDragEnd({ active, over: { id: '2026-10-16' } } as never)).toBe('Fall qualifier R2 moved to Friday 16 October at 8:42 AM.');
    expect(a.onDragCancel({ active, over: null } as never)).toBe('Move cancelled. Fall qualifier R2 stays on Thursday 15 October.');
  });
});

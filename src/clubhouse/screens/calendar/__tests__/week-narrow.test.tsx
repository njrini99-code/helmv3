// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import { laneBox, layoutLanes, type ChCalEvent, type ChCalType } from '../model';
import { TimeGrid, clearFrom } from '../views';

afterEach(cleanup);

const DAY = '2026-10-21';
const ev = (over: Partial<ChCalEvent> & { id: string; type: ChCalType }): ChCalEvent =>
  ({ title: over.id, date: DAY, start: 9, end: 10, allDay: false, location: null, notes: null, recurring: null, people: [], rsvp: {}, rsvpRequired: false, owner: null, busyOnly: false, instructor: null, pattern: null, canEdit: true, cancelled: false, seriesId: null, startIso: `${DAY}T13:00:00Z`, span: null, ...over }) as ChCalEvent;

const grid = (events: ChCalEvent[]) =>
  render(<TimeGrid dates={[DAY]} events={events} people={new Map()} now={{ date: '2026-10-20', hour: 12 }} selId={null} flagged={new Set()} onSelect={() => {}} onDay={() => {}} />);

const css = readFileSync(join(import.meta.dirname, '../../../styles/calendar.css'), 'utf8');

/**
 * The desktop week at 1440px draws 100px day columns. Nine titles there were cut to a few letters ("Round r…", one tile
 * only "… 1:30 PM"): in a narrow block the title comes first, on the lines the block holds, and the time keeps its row
 * only when one is left.
 */
describe('the week grid in narrow columns', () => {
  it('a block that is not one short row wraps its words, and says how many lines its title may take', () => {
    const { container } = grid([ev({ id: 'hour', type: 'meeting' }), ev({ id: 'ninety', type: 'practice', start: 11, end: 12.5 }), ev({ id: 'two', type: 'practice', start: 14, end: 16 })]);
    const block = (id: string) => container.querySelector<HTMLElement>(`[data-ev-id="${id}"]`)!;
    for (const id of ['hour', 'ninety', 'two']) {
      const w = block(id).querySelector(':scope > .ch-ev__w')!;
      expect(w, id).not.toBeNull();
      expect(w.querySelector(':scope > .ch-ev__t'), id).not.toBeNull();
      expect(w.querySelector(':scope > .ch-ev__m'), id).not.toBeNull();
    }
    // One hour is 50px: two title lines and no time row. Ninety minutes is 76px: three. Two hours hold three and the time.
    expect(block('hour').style.getPropertyValue('--ch-ev-solo')).toBe('2');
    expect(block('ninety').style.getPropertyValue('--ch-ev-solo')).toBe('3');
    expect(block('two').style.getPropertyValue('--ch-ev-solo')).toBe('3');
  });

  it('a short row has no wrapper: its title and its time stay one row', () => {
    const { container } = grid([ev({ id: 'brief', type: 'meeting', start: 13.5, end: 14.25 })]);
    const b = container.querySelector('[data-ev-id="brief"]')!;
    expect(b.className).toContain('ch-ev--short');
    expect(b.querySelector('.ch-ev__w')).toBeNull();
    expect(b.querySelector(':scope > .ch-ev__t')).not.toBeNull();
  });

  it('the wrapper is not there in a wide column, and under 98px of text room it puts the title first', () => {
    expect(css).toMatch(/\.ch-ev__w \{\s*display: contents;\s*\}/);
    const narrow = css.slice(css.indexOf('.ch-ev .ch-ev__w {'));
    expect(css.slice(0, css.indexOf('.ch-ev .ch-ev__w {')).trimEnd().endsWith('@container (max-width: 97.98px) {')).toBe(true);
    expect(narrow).toMatch(/flex-flow: column wrap;/);
    expect(narrow).toMatch(/-webkit-line-clamp: var\(--ch-ev-solo, 2\);/);
    // The type's glyph goes under the same width.
    expect(css).toMatch(/@container \(max-width: 97\.98px\) \{\s*\.ch-ev__g \{\s*display: none;/);
  });

  it('a marked block leaves the time its row, so the mark in the bottom corner never lies on a title line', () => {
    const e = ev({ id: 'clash', type: 'practice' });
    const { container } = render(<TimeGrid dates={[DAY]} events={[e]} people={new Map()} now={{ date: '2026-10-20', hour: 12 }} selId={null} flagged={new Set(['clash'])} onSelect={() => {}} onDay={() => {}} />);
    const b = container.querySelector<HTMLElement>('[data-ev-id="clash"]')!;
    expect(b.className).toContain('has-mark');
    expect(b.style.getPropertyValue('--ch-ev-solo')).toBe('1');
  });
});

describe('the cascade step', () => {
  it('a block on its own fills the column; a later lane steps in, by half the step in a column under 120px', () => {
    expect(laneBox(0, 1)).toEqual({ left: 'calc(0% + 3px)', width: 'calc(100% - 6px)' });
    expect(laneBox(0, 2)).toEqual({ left: 'calc(0% + 3px)', width: 'calc(100% - 6px)' });
    const second = laneBox(1, 2);
    expect(second.left).toBe('calc(23% + clamp(0px, (100% - 120px) * 999, 23%) + 3px)');
    expect(second.width).toBe('calc(100% - (23% + clamp(0px, (100% - 120px) * 999, 23%)) - 6px)');
    // Three lanes share 70%: 35 a step, so the third starts at 70% in a wide column and 35% in a narrow one.
    expect(laneBox(2, 3).left).toBe('calc(35% + clamp(0px, (100% - 120px) * 999, 35%) + 3px)');
  });
});

describe('a busy block under an event comes out as a tile of its own', () => {
  const round = ev({ id: 'round', type: 'tournament', start: 8, end: 12.5 });
  const staff = ev({ id: 'staff', type: 'busy', start: 12, end: 13 });

  it('it is drawn from where the event over it ends', () => {
    expect(clearFrom(staff, layoutLanes([round, staff]))).toBe(12.5);
    const { container } = grid([round, staff]);
    const b = container.querySelector<HTMLElement>('[data-ev-id="staff"]')!;
    // 12:30 on a grid that opens at 6: 6.5 hours of 52px, and the half hour left is 24px.
    expect(b.style.top).toBe('338px');
    expect(b.style.height).toBe('24px');
    expect(b.className).toContain('ch-ev--under');
    // Its name keeps its real hours.
    expect(b.getAttribute('aria-label')).toMatch(/^Busy · staff, 12:00 – 1:00 PM/);
  });

  it('nothing changes when it starts first, when it is covered whole, or when two busy blocks overlap', () => {
    const early = ev({ id: 'early', type: 'busy', start: 7, end: 9 });
    expect(clearFrom(early, layoutLanes([round, early]))).toBeUndefined();
    const inside = ev({ id: 'inside', type: 'busy', start: 9, end: 10 });
    expect(clearFrom(inside, layoutLanes([round, inside]))).toBeUndefined();
    const other = ev({ id: 'other', type: 'busy', start: 12.25, end: 13.5 });
    expect(clearFrom(staff, layoutLanes([round, staff, other]))).toBeUndefined();
    // Less than a row would show: it stays under.
    const sliver = ev({ id: 'sliver', type: 'busy', start: 12, end: 12.75 });
    expect(clearFrom(sliver, layoutLanes([round, sliver]))).toBeUndefined();
  });
});

describe('an ended competition keeps its green', () => {
  it('the week block and the month chip are not desaturated, and the block’s time takes the title’s ivory', () => {
    expect(css).toMatch(/\.ch-ev\.is-past\.ch-ev--tournament,\s*\.ch-mo__cell\.is-past \.ch-mo__ev\.is-major:not\(\.is-qualifier\) \{\s*filter: none;/);
    expect(css).toMatch(/\.ch-ev\.is-past\.ch-ev--tournament:not\(:hover\):not\(:focus-visible\):not\(\.is-sel\) \.ch-ev__m \{\s*color: var\(--ch-on-fill-100\);/);
  });
});

describe('a bar one week column wide', () => {
  it('drops its glyph and takes two lines, and its row in the lane grows with it', () => {
    expect(css).toMatch(/@container \(max-width: 95\.98px\) \{\s*\.ch-ev-bar--span > \.ch-ev__g \{\s*display: none;/);
    const { container } = grid([ev({ id: 'allday', type: 'qualifier', allDay: true, start: null, end: null })]);
    expect(container.querySelector<HTMLElement>('.ch-wk__allday')!.style.gridTemplateRows).toBe('repeat(1, minmax(26px, auto))');
  });
});

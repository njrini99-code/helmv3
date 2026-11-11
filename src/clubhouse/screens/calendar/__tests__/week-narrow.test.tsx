// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import { laneBox, layoutLanes, type ChCalEvent, type ChCalType } from '../model';
import { TimeGrid, clearFrom, coveredFrom } from '../views';

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

  it('the wrapper is not there in a wide column, and under 180px of text room it puts the title first', () => {
    expect(css).toMatch(/\.ch-ev__w \{\s*display: contents;\s*\}/);
    const narrow = css.slice(css.indexOf('.ch-ev .ch-ev__w {'));
    // 180px: the full-width week's column gives a block 129px of text room at 1440, where a title beside its time is cut.
    expect(css.slice(0, css.indexOf('.ch-ev .ch-ev__w {')).trimEnd().endsWith('@container (max-width: 179.98px) {')).toBe(true);
    expect(narrow).toMatch(/flex-flow: column wrap;/);
    expect(narrow).toMatch(/-webkit-line-clamp: var\(--ch-ev-solo, 2\);/);
    // The type's glyph goes only under 98px, so the full-width week's column keeps it.
    expect(css).toMatch(/@container \(max-width: 97\.98px\) \{\s*\.ch-ev__g \{\s*display: none;/);
    expect(css.match(/@container \(max-width: 179\.98px\) \{\s*\.ch-ev__g \{/)).toBeNull();
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

describe('a timed run in the all-day lane', () => {
  const WEEK = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
  const run = (from: string, to: string) => {
    const days = WEEK.filter((d) => d >= from && d <= to);
    return days.map((d, i) => ev({ id: 'trip', type: 'tournament', title: 'Sea Pines', date: d, start: i === 0 ? 8 : 0, end: i === days.length - 1 ? 17 : 24, span: { from, to, start: 8, end: 17 } }));
  };
  const times = (events: ChCalEvent[]) => {
    const { container } = render(<TimeGrid dates={WEEK} events={events} people={new Map()} now={{ date: '2026-10-17', hour: 12 }} selId={null} flagged={new Set()} onSelect={() => {}} onDay={() => {}} />);
    return [...container.querySelectorAll('.ch-ev-bar--span .ch-ev-bar__t')].map((el) => el.textContent);
  };

  it('prints its start and its end across three columns or more', () => {
    expect(times(run('2026-10-20', '2026-10-22'))).toEqual(['8:00 AM', '5:00 PM']);
  });

  it('across two columns the name comes first: both times beside it left "8:00 AM S… 5:00 PM"', () => {
    expect(times(run('2026-10-20', '2026-10-21'))).toEqual([]);
  });
});

/**
 * Thu 3 PM at 1440px: a class from 3:00 with "Course prep" lying over it from 3:30. The class showed "10" and "3:(" in
 * the 23px strip beside the block on top: the ends of its second title line and of its time.
 */
describe('a block another lies over shows whole lines only', () => {
  const lab = ev({ id: 'lab', type: 'class', start: 15, end: 16.25 });
  const prep = ev({ id: 'prep', type: 'practice', start: 15.5, end: 17.5 });

  it('knows the hour the block on top begins; the block on top, and one under a busy block, are covered by nothing', () => {
    const laid = layoutLanes([lab, prep]);
    const of = (id: string) => laid.find((l) => l.e.id === id)!;
    expect(coveredFrom(of('lab'), laid)).toBe(15.5);
    expect(coveredFrom(of('prep'), laid)).toBeUndefined();
    const busy = ev({ id: 'busy', type: 'busy', start: 15.5, end: 16 });
    const under = layoutLanes([lab, busy]);
    expect(coveredFrom(under.find((l) => l.e.id === 'lab')!, under)).toBeUndefined();
    expect(coveredFrom(layoutLanes([lab])[0]!, layoutLanes([lab]))).toBeUndefined();
  });

  it('its title keeps to the lines above the block on top, and its words to the room there', () => {
    const { container } = grid([lab, prep]);
    const b = container.querySelector<HTMLElement>('[data-ev-id="lab"]')!;
    expect(b.className).toContain('is-covered');
    // Half an hour is 26px: less the other block's 2px edge and this one's 4px of padding, 20px, one 18px title line.
    expect(b.style.getPropertyValue('--ch-ev-room')).toBe('20px');
    expect(b.style.getPropertyValue('--ch-ev-solo')).toBe('1');
    const top = container.querySelector<HTMLElement>('[data-ev-id="prep"]')!;
    expect(top.className).not.toContain('is-covered');
    expect(top.style.getPropertyValue('--ch-ev-room')).toBe('');
  });

  it('a block covered lower down keeps every line that shows whole', () => {
    const block = ev({ id: 'block', type: 'practice', start: 15.5, end: 17 });
    const one = ev({ id: 'one', type: 'meeting', start: 16.75, end: 17.5 });
    const { container } = grid([block, one]);
    const b = container.querySelector<HTMLElement>('[data-ev-id="block"]')!;
    // 75 minutes is 65px: 59 of room, three title lines, or two and the time's row.
    expect(b.style.getPropertyValue('--ch-ev-room')).toBe('59px');
    expect(b.style.getPropertyValue('--ch-ev-solo')).toBe('3');
  });

  it('a block of classes marks the lines of names that would be cut', () => {
    const a = ev({ id: 'a', type: 'class', title: 'CHEM 102', owner: 'p1', start: 15, end: 16.25 });
    const c = ev({ id: 'c', type: 'class', title: 'BIOL 110', owner: 'p2', start: 15, end: 16.25 });
    const { container } = grid([a, c, prep]);
    const who = [...container.querySelectorAll<HTMLElement>('.ch-ev--group .ch-ev__who')];
    expect(who.length).toBeGreaterThan(0);
    for (const w of who) expect(w.hasAttribute('data-covered')).toBe(true);
    cleanup();
    // With nothing over it the names are plain lines.
    const free = grid([a, c]);
    for (const w of free.container.querySelectorAll('.ch-ev--group .ch-ev__who')) expect(w.hasAttribute('data-covered')).toBe(false);
  });

  it('only in a narrow column: a wide one shows those rows whole in the strip at the left', () => {
    const at = css.indexOf('.ch-ev.is-covered .ch-ev__w {');
    expect(at).toBeGreaterThan(-1);
    const open = css.lastIndexOf('@container', at);
    expect(css.slice(open, css.indexOf('{', open)).trim()).toBe('@container (max-width: 179.98px)');
    expect(css.slice(at)).toMatch(/^\.ch-ev\.is-covered \.ch-ev__w \{\s*height: var\(--ch-ev-room\);\s*\}\s*\.ch-ev--group \.ch-ev__who\[data-covered\] \{\s*display: none;/);
  });
});

/** Wed and Thu at 1440px: "Putting ladder", "Travel briefing" and "1:1 with Jonah" are 45 minutes, 37px, and were cut on one line. */
describe('a 45-minute block takes two title lines in a narrow column', () => {
  const block = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-ev-id="${id}"]`)!;

  it('37px holds two lines of 18; half an hour stays one row', () => {
    const { container } = grid([ev({ id: 'ladder', type: 'practice', start: 17.5, end: 18.25 }), ev({ id: 'call', type: 'meeting', start: 18.25, end: 18.75 })]);
    expect(block(container, 'ladder').style.height).toBe('37px');
    expect(block(container, 'ladder').className).toContain('ch-ev--short ch-ev--two');
    expect(block(container, 'call').className).toContain('ch-ev--short');
    expect(block(container, 'call').className).not.toContain('ch-ev--two');
  });

  it('a cascaded one takes them too, on top of the block it overlaps', () => {
    const { container } = grid([ev({ id: 'game', type: 'practice', start: 15.5, end: 17 }), ev({ id: 'one', type: 'meeting', start: 16.75, end: 17.5 })]);
    expect(block(container, 'one').className).toContain('ch-ev--two');
    expect(block(container, 'one').className).toContain('ch-ev--lane');
  });

  it('under a block that lies over its second line it stays one row, at the top, clear of that block', () => {
    const { container } = grid([ev({ id: 'lineup', type: 'meeting', start: 9, end: 9.75 }), ev({ id: 'wedges', type: 'practice', start: 9.5, end: 10.5 })]);
    const b = block(container, 'lineup');
    expect(b.className).not.toContain('ch-ev--two');
    expect(b.className).toContain('is-pinned');
    expect(block(container, 'wedges').className).not.toContain('is-pinned');
  });

  it('the rules live in the narrow column, and outrank the cascaded short title’s one line', () => {
    const at = css.indexOf('.ch-ev.ch-ev--short.ch-ev--two .ch-ev__t {');
    expect(at).toBeGreaterThan(-1);
    const open = css.lastIndexOf('@container', at);
    expect(css.slice(open, css.indexOf('{', open)).trim()).toBe('@container (max-width: 179.98px)');
    expect(css.slice(at, css.indexOf('}', at))).toMatch(/-webkit-line-clamp: 2;[\s\S]*white-space: normal;/);
    expect(css).toMatch(/\.ch-ev--short\.is-pinned \.ch-ev__t \{\s*align-self: flex-start;\s*margin-top: var\(--ch-space-1\);/);
  });
});

/** Owner, 2026-11-11: the desktop week takes the page's full width; its panel lies under it, as a narrow canvas stacks it. */
describe('the desktop week takes the full width', () => {
  it('the week’s body is one column at any width, with the panel in the page’s flow under it', () => {
    expect(css).toMatch(/\n\.ch-cal-body\[data-view='week'\] \{\s*grid-template-columns: minmax\(0, 1fr\);\s*\}/);
    expect(css).toMatch(/\n\.ch-cal-body\[data-view='week'\] > \.ch-in-wrap \{\s*position: static;\s*max-height: none;\s*\}/);
  });

  it('on the Ledger it is the narrow canvas’s stack: its gap, no column rule, and a hairline above the panel', () => {
    expect(css).toMatch(/\.ch-cal\[data-canopy\] \.ch-cal-body\[data-view='week'\] \{\s*grid-template-columns: minmax\(0, 1fr\);\s*gap: 32px;\s*\}/);
    expect(css).toMatch(/\.ch-cal\[data-canopy\] \.ch-cal-body\[data-view='week'\]::before \{\s*content: none;\s*\}/);
    expect(css).toMatch(/\.ch-cal\[data-canopy\] \.ch-cal-body\[data-view='week'\] > \.ch-in-wrap\.ch-cal-surface \{\s*padding: 24px 0 0;\s*box-shadow: inset 0 var\(--ch-hairline-w\) 0 var\(--ch-ledger-rule\);\s*\}/);
  });

  it('Day, Month and List keep the panel beside them: no rule names their view', () => {
    expect(css.match(/\.ch-cal-body\[data-view='(?!week')/)).toBeNull();
  });
});

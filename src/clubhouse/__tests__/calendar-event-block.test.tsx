// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import type { ChCalEvent, ChCalType } from '../screens/calendar/model';
import { TimeGrid, blockTier } from '../screens/calendar/views';

afterEach(cleanup);

const DAY = '2026-10-21';
function ev(over: Partial<ChCalEvent> & { id: string; type: ChCalType }): ChCalEvent {
  return {
    title: over.id,
    date: DAY,
    start: 9,
    end: 11,
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
    startIso: `${DAY}T13:00:00Z`,
    span: null,
    ...over,
  } as ChCalEvent;
}

function grid(events: ChCalEvent[]) {
  return render(
    <TimeGrid dates={[DAY]} events={events} people={new Map()} now={{ date: '2026-10-20', hour: 12 }} selId={null} flagged={new Set()} onSelect={() => {}} onDay={() => {}} />,
  );
}

describe('P-4 slice 1: the event block', () => {
  it('each type draws its own material class and leads with its glyph', () => {
    const types: ChCalType[] = ['tournament', 'qualifier', 'practice', 'meeting', 'travel', 'other'];
    const { container } = grid(types.map((type, i) => ev({ id: type, type, start: 6 + i * 2, end: 7.5 + i * 2 })));
    for (const type of types) {
      const b = container.querySelector(`.ch-ev--${type}`)!;
      expect(b, type).not.toBeNull();
      expect(b.querySelector('.ch-ev__t svg.ch-ev__g'), type).not.toBeNull();
    }
  });

  it('tiers by drawn height: a sliver has no glyph; 24, 40 and 70px step up', () => {
    expect([19, 23.9, 24, 39, 40, 69, 70].map(blockTier)).toEqual(['sliver', 'sliver', 'short', 'short', 'standard', 'standard', 'tall']);
    // A 15-minute practice draws at the 22px floor: a sliver, title only.
    const { container } = grid([ev({ id: 'quick', type: 'practice', start: 9, end: 9.25 })]);
    const b = container.querySelector('.ch-ev--practice')!;
    expect(b.classList.contains('ch-ev--sliver')).toBe(true);
    expect(b.querySelector('.ch-ev__g')).toBeNull();
  });

  it('a cancelled event is paper, struck, and its time line says Cancelled', () => {
    const { container } = grid([ev({ id: 'gone', type: 'practice', cancelled: true })]);
    const b = container.querySelector('.ch-ev')!;
    expect(b.className).toContain('ch-ev--other');
    expect(b.className).toContain('is-cancelled');
    expect(b.querySelector('.ch-ev__m')!.textContent).toBe('Cancelled');
  });
});

/**
 * The ban (owner, 2026-10-24: "the cards with the thicker left border are banned for my app"): nothing in the calendar
 * draws a left border over a hairline, a left stripe, or an inset left shadow, in any state, light or dark.
 */
describe('no side stripe anywhere in the calendar', () => {
  const css = readFileSync(join(import.meta.dirname, '../styles/calendar.css'), 'utf8');
  const px = (v: string) => (/^var\(--ch-hairline-w\)$/.test(v) ? 1 : parseFloat(v));
  it('no left or inline-start border wider than a hairline', () => {
    const bad: string[] = [];
    postcss.parse(css).walkDecls(/^border-(left|inline-start)(-width)?$/, (d) => {
      const w = d.value.split(/\s+/).find((t) => /^(\d|var\(--ch-hairline-w\))/.test(t));
      if (w && px(w) > 1) bad.push(`${(d.parent as postcss.Rule).selector} { ${d.prop}: ${d.value} }`);
    });
    expect(bad).toEqual([]);
  });
  it('no inset shadow offset only along x (a painted stripe)', () => {
    const bad: string[] = [];
    postcss.parse(css).walkDecls('box-shadow', (d) => {
      for (const layer of d.value.split(/,(?![^(]*\))/)) {
        const m = layer.trim().match(/^inset\s+(-?[\d.]+)px\s+(-?[\d.]+)(?:px)?\s/);
        if (m && parseFloat(m[1]!) !== 0 && parseFloat(m[2]!) === 0) bad.push(`${(d.parent as postcss.Rule).selector} { box-shadow: ${d.value} }`);
      }
    });
    expect(bad).toEqual([]);
  });
});

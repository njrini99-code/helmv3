import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// W44 (preview walk, 11 Nov): month events read as grey lines cut after a few words. A timed event now leads with its
// start, and its name is in primary ink; an all-day event and a tournament or qualifier chip are unchanged.

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import type { ChCalEvent } from '../model';
import { DndMonth } from '../month-dnd';

afterEach(cleanup);

const ev = (over: Partial<ChCalEvent> & { id: string }): ChCalEvent =>
  ({
    type: 'practice', title: over.id, date: '2026-10-15', start: 15.5, end: 17, allDay: false, location: null, notes: null,
    recurring: null, people: [], rsvp: {}, rsvpRequired: false, owner: null, busyOnly: false, instructor: null, pattern: null,
    canEdit: true, cancelled: false, seriesId: null, startIso: '2026-10-15T19:30:00Z', span: null, ...over,
  }) as ChCalEvent;

const month = (events: ChCalEvent[]) =>
  render(<DndMonth anchor="2026-10-14" events={events} now={{ date: '2026-10-14' }} selDate="2026-10-14" onPick={() => {}} coach={false} />).container;

describe('W44 month chips lead with the time', () => {
  it('a timed practice shows its start before the name', () => {
    const c = month([ev({ id: 'Range and wedges' })]);
    const chip = c.querySelector('button.ch-mo__ev')!;
    expect(chip.querySelector('.ch-mo__at')?.textContent).toBe('3:30');
    expect(chip.textContent).toMatch(/^3:30\s*Range and wedges/);
  });

  it('an all-day event and a qualifier chip carry no time', () => {
    const c = month([ev({ id: 'Day off', allDay: true, start: null, end: null }), ev({ id: 'Fall qualifier', type: 'qualifier', date: '2026-10-16' })]);
    expect(c.querySelectorAll('.ch-mo__at')).toHaveLength(0);
  });

  it('the name is primary ink, the time quieter', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/calendar.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const body = (sel: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1]!.trim() === sel)?.[2] ?? '';
    expect(body('button.ch-mo__ev:not(.is-major)')).toMatch(/color:\s*var\(--ch-text-primary\)/);
    expect(body('.ch-mo__at')).toMatch(/color:\s*var\(--ch-text-tertiary\)/);
  });
});

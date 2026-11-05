// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { focusTitle } from '../../../../data/coachhelm-coach-brief-shape';
import { StoriesCard } from '../Stories';

const brief = (over = {}) =>
  ({
    week: 'Week of Oct 26',
    counts: null,
    reads: [{ id: 'r1', kind: 'read', who: 'Eli Brandt', title: 'Two doubles from penalties', href: '/x', behind: 'Both drives went into the hazard.', next: null }],
    working: [],
    ...over,
  }) as never;

const round = { date: '2026-10-29', course: 'Hilltop', tracked: 17, holes: [{ n: 1, toPar: -1 }, { n: 2, toPar: 0 }, { n: 3, toPar: 1 }, { n: 4, toPar: 2 }, { n: 5, toPar: null }] };

afterEach(cleanup);

describe('story picture (AC-STORY-03, AC-TODAY-04)', () => {
  const show = (rounds: Record<string, typeof round> | null) =>
    render(<StoriesCard brief={brief()} themes={null} failed={false} players={[]} phone rounds={rounds} autoOpen onDesk={() => {}} onAction={() => {}} />);

  it('colours each hole by its score to par, and leaves a hole with no score plain', () => {
    show({ 'Eli Brandt': round });
    const cls = [...document.querySelectorAll('.sto-hole')].map((e) => e.className.replace('sto-hole', '').trim());
    expect(cls).toEqual(['is-birdie', '', 'is-bogey', 'is-double', '']);
  });

  it('says where and how many holes were tracked, and the read body', () => {
    show({ 'Eli Brandt': round });
    const text = document.querySelector('.story')!.textContent!;
    expect(text).toContain('Thursday at Hilltop');
    expect(text).toContain('Thursday’s round · 17 of 5 holes with shots tracked');
    expect(text).toContain('Both drives went into the hazard.');
  });

  it('draws no strip when no round fell inside the week', () => {
    show(null);
    expect(document.querySelector('.sto-holes')).toBeNull();
    expect(document.querySelector('.story')!.textContent).toContain('Week of Oct 26');
  });
});

describe('a working tile says what it is about', () => {
  const tile = (w: object) => render(<StoriesCard brief={brief({ reads: [], working: [{ id: 'w', who: 'Eli Brandt', title: '3-5 ft putting', word: 'Active', since: null, href: '#', ...w }] })} themes={null} failed={false} players={[]} phone={false} rounds={null} onDesk={() => {}} onAction={() => {}} />);

  it('leads with the focus name, then the figures', () => {
    tile({ line: 'Now 48%, target 69%, from 47%', headline: '3-5 ft putting: now 48%, target 69%' });
    expect(document.querySelector('.tile b')!.textContent).toBe('3-5 ft putting: now 48%, target 69%');
  });

  it('still names it when a row has no headline, or nothing measured', () => {
    tile({ line: 'Now 48%, target 69%' });
    expect(document.querySelector('.tile b')!.textContent).toBe('3-5 ft putting: Now 48%, target 69%');
    cleanup();
    tile({ line: null });
    expect(document.querySelector('.tile b')!.textContent).toBe('3-5 ft putting');
  });
});

describe('focusTitle', () => {
  it('drops a figure frozen into a stored title, and nothing else', () => {
    expect(focusTitle('3-5 ft putting: 47%')).toBe('3-5 ft putting');
    expect(focusTitle('  Up and down: 12.5 ft ')).toBe('Up and down');
    expect(focusTitle('Approach play is the biggest leak — costing ~1.4 strokes per round')).toBe('Approach play is the biggest leak — costing ~1.4 strokes per round');
    expect(focusTitle('100-150')).toBe('100-150');
    expect(focusTitle(null)).toBe('');
  });
});

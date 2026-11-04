// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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

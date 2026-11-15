// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StoriesCard, storyAxis } from '../Stories';

/**
 * Focus stories (stats and charts audit 2026-11-15, CH-08): before, now and target are positions on one axis, the target's side
 * to the right, and Now is never painted as a gain for moving the wrong way. The old bars were each value's size, so the sign was
 * lost, and Now was always the gain colour.
 */
afterEach(cleanup);

const brief = (progress: { from: number; now: number; target: number }) =>
  ({
    week: 'Week of Oct 26',
    counts: null,
    reads: [],
    working: [{ id: 'w1', who: 'Eli Brandt', title: 'Greens in regulation', word: 'Working on', line: 'GIR 44%, target 60%', since: '3 rounds since Oct 2', playerId: 'p1', progress, href: '/x' }],
  }) as never;

const show = (progress: { from: number; now: number; target: number }) =>
  render(<StoriesCard brief={brief(progress)} themes={null} failed={false} players={[]} phone rounds={null} autoOpen onDesk={() => {}} onAction={() => {}} />);

describe('storyAxis · positions on one axis (CH-08)', () => {
  it('greens 50% to 44% against a 60% target moved away, and Now carries no gain fill', () => {
    const a = storyAxis({ from: 50, now: 44, target: 60 });
    expect(a.way).toBe('away');
    expect(a.now).toBeLessThan(a.from);
    show({ from: 50, now: 44, target: 60 });
    const story = document.querySelector('.story')!;
    expect(story.textContent).toContain('Moved away from the target');
    expect(story.innerHTML).not.toContain('gain');
  });

  it('strokes gained −0.4 to +0.3 against +0.5 sits between before and target, right of zero', () => {
    const a = storyAxis({ from: -0.4, now: 0.3, target: 0.5 });
    expect(a.now).toBeGreaterThan(a.from);
    expect(a.now).toBeLessThan(a.target);
    expect(a.zero).not.toBeNull();
    expect(a.now).toBeGreaterThan(a.zero!);
    expect(a.way).toBe('towards');
  });

  it('a lower-is-better target runs high to low, so the target is still on the right', () => {
    const a = storyAxis({ from: 1.2, now: 0.9, target: 0.5 });
    expect(a.target).toBeGreaterThan(a.now);
    expect(a.now).toBeGreaterThan(a.from);
    expect(a.zero).toBeNull();
  });
});

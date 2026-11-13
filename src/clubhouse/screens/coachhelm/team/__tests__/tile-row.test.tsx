import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StoriesCard } from '../Stories';

/**
 * W10 (staging, 11 Nov, desktop 1920): This week listed three rows and only the middle one had a picture, a focus's before and now
 * bars with a target tick, so its words started 108px further in than the other two and the tick read as a divider. A tile's
 * picture is drawn only when it has a true one (AC-STORY-03), so on a desk the words lead every row and the picture closes it.
 */

afterEach(cleanup);

const brief = {
  week: 'Week of Oct 26',
  counts: '4 rounds · 2 new reads · 1 cleared',
  reads: [{ id: 'r1', kind: 'read', who: 'Eli Brandt', title: 'Two doubles from penalties', tag: 'Likely', strokes: null, next: null, behind: null, href: '#' }],
  working: [
    { id: 'w1', who: 'Jonah Okafor', playerId: 'p-jonah', title: 'Lag putting from 30 ft and out', word: 'Active', line: 'Three-putts 0.9 to 0.5 a round · target 0.4', since: '5 rounds in', href: '#', progress: { from: 0.9, now: 0.5, target: 0.4 } },
    { id: 'w2', who: 'Priya Shah', playerId: 'p-priya', title: 'Wedges from 50 to 100 yd', word: 'In progress', line: null, since: '3 rounds in', href: '#', progress: null },
  ],
} as never;

const tiles = (phone: boolean) => {
  render(<StoriesCard brief={brief} themes={null} failed={false} players={[]} phone={phone} rounds={null} onDesk={() => {}} onAction={() => {}} />);
  return [...document.querySelectorAll<HTMLElement>('.tile')];
};

describe('This week’s rows on a desk (W10)', () => {
  it('every row starts on its words; a picture, when there is one, closes the row', () => {
    const rows = tiles(false);
    expect(rows).toHaveLength(3);
    // The staging shape: some rows with a picture, some without.
    expect(rows.filter((t) => t.querySelector('.tv'))).toHaveLength(1);
    for (const t of rows) {
      expect(t.firstElementChild?.classList.contains('tt')).toBe(true);
      const figure = t.querySelector(':scope > .tv');
      if (figure) expect(t.lastElementChild).toBe(figure);
    }
  });

  it('the focus picture’s target is a line through both bars, not a mark beside the lower one', () => {
    const tick = [...tiles(false).flatMap((t) => [...t.querySelectorAll('.tv svg rect')])].find((r) => r.getAttribute('width') === '2');
    expect(tick?.getAttribute('y')).toBe('0');
    expect(tick?.getAttribute('height')).toBe('40');
  });

  it('the phone’s cards keep their picture at the top', () => {
    const withFigure = tiles(true).find((t) => t.querySelector('.tv'));
    expect(withFigure?.firstElementChild?.classList.contains('tv')).toBe(true);
  });
});

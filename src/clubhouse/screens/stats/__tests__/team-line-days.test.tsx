import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TeamFeatureChart } from '../ScoringFeatureChart';
import { straightPath, teamLineDays } from '../shs-figures';

afterEach(cleanup);

// W26 (owner's preview, 11 Nov 2026): a smoothed curve drew values between round days that never happened, and its low point was
// one player's single 87, shown as the team's worst day; "Mean 75.3" sat beside a 75.7 headline with no word on why.

describe('the team scoring line (W26)', () => {
  it('draws straight segments, no curve', () => {
    expect(straightPath([[0, 10], [5, 20], [9, 4]])).toBe('M0,10L5,20L9,4');
    expect(straightPath([[0, 10]])).toBe('');
  });

  // Prod audit 2026-11-15, STATS-P-05 (spec S2.4): with one-round days left off the line, only the last three points were joined and
  // the rest floated. The line joins every day in the window; a one-round day is a hollow dot on it.
  it('joins every day, and marks a one-round day hollow on the line', () => {
    const r = teamLineDays([{ n: 6 }, { n: 1 }, { n: 5 }, { n: 4 }]);
    expect(r.line).toEqual([0, 1, 2, 3]);
    expect([...r.one]).toEqual([1]);
  });

  it('reads a day with no count as a team day, and a nine-hole round as half', () => {
    expect(teamLineDays([{ n: 1 }, { n: 1 }, { n: 3 }])).toEqual({ line: [0, 1, 2], one: new Set([0, 1]) });
    expect(teamLineDays([{}, { n: 1 }, {}])).toEqual({ line: [0, 1, 2], one: new Set([1]) });
    // A day of one nine-hole round counts as half a round: still one player's day.
    expect([...teamLineDays([{ n: 3 }, { n: 0.5 }, { n: 4 }]).one]).toEqual([1]);
  });

  it('renders the hollow day, a straight line, and only its two dates as words', () => {
    const { container } = render(
      <TeamFeatureChart
        days={[
          { label: 'Sep 3', score: 74.6, n: 6 },
          { label: 'Sep 13', score: 87, n: 1 },
          { label: 'Sep 20', score: 73.9, n: 7 },
          { label: 'Oct 1', score: 73.1, n: 7 },
        ]}
      />,
    );
    expect(container.querySelectorAll('.ch-shs-rdot.is-one')).toHaveLength(1);
    const d = container.querySelector('.ch-shs-avgline')!.getAttribute('d')!;
    expect(d).not.toMatch(/[CQS]/);
    expect(d.match(/L/g)).toHaveLength(3);
    // No number in the drawing: the card's figure is the only average on it, and the newest day (73.1) would sit under it.
    expect([...container.querySelectorAll('svg text')].map((t) => t.textContent)).toEqual(['Sep 3', 'Oct 1']);
    expect(container.querySelector('.ch-shs-rdot:last-of-type')!.getAttribute('r')).toBe('5');
  });

  // Owner's screenshot (27 Nov 2026, team Scoring average): "Round-day avg 73.9" sat under a 73.6 headline, the second average beside
  // the headline that W26, F-0009 and STATS-P-04 each flagged. The preview draws no second average; the tap-through keeps its reference.
  it('draws no second average on the preview, in the drawing or under it', () => {
    const { container } = render(
      <TeamFeatureChart
        days={[
          { label: 'Sep 3', score: 74.6, n: 6 },
          { label: 'Sep 20', score: 76.4, n: 7 },
          { label: 'Oct 1', score: 78.1, n: 7 },
        ]}
      />,
    );
    expect(container.textContent).not.toMatch(/avg|mean|average/i);
    expect(container.querySelector('.ch-shs-ref, .ch-shs-meanline')).toBeNull();
    expect(container.querySelectorAll('.ch-shs-grid')).toHaveLength(0);
  });

  // The axis is inverted like every Clubhouse score chart, and with no axis numbers the words under the drawing say which way is better.
  it('says under the drawing that lower scores sit higher, and draws them so', () => {
    const { container } = render(<TeamFeatureChart days={[{ label: 'Sep 3', score: 74.6 }, { label: 'Sep 20', score: 72.4 }]} />);
    const key = container.querySelector('.ch-shs-mean-key')!;
    expect(key.closest('svg')).toBeNull();
    expect(key.textContent).toBe('Lower scores sit higher');
    const [a, b] = [...container.querySelectorAll('.ch-shs-rdot')].map((c) => Number(c.getAttribute('cy')));
    expect(b!).toBeLessThan(a!);
  });
  // With no axis numbers the scale has a floor: 1.7 strokes drawn edge to edge read as a big change beside "No clear change".
  it('draws a small spread as a small move', () => {
    const { container } = render(
      <TeamFeatureChart days={[74.8, 74.2, 73.9, 73.1, 73.4].map((score, i) => ({ label: `Sep ${i + 1}`, score, n: 6 }))} />,
    );
    const ys = [...container.querySelectorAll('.ch-shs-rdot')].map((c) => Number(c.getAttribute('cy')));
    // The plot is 160 less 8 above and the date row below (26 at Text Size 1): 126 tall. 1.7 of 4 strokes is under half of it.
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(126 * 0.45);
  });
});

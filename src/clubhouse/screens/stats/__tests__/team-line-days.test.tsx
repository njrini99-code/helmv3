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

  it('leaves a one-round day off the team line, as a hollow dot', () => {
    const r = teamLineDays([{ n: 6 }, { n: 1 }, { n: 5 }, { n: 4 }]);
    expect(r.line).toEqual([0, 2, 3]);
    expect([...r.one]).toEqual([1]);
  });

  it('joins every day when fewer than two had the team out, and reads a day with no count as a team day', () => {
    expect(teamLineDays([{ n: 1 }, { n: 1 }, { n: 3 }])).toEqual({ line: [0, 1, 2], one: new Set() });
    expect(teamLineDays([{}, { n: 1 }, {}]).line).toEqual([0, 2]);
  });

  it('renders the hollow day, a straight line and a named average', () => {
    const { container } = render(
      <TeamFeatureChart
        days={[
          { label: 'Sep 3', score: 74.6, n: 6 },
          { label: 'Sep 13', score: 87, n: 1 },
          { label: 'Sep 20', score: 73.9, n: 7 },
          { label: 'Oct 1', score: 73.1, n: 7 },
        ]}
        mean={75.3}
      />,
    );
    expect(container.querySelectorAll('.ch-shs-rdot.is-one')).toHaveLength(1);
    const d = container.querySelector('.ch-shs-avgline')!.getAttribute('d')!;
    expect(d).not.toMatch(/[CQS]/);
    expect(d.match(/L/g)).toHaveLength(2);
    expect(container.textContent).toContain('Avg of these days 75.3');
  });
});

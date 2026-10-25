import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import { Line } from '../Line';
import { LegBars } from '../../../screens/stats/LegBars';
import { RoundTrend } from '../../../screens/stats/RoundTrend';

afterEach(cleanup);

/** AX-17 (row 120): a chart's name is its summary, and its figures follow as a table a screen reader can move into. */
describe('every chart has its figures as a table after its summary', () => {
  it('Line: the summary names the table, one row a point, a gap says so', () => {
    render(<Line label="Team scores, last three days." points={[{ x: 'Sep 1', y: 74 }, { x: 'Sep 2', y: null }, { x: 'Sep 3', y: 72 }]} format={(v) => v.toFixed(1)} />);
    const table = screen.getByRole('table', { name: 'Team scores, last three days.' });
    expect(within(table).getAllByRole('row').map((r) => r.textContent)).toEqual(['PointValue', 'Sep 174.0', 'Sep 2No figure', 'Sep 372.0']);
  });

  it('Line inside a control draws no table (it is hidden there), nor where the page has its own', () => {
    render(<Line label="Leg." interactive={false} points={[{ x: '1', y: 0.2 }]} />);
    render(<Line label="Own table." table={false} points={[{ x: '1', y: 0.2 }]} />);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('the round trend and the leg bars', () => {
    render(
      <RoundTrend
        kind="score"
        label="Scores over the last 3 rounds."
        rounds={[
          { id: 'a', label: 'Sep 1', course: 'Pines', value: 74, toPar: 2, holes: 18 },
          { id: 'b', label: 'Sep 8', course: 'Oaks', value: 72, toPar: 0, holes: 18 },
          { id: 'c', label: 'Sep 15', course: 'Pines', value: 71, toPar: -1, holes: 18 },
        ]}
      />,
    );
    expect(within(screen.getByRole('table', { name: 'Scores over the last 3 rounds.' })).getAllByRole('row')).toHaveLength(4);
    cleanup();
    render(<LegBars baseline="Tour" rows={[{ label: 'Putting', value: -0.4, se: 0.2, means: 'Putts' }, { label: 'Approach', value: null, tag: 'Needs 3 rounds', means: 'Shots in' }]} />);
    const rows = within(screen.getByRole('table', { name: 'Strokes gained per round by leg' })).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual(['LegStrokes gainedLikely range', 'Putting−0.4−0.6 to −0.2', 'ApproachNeeds 3 rounds']);
  });
});

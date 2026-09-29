import { describe, expect, it } from 'vitest';
import { liveCounterfactual, teamStrokesAvailable } from '../strokes-available';

const row = (player_id: string, category: string, saved: number | null, suppressed = false) => ({
  player_id,
  category,
  evidence: saved == null ? { metric: 'm' } : { metric: 'm', counterfactual: { strokes_saved_per_round: saved, suppressed } },
});

describe('liveCounterfactual', () => {
  it('reads only a live, finite, positive strokes-saved figure', () => {
    expect(liveCounterfactual(row('p', 'putting', 0.7).evidence)).toBe(0.7);
    expect(liveCounterfactual(row('p', 'putting', 0.7, true).evidence)).toBeNull();
    expect(liveCounterfactual(row('p', 'putting', 0).evidence)).toBeNull();
    expect(liveCounterfactual(row('p', 'putting', null).evidence)).toBeNull();
    expect(liveCounterfactual(null)).toBeNull();
  });
});

describe('teamStrokesAvailable', () => {
  const counted = new Set(['p1', 'p2', 'p3', 'p4']);

  it('is the roster mean of each player\'s largest counterfactual, not one player\'s figure', () => {
    // Audit row 1/7: the Home chip showed the top-ranked row's 2.50 as the
    // team's figure. Two players carry putting leaks: p1 max 2.5 (overlapping
    // rows are not summed), p2 0.5; four current players -> 3.0 / 4 = 0.75.
    const out = teamStrokesAvailable(
      [row('p1', 'putting', 2.5), row('p1', 'putting', 1.0), row('p2', 'putting', 0.5), row('p3', 'tee', 0.9)],
      'putting',
      counted,
    );
    expect(out).toEqual({ perRound: 0.75, playersWithLeak: 2, playersCounted: 4 });
  });

  it('ignores players outside the counted set and rows with no live counterfactual', () => {
    const out = teamStrokesAvailable(
      [row('gone', 'putting', 3.0), row('p1', 'putting', 0.4), row('p2', 'putting', 1.0, true), row('p3', 'putting', null)],
      'putting',
      counted,
    );
    expect(out).toEqual({ perRound: 0.1, playersWithLeak: 1, playersCounted: 4 });
  });

  it('returns null when nobody carries a live figure or nobody is counted', () => {
    expect(teamStrokesAvailable([row('p1', 'approach', null)], 'approach', counted)).toBeNull();
    expect(teamStrokesAvailable([row('p1', 'putting', 1)], 'putting', new Set())).toBeNull();
  });
});

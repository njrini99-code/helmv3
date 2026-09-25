import { describe, expect, it } from 'vitest';
import {
  buildPercentileProfile,
  teamPercentileReadout,
  PERCENTILE_MIN_TEAM_N,
} from '../percentiles';

describe('buildPercentileProfile (NUM-35)', () => {
  it('records the team size each percentile was ranked in', () => {
    const p = buildPercentileProfile({ sgTotal: 1.2 }, { sgTotal: [1.2, -0.4] }, null, 'p1');
    expect(p.metrics.sgTotal?.teamN).toBe(2);
    // One teammate below: the raw rank is 50, and the readout is withheld.
    expect(teamPercentileReadout(p.metrics.sgTotal)).toBeNull();
  });

  it('reports no platform percentile when the platform distribution is the team copy', () => {
    const team = { sgTotal: [0, 1, 2, 3, 4, 5] };
    const p = buildPercentileProfile({ sgTotal: 3 }, team, team);
    expect(p.metrics.sgTotal?.platform).toBeNull();
    expect(buildPercentileProfile({ sgTotal: 3 }, team, null).metrics.sgTotal?.platform).toBeNull();
  });

  it('keeps a real platform distribution', () => {
    const p = buildPercentileProfile({ sgTotal: 3 }, { sgTotal: [0, 1] }, { sgTotal: [0, 1, 2, 4] });
    expect(p.metrics.sgTotal?.platform).toBe(75);
  });
});

describe('teamPercentileReadout', () => {
  it(`withholds the number below ${PERCENTILE_MIN_TEAM_N} teammates`, () => {
    expect(teamPercentileReadout({ team: 100, teamN: 1 })).toBeNull();
    expect(teamPercentileReadout({ team: 100, teamN: PERCENTILE_MIN_TEAM_N - 1 })).toBeNull();
    expect(teamPercentileReadout({ team: 100 })).toBeNull();
  });

  it('prints a rounded percentile at or above the floor', () => {
    expect(teamPercentileReadout({ team: 83.33, teamN: PERCENTILE_MIN_TEAM_N })).toBe('83rd %ile');
    expect(teamPercentileReadout({ team: 12, teamN: 9 })).toBe('12th %ile');
    expect(teamPercentileReadout({ team: 80, teamN: 9 })).toBe('80th %ile');
  });
});

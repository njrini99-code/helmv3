import { describe, it, expect } from 'vitest';
import { computeTeamGrade, computeTeamComputedInsights } from '@/lib/admin/data/team-grade';

describe('computeTeamGrade', () => {
  it('is D for a dormant team regardless of anything else', () => {
    expect(computeTeamGrade({ health: 'dormant', errors7d: 0, dormantRosterRatio: 0 })).toBe('D');
  });

  it('is C when errors7d is high or most of the roster is dormant', () => {
    expect(computeTeamGrade({ health: 'active', errors7d: 6, dormantRosterRatio: 0 })).toBe('C');
    expect(computeTeamGrade({ health: 'active', errors7d: 0, dormantRosterRatio: 0.6 })).toBe('C');
  });

  it('is B for cooling, any errors, or a moderately dormant roster', () => {
    expect(computeTeamGrade({ health: 'cooling', errors7d: 0, dormantRosterRatio: 0 })).toBe('B');
    expect(computeTeamGrade({ health: 'active', errors7d: 1, dormantRosterRatio: 0 })).toBe('B');
    expect(computeTeamGrade({ health: 'active', errors7d: 0, dormantRosterRatio: 0.3 })).toBe('B');
  });

  it('is A for a clean, active, error-free team', () => {
    expect(computeTeamGrade({ health: 'active', errors7d: 0, dormantRosterRatio: 0 })).toBe('A');
  });
});

describe('computeTeamComputedInsights', () => {
  it('flags dormant players by count', () => {
    const insights = computeTeamComputedInsights(
      [{ activityStatus: 'dormant' }, { activityStatus: 'dormant' }, { activityStatus: 'active' }],
      5,
      0,
    );
    expect(insights).toContain('2 players inactive 14+ days');
  });

  it('flags zero rounds in 30d only when the roster is non-empty', () => {
    expect(computeTeamComputedInsights([{ activityStatus: 'active' }], 0, 0)).toContain(
      'No rounds logged in the last 30 days',
    );
    expect(computeTeamComputedInsights([], 0, 0)).not.toContain('No rounds logged in the last 30 days');
  });

  it('flags recent errors', () => {
    expect(computeTeamComputedInsights([{ activityStatus: 'active' }], 5, 3)).toContain(
      '3 errors in the last 7 days',
    );
  });

  it('is a clean, positive statement when everything is healthy', () => {
    const insights = computeTeamComputedInsights([{ activityStatus: 'active' }], 5, 0);
    expect(insights).toEqual(['Team is fully active with no errors']);
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** DF-P-13: one rule names a team's Tour on every page, the round review's: its own strokes gained baseline, else its gender's. */
describe('teamTour (DF-P-13)', () => {
  it('a baseline the team set wins over its gender, as the round review reads it', async () => {
    const { teamTour } = await import('../stats-common');
    const { reviewTour } = await import('../round-review-shape');
    expect(teamTour({ gender: 'mens', golf_team_settings: { sg_baseline: 'womens' } })).toBe('lpga');
    expect(teamTour({ gender: 'womens', golf_team_settings: [{ sg_baseline: 'pga_tour' }] })).toBe('pga');
    for (const [gender, baseline] of [['mens', 'womens'], ['womens', 'pga_tour'], ['womens', null], ['mens', 'd1']] as const) {
      expect(teamTour({ gender, golf_team_settings: { sg_baseline: baseline } })).toBe(reviewTour(gender === 'womens' ? 'lpga' : 'pga', baseline));
    }
  });

  it('no settings row (none written, or one the reader cannot see) is the gender’s Tour', async () => {
    const { teamTour } = await import('../stats-common');
    expect(teamTour({ gender: 'womens', golf_team_settings: null })).toBe('lpga');
    expect(teamTour({ gender: 'mens' })).toBe('pga');
    expect(teamTour(null)).toBe('pga');
  });
});

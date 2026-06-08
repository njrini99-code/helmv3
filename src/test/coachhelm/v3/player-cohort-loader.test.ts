import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
const eq2 = vi.fn(() => ({ maybeSingle }));
const eq1 = vi.fn(() => ({ eq: eq2 }));
const select = vi.fn(() => ({ eq: eq1 }));
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from }),
}));

import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';

describe('loadPlayerCohort', () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    from.mockClear();
  });

  it('resolves a women\'s-team player to gender=womens', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { golf_teams: { gender: 'womens', division: 'd1' } },
      error: null,
    });
    const c = await loadPlayerCohort('grace');
    expect(c.gender).toBe('womens');
  });

  it('defaults to mens when the team has no gender (men\'s baseline unchanged)', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { golf_teams: { gender: null, division: null } },
      error: null,
    });
    const c = await loadPlayerCohort('p1');
    expect(c.gender).toBe('mens');
  });

  it('fails safe to mens on a lookup error (never throws into a cron run)', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const c = await loadPlayerCohort('p1');
    expect(c.gender).toBe('mens');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// loadPlayerCohort now LISTS active memberships (no .maybeSingle()) so a 2+
// active-membership data anomaly can never throw. Terminal call is the second
// .eq('status','active'), which resolves to { data: rows[], error }.
const eqStatus = vi.fn();
const eqPlayer = vi.fn(() => ({ eq: eqStatus }));
const select = vi.fn(() => ({ eq: eqPlayer }));
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from }),
}));

import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';

describe('loadPlayerCohort', () => {
  beforeEach(() => {
    eqStatus.mockReset();
    from.mockClear();
  });

  it("resolves a women's-team player to gender=womens", async () => {
    eqStatus.mockResolvedValueOnce({
      data: [{ golf_teams: { gender: 'womens', division: 'd1' } }],
      error: null,
    });
    const c = await loadPlayerCohort('grace');
    expect(c.gender).toBe('womens');
  });

  it("defaults to mens when the team has no gender (men's baseline unchanged)", async () => {
    eqStatus.mockResolvedValueOnce({
      data: [{ golf_teams: { gender: null, division: null } }],
      error: null,
    });
    const c = await loadPlayerCohort('p1');
    expect(c.gender).toBe('mens');
  });

  it('classifies womens if ANY active membership is womens (2-membership anomaly never throws)', async () => {
    eqStatus.mockResolvedValueOnce({
      data: [
        { golf_teams: { gender: 'mens' } },
        { golf_teams: { gender: 'womens' } },
      ],
      error: null,
    });
    const c = await loadPlayerCohort('anomaly');
    expect(c.gender).toBe('womens');
  });

  it('defaults to mens when there are no active memberships', async () => {
    eqStatus.mockResolvedValueOnce({ data: [], error: null });
    const c = await loadPlayerCohort('p1');
    expect(c.gender).toBe('mens');
  });

  it('fails safe to mens on a lookup error (never throws into a cron run)', async () => {
    eqStatus.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const c = await loadPlayerCohort('p1');
    expect(c.gender).toBe('mens');
  });
});

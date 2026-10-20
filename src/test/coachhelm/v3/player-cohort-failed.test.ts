import { beforeEach, describe, expect, it, vi } from 'vitest';

// A failed cohort lookup falls back to the men's default for the generators and the cron (a run must never throw). It now says it
// fell back (`failed`), so a page that would state the cohort as fact (Clubhouse Standing) can say it could not confirm it.
const eqStatus = vi.fn();
const eqPlayer = vi.fn(() => ({ eq: eqStatus }));
const select = vi.fn(() => ({ eq: eqPlayer }));
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined) }));

import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';

describe('loadPlayerCohort, failed', () => {
  beforeEach(() => {
    eqStatus.mockReset();
  });

  it('a lookup error is the men’s default marked failed', async () => {
    eqStatus.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await loadPlayerCohort('p1')).toEqual({ gender: 'mens', level: null, failed: true });
  });

  it('a lookup that throws is the same', async () => {
    eqStatus.mockRejectedValueOnce(new Error('down'));
    expect(await loadPlayerCohort('p1')).toMatchObject({ gender: 'mens', failed: true });
  });

  it('a lookup that read is never marked: the men’s default for no team, or the answer', async () => {
    eqStatus.mockResolvedValueOnce({ data: [], error: null });
    expect(await loadPlayerCohort('p1')).toEqual({ gender: 'mens', level: null });
    eqStatus.mockResolvedValueOnce({ data: [{ golf_teams: { gender: 'womens' } }], error: null });
    expect(await loadPlayerCohort('p2')).toEqual({ gender: 'womens', level: null });
  });
});

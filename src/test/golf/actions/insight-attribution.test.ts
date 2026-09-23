/**
 * A9 slice 3 (repair-plan §14.12): the server-action flag gate on
 * `getInsightAttributionReadout` / `getPlayerAttributionReadouts`
 * (`src/app/golf/actions/insight-attribution.ts`). `attribution-read.ts`
 * (the loader) and `attribution-view-model.ts` are mocked/real
 * respectively per test — see each describe block.
 *
 * Required coverage (team-lead, A9 slice 3): flag-off makes NO DB call,
 * and a failed read renders nothing (returns `null` at this layer, which
 * `AttributionReadout.tsx` then renders as nothing).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const isFlagEnabledMock = vi.fn().mockReturnValue(false);
vi.mock('@/lib/flags', () => ({ isFlagEnabled: (...args: unknown[]) => isFlagEnabledMock(...args) }));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

const verifyPlayerAccessMock = vi.fn();
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => verifyPlayerAccessMock(...args),
}));

const readAttributionForInsightMock = vi.fn();
const readAttributionForPlayerMock = vi.fn();
vi.mock('@/lib/coachhelm/v3/effectiveness/attribution-read', () => ({
  readAttributionForInsight: (...args: unknown[]) => readAttributionForInsightMock(...args),
  readAttributionForPlayer: (...args: unknown[]) => readAttributionForPlayerMock(...args),
}));

import { getInsightAttributionReadout, getPlayerAttributionReadouts } from '@/app/golf/actions/insight-attribution';

const AUTHED_USER = { id: 'user-1' };

function makeSb() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: AUTHED_USER }, error: null }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isFlagEnabledMock.mockReturnValue(false);
});

describe('getInsightAttributionReadout', () => {
  it('flag off: returns null and makes NO DB call at all — createClient is never invoked', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const result = await getInsightAttributionReadout('insight-1');
    expect(result).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(readAttributionForInsightMock).not.toHaveBeenCalled();
  });

  it('empty insight id: returns null without calling isFlagEnabled or the client', async () => {
    const result = await getInsightAttributionReadout('');
    expect(result).toBeNull();
    expect(isFlagEnabledMock).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('flag on, not authenticated: returns null', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const sb = makeSb();
    sb.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });
    createClientMock.mockResolvedValue(sb);
    const result = await getInsightAttributionReadout('insight-1');
    expect(result).toBeNull();
    expect(readAttributionForInsightMock).not.toHaveBeenCalled();
  });

  it('flag on, authenticated, a FAILED read renders nothing: { ok: false } from the loader returns null, never a fabricated readout', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(makeSb());
    readAttributionForInsightMock.mockResolvedValue({ ok: false });
    const result = await getInsightAttributionReadout('insight-1');
    expect(result).toBeNull();
  });

  it('flag on, authenticated, no attribution row yet: returns the real `missing` state (not null)', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(makeSb());
    readAttributionForInsightMock.mockResolvedValue({ ok: true, rows: [] });
    const result = await getInsightAttributionReadout('insight-1');
    expect(result).toEqual({ state: 'missing' });
  });

  it('flag on, authenticated, a row found: returns a result readout built by the real view model', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(makeSb());
    readAttributionForInsightMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          insight_id: 'insight-1',
          target_metric_id: 'sg_total',
          baseline_value: 1,
          post_value: 2,
          delta: 1,
          n_rounds_before: 5,
          n_rounds_after: 5,
          method_version: 'comparable_opportunities_v1',
        },
      ],
    });
    const result = await getInsightAttributionReadout('insight-1');
    expect(result?.state).toBe('result');
  });
});

describe('getPlayerAttributionReadouts', () => {
  it('flag off: returns null and makes NO DB call at all', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const result = await getPlayerAttributionReadouts('player-1');
    expect(result).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(readAttributionForPlayerMock).not.toHaveBeenCalled();
  });

  it('flag on, access denied: returns null without reading attribution rows', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(makeSb());
    verifyPlayerAccessMock.mockResolvedValue({ allowed: false });
    const result = await getPlayerAttributionReadouts('player-1');
    expect(result).toBeNull();
    expect(readAttributionForPlayerMock).not.toHaveBeenCalled();
  });

  it('flag on, authorized, a failed read renders nothing', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(makeSb());
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true });
    readAttributionForPlayerMock.mockResolvedValue({ ok: false });
    const result = await getPlayerAttributionReadouts('player-1');
    expect(result).toBeNull();
  });

  it('flag on, authorized, rows found: keyed by insight_id', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(makeSb());
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true });
    readAttributionForPlayerMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          insight_id: 'insight-a',
          target_metric_id: 'sg_total',
          baseline_value: 1,
          post_value: 2,
          delta: 1,
          n_rounds_before: 5,
          n_rounds_after: 5,
          method_version: null,
        },
      ],
    });
    const result = await getPlayerAttributionReadouts('player-1');
    expect(result).not.toBeNull();
    expect(Object.keys(result ?? {})).toEqual(['insight-a']);
    expect(result?.['insight-a']?.state).toBe('result');
  });
});

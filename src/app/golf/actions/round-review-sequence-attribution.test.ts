/**
 * A4 slice 3b — `getRoundReviewSequenceAttribution` gate tests.
 *
 * Covers the two "never do this" contracts from the task spec: the flag-off
 * path must make ZERO DB calls (not just skip rendering), and a failed
 * downstream read must surface as `null`, not `[]` or a thrown rejection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VerifyResult } from '@/lib/auth/verify-player-access';

const mocks = vi.hoisted(() => ({
  isFlagEnabled: vi.fn(() => false),
  createClient: vi.fn(async () => ({ auth: { getUser: vi.fn() } })),
  verifyPlayerAccess: vi.fn(async (): Promise<VerifyResult> => ({ allowed: false })),
  loadSequenceAttribution: vi.fn(async () => null as unknown),
}));

vi.mock('@/lib/flags', () => ({ isFlagEnabled: mocks.isFlagEnabled }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyPlayerAccess: mocks.verifyPlayerAccess }));
vi.mock('@/lib/coachhelm/v3/metrics/load-sequence-attribution', () => ({
  loadSequenceAttribution: mocks.loadSequenceAttribution,
}));

import { getRoundReviewSequenceAttribution } from './round-review-sequence-attribution';

const PLAYER_ID = '11111111-1111-1111-1111-111111111111';

describe('getRoundReviewSequenceAttribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFlagEnabled.mockReturnValue(false);
  });

  it('flag off: returns null and makes ZERO DB calls — createClient is never invoked', async () => {
    mocks.isFlagEnabled.mockReturnValue(false);

    const result = await getRoundReviewSequenceAttribution(PLAYER_ID);

    expect(result).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.verifyPlayerAccess).not.toHaveBeenCalled();
    expect(mocks.loadSequenceAttribution).not.toHaveBeenCalled();
  });

  it('malformed player id: returns null without calling createClient (flag on)', async () => {
    mocks.isFlagEnabled.mockReturnValue(true);

    const result = await getRoundReviewSequenceAttribution('not-a-uuid');

    expect(result).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('unauthenticated: returns null (flag on, no user on the session)', async () => {
    mocks.isFlagEnabled.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    } as never);

    const result = await getRoundReviewSequenceAttribution(PLAYER_ID);

    expect(result).toBeNull();
    expect(mocks.verifyPlayerAccess).not.toHaveBeenCalled();
  });

  it('unauthorized: returns null when verifyPlayerAccess denies (flag on, authenticated)', async () => {
    mocks.isFlagEnabled.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    } as never);
    mocks.verifyPlayerAccess.mockResolvedValue({ allowed: false });

    const result = await getRoundReviewSequenceAttribution(PLAYER_ID);

    expect(result).toBeNull();
    expect(mocks.loadSequenceAttribution).not.toHaveBeenCalled();
  });

  it('failed read: a null from loadSequenceAttribution passes straight through as null, never []', async () => {
    mocks.isFlagEnabled.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    } as never);
    mocks.verifyPlayerAccess.mockResolvedValue({ allowed: true, reason: 'self' });
    mocks.loadSequenceAttribution.mockResolvedValue(null);

    const result = await getRoundReviewSequenceAttribution(PLAYER_ID);

    expect(result).toBeNull();
  });

  it('authorized + successful read: returns the rollup rows', async () => {
    mocks.isFlagEnabled.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    } as never);
    mocks.verifyPlayerAccess.mockResolvedValue({ allowed: true, reason: 'coach' });
    const rows = [{ metricId: 'sequence_event_strokes_gained' }];
    mocks.loadSequenceAttribution.mockResolvedValue(rows);

    const result = await getRoundReviewSequenceAttribution(PLAYER_ID);

    expect(result).toBe(rows);
  });
});

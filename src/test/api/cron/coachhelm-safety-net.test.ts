import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/coachhelm-safety-net/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';

const createAdminMock = vi.mocked(createAdminClient);
const postRoundTriggerMock = vi.mocked(postRoundTrigger);

type PendingRound = { id: string; player_id: string; created_at: string };

/**
 * Build a chainable mock that resolves the pending-rounds query.
 * The route's chain is:
 *   .from('golf_rounds').select(...).eq('round_status','completed')
 *     .is('coachhelm_analyzed_at',null).is('coachhelm_failed_at',null)
 *     .gte('created_at',...).order(...).limit(...)
 * Each method must be chainable; the final `.limit(...)` resolves.
 */
function buildSupabase(rounds: PendingRound[] | null, roundsError: string | null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: rounds,
      error: roundsError ? { message: roundsError, code: 'XX' } : null,
    }),
  };
  return {
    from: vi.fn(() => chain),
  } as unknown as ReturnType<typeof createAdminClient>;
}

describe('GET /api/cron/coachhelm-safety-net', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
    postRoundTriggerMock.mockReset();
    postRoundTriggerMock.mockResolvedValue(undefined);
    process.env.CRON_SECRET = 'cs';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects without bearer token', async () => {
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-safety-net') as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(401);
  });

  it('returns a summary when there are no pending rounds', async () => {
    createAdminMock.mockReturnValueOnce(buildSupabase([], null));
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-safety-net', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      pending: number;
      recovered: number;
      failed: number;
      concurrency: number;
    };
    expect(body.success).toBe(true);
    expect(body.pending).toBe(0);
    expect(body.recovered).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.concurrency).toBe(5);
    expect(postRoundTriggerMock).not.toHaveBeenCalled();
  });

  it('returns 500 when fetching rounds errors', async () => {
    createAdminMock.mockReturnValueOnce(buildSupabase(null, 'boom'));
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-safety-net', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(500);
  });

  it('processes pending rounds with chunked concurrency', async () => {
    const pending: PendingRound[] = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      player_id: `p${i}`,
      created_at: new Date().toISOString(),
    }));
    createAdminMock.mockReturnValueOnce(buildSupabase(pending, null));

    const res = await GET(
      new Request('http://x/api/cron/coachhelm-safety-net', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { pending: number; recovered: number; failed: number };
    expect(body.pending).toBe(12);
    expect(body.recovered).toBe(12);
    expect(body.failed).toBe(0);
    expect(postRoundTriggerMock).toHaveBeenCalledTimes(12);
  });

  it('counts rejected postRoundTrigger calls as failed', async () => {
    const pending: PendingRound[] = [
      { id: 'r1', player_id: 'p1', created_at: new Date().toISOString() },
    ];
    createAdminMock.mockReturnValueOnce(buildSupabase(pending, null));
    postRoundTriggerMock.mockRejectedValueOnce(new Error('engine_boom'));

    const res = await GET(
      new Request('http://x/api/cron/coachhelm-safety-net', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { recovered: number; failed: number };
    expect(body.recovered).toBe(0);
    expect(body.failed).toBe(1);
  });
});

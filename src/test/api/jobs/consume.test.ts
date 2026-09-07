import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotificationDirect: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/notifications/push', () => ({
  sendPushNotificationDirect: vi.fn().mockResolvedValue({ success: true }),
}));

import { GET } from '@/app/api/jobs/consume/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';

const createAdminMock = vi.mocked(createAdminClient);

function req() {
  return new Request('http://x/api/jobs/consume', {
    headers: { authorization: 'Bearer cs' },
  }) as unknown as import('next/server').NextRequest;
}

describe('GET /api/jobs/consume', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
    process.env.CRON_SECRET = 'cs';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects when the bearer token is missing or wrong', async () => {
    const res = await GET(
      new Request('http://x/api/jobs/consume') as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(401);
  });

  it('degrades to a 200 no-op per queue when the pgmq facade is not applied', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    createAdminMock.mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; results: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.results['coachhelm_analysis']).toEqual({ skipped: 'migration-not-applied', code: 'PGRST202' });
  });

  it('reads a batch, runs the handler, and acks on success', async () => {
    const rpc = vi.fn((fn: string, args?: Record<string, unknown>) => {
      if (fn === 'helm_jobs_read_batch') {
        if (args?.p_queue === 'coachhelm_analysis') {
          return Promise.resolve({
            data: [{ msg_id: 1, read_ct: 1, enqueued_at: 'x', vt: 'y', message: { roundId: 'r1', playerId: 'p1' } }],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      }
      if (fn === 'helm_jobs_ack') return Promise.resolve({ data: true, error: null });
      if (fn === 'helm_jobs_fail') return Promise.resolve({ data: { outcome: 'requeued' }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    createAdminMock.mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: { coachhelm_analysis: { read: number; acked: number; failed: number } };
    };
    expect(body.results.coachhelm_analysis.read).toBe(1);
    expect(body.results.coachhelm_analysis.acked).toBe(1);
    expect(body.results.coachhelm_analysis.failed).toBe(0);
    expect(postRoundTrigger).toHaveBeenCalledWith(expect.anything(), {
      playerId: 'p1',
      roundId: 'r1',
      triggerReason: 'round_submitted',
    });
    expect(rpc).toHaveBeenCalledWith('helm_jobs_ack', { p_queue: 'coachhelm_analysis', p_msg_id: 1 });
  });

  it('calls helm_jobs_fail when the handler throws', async () => {
    vi.mocked(postRoundTrigger).mockResolvedValueOnce({ success: false, error: 'boom' });
    const rpc = vi.fn((fn: string, args?: Record<string, unknown>) => {
      if (fn === 'helm_jobs_read_batch') {
        if (args?.p_queue === 'coachhelm_analysis') {
          return Promise.resolve({
            data: [{ msg_id: 2, read_ct: 1, enqueued_at: 'x', vt: 'y', message: { roundId: 'r2', playerId: 'p2' } }],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      }
      if (fn === 'helm_jobs_fail') return Promise.resolve({ data: { outcome: 'requeued' }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    createAdminMock.mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: { coachhelm_analysis: { failed: number; acked: number } };
    };
    expect(body.results.coachhelm_analysis.failed).toBe(1);
    expect(body.results.coachhelm_analysis.acked).toBe(0);
    expect(rpc).toHaveBeenCalledWith('helm_jobs_fail', {
      p_queue: 'coachhelm_analysis',
      p_msg_id: 2,
      p_error: expect.stringContaining('boom'),
    });
  });
});

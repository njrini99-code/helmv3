import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

import { enqueueJob, isHelmQueueEnabled } from '@/lib/jobs/enqueue';
import { createAdminClient } from '@/lib/supabase/admin';

const createAdminMock = vi.mocked(createAdminClient);

describe('enqueueJob', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
    delete process.env.HELM_QUEUE_ENABLED;
  });

  afterEach(() => {
    delete process.env.HELM_QUEUE_ENABLED;
  });

  it('is disabled by default', () => {
    expect(isHelmQueueEnabled()).toBe(false);
  });

  it('fails open with queue_disabled when HELM_QUEUE_ENABLED is unset', async () => {
    const result = await enqueueJob('coachhelm_analysis', { roundId: 'r1' });
    expect(result).toEqual({ queued: false, reason: 'queue_disabled' });
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it('fails open with facade_missing when the RPC is not found', async () => {
    process.env.HELM_QUEUE_ENABLED = 'true';
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    createAdminMock.mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);

    const result = await enqueueJob('coachhelm_analysis', { roundId: 'r1' });
    expect(result).toEqual({ queued: false, reason: 'facade_missing' });
  });

  it('returns queued:true with the msg_id on success', async () => {
    process.env.HELM_QUEUE_ENABLED = 'true';
    const rpc = vi.fn().mockResolvedValue({ data: 42, error: null });
    createAdminMock.mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);

    const result = await enqueueJob('email_send', { type: 'x' }, { dedupeKey: 'k1' });
    expect(result).toEqual({ queued: true, msgId: 42 });
    expect(rpc).toHaveBeenCalledWith('helm_jobs_enqueue', {
      p_queue: 'email_send',
      p_payload: { type: 'x' },
      p_dedupe_key: 'k1',
    });
  });

  it('fails open with enqueue_failed on an unexpected error', async () => {
    process.env.HELM_QUEUE_ENABLED = 'true';
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '55000', message: 'lock timeout' } });
    createAdminMock.mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);

    const result = await enqueueJob('push_send', { userId: 'u1' });
    expect(result).toEqual({ queued: false, reason: 'enqueue_failed' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseErrorEnvelope } from '../envelope';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  vercelWaitUntil: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));
vi.mock('../../vercel-wait-until', () => ({ vercelWaitUntil: mocks.vercelWaitUntil }));

import { recordDbErrorOutOfBand, scheduleDbErrorRecording } from '../record-db-error';

function envelope(overrides: Partial<SupabaseErrorEnvelope> = {}): SupabaseErrorEnvelope {
  return {
    occurredAt: '2026-09-03T12:00:00.000Z',
    source: 'supabase',
    service: 'postgrest',
    environment: 'production',
    releaseSha: null,
    runtime: 'node',
    sport: 'golf',
    feature: 'round_tracking',
    action: 'save_partial_round',
    journey: null,
    operation: 'rpc',
    relation: null,
    rpc: 'save_partial_round_atomic',
    functionName: 'save_partial_round_atomic',
    bucketClass: null,
    code: '42501',
    sqlstate: '42501',
    postgrestCode: null,
    authCode: null,
    storageCode: null,
    httpStatus: null,
    retryability: 'no',
    expectedness: 'unexpected',
    severity: 'error',
    fingerprint: 'supabase|postgrest|round_tracking|rpc|save_partial_round_atomic|42501',
    normalizedMessage: 'permission denied',
    safeDetails: null,
    safeHint: null,
    sentryTraceId: null,
    sentrySpanId: null,
    helmTraceId: null,
    durationMs: 50,
    attempt: 1,
    terminal: true,
    safeMetadata: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordDbErrorOutOfBand', () => {
  it('returns ok:true with an errorId on a successful write', async () => {
    mocks.rpc.mockResolvedValue({ data: 'row-id-123', error: null });
    const result = await recordDbErrorOutOfBand(envelope());
    expect(result.ok).toBe(true);
    expect(result.errorId).toBe('row-id-123');
    expect(mocks.rpc).toHaveBeenCalledWith('record_db_error_event', expect.objectContaining({ p_fingerprint: envelope().fingerprint }));
  });

  it.each(['PGRST202', '42883', '42P01', '3F000'])(
    'degrades to ok:true, skipped:migration-not-applied on %s rather than surfacing a failure',
    async (code) => {
      mocks.rpc.mockResolvedValue({ data: null, error: { code, message: 'nope' } });
      const result = await recordDbErrorOutOfBand(envelope());
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe('migration-not-applied');
    },
  );

  it('recognizes a message-only "does not exist" shape when code is absent', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: null, message: 'relation "helm_debug.db_error_events" does not exist' } });
    const result = await recordDbErrorOutOfBand(envelope());
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe('migration-not-applied');
  });

  it('a genuine (non-migration) error is reported as a failure, not swallowed as success', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } });
    const result = await recordDbErrorOutOfBand(envelope());
    expect(result.ok).toBe(false);
    expect(result.failure).toContain('connection failure');
  });

  it('fails open (never rejects) when createAdminClient itself throws', async () => {
    mocks.rpc.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(recordDbErrorOutOfBand(envelope())).resolves.toEqual(expect.objectContaining({ ok: false }));
  });

  it('times out rather than hanging when the RPC never settles', async () => {
    mocks.rpc.mockReturnValue(new Promise(() => {})); // never resolves
    const result = await recordDbErrorOutOfBand(envelope());
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe('timed-out');
  }, 10_000);

  it('forwards p_force_individual_row when the caller requests the P0/P1 path', async () => {
    mocks.rpc.mockResolvedValue({ data: 'row-id', error: null });
    await recordDbErrorOutOfBand(envelope(), { forceIndividualRow: true });
    expect(mocks.rpc).toHaveBeenCalledWith('record_db_error_event', expect.objectContaining({ p_force_individual_row: true }));
  });
});

describe('scheduleDbErrorRecording', () => {
  it('registers the write with vercelWaitUntil and returns synchronously (fire-and-forget)', () => {
    mocks.rpc.mockResolvedValue({ data: 'row-id', error: null });
    const result = scheduleDbErrorRecording(envelope());
    expect(result).toBeUndefined();
    expect(mocks.vercelWaitUntil).toHaveBeenCalledTimes(1);
    expect(mocks.vercelWaitUntil).toHaveBeenCalledWith(expect.any(Promise));
  });
});

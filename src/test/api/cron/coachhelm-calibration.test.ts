import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/coachhelm-calibration/route';
import { createAdminClient } from '@/lib/supabase/admin';

const createAdminMock = vi.mocked(createAdminClient);

type Row = {
  within_interval: boolean | null;
  golf_predictions: { confidence: number | null; metric: string | null };
};

function mockSupabase(
  rows: Row[] | null,
  fetchError: string | null = null,
  upsertError: string | null = null,
  upsertSpy?: ReturnType<typeof vi.fn>,
) {
  const selectBuilder = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: rows,
      error: fetchError ? { message: fetchError, code: 'XX' } : null,
    }),
  };
  const upsertBuilder = {
    upsert: upsertSpy ?? vi.fn().mockResolvedValue({
      error: upsertError ? { message: upsertError, code: 'YY' } : null,
    }),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === 'golf_prediction_validations') return selectBuilder;
      if (table === 'golf_confidence_calibration') return upsertBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

describe('GET /api/cron/coachhelm-calibration', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
    process.env.CRON_SECRET = 'cs';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects when the bearer token is missing or wrong', async () => {
    const res1 = await GET(
      new Request('http://x/api/cron/coachhelm-calibration') as unknown as import('next/server').NextRequest,
    );
    expect(res1.status).toBe(401);

    const res2 = await GET(
      new Request('http://x/api/cron/coachhelm-calibration', {
        headers: { authorization: 'Bearer wrong' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res2.status).toBe(401);
  });

  it('returns 200 with zero buckets when there are no validations', async () => {
    createAdminMock.mockReturnValueOnce(mockSupabase([]));
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-calibration', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; bucketsWritten: number };
    expect(body.success).toBe(true);
    expect(body.bucketsWritten).toBe(0);
  });

  it('groups validations into buckets and upserts to golf_confidence_calibration', async () => {
    const rows: Row[] = [
      // scoreToPar, confidence 0.85 bucket=0.8, within=true
      { within_interval: true, golf_predictions: { confidence: 0.85, metric: 'scoreToPar' } },
      // scoreToPar, confidence 0.82 bucket=0.8, within=false
      { within_interval: false, golf_predictions: { confidence: 0.82, metric: 'scoreToPar' } },
      // putts, confidence 0.55 bucket=0.4, within=true
      { within_interval: true, golf_predictions: { confidence: 0.55, metric: 'putts' } },
    ];
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    createAdminMock.mockReturnValueOnce(mockSupabase(rows, null, null, upsertSpy));

    const res = await GET(
      new Request('http://x/api/cron/coachhelm-calibration', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bucketsWritten: number; totalValidations: number };
    expect(body.totalValidations).toBe(3);
    expect(body.bucketsWritten).toBe(2); // one per (metric, bucket) key

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsertSpy.mock.calls[0] as [
      Array<Record<string, unknown>>,
      { onConflict: string },
    ];
    expect(opts.onConflict).toBe('bucket,prediction_type');
    const scoreBucket = payload.find((p) => p.prediction_type === 'scoreToPar');
    expect(scoreBucket).toBeDefined();
    expect(scoreBucket?.bucket).toBe(0.8);
    expect(scoreBucket?.predictions_count).toBe(2);
    expect(scoreBucket?.correct_count).toBe(1);
    expect(scoreBucket?.actual_accuracy).toBe(0.5);

    const puttsBucket = payload.find((p) => p.prediction_type === 'putts');
    expect(puttsBucket?.bucket).toBe(0.4);
    expect(puttsBucket?.correct_count).toBe(1);
    expect(puttsBucket?.actual_accuracy).toBe(1);
  });

  it('returns 500 when the fetch query errors', async () => {
    createAdminMock.mockReturnValueOnce(mockSupabase(null, 'db down'));
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-calibration', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(500);
  });

  it('returns 500 when the upsert errors', async () => {
    const rows: Row[] = [
      { within_interval: true, golf_predictions: { confidence: 0.9, metric: 'scoreToPar' } },
    ];
    createAdminMock.mockReturnValueOnce(mockSupabase(rows, null, 'upsert bad'));
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-calibration', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(500);
  });
});

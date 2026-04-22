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

type Validation = { prediction_id: string | null; within_interval: boolean | null };
type Prediction = { id: string; confidence: number | null; metric: string | null };

function buildSupabase(opts: {
  validations: Validation[] | null;
  validationsError?: string | null;
  predictions?: Prediction[];
  predictionsError?: string | null;
  upsertError?: string | null;
  upsertSpy?: ReturnType<typeof vi.fn>;
}) {
  const validationsBuilder = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: opts.validations,
      error: opts.validationsError ? { message: opts.validationsError, code: 'VV' } : null,
    }),
  };
  const predictionsBuilder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: opts.predictions ?? [],
      error: opts.predictionsError ? { message: opts.predictionsError, code: 'PP' } : null,
    }),
  };
  const upsertBuilder = {
    upsert:
      opts.upsertSpy ??
      vi.fn().mockResolvedValue({
        error: opts.upsertError ? { message: opts.upsertError, code: 'UU' } : null,
      }),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === 'golf_prediction_validations') return validationsBuilder;
      if (table === 'golf_predictions') return predictionsBuilder;
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
    createAdminMock.mockReturnValueOnce(buildSupabase({ validations: [] }));
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

  it('joins validations to predictions, buckets, and upserts', async () => {
    const validations: Validation[] = [
      { prediction_id: 'p1', within_interval: true },
      { prediction_id: 'p2', within_interval: false },
      { prediction_id: 'p3', within_interval: true },
    ];
    const predictions: Prediction[] = [
      { id: 'p1', confidence: 0.85, metric: 'scoreToPar' }, // bucket 0.8
      { id: 'p2', confidence: 0.82, metric: 'scoreToPar' }, // bucket 0.8
      { id: 'p3', confidence: 0.55, metric: 'putts' }, // bucket 0.4
    ];
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });

    createAdminMock.mockReturnValueOnce(
      buildSupabase({ validations, predictions, upsertSpy }),
    );

    const res = await GET(
      new Request('http://x/api/cron/coachhelm-calibration', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { bucketsWritten: number; totalValidations: number };
    expect(body.totalValidations).toBe(3);
    expect(body.bucketsWritten).toBe(2);

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

  it('returns 500 when the validations query errors', async () => {
    createAdminMock.mockReturnValueOnce(
      buildSupabase({ validations: null, validationsError: 'db down' }),
    );
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-calibration', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(500);
  });

  it('returns 500 when the predictions follow-up query errors', async () => {
    createAdminMock.mockReturnValueOnce(
      buildSupabase({
        validations: [{ prediction_id: 'p1', within_interval: true }],
        predictionsError: 'preds down',
      }),
    );
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-calibration', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(500);
  });

  it('returns 500 when the upsert errors', async () => {
    createAdminMock.mockReturnValueOnce(
      buildSupabase({
        validations: [{ prediction_id: 'p1', within_interval: true }],
        predictions: [{ id: 'p1', confidence: 0.9, metric: 'scoreToPar' }],
        upsertError: 'upsert bad',
      }),
    );
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-calibration', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(500);
  });
});

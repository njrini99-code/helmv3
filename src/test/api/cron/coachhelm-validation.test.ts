import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mocks (hoisted; keep inline factories pure of top-level closures) ----

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/coachhelm/v2/learning/outcome-validator', () => ({
  validatePredictionAgainstOutcome: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/coachhelm-validation/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePredictionAgainstOutcome } from '@/lib/coachhelm/v2/learning/outcome-validator';

const createAdminMock = vi.mocked(createAdminClient);
const validateMock = vi.mocked(validatePredictionAgainstOutcome);

// Minimal supabase query-builder stub that resolves to { data, error }
function mockSupabase(ripeRows: unknown[] | null, errorMessage: string | null = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: ripeRows,
      error: errorMessage ? { message: errorMessage, code: 'XXYY' } : null,
    }),
  };
  return {
    from: vi.fn().mockReturnValue(builder),
  } as unknown as ReturnType<typeof createAdminClient>;
}

describe('GET /api/cron/coachhelm-validation', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
    validateMock.mockReset();
    process.env.CRON_SECRET = 'cs';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects when authorization header is missing', async () => {
    const req = new Request('http://x/api/cron/coachhelm-validation');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(401);
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it('rejects when the bearer token is wrong', async () => {
    const req = new Request('http://x/api/cron/coachhelm-validation', {
      headers: { authorization: 'Bearer nope' },
    });
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(401);
  });

  it('returns a summary with zero work when there are no ripe predictions', async () => {
    createAdminMock.mockReturnValueOnce(mockSupabase([]));
    const req = new Request('http://x/api/cron/coachhelm-validation', {
      headers: { authorization: 'Bearer cs' },
    });
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      validated: number;
      failed: number;
      total: number;
    };
    expect(body.success).toBe(true);
    expect(body.validated).toBe(0);
    expect(body.total).toBe(0);
  });

  it('calls validatePredictionAgainstOutcome for each ripe prediction', async () => {
    const rows = [
      {
        id: 'p1',
        player_id: 'pl1',
        metric: 'scoreToPar',
        predicted_value: 2,
        predicted_low: 1,
        predicted_high: 3,
        confidence_interval_low: null,
        confidence_interval_high: null,
        due_date: '2026-04-01',
        created_at: '2026-03-25T00:00:00Z',
        related_round_id: null,
      },
      {
        id: 'p2',
        player_id: 'pl2',
        metric: 'putts',
        predicted_value: 30,
        predicted_low: 28,
        predicted_high: 32,
        confidence_interval_low: null,
        confidence_interval_high: null,
        due_date: '2026-04-02',
        created_at: '2026-03-26T00:00:00Z',
        related_round_id: null,
      },
    ];
    createAdminMock.mockReturnValueOnce(mockSupabase(rows));
    validateMock
      .mockResolvedValueOnce({
        predictionId: 'p1',
        validationId: 'v1',
        actualValue: 2.5,
        error: 0.5,
        withinInterval: true,
        direction: 'accurate',
      })
      .mockResolvedValueOnce(null); // p2: no round yet, skipped

    const req = new Request('http://x/api/cron/coachhelm-validation', {
      headers: { authorization: 'Bearer cs' },
    });
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      validated: number;
      skipped: number;
      failed: number;
      total: number;
    };
    expect(body.success).toBe(true);
    expect(body.total).toBe(2);
    expect(body.validated).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.failed).toBe(0);
    expect(validateMock).toHaveBeenCalledTimes(2);
  });

  it('counts per-prediction exceptions as failed and still returns success=true', async () => {
    const rows = [
      {
        id: 'p1',
        player_id: 'pl1',
        metric: 'scoreToPar',
        predicted_value: 2,
        predicted_low: null,
        predicted_high: null,
        confidence_interval_low: null,
        confidence_interval_high: null,
        due_date: '2026-04-01',
        created_at: '2026-03-25T00:00:00Z',
        related_round_id: null,
      },
    ];
    createAdminMock.mockReturnValueOnce(mockSupabase(rows));
    validateMock.mockRejectedValueOnce(new Error('boom'));

    const req = new Request('http://x/api/cron/coachhelm-validation', {
      headers: { authorization: 'Bearer cs' },
    });
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; failed: number };
    expect(body.success).toBe(true);
    expect(body.failed).toBe(1);
  });

  it('returns 500 when the ripe-fetch query errors', async () => {
    createAdminMock.mockReturnValueOnce(mockSupabase(null, 'db down'));
    const req = new Request('http://x/api/cron/coachhelm-validation', {
      headers: { authorization: 'Bearer cs' },
    });
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(500);
  });
});

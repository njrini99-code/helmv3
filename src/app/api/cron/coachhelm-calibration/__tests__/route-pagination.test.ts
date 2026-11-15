/**
 * The calibration cron must read every validation in its 90-day window.
 *
 * PostgREST caps a response at 1000 rows. On 2026-11-08 production had 1253
 * validations in the window, and the cron's single `.limit(1000)` read only
 * the first 1000 (in no stated order), so about a fifth of the evidence was
 * silently dropped from the confidence curve.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));

import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/coachhelm-calibration/route';
import { createAdminClient } from '@/lib/supabase/admin';

const createAdminMock = vi.mocked(createAdminClient);

const POSTGREST_MAX_ROWS = 1000;
const VALIDATION_COUNT = 1253;

type Validation = { prediction_id: string; within_interval: boolean };

/**
 * A validations builder that behaves like PostgREST: `.limit(n)` and
 * `.range(from, to)` both return at most 1000 rows.
 */
function validationsBuilder(rows: Validation[]) {
  const builder = {
    select: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn((n: number) =>
      Promise.resolve({ data: rows.slice(0, Math.min(n, POSTGREST_MAX_ROWS)), error: null }),
    ),
    range: vi.fn((from: number, to: number) =>
      Promise.resolve({
        data: rows.slice(from, Math.min(to + 1, from + POSTGREST_MAX_ROWS)),
        error: null,
      }),
    ),
  };
  return builder;
}

function predictionsBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn((_col: string, ids: string[]) =>
      Promise.resolve({
        data: ids.map((id) => ({ id, confidence: 0.8, metric: 'score' })),
        error: null,
      }),
    ),
  };
  return builder;
}

describe('GET /api/cron/coachhelm-calibration — pagination', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
    process.env.CRON_SECRET = 'cs';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('counts every validation in the window, not just the first 1000', async () => {
    const rows: Validation[] = Array.from({ length: VALIDATION_COUNT }, (_, i) => ({
      prediction_id: `p-${i}`,
      within_interval: i % 2 === 0,
    }));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    createAdminMock.mockReturnValueOnce({
      from: vi.fn((table: string) => {
        if (table === 'golf_prediction_validations') return validationsBuilder(rows);
        if (table === 'golf_predictions') return predictionsBuilder();
        if (table === 'golf_confidence_calibration') return { upsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(
      new Request('http://x/api/cron/coachhelm-calibration', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as NextRequest,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalValidations).toBe(VALIDATION_COUNT);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/coachhelm/v2/analytics/effectiveness-writer', () => ({
  rollupInsightEffectivenessForYesterday: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/coachhelm/v2/analytics/prediction-performance-writer', () => ({
  rollupPredictionPerformanceRolling30d: vi.fn(async () => ({ ok: true })),
}));

import { GET } from '@/app/api/cron/coachhelm-insight-lifecycle/route';
import { createAdminClient } from '@/lib/supabase/admin';

const createAdminMock = vi.mocked(createAdminClient);

function buildSupabase() {
  const insightsBuilder = {
    select: vi.fn(() => insightsBuilder),
    in: vi.fn(() => insightsBuilder),
    lt: vi.fn(() => insightsBuilder),
    order: vi.fn(() => insightsBuilder),
    or: vi.fn(() => insightsBuilder),
    limit: vi.fn(async () => ({ data: [], error: null })),
  };

  return {
    insightsBuilder,
    client: {
      from: vi.fn((table: string) => {
        if (table === 'golf_coach_insights') return insightsBuilder;
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as ReturnType<typeof createAdminClient>,
  };
}

describe('GET /api/cron/coachhelm-insight-lifecycle scan bounds', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
    process.env.CRON_SECRET = 'secret';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('only scans stale non-terminal insights and caps each page', async () => {
    const { client, insightsBuilder } = buildSupabase();
    createAdminMock.mockReturnValueOnce(client);

    const res = await GET(new NextRequest('http://x/api/cron/coachhelm-insight-lifecycle', {
      headers: { authorization: 'Bearer secret' },
    }));

    expect(res.status).toBe(200);
    expect(insightsBuilder.in).toHaveBeenCalledWith('lifecycle_state', [
      'tentative',
      'detected',
      'matured',
      'addressed',
    ]);
    expect(insightsBuilder.lt).toHaveBeenCalledWith('updated_at', expect.any(String));
    expect(insightsBuilder.limit).toHaveBeenCalledWith(2000);
    const body = (await res.json()) as { total: number; max_rows_per_run: number; next_cursor: string | null };
    expect(body.total).toBe(0);
    expect(body.max_rows_per_run).toBe(10000);
    expect(body.next_cursor).toBeNull();
  });

  it('applies the resume cursor as a keyset filter when valid', async () => {
    const { client, insightsBuilder } = buildSupabase();
    createAdminMock.mockReturnValueOnce(client);

    const uuid = '11111111-2222-3333-4444-555555555555';
    await GET(new NextRequest(
      `http://x/api/cron/coachhelm-insight-lifecycle?cursor=2026-05-12T01:00:00.000Z%7C${uuid}`,
      { headers: { authorization: 'Bearer secret' } },
    ));

    expect(insightsBuilder.or).toHaveBeenCalledWith(
      `updated_at.gt.2026-05-12T01:00:00.000Z,and(updated_at.eq.2026-05-12T01:00:00.000Z,id.gt.${uuid})`,
    );
  });

  it('ignores a cursor whose id is not a UUID', async () => {
    const { client, insightsBuilder } = buildSupabase();
    createAdminMock.mockReturnValueOnce(client);

    await GET(new NextRequest(
      'http://x/api/cron/coachhelm-insight-lifecycle?cursor=2026-05-12T01:00:00.000Z%7Crow-1',
      { headers: { authorization: 'Bearer secret' } },
    ));

    // Invalid cursor → no .or() applied; scan starts fresh.
    expect(insightsBuilder.or).not.toHaveBeenCalled();
  });

  it('ignores a cursor whose updatedAt is not a valid timestamp', async () => {
    const { client, insightsBuilder } = buildSupabase();
    createAdminMock.mockReturnValueOnce(client);

    const uuid = '11111111-2222-3333-4444-555555555555';
    await GET(new NextRequest(
      `http://x/api/cron/coachhelm-insight-lifecycle?cursor=not-a-date%7C${uuid}`,
      { headers: { authorization: 'Bearer secret' } },
    ));

    expect(insightsBuilder.or).not.toHaveBeenCalled();
  });
});

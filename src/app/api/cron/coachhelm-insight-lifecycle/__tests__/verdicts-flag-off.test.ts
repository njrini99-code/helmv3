import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/coachhelm/v2/analytics/effectiveness-writer', () => ({
  rollupInsightEffectivenessForYesterday: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/coachhelm/v2/analytics/prediction-performance-writer', () => ({
  rollupPredictionPerformanceRolling30d: vi.fn(async () => ({ ok: true })),
}));

import { GET } from '@/app/api/cron/coachhelm-insight-lifecycle/route';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Slice 4: with coachhelm_verdicts_v1 off (its registry default), the verdict
 * step returns without touching golf_player_focus_areas: the only table the
 * cron reads is golf_coach_insights, exactly as before.
 */
describe('coachhelm-insight-lifecycle verdict step, flag off', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'secret';
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('reads no focus area and reports the step as not run', async () => {
    const tables: string[] = [];
    const insights = {
      select: vi.fn(() => insights),
      in: vi.fn(() => insights),
      lt: vi.fn(() => insights),
      order: vi.fn(() => insights),
      or: vi.fn(() => insights),
      limit: vi.fn(async () => ({ data: [], error: null })),
    };
    vi.mocked(createAdminClient).mockReturnValueOnce({
      from: vi.fn((table: string) => {
        tables.push(table);
        if (table === 'golf_coach_insights') return insights;
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(new NextRequest('http://x/api/cron/coachhelm-insight-lifecycle', { headers: { authorization: 'Bearer secret' } }));

    expect(res.status).toBe(200);
    expect(tables).toEqual(['golf_coach_insights']);
    const body = (await res.json()) as { focus_area_verdicts: { ran: boolean; reason?: string } };
    expect(body.focus_area_verdicts).toMatchObject({ ran: false, reason: 'flag_off' });
  });
});

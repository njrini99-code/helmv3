import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/app/golf/actions/insights', () => ({
  triggerPlayerInsightsAfterRound: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/coachhelm/v2/analytics/effectiveness-writer', () => ({
  rollupInsightEffectivenessForYesterday: vi.fn(),
}));

vi.mock('@/lib/coachhelm/v2/analytics/prediction-performance-writer', () => ({
  rollupPredictionPerformanceRolling30d: vi.fn(),
}));

import { GET as lifecycleGET } from '@/app/api/cron/coachhelm-insight-lifecycle/route';
import { GET as processSequencesGET } from '@/app/api/cron/process-sequences/route';
import { GET as refreshEngagementGET } from '@/app/api/cron/refresh-engagement/route';

describe('cron route auth contract', () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it.each([
    ['coachhelm-insight-lifecycle', lifecycleGET],
    ['process-sequences', processSequencesGET],
    ['refresh-engagement', refreshEngagementGET],
  ])('rejects x-vercel-cron without bearer token for %s', async (routeName, handler) => {
    process.env.CRON_SECRET = 'secret';

    const res = await handler(
      new Request(`http://x/api/cron/${routeName}`, {
        headers: { 'x-vercel-cron': '1' },
      }) as never,
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});

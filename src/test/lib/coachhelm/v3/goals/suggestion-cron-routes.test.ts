/**
 * Route-level tests for the W19 follow-up cron routes.
 *
 * Verifies CRON_SECRET auth + structured JSON response shape.
 * The engine logic is covered separately in suggestion-writer.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({}) as never),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/coachhelm/v3/goals/suggestion-writer', async (orig) => {
  const real = (await orig()) as typeof import('@/lib/coachhelm/v3/goals/suggestion-writer');
  return {
    ...real,
    runSuggestionWriter: vi.fn(async () => ({
      players_considered: 1,
      players_with_standings: 1,
      suggestions_inserted: 2,
      per_player: [{ player_id: 'A', inserted: 2, metric_ids: ['sg_putting', 'sg_approach'] }],
      duration_ms: 42,
    })),
    runSuggestionEvaluator: vi.fn(async () => ({ expired: 3, duration_ms: 7 })),
  };
});

import { GET as writeGET } from '@/app/api/cron/v3/goal-suggestions-write/route';
import { GET as evalGET } from '@/app/api/cron/v3/goal-suggestions-evaluate/route';

describe('cron /api/cron/v3/goal-suggestions-write', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret-value';
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects missing Authorization header with 401', async () => {
    const res = await writeGET(
      new NextRequest('http://x/api/cron/v3/goal-suggestions-write'),
    );
    expect(res.status).toBe(401);
  });

  it('rejects wrong bearer with 401', async () => {
    const res = await writeGET(
      new NextRequest('http://x/api/cron/v3/goal-suggestions-write', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 with structured writer JSON on valid auth', async () => {
    const res = await writeGET(
      new NextRequest('http://x/api/cron/v3/goal-suggestions-write', {
        headers: { authorization: 'Bearer cron-secret-value' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      players_considered: number;
      players_with_standings: number;
      suggestions_inserted: number;
      per_player: unknown[];
      duration_ms: number;
    };
    expect(body.players_considered).toBe(1);
    expect(body.players_with_standings).toBe(1);
    expect(body.suggestions_inserted).toBe(2);
    expect(body.per_player).toHaveLength(1);
  });
});

describe('cron /api/cron/v3/goal-suggestions-evaluate', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret-value';
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await evalGET(
      new NextRequest('http://x/api/cron/v3/goal-suggestions-evaluate'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 with { expired, duration_ms } on valid auth', async () => {
    const res = await evalGET(
      new NextRequest('http://x/api/cron/v3/goal-suggestions-evaluate', {
        headers: { authorization: 'Bearer cron-secret-value' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { expired: number; duration_ms: number };
    expect(body.expired).toBe(3);
    expect(typeof body.duration_ms).toBe('number');
  });
});

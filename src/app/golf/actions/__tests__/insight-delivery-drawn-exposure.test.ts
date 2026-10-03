/**
 * Swap audit CH13-21 — a surface records as shown only the cards it draws.
 *
 * `getInsightsForPlayer` recorded an exposure for every row it returned. The
 * Clubhouse player board and Deep dive drop the cards that state no finding,
 * so those were counted as shown though nobody saw them. A caller can now say
 * which rows it draws (`drawn`); omitted, every returned row counts, as before.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    throw new Error('test passes supabaseOverride; createClient must not be called');
  }),
}));

vi.mock('@/lib/auth/verify-player-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/verify-player-access')>()),
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' })),
}));

const recordInsightExposure = vi.fn(async (_rows: unknown[]) => undefined);
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/effectiveness/event-ledger')>();
  return { ...actual, recordInsightExposure: (rows: unknown[]) => recordInsightExposure(rows) };
});

import { getInsightsForPlayer } from '@/app/golf/actions/insight-delivery';

function row(id: string, metric: string, signature = 'v3:x') {
  return {
    id,
    player_id: 'p1',
    category: 'approach',
    insight_type: 'approach_proximity',
    title: `Title ${id}`,
    content: `Content ${id}`,
    signature,
    evidence: { metric, metric_label: metric, strokes_impact: 0.5, confidence: 0.8, sample_n: 20 },
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    outcome_status: null,
    outcome_measured_at: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    drill_attachments: null,
  };
}

function makeClient(insightRows: unknown[]) {
  const make = (data: unknown[]) => {
    const terminal = { data, error: null };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'or', 'in', 'eq', 'neq', 'gte', 'lte', 'is', 'order', 'limit', 'range']) {
      b[m] = vi.fn(() => b);
    }
    b.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    b.then = (resolve: (v: typeof terminal) => void) => Promise.resolve(resolve(terminal));
    return b;
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    from: vi.fn((table: string) => make(table === 'golf_coach_insights' ? insightRows : [])),
  } as unknown as SupabaseClient;
}

const exposedIds = () =>
  (recordInsightExposure.mock.calls.flatMap(([rows]) => rows as Array<{ insight_id: string }>)).map((r) => r.insight_id).sort();

describe('getInsightsForPlayer — exposure follows what the surface draws (CH13-21)', () => {
  beforeEach(() => recordInsightExposure.mockClear());

  it('without `drawn`, every returned row is recorded, as before', async () => {
    const out = await getInsightsForPlayer('p1', { limit: 10 }, makeClient([row('a', 'm1'), row('b', 'm2')]));
    expect(out.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(exposedIds()).toEqual(['a', 'b']);
  });

  it('with `drawn`, a returned row the surface does not draw is not recorded as shown', async () => {
    const out = await getInsightsForPlayer('p1', { limit: 10, drawn: (i) => i.id !== 'b' }, makeClient([row('a', 'm1'), row('b', 'm2')]));
    expect(out.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(exposedIds()).toEqual(['a']);
  });
});

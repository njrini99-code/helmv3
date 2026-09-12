import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `getActiveInsights` (repair plan N5). The feed used to `.order('priority')`
 * — a TEXT column, so ascending was high < low < medium < urgent — and cut to
 * `limit` in that non-order. It now reads the coach's full visible active
 * set, ranks it with the shared `scoreInsight` composite, and slices.
 */

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _m: unknown, fn: unknown) => fn,
}));
// Calibration is a DB read the feed tolerates failing (raw confidence is the
// fallback). Fail it deterministically here so the ranking is pure.
vi.mock('@/lib/coachhelm/v2/reasoning/confidence-calibrator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/coachhelm/v2/reasoning/confidence-calibrator')>()),
  bootstrapFromDb: vi.fn(async () => {
    throw new Error('no calibration in test');
  }),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({}) }),
}));

import { getActiveInsights } from '@/app/golf/actions/insights';

function row(id: string, priority: string, created_at: string, strokes_impact: number, confidence: number) {
  return {
    id,
    coach_id: 'coach-1',
    player_id: 'p-1',
    category: 'approach',
    insight_type: 'approach',
    title: id,
    content: '',
    signature: `v3:${id}`,
    evidence: { metric: 'gir_pct', strokes_impact, confidence, sample_n: 20 },
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority,
    acknowledged_at: null,
    resolved_at: null,
    created_at,
    updated_at: created_at,
    player: { id: 'p-1', first_name: 'A', last_name: 'B', avatar_url: null },
  };
}

describe('getActiveInsights — severity ranking (N5)', () => {
  const orderSpy = vi.fn();
  const rangeSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ranks the FULL visible set with the shared composite and slices to limit — never the alphabetical text order', async () => {
    // Alphabetical `priority` order would be: high, low, medium, urgent.
    const rows = [
      row('i-low-new', 'low', '2026-09-12T12:00:00Z', 0, 0.9),
      row('i-medium', 'medium', '2026-09-12T11:00:00Z', 0, 0.9),
      row('i-high-leak', 'high', '2026-09-12T10:00:00Z', 1.2, 0.8),
      row('i-urgent-old', 'urgent', '2026-09-01T10:00:00Z', 0.1, 0.7),
    ];
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'coach-1' }, error: null }) }) }) };
        }
        if (table === 'golf_coach_insights') {
          const terminal = { data: rows, error: null };
          const node: Record<string, unknown> = {};
          node.or = () => node;
          node.in = () => node;
          node.neq = () => node;
          node.eq = () => node;
          node.order = (...args: unknown[]) => { orderSpy(...args); return node; };
          node.range = (...args: unknown[]) => { rangeSpy(...args); return node; };
          node.limit = () => { throw new Error('the feed must not cut at the DB before ranking'); };
          node.then = (resolve: (v: typeof terminal) => void) => Promise.resolve(resolve(terminal));
          return { select: () => node };
        }
        // Anything else (weights, calibration) — an empty, failing builder.
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
    });

    const result = await getActiveInsights(2);
    expect(result.success).toBe(true);
    // urgent short-circuits to the top; the real 1.2-stroke leak beats the
    // zero-impact diagnostics; the newest row (low) is nowhere near the top.
    expect(result.insights.map((i: { id: string }) => i.id)).toEqual(['i-urgent-old', 'i-high-leak']);
    // The full set was paged (range), and the DB was never asked to sort the
    // text column.
    expect(rangeSpy).toHaveBeenCalled();
    expect(orderSpy.mock.calls.map((c) => c[0])).not.toContain('priority');
  });

  it('returns the honest error envelope when the read fails', async () => {
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'coach-1' }, error: null }) }) }) };
        }
        const terminal = { data: null, error: { message: 'boom', code: '500' } };
        const node: Record<string, unknown> = {};
        node.or = () => node;
        node.in = () => node;
        node.neq = () => node;
        node.eq = () => node;
        node.order = () => node;
        node.range = () => node;
        node.then = (resolve: (v: typeof terminal) => void) => Promise.resolve(resolve(terminal));
        return { select: () => node };
      },
    });
    const result = await getActiveInsights(5);
    expect(result.success).toBe(false);
    expect(result.insights).toEqual([]);
  });
});

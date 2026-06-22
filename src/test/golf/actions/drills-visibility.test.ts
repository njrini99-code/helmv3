import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Regression guard for the golf_insight_drill_attachments stale-data hole.
//
// The attachment RLS policy is EXISTS-only (parent insight row exists), NOT
// visibility-aware, and the standalone readers didn't route through
// applyInsightVisibility — so drills of an archived/dismissed/stale-v2 insight
// surfaced on the My-Development PracticeRx surface. The fix resolves the
// product-visible insight subset FIRST and only fetches drills for those.
// applyInsightVisibility runs for real here (not mocked); only Supabase is faked.
// ---------------------------------------------------------------------------

const { fromMock, state, calls } = vi.hoisted(() => {
  const state: Record<string, { data: unknown; error: unknown }> = {
    golf_coach_insights: { data: [], error: null },
    golf_insight_drill_attachments: { data: [], error: null },
  };
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  function chainable(table: string) {
    const b: Record<string, unknown> = {};
    const wrap = (name: string) => (...args: unknown[]) => {
      calls.push({ table, method: name, args });
      return b;
    };
    for (const m of ['select', 'eq', 'in', 'or', 'neq', 'order', 'limit']) b[m] = wrap(m);
    // Resolve lazily so a test can set state.* before awaiting.
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(state[table]).then(res, rej);
    return b;
  }

  const fromMock = vi.fn((table: string) => chainable(table));
  return { fromMock, state, calls };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: fromMock,
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { getDrillsForInsight, getDrillsForInsights } = await import('@/app/golf/actions/drills');

const DRILL = {
  id: 'd1',
  slug: 'putting-gate',
  title: 'Gate drill',
  category: 'putting',
  tags: ['putting'],
  description: 'gate',
  duration_min: 10,
  difficulty: 'beginner' as const,
  video_url: null,
};

describe('drills readers gate on parent insight visibility (stale-data fix)', () => {
  beforeEach(() => {
    calls.length = 0;
    state.golf_coach_insights = { data: [], error: null };
    state.golf_insight_drill_attachments = { data: [], error: null };
  });

  it('getDrillsForInsight returns [] and never queries attachments when the insight is not visible', async () => {
    state.golf_coach_insights = { data: [], error: null }; // visibility filter excludes it
    state.golf_insight_drill_attachments = { data: [{ rank: 1, drill: DRILL }], error: null };

    const out = await getDrillsForInsight('insight-x');

    expect(out).toEqual([]);
    expect(calls.some((c) => c.table === 'golf_insight_drill_attachments')).toBe(false);
  });

  it('getDrillsForInsight returns drills when the parent insight IS visible', async () => {
    state.golf_coach_insights = { data: [{ id: 'insight-1' }], error: null };
    state.golf_insight_drill_attachments = { data: [{ rank: 1, drill: DRILL }], error: null };

    const out = await getDrillsForInsight('insight-1');

    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('d1');
  });

  it('getDrillsForInsights only fetches drills for the visible subset; hidden ids get []', async () => {
    // Only insight-1 is product-visible.
    state.golf_coach_insights = { data: [{ id: 'insight-1' }], error: null };
    state.golf_insight_drill_attachments = {
      data: [{ insight_id: 'insight-1', rank: 1, drill: DRILL }],
      error: null,
    };

    const out = await getDrillsForInsights(['insight-1', 'insight-2']);

    expect(out['insight-1']).toHaveLength(1);
    expect(out['insight-2']).toEqual([]); // hidden parent → no drills, but key present (total map)

    // The attachment fetch was scoped to the visible ids only.
    const attIn = calls.find((c) => c.table === 'golf_insight_drill_attachments' && c.method === 'in');
    expect(attIn?.args).toEqual(['insight_id', ['insight-1']]);
  });

  it('getDrillsForInsights returns an all-empty total map when no requested insight is visible', async () => {
    state.golf_coach_insights = { data: [], error: null };

    const out = await getDrillsForInsights(['insight-1', 'insight-2']);

    expect(out).toEqual({ 'insight-1': [], 'insight-2': [] });
    expect(calls.some((c) => c.table === 'golf_insight_drill_attachments')).toBe(false);
  });
});

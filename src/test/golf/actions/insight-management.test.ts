import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logServerError so it doesn't try to write to admin tables in tests.
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

// Mock Next cache so revalidatePath is a no-op in tests.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// We'll swap out @/lib/supabase/server per-test.
const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));

import {
  searchInsights,
  bulkDismissInsights,
  exportInsights,
} from '@/app/golf/actions/insight-management';

// ---------- helpers ----------

function makeSearchBuilder(finalResult: { data: unknown[] | null; error: { message: string } | null; count: number | null }) {
  const terminal = {
    data: finalResult.data,
    error: finalResult.error,
    count: finalResult.count,
  };
  const orSpy = vi.fn().mockReturnThis();
  const builder: Record<string, unknown> & {
    or: typeof orSpy;
    in: ReturnType<typeof vi.fn>;
    neq: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    lte: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    then: (resolve: (v: typeof terminal) => void) => Promise<void>;
  } = {
    or: orSpy,
    // The shared `applyInsightVisibility` helper chains .in + .neq.
    in: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    // Make the builder awaitable.
    then: (resolve) => Promise.resolve(resolve(terminal)),
  };
  return { builder, orSpy };
}

// ---------- tests ----------

describe('searchInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches title.ilike and content.ilike (NOT description)', async () => {
    const { builder, orSpy } = makeSearchBuilder({ data: [], error: null, count: 0 });
    createClientMock.mockResolvedValue({
      from: () => ({
        select: () => builder,
      }),
    });

    await searchInsights({ coachId: 'coach-1', query: 'putting' });

    // Two .or() calls now: the shared v3 visibility filter (applied first by
    // `applyInsightVisibility`) and the title/content text search.
    expect(orSpy).toHaveBeenCalledTimes(2);
    const orFilters = orSpy.mock.calls.map((c) => c[0] as string);
    // The v3 engine visibility filter is applied.
    expect(orFilters).toContain('engine_version.eq.v3,signature.like.v3:%');
    // The text-search filter searches title + content (NOT the old description).
    const textFilter = orFilters.find((f) => f.includes('ilike'));
    expect(textFilter).toBeDefined();
    expect(textFilter).toContain('content.ilike');
    expect(textFilter).not.toContain('description.ilike');
    expect(textFilter).toContain('title.ilike');
  });
});

describe('bulkDismissInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes status=dismissed, dismissed=true, and dismissed_at', async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: () => ({
        in: () => ({
          select: async () => ({ data: [{ id: 'i-1' }], error: null }),
        }),
      }),
    });

    createClientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: 'u-1' } } }),
      },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: 'coach-1' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'golf_coach_insights') {
          return { update: updateSpy };
        }
        return {};
      },
    });

    const result = await bulkDismissInsights(['i-1']);
    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const firstCall = updateSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const payload = firstCall![0];
    expect(payload.status).toBe('dismissed');
    expect(payload.dismissed).toBe(true);
    expect(typeof payload.dismissed_at).toBe('string');
  });
});

describe('exportInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives recommendation from metadata.recommendation and uses content (not description)', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: 'u-1' } } }),
      },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: 'coach-1' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'golf_coach_insights') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({
                  data: [
                    {
                      id: 'i-1',
                      insight_type: 'scoring_decline',
                      priority: 'high',
                      title: 'Decline',
                      content: 'Content body',
                      status: 'active',
                      dismissed: false,
                      dismissed_at: null,
                      outcome_status: null,
                      metadata: { recommendation: 'Work putting 10 min/day' },
                      created_at: '2026-04-21T00:00:00Z',
                      player_id: 'p-1',
                      player: { first_name: 'Sam', last_name: 'Burns' },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      },
    });

    const result = await exportInsights(['i-1'], 'json');
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.data ?? '[]');
    expect(parsed[0].recommendation).toBe('Work putting 10 min/day');
    expect(parsed[0].description).toBe('Content body');
  });
});

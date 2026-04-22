/**
 * Server-action tests for insight-celebration.markCelebrationShown — Wave 1D.
 *
 * Covers:
 *  - Returns error for anonymous users
 *  - Returns Forbidden when the caller doesn't own the insight
 *  - Stamps `metadata.celebration_shown_at` on first call (merges with
 *    existing metadata, no clobber)
 *  - Is idempotent when the flag is already present
 *  - Surfaces the load / update errors via logServerError
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

type VerifyReason = 'self' | 'coach' | 'denied';
const verifyPlayerAccessMock = vi.fn(
  async (): Promise<{ allowed: boolean; reason?: VerifyReason }> => ({
    allowed: true,
    reason: 'self',
  }),
);
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) =>
    verifyPlayerAccessMock(...(args as Parameters<typeof verifyPlayerAccessMock>)),
}));

import { markCelebrationShown } from '@/app/golf/actions/insight-celebration';

interface LoadRow {
  id: string;
  player_id: string;
  metadata: Record<string, unknown> | null;
}

function makeSupabaseMock(opts: {
  userId?: string | null;
  loadRow?: LoadRow | null;
  loadError?: { message: string; code?: string } | null;
  updateError?: { message: string; code?: string } | null;
  onUpdate?: (patch: Record<string, unknown>) => void;
}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: opts.userId ? { id: opts.userId } : null },
        error: null,
      })),
    },
    from: vi.fn((_table: string) => {
      const updateCall = vi.fn((patch: Record<string, unknown>) => {
        opts.onUpdate?.(patch);
        return {
          eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
        };
      });

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: opts.loadRow ?? null,
          error: opts.loadError ?? null,
        }),
        update: updateCall,
      };
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });
});

// ---------------------------------------------------------------------------

describe('markCelebrationShown', () => {
  it('returns an error when the user is not authenticated', async () => {
    const sb = makeSupabaseMock({ userId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await markCelebrationShown('i-1', sb as any);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Not authenticated/i);
  });

  it('returns an error when the insight id is missing', async () => {
    const sb = makeSupabaseMock({ userId: 'u-1' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await markCelebrationShown('', sb as any);
    expect(result.success).toBe(false);
  });

  it('returns Forbidden when the caller is not the player owner', async () => {
    verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: true, reason: 'coach' });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      loadRow: { id: 'i-1', player_id: 'p-1', metadata: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await markCelebrationShown('i-1', sb as any);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Forbidden/i);
  });

  it('stamps metadata.celebration_shown_at on first call', async () => {
    const patches: Record<string, unknown>[] = [];
    const sb = makeSupabaseMock({
      userId: 'u-1',
      loadRow: { id: 'i-1', player_id: 'p-1', metadata: { other_key: 'preserve' } },
      onUpdate: (patch) => patches.push(patch),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await markCelebrationShown('i-1', sb as any);

    expect(result.success).toBe(true);
    expect(typeof result.celebration_shown_at).toBe('string');
    expect(patches).toHaveLength(1);

    const patch = patches[0] as { metadata: Record<string, unknown> };
    expect(patch.metadata.other_key).toBe('preserve');
    expect(typeof patch.metadata.celebration_shown_at).toBe('string');
  });

  it('is idempotent when celebration_shown_at is already set', async () => {
    const patches: Record<string, unknown>[] = [];
    const sb = makeSupabaseMock({
      userId: 'u-1',
      loadRow: {
        id: 'i-1',
        player_id: 'p-1',
        metadata: { celebration_shown_at: '2026-04-20T00:00:00.000Z' },
      },
      onUpdate: (patch) => patches.push(patch),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await markCelebrationShown('i-1', sb as any);

    expect(result.success).toBe(true);
    expect(result.celebration_shown_at).toBe('2026-04-20T00:00:00.000Z');
    // No update issued — we short-circuit instead.
    expect(patches).toHaveLength(0);
  });

  it('reports failure when the load query errors', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      loadError: { message: 'boom' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await markCelebrationShown('i-1', sb as any);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/load/i);
  });

  it('reports failure when the update query errors', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      loadRow: { id: 'i-1', player_id: 'p-1', metadata: null },
      updateError: { message: 'update-boom' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await markCelebrationShown('i-1', sb as any);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/update/i);
  });
});

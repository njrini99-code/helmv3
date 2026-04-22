import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { GET } from '@/app/api/cron/coachhelm-safety-net/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerPlayerInsightsAfterRound } from '@/app/golf/actions/insights';

const createAdminMock = vi.mocked(createAdminClient);
const triggerMock = vi.mocked(triggerPlayerInsightsAfterRound);

type Round = { id: string; player_id: string; round_date: string | null };

function buildSupabase(
  rounds: Round[] | null,
  roundsError: string | null,
  // Map of player_id -> existing-insights result
  existingByPlayer: Record<string, Array<{ id: string }>>,
  existingError: string | null = null,
) {
  const roundsBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: rounds,
      error: roundsError ? { message: roundsError, code: 'XX' } : null,
    }),
  };

  const insightsBuilderFactory = (playerId: string) => {
    const builder: {
      select: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      gte: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    } = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(),
      gte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: existingByPlayer[playerId] ?? [],
        error: existingError ? { message: existingError, code: 'YY' } : null,
      }),
    };
    // Track the player_id filter so we can look it up
    builder.eq = vi.fn((col: string, val: string) => {
      if (col === 'player_id') {
        builder.limit = vi.fn().mockResolvedValue({
          data: existingByPlayer[val] ?? [],
          error: existingError ? { message: existingError, code: 'YY' } : null,
        });
      }
      return builder;
    });
    return builder;
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'golf_rounds') return roundsBuilder;
      if (table === 'golf_coach_insights') return insightsBuilderFactory('');
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

describe('GET /api/cron/coachhelm-safety-net', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
    triggerMock.mockReset();
    process.env.CRON_SECRET = 'cs';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects without bearer token', async () => {
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-safety-net') as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(401);
  });

  it('returns a summary when there are no rounds in the window', async () => {
    createAdminMock.mockReturnValueOnce(buildSupabase([], null, {}));
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-safety-net', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      uniquePlayers: number;
      recovered: number;
    };
    expect(body.success).toBe(true);
    expect(body.uniquePlayers).toBe(0);
    expect(body.recovered).toBe(0);
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('returns 500 when fetching rounds errors', async () => {
    createAdminMock.mockReturnValueOnce(buildSupabase(null, 'boom', {}));
    const res = await GET(
      new Request('http://x/api/cron/coachhelm-safety-net', {
        headers: { authorization: 'Bearer cs' },
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(500);
  });
});

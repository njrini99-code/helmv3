/**
 * #2061 (2026-09-24 pool exhaustion): generateAlerts ran analyzePlayer for the
 * whole roster through one unbounded Promise.all. Each analyzePlayer runs the
 * Tier-1 generator pipeline via the service-role client, so a roster scan put
 * every player's pipeline on the database at once. It is now bounded to 4
 * players in flight, and the alert rows still come out in roster order.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const tracking = vi.hoisted(() => ({ inFlight: 0, peak: 0, analyzed: [] as string[] }));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/coachhelm/v2', () => ({
  coachHelmIntelligence: {
    analyzePlayer: vi.fn(async (playerId: string) => {
      tracking.inFlight += 1;
      tracking.peak = Math.max(tracking.peak, tracking.inFlight);
      // Uneven durations so completion order differs from roster order.
      await new Promise((r) => setTimeout(r, 1 + ((playerId.charCodeAt(playerId.length - 1) * 7) % 5)));
      tracking.inFlight -= 1;
      tracking.analyzed.push(playerId);
      return {
        alertLevel: 'critical',
        primaryInsight: { headline: `alert ${playerId}`, body: 'b', callToAction: 'c', tone: 'urgent', confidence: 0.8 },
        patterns: [],
        recommendations: [],
        insights: [],
      };
    }),
  },
}));

import { generateAlerts } from '@/app/golf/actions/alerts';
import { createClient } from '@/lib/supabase/server';

const createClientMock = vi.mocked(createClient);
const ROSTER = Array.from({ length: 11 }, (_, i) => `p-${String.fromCharCode(97 + i)}`);

function makeClient(inserted: unknown[][]) {
  const thenable = (value: unknown) => (resolve: (v: unknown) => void) => Promise.resolve(resolve(value));
  const coachBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'coach-1' }, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'coach-1' }, error: null }),
  };
  const teamMembersBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: thenable({ data: ROSTER.map((player_id) => ({ player_id })), error: null }),
  };
  const playersBuilder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then: thenable({
      data: ROSTER.map((id) => ({ id, first_name: 'F', last_name: id, avatar_url: null })),
      error: null,
    }),
  };
  function makeInsightsBuilder() {
    let mode: 'count' | 'insert' | 'read' = 'read';
    const builder = {
      select: vi.fn((_cols: string, options?: { count?: string; head?: boolean }) => {
        if (options?.head || options?.count) mode = 'count';
        return builder;
      }),
      insert: vi.fn((rows: unknown[]) => {
        inserted.push(rows);
        mode = 'insert';
        return builder;
      }),
      not: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => {
        if (mode === 'count') return Promise.resolve(resolve({ count: 0, error: null, data: null }));
        if (mode === 'insert') return Promise.resolve(resolve({ error: null }));
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    };
    return builder;
  }
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === 'golf_coaches') return coachBuilder;
      if (table === 'golf_team_members') return teamMembersBuilder;
      if (table === 'golf_players') return playersBuilder;
      if (table === 'golf_coach_insights') return makeInsightsBuilder();
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>;
}

describe('generateAlerts — bounded roster fan-out (#2061)', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    tracking.inFlight = 0;
    tracking.peak = 0;
    tracking.analyzed.length = 0;
  });

  it('analyzes every rostered player with at most 4 analyzePlayer calls in flight', async () => {
    const inserted: unknown[][] = [];
    createClientMock.mockResolvedValue(makeClient(inserted));

    const res = await generateAlerts('coach-1', 'team-1');

    expect(res.success).toBe(true);
    expect(tracking.analyzed).toHaveLength(ROSTER.length);
    expect(tracking.peak).toBe(4);
    // One alert per player, in roster order regardless of completion order.
    expect(inserted).toHaveLength(1);
    expect((inserted[0] as Array<{ player_id: string }>).map((r) => r.player_id)).toEqual(ROSTER);
  });
});

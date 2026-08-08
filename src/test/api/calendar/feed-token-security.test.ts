import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { GET as feedGET } from '@/app/api/calendar/feeds/[token]/route';
import { GET as coachGET } from '@/app/api/calendar/coach/[token]/route';

const createAdminMock = vi.mocked(createAdminClient);
const TOKEN = '1234567890abcdef1234567890abcdef';

function thenable<T extends object>(target: T, response: unknown): T & PromiseLike<unknown> {
  return Object.assign(target, {
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(response).then(onfulfilled, onrejected);
    },
  }) as T & PromiseLike<unknown>;
}

function queryBuilder(response: unknown) {
  const builder = thenable({
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => builder),
    update: vi.fn(() => builder),
    single: vi.fn(async () => response),
    maybeSingle: vi.fn(async () => response),
  }, response);
  return builder;
}

function buildFeedSupabase(options: {
  authorized: boolean;
  rpcError?: { message: string } | null;
  feed?: Record<string, unknown>;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'golf_calendar_feeds') {
      return queryBuilder({
        data: options.feed ?? {
          id: 'feed-1',
          feed_token: TOKEN,
          feed_type: 'all_events',
          team_id: 'team-1',
          user_id: 'user-1',
          name: 'Team Feed',
          is_active: true,
          last_synced_at: null,
        },
        error: null,
      });
    }
    if (table === 'golf_events') {
      return queryBuilder({ data: [], error: null });
    }
    if (table === 'golf_team_settings') {
      return queryBuilder({ data: { timezone: 'America/New_York' }, error: null });
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    from,
    rpc: vi.fn(async () => ({ data: options.authorized, error: options.rpcError ?? null })),
  } as unknown as ReturnType<typeof createAdminClient>;
}

function buildCoachSupabase(options: { authorized: boolean; rpcError?: { message: string } | null }) {
  const from = vi.fn((table: string) => {
    if (table === 'golf_calendar_feeds') {
      return queryBuilder({
        data: {
          id: 'feed-1',
          user_id: 'user-1',
          team_id: 'team-1',
          name: 'Coach Feed',
          is_active: true,
        },
        error: null,
      });
    }
    if (table === 'golf_team_coach_staff') {
      // Coach row is resolved through golf_team_coach_staff for the verified
      // team — never by user_id alone, which would be ambiguous for multi-org
      // users with multiple coach profiles.
      return queryBuilder({
        data: {
          coach: {
            id: 'coach-1',
            full_name: 'Coach One',
            organization_id: 'org-1',
          },
        },
        error: null,
      });
    }
    if (table === 'golf_events') {
      return queryBuilder({ data: [], error: null });
    }
    if (table === 'golf_team_settings') {
      return queryBuilder({ data: { timezone: 'America/New_York' }, error: null });
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    from,
    rpc: vi.fn(async () => ({ data: options.authorized, error: options.rpcError ?? null })),
  } as unknown as ReturnType<typeof createAdminClient>;
}

describe('calendar token route authorization', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
  });

  it('returns 404 when a feed token points at a team the owner no longer belongs to', async () => {
    const supabase = buildFeedSupabase({ authorized: false });
    createAdminMock.mockReturnValueOnce(supabase);

    const res = await feedGET(
      new Request(`http://x/api/calendar/feeds/${TOKEN}`) as never,
      { params: Promise.resolve({ token: TOKEN }) },
    );

    expect(res.status).toBe(404);
    expect(supabase.rpc).toHaveBeenCalledWith('is_user_on_team', {
      p_user_id: 'user-1',
      p_team_id: 'team-1',
    });
  });

  it('still serves an authorized feed token', async () => {
    createAdminMock.mockReturnValueOnce(buildFeedSupabase({ authorized: true }));

    const res = await feedGET(
      new Request(`http://x/api/calendar/feeds/${TOKEN}`) as never,
      { params: Promise.resolve({ token: TOKEN }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
  });

  it('returns 404 when the coach feed pins an unauthorized team', async () => {
    const supabase = buildCoachSupabase({ authorized: false });
    createAdminMock.mockReturnValueOnce(supabase);

    const res = await coachGET(
      new Request(`http://x/api/calendar/coach/${TOKEN}`) as never,
      { params: Promise.resolve({ token: TOKEN }) },
    );

    expect(res.status).toBe(404);
    // Coach feed must use the COACH-ONLY RPC. Player memberships do not
    // satisfy verify_coach_owns_team, which closes the prior gap where a
    // user with a coach profile but only player membership on the target
    // team could read the coach feed via is_user_on_team.
    expect(supabase.rpc).toHaveBeenCalledWith('verify_coach_owns_team', {
      p_team_id: 'team-1',
      p_user_id: 'user-1',
    });
  });

  it('serves the coach feed when verify_coach_owns_team passes', async () => {
    const supabase = buildCoachSupabase({ authorized: true });
    createAdminMock.mockReturnValueOnce(supabase);

    const res = await coachGET(
      new Request(`http://x/api/calendar/coach/${TOKEN}`) as never,
      { params: Promise.resolve({ token: TOKEN }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    expect(supabase.rpc).toHaveBeenCalledWith('verify_coach_owns_team', {
      p_team_id: 'team-1',
      p_user_id: 'user-1',
    });
  });
});

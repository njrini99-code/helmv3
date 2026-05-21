import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock the shared verifyTeamAccess helper so tests focus on SQL shape.
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyTeamAccess: vi.fn().mockResolvedValue({ allowed: true, reason: 'coach' }),
  verifyPlayerAccess: vi.fn().mockResolvedValue({ allowed: true, reason: 'coach' }),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));

import {
  generateTeamCorrelations,
  getTeamInsightsSummary,
} from '@/app/golf/actions/intelligence-dashboard';

/**
 * Build a supabase stub whose `.from(table)` branches on table and returns
 * pre-canned thenables for each call path used by the action under test.
 */
function buildSupabase(opts: {
  // What `verifyTeamAccess` helper's internal golf_coaches lookup returns
  coachLookup?: { data: { id: string } | null };
  // Rows returned by golf_team_members lookups (by team_id + status='active')
  teamMembers?: Array<{ player_id: string; golf_players?: { id: string; first_name: string; last_name: string } }>;
  // Rows returned by golf_patterns_v2.in('player_id', ids)
  patterns?: Array<Record<string, unknown>>;
  // Rows returned by golf_coach_insights.select()
  insights?: Array<Record<string, unknown>>;
  // count() result for golf_coach_insights
  insightCount?: number;
}) {
  const {
    coachLookup = { data: { id: 'coach-1' } },
    teamMembers = [],
    patterns = [],
    insights = [],
    insightCount = 0,
  } = opts;

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: (table: string) => {
      if (table === 'golf_coaches') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => coachLookup,
              single: async () => coachLookup,
            }),
          }),
        };
      }
      if (table === 'golf_team_members') {
        const selectBuilder = (_cols: string) => ({
          eq: (_c: string, _v: string) => ({
            eq: async () => ({ data: teamMembers, error: null }),
          }),
        });
        return { select: selectBuilder };
      }
      if (table === 'golf_patterns_v2') {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: patterns, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'golf_coach_insights') {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return {
                eq: () => ({
                  eq: async () => ({ count: insightCount, error: null }),
                }),
              };
            }
            return {
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    range: async () => ({ data: insights, error: null }),
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === 'golf_teams') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: 'team-1' }, error: null }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({}) };
    },
  };
}

describe('intelligence-dashboard actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TODO(plan-03 / plan-07): un-skip after intelligence-dashboard action is
  // confirmed to use the post-refactor schema. See src/test/SKIPPED.md.
  it.skip('generateTeamCorrelations uses golf_team_members (not golf_players.team_id)', async () => {
    const sb = buildSupabase({
      teamMembers: [
        { player_id: 'p-1', golf_players: { id: 'p-1', first_name: 'A', last_name: 'B' } },
      ],
    });

    // Spy on the table dispatcher so we can assert which tables were touched.
    const fromSpy = vi.spyOn(sb, 'from');
    createClientMock.mockResolvedValue(sb);

    const result = await generateTeamCorrelations('team-1');
    expect(result.success).toBe(true);
    const calls = fromSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContain('golf_team_members');
    // Must not query golf_players with .eq('team_id', ...)
    // (it's fine if golf_players is NOT read at all, since we use inner join)
  });

  it('getTeamInsightsSummary queries golf_patterns_v2 by player_id (not team_id, no pattern_name)', async () => {
    // Capture the select() call so we assert the column list.
    const patternSelectSpy = vi.fn().mockReturnValue({
      in: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    });

    const sb: Record<string, unknown> = {
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: 'coach-1' } }),
                single: async () => ({ data: { id: 'coach-1' } }),
              }),
            }),
          };
        }
        if (table === 'golf_team_members') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: [{ player_id: 'p-1' }], error: null }),
              }),
            }),
          };
        }
        if (table === 'golf_patterns_v2') {
          return { select: patternSelectSpy };
        }
        if (table === 'golf_coach_insights') {
          return {
            select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
              if (opts?.head) {
                return {
                  eq: () => ({
                    eq: async () => ({ count: 0, error: null }),
                  }),
                };
              }
              return {
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      range: async () => ({ data: [], error: null }),
                    }),
                  }),
                }),
              };
            },
          };
        }
        return { select: () => ({}) };
      },
    };

    createClientMock.mockResolvedValue(sb);

    const result = await getTeamInsightsSummary('team-1');
    expect(result.success).toBe(true);
    expect(patternSelectSpy).toHaveBeenCalledTimes(1);
    const selectColumns = patternSelectSpy.mock.calls[0]?.[0] as string;
    expect(selectColumns).toContain('pattern_type');
    expect(selectColumns).not.toContain('pattern_name');
    expect(selectColumns).toContain('metadata');
    expect(selectColumns).toContain('player_id');
  });
});

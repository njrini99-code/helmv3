import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock the shared verifyTeamAccess/verifyInsightAccess helpers so tests focus
// on SQL shape. verifyInsightAccess backs the dynamic-import teamGate inside
// acknowledgeInsightImpl (Fix 2 / P1-12 Triage Desk ledger fix).
// Spread the real module so pure helpers exported alongside the probes (e.g.
// `insightAccessDenialMessage`, which acknowledgeInsightImpl destructures from
// the same dynamic import) stay real instead of vanishing from the mock.
const verifyInsightAccessMock = vi.fn();
vi.mock('@/lib/auth/verify-player-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/verify-player-access')>()),
  verifyTeamAccess: vi.fn().mockResolvedValue({ allowed: true, reason: 'coach' }),
  verifyPlayerAccess: vi.fn().mockResolvedValue({ allowed: true, reason: 'coach' }),
  verifyInsightAccess: (...args: unknown[]) => verifyInsightAccessMock(...args),
}));

// P1-12 / Fix 2 — the effectiveness event ledger. Mocked so the Triage Desk
// mutation tests can assert it was actually called (previously it never was).
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', () => ({
  recordInsightAction: vi.fn().mockResolvedValue(undefined),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));

import {
  generateTeamCorrelations,
  getTeamInsightsSummary,
  dismissInsight,
  acknowledgeInsight,
} from '@/app/golf/actions/intelligence-dashboard';
import { recordInsightAction } from '@/lib/coachhelm/v3/effectiveness/event-ledger';

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
          // The action now wraps both queries in `applyInsightVisibility`,
          // which chains .or → .in → .neq AFTER the .eq filters. Model a
          // self-returning visibility chain that lands on the terminal.
          const visibilityChain = (terminal: unknown) => {
            const node: Record<string, unknown> = {};
            node.or = () => node;
            node.in = () => node;
            node.neq = () => node;
            // Count query: `neq` is the last call before await → make node
            // awaitable. Data query continues with .order().range().
            node.then = (resolve: (v: unknown) => void) =>
              Promise.resolve(resolve(terminal));
            node.order = () => ({
              range: async () => terminal,
            });
            return node;
          };
          return {
            select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
              if (opts?.head) {
                return {
                  eq: () => ({
                    eq: () => visibilityChain({ count: 0, error: null }),
                  }),
                };
              }
              return {
                eq: () => ({
                  eq: () => visibilityChain({ data: [], error: null }),
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

/**
 * P1-12 / Fix 2 — Triage Desk effectiveness ledger durability.
 *
 * `dismissInsight`/`acknowledgeInsight` in THIS file are the mutation
 * functions reached live from the Triage Desk (the primary Intelligence Hub
 * surface): CoachIntelligenceHome.tsx -> TriageDesk.tsx -> signal-groups.ts
 * (reviewSignalImpl/dismissSignalImpl) -> intelligence-dashboard.ts. Before
 * this fix, both functions did a real `.update()` on `golf_coach_insights`
 * and recorded NOTHING in `golf_insight_action` — a total absence, not a
 * dropped `void` call like the sibling insights.ts/development.ts sites.
 * These tests pin the corrected behavior: a confirmed update must produce a
 * real ledger row via `recordInsightAction`.
 */
describe('intelligence-dashboard Triage Desk mutations — effectiveness ledger (Fix 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Shared team-gate stub for acknowledgeInsightImpl's dynamic-import path.
    verifyInsightAccessMock.mockResolvedValue({
      allowed: true,
      reason: 'coach',
      teamId: 'team-1',
      coachId: 'coach-1',
    });
  });

  /**
   * Builds a supabase double covering every query both dismissInsightImpl and
   * acknowledgeInsightImpl issue:
   *  - the LOCAL verifyInsightAccess() helper's own `golf_coach_insights`
   *    lookup (.select('id, coach_id, team_id').eq('id',...).single()) and
   *    its `golf_coaches` ownership lookup (.select('id, organization_id')
   *    .eq('user_id',...).single())
   *  - the mutation's `.update(...).eq(...)[.eq(...)].select('id, player_id')`
   *    chain, parameterized so tests can assert the recorded action and probe
   *    the player_id-missing guard.
   */
  function buildTriageSupabase(updateResult: { data: unknown; error: unknown }) {
    const updateChain = () => {
      const node: { eq: () => typeof node; select: (cols: string) => Promise<typeof updateResult> } = {
        eq: () => node,
        select: async () => updateResult,
      };
      return node;
    };

    return {
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: (table: string) => {
        if (table === 'golf_coach_insights') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { id: 'insight-1', coach_id: 'coach-1', team_id: 'team-1' },
                  error: null,
                }),
              }),
            }),
            update: () => updateChain(),
          };
        }
        if (table === 'golf_coaches') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: 'coach-1', organization_id: 'org-1' }, error: null }),
              }),
            }),
          };
        }
        return { select: () => ({}) };
      },
    };
  }

  it('dismissInsight (Triage Desk path) records a "dismissed" action via recordInsightAction', async () => {
    createClientMock.mockResolvedValue(
      buildTriageSupabase({ data: [{ id: 'insight-1', player_id: 'player-9' }], error: null }),
    );

    const result = await dismissInsight('insight-1');

    expect(result.success).toBe(true);
    expect(recordInsightAction).toHaveBeenCalledTimes(1);
    expect(recordInsightAction).toHaveBeenCalledWith({
      insight_id: 'insight-1',
      player_id: 'player-9',
      actor_id: 'user-1',
      actor_role: 'coach',
      action_type: 'dismissed',
    });
  });

  it('acknowledgeInsight (Triage Desk path) records an "acknowledged" action via recordInsightAction', async () => {
    createClientMock.mockResolvedValue(
      buildTriageSupabase({ data: [{ id: 'insight-1', player_id: 'player-9' }], error: null }),
    );

    const result = await acknowledgeInsight('insight-1');

    expect(result.success).toBe(true);
    expect(recordInsightAction).toHaveBeenCalledTimes(1);
    expect(recordInsightAction).toHaveBeenCalledWith({
      insight_id: 'insight-1',
      player_id: 'player-9',
      actor_id: 'user-1',
      actor_role: 'coach',
      action_type: 'acknowledged',
    });
  });

  it('dismissInsight does not call recordInsightAction when the update returns no player_id', async () => {
    createClientMock.mockResolvedValue(
      buildTriageSupabase({ data: [{ id: 'insight-1', player_id: null }], error: null }),
    );

    const result = await dismissInsight('insight-1');

    expect(result.success).toBe(true);
    expect(recordInsightAction).not.toHaveBeenCalled();
  });
});

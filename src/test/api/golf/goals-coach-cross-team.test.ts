import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A coach may only create a goal for a player on a team they staff.
 *
 * Both ids on this path arrive from the caller. Until 2026-08-19 neither was
 * checked in the action, and the DB was not the backstop it was believed to be:
 * the hardened `goals_coach_create` policy binding player_id to team_id was
 * authored twice (20260526180000, re-authored replay-safe as 20260528010000)
 * and never landed in production. Verified against pg_policies — the live
 * WITH CHECK carried no golf_team_members clause.
 *
 * The consequence was not just a stray row. `loadStandingForMetric` runs on the
 * SERVICE-ROLE client and reads golf_player_standing for whatever player_id it
 * is handed; the value is then persisted as the new goal's baseline, which the
 * creating coach can read back. So the leak is a real per-metric standing value
 * for a player on another program's roster, one metric per goal.
 *
 * These tests therefore assert that loadStandingForMetric is NEVER REACHED for
 * an off-roster player — not merely that the action returns ok:false. A test
 * that only checked the return value would still pass against an implementation
 * that read the other team's data and then discarded it.
 */

const validateCoachTeamAccess = vi.fn();
const loadStandingForMetric = vi.fn();
const membershipMaybeSingle = vi.fn();
const insertSingle = vi.fn();

vi.mock('@/lib/golf/resolve-team', () => ({
  validateCoachTeamAccess: (...args: unknown[]) => validateCoachTeamAccess(...args),
  resolveCoachTeamIdWithCookie: vi.fn(),
}));
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({
  loadStandingForMetric: (...args: unknown[]) => loadStandingForMetric(...args),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _m: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/supabase/untyped', () => ({ fromUntyped: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-coach' } }, error: null })) },
    from: (table: string) => {
      if (table === 'golf_players') {
        // The caller is a coach, not a player.
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      if (table === 'golf_coaches') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'coach-1', user_id: 'user-coach', organization_id: 'org-1' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'golf_goals') {
        return {
          select: () => ({ eq: () => ({ eq: async () => ({ count: 0, error: null }) }) }),
          insert: () => ({ select: () => ({ single: insertSingle }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_team_members') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: membershipMaybeSingle }) }) }),
          }),
        };
      }
      throw new Error(`unexpected admin table ${table}`);
    },
  }),
}));

import { createGoal } from '@/app/golf/actions/v3/goals';

const OFF_ROSTER = 'player-on-another-team';
const ON_ROSTER = 'player-on-my-team';

function input(playerId: string) {
  return {
    metric_id: 'sg_putting' as never,
    title: 'Tighten up inside 10ft',
    category: 'putting',
    ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    target_value: 0.5,
    target_source: 'manual' as never,
    team_id: 'team-mine',
    player_id_if_coach_creating: playerId,
  } as never;
}

describe('createGoal — a coach cannot reach across the roster', () => {
  beforeEach(() => {
    validateCoachTeamAccess.mockReset().mockResolvedValue(true);
    loadStandingForMetric.mockReset().mockResolvedValue({ player_value: 0.42 });
    membershipMaybeSingle.mockReset();
    insertSingle.mockReset().mockResolvedValue({ data: { id: 'goal-1' }, error: null });
  });

  it('never reads standing for a player who is not on the team', async () => {
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await createGoal(input(OFF_ROSTER));

    expect(res.ok).toBe(false);
    // THE invariant. The service-role read must not happen at all — returning
    // ok:false after reading the row would still have leaked it into a log,
    // and previously leaked it into the goal's baseline_value.
    expect(loadStandingForMetric).not.toHaveBeenCalled();
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it('fails CLOSED when the membership check itself errors', async () => {
    membershipMaybeSingle.mockResolvedValue({ data: null, error: { message: 'connection failure' } });

    const res = await createGoal(input(OFF_ROSTER));

    expect(res.ok).toBe(false);
    expect(loadStandingForMetric).not.toHaveBeenCalled();
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it('refuses before the roster probe when the coach does not staff the team', async () => {
    validateCoachTeamAccess.mockResolvedValue(false);
    membershipMaybeSingle.mockResolvedValue({ data: { id: 'tm-1' }, error: null });

    const res = await createGoal(input(OFF_ROSTER));

    expect(res.ok).toBe(false);
    expect(membershipMaybeSingle).not.toHaveBeenCalled();
    expect(loadStandingForMetric).not.toHaveBeenCalled();
  });

  it('STILL creates the goal for a player who IS on the team', async () => {
    membershipMaybeSingle.mockResolvedValue({ data: { id: 'tm-1' }, error: null });

    const res = await createGoal(input(ON_ROSTER));

    // Without this case the "fix" could be a blanket refusal, which would break
    // every legitimate coach-assigned goal and look green.
    expect(res.ok).toBe(true);
    expect(loadStandingForMetric).toHaveBeenCalledWith(ON_ROSTER, 'sg_putting');
    expect(insertSingle).toHaveBeenCalled();
  });
});

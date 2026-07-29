// =============================================================================
// Team join / invite code lifecycle (#395)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const from = vi.fn();
const rpc = vi.fn();
const fromUntypedUpdate = vi.fn();
const fromUntypedEq = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from,
    rpc,
  })),
}));
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn(() => ({
    update: fromUntypedUpdate.mockReturnValue({ eq: fromUntypedEq }),
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/validation/server-action-validator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validation/server-action-validator')>();
  return {
    ...actual,
    formatSafeErrorResponse: vi.fn((err: unknown) => ({
      success: false,
      error: err instanceof Error ? err.message : 'error',
    })),
    logSecurityEvent: vi.fn(async () => {}),
  };
});
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction: (_name: string, _opts: unknown, fn: (...args: unknown[]) => unknown) =>
    fn,
}));
vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    activeTeamId: 'team-1',
    activeRole: 'coach',
    activeCoachId: 'coach-1',
    activePlayerId: null,
    fellBackFromStale: false,
  })),
}));
vi.mock('@/lib/baseball/capabilities', () => ({
  requireBaseballCapability: vi.fn(async () => {}),
}));

import { processTeamInvitation } from '@/app/baseball/actions/teams';

const PLAYER_ID = '11111111-1111-4111-8111-111111111111';

function chain(resolver: () => unknown) {
  const builder: Record<string, unknown> = {};
  const terminal = () => resolver();
  for (const method of ['select', 'eq', 'single', 'insert', 'update']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(terminal);
  builder.maybeSingle = vi.fn(terminal);
  return builder;
}

/**
 * The invitation row as the RESOLVER returns it — flat, and without `code`.
 *
 * processTeamInvitation no longer reads baseball_team_invitations directly.
 * That table's SELECT policy is staff-scoped (migration 20260729000200
 * SECTION 3, replacing the baseline's `USING (is_active = true)`, which let
 * any authenticated user enumerate every live invite code in the database), so
 * a `.eq('code', ...)` returns zero rows for every legitimate joiner — who is
 * by definition not staff on the team they are joining. The code goes to a
 * SECURITY DEFINER resolver as an argument instead.
 */
function invitationRow(overrides: Record<string, unknown> = {}) {
  return {
    invitation_id: 'inv-1',
    team_id: 'team-1',
    expires_at: null,
    is_active: true,
    max_uses: 5,
    used_count: 1,
    ...overrides,
  };
}

/** What resolve_baseball_team_invitation_by_code answers with, per test. */
let resolvedInvitations: unknown[] = [];

describe('processTeamInvitation max_uses accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromUntypedEq.mockResolvedValue({ error: null });
    resolvedInvitations = [invitationRow()];
    // Three different RPCs run in this flow, so the default must dispatch by
    // name rather than answer everything with one shape:
    //   resolve_baseball_team_invitation_by_code — resolves the invite code for
    //     a caller who is not staff on the target team. Set-returning, so it
    //     answers with an array; an unmatched code is [].
    //   try_redeem_baseball_team_invitation — reserves a redemption atomically
    //     before joinTeam runs (#395); returns a bare boolean. Default: granted.
    //   get_baseball_team_join_context — resolves the team's non-secret join
    //     policy for a caller with no membership yet, which every invitee is.
    //     Set-returning, so it answers with an array. joinTeam calls it twice
    //     (validatePlayerCanJoinTeam, then the policy check).
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'resolve_baseball_team_invitation_by_code') {
        return { data: resolvedInvitations, error: null };
      }
      if (fn === 'get_baseball_team_join_context') {
        return {
          data: [
            {
              id: 'team-1',
              name: 'Eagles',
              team_type: 'college',
              invite_policy: 'open',
              require_coach_approval: false,
            },
          ],
          error: null,
        };
      }
      return { data: true, error: null };
    });
  });

  it('blocks when invitation used_count meets max_uses (not roster size)', async () => {
    resolvedInvitations = [invitationRow({ max_uses: 3, used_count: 3 })];

    const ownershipChain = chain(() => ({
      data: { user_id: 'user-1' },
      error: null,
    }));

    from.mockImplementation((table: string) => {
      if (table === 'baseball_players') return ownershipChain;
      return chain(() => ({ data: null, error: null }));
    });

    const result = await processTeamInvitation('ABC12345', PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maximum number of uses/i);
  });

  it('increments used_count after a successful join', async () => {
    let playerReads = 0;
    from.mockImplementation((table: string) => {
      if (table === 'baseball_players') {
        playerReads += 1;
        if (playerReads === 1) {
          return chain(() => ({ data: { user_id: 'user-1' }, error: null }));
        }
        return chain(() => ({
          data: { id: PLAYER_ID, user_id: 'user-1', player_type: 'college' },
          error: null,
        }));
      }
      if (table === 'baseball_teams') {
        return chain(() => ({
          data: { id: 'team-1', name: 'Eagles', team_type: 'college' },
          error: null,
        }));
      }
      if (table === 'baseball_team_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
          insert: vi.fn(async () => ({ error: null })),
        };
      }
      return chain(() => ({ data: null, error: null }));
    });

    const result = await processTeamInvitation('ABC12345', PLAYER_ID);

    expect(result.success).toBe(true);
    // Redemption is reserved atomically via RPC before joinTeam runs, not via
    // a stale-read-then-update on used_count (#395 — avoids a lost-update
    // race between two players redeeming the same invite concurrently).
    expect(rpc).toHaveBeenCalledWith(
      'try_redeem_baseball_team_invitation',
      { p_invitation_id: 'inv-1' },
    );
  });

  it('releases the reserved redemption when joinTeam fails after redeeming', async () => {
    let playerReads = 0;
    from.mockImplementation((table: string) => {
      if (table === 'baseball_players') {
        playerReads += 1;
        if (playerReads === 1) {
          return chain(() => ({ data: { user_id: 'user-1' }, error: null }));
        }
        return chain(() => ({
          data: { id: PLAYER_ID, user_id: 'user-1', player_type: 'college' },
          error: null,
        }));
      }
      if (table === 'baseball_teams') {
        return chain(() => ({
          data: { id: 'team-1', name: 'Eagles', team_type: 'college' },
          error: null,
        }));
      }
      if (table === 'baseball_team_members') {
        // The membership insert fails AFTER the redemption was reserved —
        // the reservation must be released, not left stranded (which would
        // permanently shrink the invite's remaining uses).
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
          insert: vi.fn(async () => ({ error: { message: 'insert failed' } })),
        };
      }
      return chain(() => ({ data: null, error: null }));
    });

    const result = await processTeamInvitation('ABC12345', PLAYER_ID);

    expect(result.success).toBe(false);
    expect(rpc).toHaveBeenCalledWith(
      'try_redeem_baseball_team_invitation',
      { p_invitation_id: 'inv-1' },
    );
    expect(rpc).toHaveBeenCalledWith(
      'release_baseball_team_invitation_redemption',
      { p_invitation_id: 'inv-1' },
    );
  });

  it('rejects IDOR when caller does not own the player profile', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'baseball_players') {
        return chain(() => ({ data: { user_id: 'other-user' }, error: null }));
      }
      return chain(() => ({ data: null, error: null }));
    });

    const result = await processTeamInvitation('ABC12345', PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/own player profile/i);
  });
});

describe('processTeamInvitation reads the invite code through the resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromUntypedEq.mockResolvedValue({ error: null });
    resolvedInvitations = [invitationRow()];
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'resolve_baseball_team_invitation_by_code') {
        return { data: resolvedInvitations, error: null };
      }
      if (fn === 'get_baseball_team_join_context') {
        return {
          data: [
            {
              id: 'team-1',
              name: 'Eagles',
              team_type: 'college',
              invite_policy: 'open',
              require_coach_approval: false,
            },
          ],
          error: null,
        };
      }
      return { data: true, error: null };
    });
    from.mockImplementation((table: string) => {
      if (table === 'baseball_players') {
        return chain(() => ({ data: { user_id: 'user-1' }, error: null }));
      }
      return chain(() => ({ data: null, error: null }));
    });
  });

  /**
   * The regression guard for the fix itself.
   *
   * A direct `.from('baseball_team_invitations').eq('code', …)` is the shape
   * that only worked because the baseline SELECT policy was
   * `USING (is_active = true)` — i.e. because every authenticated user could
   * read every live invite code in the database. Reinstating that read would
   * silently break every join once the policy migration is applied (zero rows,
   * reported to the player as "Invalid invitation code"), so it is asserted on
   * directly rather than inferred from the happy path passing.
   */
  it('never reads baseball_team_invitations directly', async () => {
    resolvedInvitations = [invitationRow({ max_uses: 1, used_count: 1 })];

    await processTeamInvitation('ABC12345', PLAYER_ID);

    expect(rpc).toHaveBeenCalledWith(
      'resolve_baseball_team_invitation_by_code',
      { p_code: 'ABC12345' },
    );
    expect(from).not.toHaveBeenCalledWith('baseball_team_invitations');
  });

  /**
   * Previously unreachable. The old policy filtered `is_active = true` inside
   * the policy, so a deactivated invitation was indistinguishable from a
   * nonexistent one: the lookup returned nothing, the join_code fallback
   * missed, and the player was told their real-but-switched-off code was
   * invalid. The resolver returns the row, which revives this branch.
   */
  it('tells the player a deactivated invitation is inactive, not invalid', async () => {
    resolvedInvitations = [invitationRow({ is_active: false })];

    const result = await processTeamInvitation('ABC12345', PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no longer active/i);
    expect(result.error).not.toMatch(/invalid/i);
  });

  /** Same reasoning for expiry — also unreachable under the old policy. */
  it('tells the player an expired invitation is expired, not invalid', async () => {
    resolvedInvitations = [
      invitationRow({ expires_at: new Date(Date.now() - 86_400_000).toISOString() }),
    ];

    const result = await processTeamInvitation('ABC12345', PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  /** An unknown code must still fall through to the join_code fallback. */
  it('falls through to the join_code path when the code matches no invitation', async () => {
    resolvedInvitations = [];

    await processTeamInvitation('ABC12345', PLAYER_ID);

    expect(rpc).toHaveBeenCalledWith(
      'resolve_baseball_team_by_join_code',
      { p_join_code: 'ABC12345' },
    );
  });
});

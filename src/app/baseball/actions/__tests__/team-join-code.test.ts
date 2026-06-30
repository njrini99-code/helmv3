// =============================================================================
// Team join / invite code lifecycle (#395)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const from = vi.fn();
const fromUntypedUpdate = vi.fn();
const fromUntypedEq = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from,
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

describe('processTeamInvitation max_uses accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromUntypedEq.mockResolvedValue({ error: null });
  });

  it('blocks when invitation used_count meets max_uses (not roster size)', async () => {
    const invitationChain = chain(() => ({
      data: {
        id: 'inv-1',
        team_id: 'team-1',
        expires_at: null,
        is_active: true,
        max_uses: 3,
        used_count: 3,
        baseball_teams: { id: 'team-1', name: 'Eagles', team_type: 'college' },
      },
      error: null,
    }));

    const ownershipChain = chain(() => ({
      data: { user_id: 'user-1' },
      error: null,
    }));

    from.mockImplementation((table: string) => {
      if (table === 'baseball_players') return ownershipChain;
      if (table === 'baseball_team_invitations') return invitationChain;
      return chain(() => ({ data: null, error: null }));
    });

    const result = await processTeamInvitation('ABC12345', PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maximum number of uses/i);
  });

  it('increments used_count after a successful join', async () => {
    const invitationChain = chain(() => ({
      data: {
        id: 'inv-1',
        team_id: 'team-1',
        expires_at: null,
        is_active: true,
        max_uses: 5,
        used_count: 1,
        baseball_teams: { id: 'team-1', name: 'Eagles', team_type: 'college' },
      },
      error: null,
    }));

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
      if (table === 'baseball_team_invitations') return invitationChain;
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
    expect(fromUntypedUpdate).toHaveBeenCalledWith({ used_count: 2 });
    expect(fromUntypedEq).toHaveBeenCalledWith('id', 'inv-1');
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

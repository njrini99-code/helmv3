// =============================================================================
// src/app/baseball/actions/__tests__/interests.test.ts
//
// #403 — college interest writes use org source of truth (organization_id only),
// validate org type server-side, and never denormalize school metadata on insert.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const insert = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from })),
}));
vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    userId: 'user-1',
    activeTeamId: 'team-1',
    activeRole: 'player',
    activePlayerId: PLAYER_ID,
    activeCoachId: null,
    fellBackFromStale: false,
  })),
}));
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn((_supabase, table: string) => from(table)),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));
vi.mock('@/lib/validation/server-action-validator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validation/server-action-validator')>();
  return {
    ...actual,
    logSecurityEvent: vi.fn(async () => {}),
  };
});

import { addToInterests, removeFromInterests, updateInterestStatus } from '@/app/baseball/actions/interests';
import { logSecurityEvent } from '@/lib/validation/server-action-validator';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_ID = '22222222-2222-4222-8222-222222222222';

function mockActivePlayerContext() {
  // .mockReset() before re-arming the default so a queued
  // mockResolvedValueOnce(null) left over from a prior (unconsumed) test
  // never leaks into this one.
  vi.mocked(getActiveBaseballContext).mockReset().mockResolvedValue({
    userId: 'user-1',
    activeTeamId: 'team-1',
    activeRole: 'player',
    activePlayerId: PLAYER_ID,
    activeCoachId: null,
    fellBackFromStale: false,
  });
}

function mockTable(table: string) {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  for (const m of ['select', 'eq', 'delete']) chain[m] = vi.fn(ret);

  chain.maybeSingle = vi.fn(async () => {
    if (table === 'organizations') {
      return { data: { id: ORG_ID, type: 'college' }, error: null };
    }
    if (table === 'baseball_recruiting_interests') {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });

  chain.single = vi.fn(async () => {
    if (table === 'baseball_players') {
      return { data: { id: PLAYER_ID }, error: null };
    }
    return { data: null, error: new Error('not found') };
  });

  chain.insert = insert.mockReturnValue({ error: null });

  return chain;
}

describe('addToInterests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActivePlayerContext();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    from.mockImplementation((table: string) => mockTable(table));
    insert.mockReturnValue({ error: null });
  });

  it('inserts only organization_id and status fields (no denormalized school metadata)', async () => {
    const res = await addToInterests(ORG_ID);

    expect(res.success).toBe(true);
    expect(logSecurityEvent).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        player_id: PLAYER_ID,
        organization_id: ORG_ID,
        status: 'interested',
        interest_level: 'researching',
      }),
    );
    const row = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('school_name');
    expect(row).not.toHaveProperty('division');
    expect(row).not.toHaveProperty('conference');
  });

  it('rejects non-college/juco organizations', async () => {
    from.mockImplementation((table: string) => {
      const chain = mockTable(table);
      if (table === 'organizations') {
        chain.maybeSingle = vi.fn(async () => ({
          data: { id: ORG_ID, type: 'high_school' },
          error: null,
        }));
      }
      return chain;
    });

    const res = await addToInterests(ORG_ID);
    expect(res.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    vi.mocked(getActiveBaseballContext).mockResolvedValueOnce(null);
    const res = await addToInterests(ORG_ID);
    expect(res.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('removeFromInterests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActivePlayerContext();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    from.mockImplementation((table: string) => mockTable(table));
  });

  it('deletes by player_id + organization_id', async () => {
    const secondEq = vi.fn(async () => ({ error: null }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    from.mockImplementation((table: string) => {
      const chain = mockTable(table);
      if (table === 'baseball_recruiting_interests') {
        chain.delete = vi.fn(() => ({ eq: firstEq }));
      }
      return chain;
    });

    const res = await removeFromInterests(ORG_ID);
    expect(res.success).toBe(true);
    expect(firstEq).toHaveBeenCalledWith('player_id', PLAYER_ID);
    expect(secondEq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });
});

describe('updateInterestStatus', () => {
  const INTEREST_ID = '33333333-3333-4333-8333-333333333333';

  function mockOwnedInterest(ownerId: string) {
    const updateEq2 = vi.fn(async () => ({ error: null }));
    const updateEq1 = vi.fn(() => ({ eq: updateEq2 }));
    const updateFn = vi.fn(() => ({ eq: updateEq1 }));

    from.mockImplementation((table: string) => {
      if (table === 'baseball_recruiting_interests') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: INTEREST_ID, player_id: ownerId },
                error: null,
              })),
            })),
          })),
          update: updateFn,
        };
      }
      return mockTable(table);
    });

    return { updateFn, updateEq1, updateEq2 };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockActivePlayerContext();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('updates status when the interest belongs to the active player (validated 6-value vocab)', async () => {
    const { updateFn, updateEq1, updateEq2 } = mockOwnedInterest(PLAYER_ID);

    const res = await updateInterestStatus(INTEREST_ID, 'contacted');

    expect(res.success).toBe(true);
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'contacted' }),
    );
    expect(updateEq1).toHaveBeenCalledWith('id', INTEREST_ID);
    expect(updateEq2).toHaveBeenCalledWith('player_id', PLAYER_ID);
  });

  it('rejects a status value outside the 6-value player journey vocab', async () => {
    const { updateFn } = mockOwnedInterest(PLAYER_ID);

    const res = await updateInterestStatus(INTEREST_ID, 'high_priority');

    expect(res.success).toBe(false);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('rejects updating an interest owned by a different player', async () => {
    const { updateFn } = mockOwnedInterest('someone-else-id');

    const res = await updateInterestStatus(INTEREST_ID, 'contacted');

    expect(res.success).toBe(false);
    expect(updateFn).not.toHaveBeenCalled();
  });
});

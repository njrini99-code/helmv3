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

import { addToInterests, removeFromInterests } from '@/app/baseball/actions/interests';
import { logSecurityEvent } from '@/lib/validation/server-action-validator';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_ID = '22222222-2222-4222-8222-222222222222';

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
    const res = await addToInterests(ORG_ID);
    expect(res.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('removeFromInterests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

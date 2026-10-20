import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * createRecruit with a request id (the Clubhouse page's Add): a repeat after a lost reply finds the prospect it already
 * added instead of adding a second, and an id that belongs to anything else is refused, never reported as saved.
 */

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/observability/supabase/observe-storage', () => ({ observeStorageResult: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

import { createRecruit } from '@/app/golf/actions/recruiting';

const REQUEST = '44444444-4444-4444-8444-444444444444';

interface World {
  /** What the insert answers: a new row, or an error. */
  insert?: { data?: { id: string } | null; error?: { code: string; message: string } | null };
  /** What reading the id back finds (RLS hides another team's row, so this is null for one). */
  existing?: { id: string; team_id: string; created_by: string | null; first_name: string; last_name: string | null } | null;
}

function world(w: World = {}) {
  const calls = { insert: [] as Record<string, unknown>[], readBack: [] as string[] };
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      if (table === 'golf_coaches') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'coach-1', organization_id: 'org-1' }, error: null }) }) }) };
      }
      if (table === 'golf_recruits') {
        return {
          insert: (row: Record<string, unknown>) => {
            calls.insert.push(row);
            return { select: () => ({ single: async () => w.insert ?? { data: { id: (row.id as string) ?? 'generated-1' }, error: null } }) };
          },
          select: () => ({
            eq: (_col: string, id: string) => {
              calls.readBack.push(id);
              return { maybeSingle: async () => ({ data: w.existing ?? null, error: null }) };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  });
  return calls;
}

const duplicate = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "golf_recruits_pkey"' } };
const mine = { id: REQUEST, team_id: 'team-1', created_by: 'coach-1', first_name: 'Ellie', last_name: 'Morrow' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createRecruit with a request id', () => {
  it('inserts the prospect under that id, so the id is what a repeat would collide on', async () => {
    const calls = world();
    const r = await createRecruit({ first_name: ' Ellie ', last_name: 'Morrow' }, { requestId: REQUEST });
    expect(r).toEqual({ success: true, data: { id: REQUEST } });
    expect(calls.insert).toEqual([expect.objectContaining({ id: REQUEST, team_id: 'team-1', created_by: 'coach-1', first_name: 'Ellie' })]);
  });

  it('a repeat after a lost reply finds the prospect it added and answers with it, adding nobody', async () => {
    const calls = world({ insert: duplicate, existing: mine });
    const r = await createRecruit({ first_name: 'Ellie', last_name: 'Morrow' }, { requestId: REQUEST });
    expect(r).toEqual({ success: true, data: { id: REQUEST } });
    expect(calls.insert).toHaveLength(1);
    expect(calls.readBack).toEqual([REQUEST]);
  });

  it('an id that is taken by a row this coach cannot see (another team\'s) is refused, not reported as saved', async () => {
    world({ insert: duplicate, existing: null });
    const r = await createRecruit({ first_name: 'Ellie', last_name: 'Morrow' }, { requestId: REQUEST });
    expect(r).toEqual({ success: false, error: 'Failed to add recruit' });
  });

  it('an id taken by a prospect on another of this coach\'s teams is refused too', async () => {
    world({ insert: duplicate, existing: { ...mine, team_id: 'team-2' } });
    expect((await createRecruit({ first_name: 'Ellie', last_name: 'Morrow' }, { requestId: REQUEST })).success).toBe(false);
  });

  it('an id taken by someone else\'s prospect on this team is refused', async () => {
    world({ insert: duplicate, existing: { ...mine, created_by: 'coach-2' } });
    expect((await createRecruit({ first_name: 'Ellie', last_name: 'Morrow' }, { requestId: REQUEST })).success).toBe(false);
  });

  it('an id taken by a different prospect of the same coach is refused, never reported as the one being added', async () => {
    world({ insert: duplicate, existing: { ...mine, first_name: 'Owen', last_name: 'Park' } });
    expect((await createRecruit({ first_name: 'Ellie', last_name: 'Morrow' }, { requestId: REQUEST })).success).toBe(false);
    world({ insert: duplicate, existing: { ...mine, first_name: 'Owen' } });
    expect((await createRecruit({ first_name: 'Ellie', last_name: 'Morrow' }, { requestId: REQUEST })).success).toBe(false);
    world({ insert: duplicate, existing: { ...mine, last_name: null } });
    expect((await createRecruit({ first_name: 'Ellie', last_name: 'Morrow' }, { requestId: REQUEST })).success).toBe(false);
  });

  it('a failure that is not a duplicate is a failure, and reads nothing back', async () => {
    const calls = world({ insert: { data: null, error: { code: '42501', message: 'row-level security' } }, existing: mine });
    expect(await createRecruit({ first_name: 'Ellie' }, { requestId: REQUEST })).toEqual({ success: false, error: 'Failed to add recruit' });
    expect(calls.readBack).toEqual([]);
  });

  it('refuses a request id that is not a UUID before it reads or writes anything', async () => {
    const calls = world();
    expect(await createRecruit({ first_name: 'Ellie' }, { requestId: 'not-a-uuid' })).toEqual({ success: false, error: 'Request id must be a UUID' });
    expect(calls.insert).toEqual([]);
  });

  it('without a request id it behaves as before: no id sent, and a duplicate-key error is still a failure', async () => {
    const calls = world();
    const r = await createRecruit({ first_name: 'Ellie' });
    expect(r.success).toBe(true);
    expect(calls.insert[0]).not.toHaveProperty('id');
    const again = world({ insert: duplicate, existing: mine });
    expect((await createRecruit({ first_name: 'Ellie', last_name: 'Morrow' })).success).toBe(false);
    expect(again.readBack).toEqual([]);
  });
});

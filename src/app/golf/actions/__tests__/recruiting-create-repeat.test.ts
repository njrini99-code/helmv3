import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * createRecruit repeated under the Clubhouse Add's request id after a lost reply, with a field corrected in between
 * (P014, CH-14915). The page keeps one id per prospect being added, so the repeat reaches the row the first attempt
 * stored: it is brought up to what was sent this time instead of a second prospect being added, but only while nobody
 * has edited it since. The plain repeat and the refusals are in src/test/golf/actions/recruiting-create.test.ts.
 */

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/observability/supabase/observe-storage', () => ({ observeStorageResult: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

import { createRecruit } from '@/app/golf/actions/recruiting';

const REQUEST = '44444444-4444-4444-8444-444444444444';
const ADDED = '2026-10-20T14:03:11.204518+00:00';

type Stored = { id: string; team_id: string; created_by: string | null; first_name: string; last_name: string | null; created_at: string; updated_at: string };
interface World {
  existing: Stored | null;
  /** What the conditional update answers. */
  update?: { data: Array<{ id: string }> | null; error: { code: string; message: string } | null };
}

const duplicate = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "golf_recruits_pkey"' } };
const mine: Stored = { id: REQUEST, team_id: 'team-1', created_by: 'coach-1', first_name: 'Ellie', last_name: 'Morrow', created_at: ADDED, updated_at: ADDED };

function world(w: World) {
  const calls = { insert: [] as Record<string, unknown>[], update: [] as Array<{ set: Record<string, unknown>; filters: Array<[string, unknown]> }> };
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
            return { select: () => ({ single: async () => duplicate }) };
          },
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: w.existing, error: null }) }) }),
          update: (set: Record<string, unknown>) => {
            const rec = { set, filters: [] as Array<[string, unknown]> };
            calls.update.push(rec);
            const chain = {
              eq: (col: string, v: unknown) => {
                rec.filters.push([col, v]);
                return chain;
              },
              select: async () => w.update ?? { data: [{ id: REQUEST }], error: null },
            };
            return chain;
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  });
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createRecruit repeated with a corrected field (CH-14915)', () => {
  it('brings the stored prospect up to what was sent this time, and adds nobody', async () => {
    const calls = world({ existing: mine });
    const r = await createRecruit({ first_name: 'Ellie', last_name: 'Morrow', hometown: ' Wilmington ', email: 'ellie@example.com' }, { requestId: REQUEST });
    expect(r).toEqual({ success: true, data: { id: REQUEST } });
    expect(calls.insert).toHaveLength(1);
    expect(calls.update).toHaveLength(1);
    expect(calls.update[0]!.set).toMatchObject({ first_name: 'Ellie', last_name: 'Morrow', hometown: 'Wilmington', email: 'ellie@example.com', status: 'recruiting' });
    // Never the key, the team or who added them.
    expect(calls.update[0]!.set).not.toHaveProperty('id');
    expect(calls.update[0]!.set).not.toHaveProperty('team_id');
    expect(calls.update[0]!.set).not.toHaveProperty('created_by');
    // Only this team's row, and only while it is as it was added.
    expect(calls.update[0]!.filters).toEqual([
      ['id', REQUEST],
      ['team_id', 'team-1'],
      ['updated_at', ADDED],
    ]);
  });

  it('the same name with other capitals or spaces is the same prospect; an empty last name is no last name', async () => {
    const calls = world({ existing: mine });
    expect(await createRecruit({ first_name: 'ellie ', last_name: ' MORROW' }, { requestId: REQUEST })).toEqual({ success: true, data: { id: REQUEST } });
    expect(calls.update[0]!.set).toMatchObject({ first_name: 'ellie', last_name: 'MORROW' });
    world({ existing: { ...mine, last_name: null } });
    expect((await createRecruit({ first_name: 'Ellie', last_name: '  ' }, { requestId: REQUEST })).success).toBe(true);
  });

  it('does not overwrite a prospect someone has edited since it was added; that prospect is still the answer', async () => {
    const calls = world({ existing: { ...mine, updated_at: '2026-10-20T14:09:40.000000+00:00' } });
    expect(await createRecruit({ first_name: 'Ellie', last_name: 'Morrow', hometown: 'Dover' }, { requestId: REQUEST })).toEqual({ success: true, data: { id: REQUEST } });
    expect(calls.update).toEqual([]);
  });

  it('a repeat whose update fails is a failure, so its Retry can try again under the same id', async () => {
    world({ existing: mine, update: { data: null, error: { code: '42501', message: 'row-level security' } } });
    expect(await createRecruit({ first_name: 'Ellie', last_name: 'Morrow', hometown: 'Dover' }, { requestId: REQUEST })).toEqual({ success: false, error: 'Failed to add recruit' });
  });

  it('a different prospect under the same id, or another coach’s, is still refused and nothing is updated', async () => {
    let calls = world({ existing: { ...mine, first_name: 'Owen', last_name: 'Park' } });
    expect(await createRecruit({ first_name: 'Ellie', last_name: 'Morrow' }, { requestId: REQUEST })).toEqual({ success: false, error: 'Failed to add recruit' });
    expect(calls.update).toEqual([]);
    calls = world({ existing: { ...mine, created_by: 'coach-2' } });
    expect((await createRecruit({ first_name: 'Ellie', last_name: 'Morrow' }, { requestId: REQUEST })).success).toBe(false);
    expect(calls.update).toEqual([]);
  });
});

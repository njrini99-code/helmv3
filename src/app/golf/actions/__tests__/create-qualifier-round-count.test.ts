import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  const state: { qualifierInsert: Record<string, unknown> | null } = {
    qualifierInsert: null,
  };

  function tableChain(table: string) {
    let wrote = false;
    const node: Record<string, unknown> = {};
    const result = () => {
      if (table === 'golf_coaches') {
        return { data: { id: 'coach-1', organization_id: 'org-1' }, error: null };
      }
      if (table === 'golf_qualifiers' && wrote) {
        return { data: { id: 'qualifier-1' }, error: null };
      }
      return { data: null, error: null };
    };

    Object.assign(node, {
      select: () => node,
      eq: () => node,
      insert: (values: Record<string, unknown>) => {
        wrote = true;
        if (table === 'golf_qualifiers') mocked.state.qualifierInsert = values;
        return node;
      },
      update: () => {
        wrote = true;
        return node;
      },
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
        Promise.resolve(result()).then(resolve),
    });
    return node;
  }

  return {
    state,
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => tableChain(table),
    }),
  };
});

vi.mock('@/lib/supabase/server', () => ({ createClient: mocked.createClient }));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: async () => 'team-1',
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: <T extends (...args: never[]) => unknown>(
    _name: string,
    _options: unknown,
    action: T,
  ) => action,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { createGolfQualifier } from '../golf';

describe('createGolfQualifier', () => {
  beforeEach(() => {
    mocked.state.qualifierInsert = null;
  });

  it('persists a multi-round cap in the qualifier creation write', async () => {
    const result = await createGolfQualifier({
      name: 'Fall Qualifying',
      description: 'Four or five 18-hole rounds',
      startDate: '2026-08-23',
      playerIds: [],
      numRounds: 5,
    });

    expect(result.success).toBe(true);
    expect(mocked.state.qualifierInsert).toMatchObject({ num_rounds: 5 });
  });

  it('rejects a creation request that omits the round cap', async () => {
    const result = await createGolfQualifier({
      name: 'Fall Qualifying',
      startDate: '2026-08-23',
      playerIds: [],
    } as unknown as Parameters<typeof createGolfQualifier>[0]);

    expect(result.success).toBe(false);
    expect(mocked.state.qualifierInsert).toBeNull();
  });
});

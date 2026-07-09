// =============================================================================
// src/app/lifting/actions/__tests__/groups.test.ts
//
// GUARD (Lane D2 fix): createGroup / updateGroup / deleteGroup / addGroupMember
// / removeGroupMember only revalidated the /lifting-portal GROUPS_PATH. Wave C
// now renders the same helm_lifting_groups reads at
// /baseball/dashboard/performance/groups (StrengthGroupsClient, mirroring the
// lifting portal), so a coach editing a group from either portal must bust
// BOTH caches — otherwise the other portal keeps serving a stale member list
// or a renamed group until an unrelated navigation. Mirrors the same
// regression-test pattern already established for programs.ts / sessions.ts /
// player-sessions.ts.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FinalResult {
  data: unknown;
  error: unknown;
}

function makeQueryBuilder(finalResult: FinalResult) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  const passthrough = ['select', 'eq', 'is'];
  for (const m of passthrough) {
    builder[m] = vi.fn(() => builder);
  }
  builder.insertArgs = null as unknown;
  builder.insert = vi.fn((payload: unknown) => {
    builder.insertArgs = payload;
    return builder;
  });
  builder.updateArgs = null as unknown;
  builder.update = vi.fn((patch: unknown) => {
    builder.updateArgs = patch;
    return builder;
  });
  builder.upsertArgs = null as unknown;
  builder.upsert = vi.fn((payload: unknown, opts: unknown) => {
    builder.upsertArgs = [payload, opts];
    return builder;
  });
  builder.single = vi.fn(async () => finalResult);
  builder.maybeSingle = vi.fn(async () => finalResult);
  builder.then = (resolve: (v: FinalResult) => void) => resolve(finalResult);
  return builder;
}

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';

let tableBuilders: Record<string, ReturnType<typeof makeQueryBuilder>>;

function resetTables() {
  tableBuilders = {
    helm_lifting_groups: makeQueryBuilder({
      data: { id: GROUP_ID, organization_id: ORG_ID, name: 'Group A', group_type: 'static', is_active: true },
      error: null,
    }),
    helm_lifting_group_members: makeQueryBuilder({ data: { id: 'member-1' }, error: null }),
    helm_lifting_athletes: makeQueryBuilder({ data: { id: ATHLETE_ID }, error: null }),
  };
}
resetTables();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn((_client: unknown, table: string) => tableBuilders[table]),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/lifting/with-lifting-action', () => ({
  withLiftingAction:
    (_name: string, _opts: unknown, fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const ctx = {
        user: { id: 'user-1' },
        orgId: ORG_ID,
        access: { isCoach: true, canEdit: true, canView: true, coachRow: { id: 'coach-1' } },
      };
      return fn(ctx, ...args);
    },
  LiftingActionError: class LiftingActionError extends Error {},
}));

import { revalidatePath } from 'next/cache';
import { createGroup, updateGroup, deleteGroup, addGroupMember, removeGroupMember } from '@/app/lifting/actions/groups';

describe('lifting groups actions revalidate the baseball performance portal (Wave C parallel routes)', () => {
  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();
    resetTables();
  });

  it('createGroup busts /baseball/dashboard/performance/groups alongside the lifting-portal path', async () => {
    await createGroup({ name: 'New Group' });

    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(paths).toContain('/lifting/dashboard/groups');
    expect(paths).toContain('/baseball/dashboard/performance/groups');
  });

  it('updateGroup busts /baseball/dashboard/performance/groups alongside the lifting-portal path', async () => {
    await updateGroup({ groupId: GROUP_ID, name: 'Renamed Group' });

    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(paths).toContain('/lifting/dashboard/groups');
    expect(paths).toContain('/baseball/dashboard/performance/groups');
  });

  it('deleteGroup busts /baseball/dashboard/performance/groups alongside the lifting-portal path', async () => {
    await deleteGroup({ groupId: GROUP_ID });

    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(paths).toContain('/lifting/dashboard/groups');
    expect(paths).toContain('/baseball/dashboard/performance/groups');
  });

  it('addGroupMember busts /baseball/dashboard/performance/groups alongside the lifting-portal path', async () => {
    await addGroupMember({ groupId: GROUP_ID, athleteId: ATHLETE_ID });

    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(paths).toContain('/lifting/dashboard/groups');
    expect(paths).toContain('/baseball/dashboard/performance/groups');
  });

  it('removeGroupMember busts /baseball/dashboard/performance/groups alongside the lifting-portal path', async () => {
    await removeGroupMember({ groupId: GROUP_ID, athleteId: ATHLETE_ID });

    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(paths).toContain('/lifting/dashboard/groups');
    expect(paths).toContain('/baseball/dashboard/performance/groups');
  });
});

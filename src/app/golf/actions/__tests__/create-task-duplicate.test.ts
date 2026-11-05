import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A retry after a lost response: the same coach creating the same task for the same team within two minutes gets the task
 * that landed back. No second row, no second set of assignments and no second notice.
 */

const spies = vi.hoisted(() => ({ notify: vi.fn(async () => {}) }));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@/lib/notifications', () => ({ notifyTaskAssigned: spies.notify, notifyTeamAnnouncement: vi.fn(async () => {}) }));

type Outcome = { data: unknown; error: unknown };
const PLAYER_ID = '4d2f8a11-6b93-4c27-8e51-9a0c3b7d2e64';
const ok = (data: unknown): Outcome => ({ data, error: null });

let recent: Array<{ id: string; description: string | null; due_date: string | null }> = [];
let duplicateFilters: Array<[string, unknown]> = [];
let inserted: string[] = [];

function chain(table: string) {
  const settle = (): Outcome => {
    if (table === 'golf_team_members') return ok([{ player_id: PLAYER_ID }]);
    if (table === 'golf_players') return ok([{ user_id: 'u-player' }]);
    if (table === 'users') return ok([{ id: 'u-player', email: 'p@example.com' }]);
    return ok([]);
  };
  const single = (): Outcome => {
    if (table === 'golf_coaches') return ok({ id: 'coach-1', organization_id: 'org-1', full_name: 'Coach' });
    if (table === 'golf_teams') return ok({ id: 'team-1' });
    if (table === 'golf_tasks') return ok({ id: 'task-new' });
    return ok(null);
  };
  const node: Record<string, unknown> = {};
  const self = () => node;
  const filters: Array<[string, unknown]> = [];
  Object.assign(node, {
    select: self,
    in: self,
    order: self,
    limit: self,
    update: self,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return node;
    },
    gte: () => {
      duplicateFilters = filters;
      return { limit: async () => ok(recent) };
    },
    insert: () => {
      inserted.push(table);
      return node;
    },
    single: async () => single(),
    maybeSingle: async () => single(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => chain(table),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

async function create(description?: string, dueDate?: string) {
  const mod = await import('@/app/golf/actions/tasks');
  return mod.createTask('team-1', 'Sign the waiver', description, dueDate, undefined, [PLAYER_ID]);
}

beforeEach(() => {
  recent = [];
  duplicateFilters = [];
  inserted = [];
  spies.notify.mockClear();
});

describe('createTask · the duplicate check', () => {
  it('returns the task that landed, inserts nothing and notifies nobody', async () => {
    recent = [{ id: 'task-earlier', description: 'Before Friday', due_date: '2026-11-06' }];
    const result = await create('Before Friday', '2026-11-06');
    expect(result).toEqual({ success: true, data: { taskId: 'task-earlier' } });
    expect(inserted).toEqual([]);
    expect(spies.notify).not.toHaveBeenCalled();
  });

  it('treats a blank description and due date as the empty row they were saved as', async () => {
    recent = [{ id: 'task-earlier', description: null, due_date: null }];
    const result = await create();
    expect(result).toEqual({ success: true, data: { taskId: 'task-earlier' } });
    expect(inserted).toEqual([]);
  });

  it('looks only at this coach, this team and this title', async () => {
    await create();
    expect(Object.fromEntries(duplicateFilters)).toEqual({ team_id: 'team-1', assigned_by: 'coach-1', title: 'Sign the waiver' });
  });

  it('inserts when the title matches but the description differs', async () => {
    recent = [{ id: 'task-earlier', description: 'Before Friday', due_date: null }];
    const result = await create('Before Monday');
    expect(result).toMatchObject({ success: true, data: { taskId: 'task-new' } });
    expect(inserted).toContain('golf_tasks');
  });

  it('inserts when the title matches but the due date differs', async () => {
    recent = [{ id: 'task-earlier', description: null, due_date: '2026-11-06' }];
    const result = await create(undefined, '2026-11-09');
    expect(result).toMatchObject({ success: true, data: { taskId: 'task-new' } });
    expect(inserted).toContain('golf_tasks');
  });
});

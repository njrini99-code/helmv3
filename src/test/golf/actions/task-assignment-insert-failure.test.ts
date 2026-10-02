import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * C-13. createTask inserted the task, then the assignments, and on an assignment failure logged and fell through to
 * `success: true` ("still return success with warning"): the coach was told the task went out, it sat on their list
 * assigned to nobody, and the players were still notified about it. A failed assignment insert must fail the action,
 * take the task back out so Retry cannot duplicate it, and notify nobody.
 */

const logServerError = vi.fn(async () => {});
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
const notifyTaskAssigned = vi.fn(async () => {});
vi.mock('@/lib/notifications', () => ({
  notifyTaskAssigned,
  notifyTeamAnnouncement: vi.fn(async () => {}),
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (d: unknown): Outcome => ({ data: d, error: null });
const fails = (m: string, code = '42501'): Outcome => ({ data: null, error: { message: m, code } });
/** Every delete on golf_tasks. */
const taskDeletes: string[] = [];
let taskDeleteRows: Array<{ id: string }> = [{ id: 'task-1' }];

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const settleSingle = () => outcomes.get(`${table}:single`) ?? outcomes.get(table) ?? ok(null);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, order: self, limit: self, insert: self, update: self,
    delete: () => {
      const d: Record<string, unknown> = {};
      Object.assign(d, {
        eq: (_c: string, id: string) => {
          if (table === 'golf_tasks') taskDeletes.push(id);
          return d;
        },
        select: () => Promise.resolve(ok(table === 'golf_tasks' ? taskDeleteRows : [])),
      });
      return d;
    },
    single: async () => settleSingle(),
    maybeSingle: async () => settleSingle(),
    then: (r: (v: Outcome) => unknown, j?: (e: unknown) => unknown) => Promise.resolve(settle()).then(r, j),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (t: string) => tableChain(t),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

const PLAYER_ID = '4d2f8a11-6b93-4c27-8e51-9a0c3b7d2e64';

async function createTask(assignees: string[] = [PLAYER_ID]) {
  const mod = await import('@/app/golf/actions/tasks');
  return mod.createTask('team-1', 'Sign the waiver', undefined, undefined, undefined, assignees);
}

beforeEach(() => {
  logServerError.mockClear();
  notifyTaskAssigned.mockClear();
  taskDeletes.length = 0;
  taskDeleteRows = [{ id: 'task-1' }];
  outcomes.clear();
  outcomes.set('golf_coaches:single', ok({ id: 'coach-1', organization_id: 'org-1', full_name: 'Coach' }));
  outcomes.set('golf_teams:single', ok({ id: 'team-1' }));
  outcomes.set('golf_tasks:single', ok({ id: 'task-1' }));
  outcomes.set('golf_team_members', ok([{ player_id: PLAYER_ID }]));
  outcomes.set('golf_task_assignments', ok([]));
  outcomes.set('golf_players', ok([{ user_id: 'u-player' }]));
  outcomes.set('users', ok([{ id: 'u-player', email: 'p@example.com' }]));
});

describe('createTask: a failed assignment insert is a failed create (C-13)', () => {
  it('fails, removes the task it created, and notifies nobody', async () => {
    outcomes.set('golf_task_assignments', fails('new row violates row-level security policy'));

    const result = await createTask();

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/wasn't created/);
    expect(taskDeletes).toEqual(['task-1']);
    expect(notifyTaskAssigned).not.toHaveBeenCalled();
    expect(logServerError.mock.calls.some((c) => /Assignment Error/.test(String((c as unknown[])[0])))).toBe(true);
  });

  it('tells the coach not to recreate the task when it could not be removed', async () => {
    outcomes.set('golf_task_assignments', fails('boom'));
    taskDeleteRows = [];

    const result = await createTask();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/do not create it again/);
  });

  it('still succeeds and notifies when the assignments land', async () => {
    const result = await createTask();

    expect(result).toEqual({ success: true, data: { taskId: 'task-1' } });
    expect(taskDeletes).toEqual([]);
    expect(notifyTaskAssigned).toHaveBeenCalled();
  });

  it('a task with no assignees has no assignment insert to fail', async () => {
    outcomes.set('golf_task_assignments', fails('would fail if reached'));
    const result = await createTask([]);
    expect(result.success).toBe(true);
  });
});

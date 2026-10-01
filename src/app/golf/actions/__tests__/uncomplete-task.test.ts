/**
 * @vitest-environment node
 *
 * uncompleteTask: a player's accidental tick is undone on their own completed
 * assignment only, and a change that touched no row is reported as a failure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; values?: unknown; filters: Array<[string, unknown]> };
const calls: Call[] = [];
let updatedRows: Array<{ id: string }> | null = [{ id: 'as1' }];
let updateError: { message: string } | null = null;

function chain(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  calls.push(call);
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.update = (values: unknown) => {
    call.op = 'update';
    call.values = values;
    return q;
  };
  q.eq = (col: string, v: unknown) => {
    call.filters.push([col, v]);
    return q;
  };
  q.single = () => Promise.resolve({ data: table === 'golf_players' ? { id: 'pl1' } : null, error: null });
  q.then = (resolve: (v: unknown) => void) => {
    if (table === 'golf_task_assignments' && call.op === 'update') return resolve({ data: updatedRows, error: updateError });
    if (table === 'golf_task_assignments') return resolve({ data: [{ status: 'pending' }], error: null });
    return resolve({ data: null, error: null });
  };
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (t: string) => chain(t),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/notifications', () => ({ notifyTaskAssigned: vi.fn() }));

const { uncompleteTask } = await import('../tasks');

beforeEach(() => {
  calls.length = 0;
  updatedRows = [{ id: 'as1' }];
  updateError = null;
});

describe('uncompleteTask', () => {
  it("puts only the signed-in player's own completed assignment back to pending, and rolls the task up again", async () => {
    expect(await uncompleteTask('t1')).toEqual({ success: true });
    const write = calls.find((c) => c.table === 'golf_task_assignments' && c.op === 'update')!;
    expect(write.values).toEqual({ status: 'pending', completed_at: null });
    expect(write.filters).toEqual([
      ['task_id', 't1'],
      ['player_id', 'pl1'],
      ['status', 'completed'],
    ]);
    const rollUp = calls.find((c) => c.table === 'golf_tasks' && c.op === 'update')!;
    expect(rollUp.values).toMatchObject({ status: 'pending', completed_at: null });
  });

  it('a change that touched no row (not done, not theirs, or hidden by a policy) is a failure, not a success', async () => {
    updatedRows = [];
    expect(await uncompleteTask('t1')).toEqual({ success: false, error: 'This task is not marked done for you.' });
    expect(calls.some((c) => c.table === 'golf_tasks' && c.op === 'update')).toBe(false);
  });

  it('a failed write says so', async () => {
    updateError = { message: 'boom' };
    expect(await uncompleteTask('t1')).toEqual({ success: false, error: "Couldn't reopen the task. Please try again." });
  });
});

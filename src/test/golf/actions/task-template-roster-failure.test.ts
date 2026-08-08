import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Applying a task template to "all players" is decided by one roster read, and
 * that read discarded its error — the same defect, in the same shape, as the
 * announcements roster read fixed earlier today.
 *
 * A failed read produced an empty playerIds, the `playerIds.length > 0` guard
 * skipped every assignment, and the action returned success. The coach applies
 * a compliance template to the whole team, sees it succeed, and the task exists
 * assigned to nobody.
 *
 * The roster is now resolved BEFORE the task is created, so a failure costs
 * nothing.
 */

const logServerError = vi.fn(async () => {});
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const inserted: string[] = [];
const ok = (data: unknown): Outcome => ({ data, error: null });

function chain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    order: self,
    limit: self,
    update: self,
    delete: self,
    insert: (rows: unknown) => {
      inserted.push(table);
      const n: Record<string, unknown> = {};
      Object.assign(n, {
        select: () => n,
        single: async () => ({ data: { id: `${table}-id` }, error: null }),
        then: (r: (v: Outcome) => unknown) =>
          Promise.resolve({ data: Array.isArray(rows) ? rows : null, error: null }).then(r),
      });
      return n;
    },
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
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

async function applyTemplate() {
  const mod = await import('@/app/golf/actions/tasks');
  return mod.createTaskFromTemplate('tmpl-1', 'team-1');
}

describe('createTaskFromTemplate — a failed roster read must not create a task for nobody', () => {
  beforeEach(() => {
    logServerError.mockClear();
    inserted.length = 0;
    outcomes.clear();
    outcomes.set('golf_coaches', ok({ id: 'c1', organization_id: 'o1' }));
    outcomes.set('golf_task_templates', ok({
      id: 'tmpl-1',
      title: 'Sign the travel waiver',
      description: null,
      default_due_days: 3,
      default_priority: 'high',
      category: 'compliance',
      default_assignee_type: 'all_players',
    }));
    outcomes.set('golf_team_members', ok([{ player_id: 'p1' }, { player_id: 'p2' }]));
  });

  it('creates nothing and names the cause when the roster read fails', async () => {
    outcomes.set('golf_team_members', { data: null, error: { message: 'permission denied', code: '42501' } });

    const result = await applyTemplate();

    expect(result.success).toBe(false);
    // The whole point of resolving the roster first: no orphan task.
    expect(inserted).not.toContain('golf_tasks');
    expect(
      logServerError.mock.calls.some((c) => /roster read failed/.test(String((c as unknown[])[0]))),
    ).toBe(true);
  });

  it('still creates the task and its assignments when the roster reads fine', async () => {
    const result = await applyTemplate();

    expect(result.success).toBe(true);
    expect(inserted).toContain('golf_tasks');
    expect(inserted).toContain('golf_task_assignments');
  });
});

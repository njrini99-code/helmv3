import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Deleting a task, setting a reminder and clearing one each ran the SAME three
 * authorization reads, in three separate copies, and all three copies threw
 * their error away.
 *
 * Refusing when a check cannot run is correct and is kept. What was wrong is
 * what each refusal then claimed: a dropped connection told a coach "Only
 * coaches can delete tasks", told them a task they are looking at does not
 * exist, or told them they are not authorized for their own team. None of
 * those suggests trying again, so the coach stops — and a compliance task they
 * meant to remove stays on every player's list.
 *
 * The three copies are now one resolver, so the honest answer is written once
 * instead of drifting between call sites. The genuine refusals are unchanged:
 * `.single()` reports no-row as PGRST116, and that code still means "really
 * not a coach" / "task really is gone".
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
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({ data: null, error: { message, code } });
/** `.single()` reports a genuine no-row as PGRST116 — an error, not empty data. */
const noRow = (): Outcome => ({ data: null, error: { message: 'no rows', code: 'PGRST116' } });

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok(null);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    order: self,
    limit: self,
    insert: self,
    update: self,
    delete: self,
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
    from: (table: string) => tableChain(table),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

async function remove() {
  const { deleteTask } = await import('@/app/golf/actions/tasks');
  return deleteTask('task-1');
}

type Refusal = { success: false; error: string };
function refused(result: Awaited<ReturnType<typeof remove>>): Refusal {
  expect(result.success).toBe(false);
  return result as Refusal;
}

const RETRY = /Couldn't verify your access to this task/;

describe('task authz — a failed read is not a verdict about the coach', () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
    outcomes.set('golf_coaches', ok({ id: 'c1', organization_id: 'o1' }));
    outcomes.set('golf_tasks', ok({ id: 'task-1', team_id: 't1' }));
    outcomes.set('golf_teams', ok({ id: 't1' }));
  });

  it('does not tell a coach only coaches may delete tasks when the read failed', async () => {
    outcomes.set('golf_coaches', fails('connection reset'));

    const result = refused(await remove());

    expect(result.error).toMatch(RETRY);
    expect(result.error).not.toMatch(/Only coaches can delete tasks/);
  });

  it('does not say "Task not found" when the task read failed', async () => {
    outcomes.set('golf_tasks', fails('statement timeout', '57014'));

    const result = refused(await remove());

    expect(result.error).toMatch(RETRY);
    expect(result.error).not.toMatch(/Task not found/);
  });

  it('does not say "Not authorized for this team" when the team read failed', async () => {
    outcomes.set('golf_teams', fails('permission denied', '42501'));

    const result = refused(await remove());

    expect(result.error).toMatch(RETRY);
    expect(result.error).not.toMatch(/Not authorized for this team/);
  });

  it('records the cause so a run of refusals is diagnosable', async () => {
    outcomes.set('golf_tasks', fails('permission denied', '42501'));

    await remove();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /task authz task read failed/.test(m))).toBe(true);
  });
});

describe('task authz — the genuine refusals still say what is actually wrong', () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
    outcomes.set('golf_coaches', ok({ id: 'c1', organization_id: 'o1' }));
    outcomes.set('golf_tasks', ok({ id: 'task-1', team_id: 't1' }));
    outcomes.set('golf_teams', ok({ id: 't1' }));
  });

  it('someone who really is not a coach is still told so', async () => {
    outcomes.set('golf_coaches', noRow());
    expect(refused(await remove()).error).toMatch(/Only coaches can delete tasks/);
  });

  it('a task that really is gone is still reported as not found', async () => {
    outcomes.set('golf_tasks', noRow());
    expect(refused(await remove()).error).toMatch(/Task not found/);
  });

  it("another team's task is still refused", async () => {
    outcomes.set('golf_teams', noRow());
    expect(refused(await remove()).error).toMatch(/Not authorized for this team/);
  });

  it('a coach with no organization still gets that specific message', async () => {
    outcomes.set('golf_coaches', ok({ id: 'c1', organization_id: null }));
    expect(refused(await remove()).error).toMatch(/not associated with an organization/);
  });
});

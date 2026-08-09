import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Assigning a task writes the assignment rows and then resolves who to notify:
 * golf_players -> user_id, then users -> email. Both reads discarded their
 * error.
 *
 * A failure on either left the list null, the `if (playerRows?.length)` /
 * `if (userRows)` guards fell through, and NO notification was sent to anyone.
 * The surrounding try/catch never fired, because supabase-js RESOLVES failures
 * rather than throwing. The task itself was created, so the coach saw success
 * and reasonably believed their players had been told.
 *
 * Nothing recorded it. This is the same shape as the push-delivery lie one
 * layer up: the work silently did not happen and the system reported fine.
 *
 * Notification stays fire-and-forget — the task is real and visible in-app
 * either way, so this logs rather than failing the action. Only the silence
 * changes.
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
vi.mock('@/lib/notifications', () => ({
  notifyTaskAssigned: vi.fn(async () => {}),
  notifyTeamAnnouncement: vi.fn(async () => {}),
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (d: unknown): Outcome => ({ data: d, error: null });
const fails = (m: string, code = '08006'): Outcome => ({ data: null, error: { message: m, code } });

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const settleSingle = () => outcomes.get(`${table}:single`) ?? outcomes.get(table) ?? ok(null);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, order: self, limit: self, insert: self, update: self,
    single: async () => settleSingle(),
    maybeSingle: async () => settleSingle(),
    then: (r: (v: Outcome) => unknown, j?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(r, j),
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
  // Positional: (teamId, title, description, dueDate, priority, assignToPlayerIds, category)
  return mod.createTask('team-1', 'Sign the waiver', undefined, undefined, undefined, assignees);
}

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_coaches:single', ok({ id: 'coach-1', organization_id: 'org-1', full_name: 'Coach' }));
  outcomes.set('golf_teams:single', ok({ id: 'team-1' }));
  outcomes.set('golf_tasks:single', ok({ id: 'task-1' }));
  outcomes.set('golf_task_assignments', ok([]));
  outcomes.set('golf_players', ok([{ user_id: 'u-player' }]));
  outcomes.set('users', ok([{ id: 'u-player', email: 'p@example.com' }]));
});

describe('task assignment — a failed recipient read must not be silent', () => {
  it('records it when the player lookup fails and nobody can be notified', async () => {
    outcomes.set('golf_players', fails('statement timeout', '57014'));

    await createTask();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /notif|recipient|player/i.test(m))).toBe(true);
  });

  it('records it when the email lookup fails', async () => {
    outcomes.set('users', fails('permission denied', '42501'));

    await createTask();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /notif|recipient|email|user/i.test(m))).toBe(true);
  });
});

describe('task assignment — the honest paths stay quiet', () => {
  it('logs nothing on the healthy path', async () => {
    await createTask();
    expect(logServerError).not.toHaveBeenCalled();
  });
});

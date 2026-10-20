import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * C-10 (privacy). A targeted announcement is the announcement row PLUS one recipient row per chosen player, and an
 * announcement with no recipient rows is read everywhere as "all team". The recipients insert's error was discarded,
 * so when it failed a post the coach addressed to two players became readable by the whole team and the action said
 * success. The announcement must not outlive its recipients: on failure it is deleted and the action fails.
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
const insertErrors = new Map<string, unknown>();
const inserted: Array<{ table: string; rows: unknown }> = [];
/** Every delete on golf_announcements: which client ran it and what it answered. */
const deletes: Array<{ client: 'user' | 'admin'; id: unknown }> = [];
let userDeleteRows: Array<{ id: string }> = [{ id: 'golf_announcements-id' }];
let adminDeleteRows: Array<{ id: string }> = [{ id: 'golf_announcements-id' }];

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const ROSTER = [{ player_id: P1 }, { player_id: P2 }, { player_id: '33333333-3333-4333-8333-333333333333' }];

function chain(table: string, client: 'user' | 'admin') {
  const settle = () => outcomes.get(table) ?? { data: [], error: null };
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    order: self,
    limit: self,
    update: self,
    upsert: self,
    delete: () => {
      const d: Record<string, unknown> = {};
      let id: unknown;
      Object.assign(d, {
        eq: (_col: string, value: unknown) => {
          id = value;
          return d;
        },
        select: () => {
          deletes.push({ client, id });
          const rows = client === 'user' ? userDeleteRows : adminDeleteRows;
          return Promise.resolve({ data: rows, error: null });
        },
      });
      return d;
    },
    insert: (rows: unknown) => {
      inserted.push({ table, rows });
      const error = insertErrors.get(table) ?? null;
      const n: Record<string, unknown> = {};
      Object.assign(n, {
        select: () => n,
        single: async () => ({ data: { id: `${table}-id`, team_id: 't1' }, error: null }),
        then: (r: (v: Outcome) => unknown) => Promise.resolve({ data: error ? null : [], error }).then(r),
      });
      return n;
    },
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

function makeClient(client: 'user' | 'admin') {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => chain(table, client),
    rpc: async () => ({ data: null, error: null }),
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeClient('admin') }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient('user') }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: async () => 't1' }));

async function publishTo(recipientPlayerIds: string[] | null) {
  const mod = await import('@/app/golf/actions/announcements');
  return mod.createEnrichedAnnouncement({
    title: 'Private: lineup change',
    body: 'Only the two of you.',
    urgency: 'normal',
    requiresAcknowledgement: false,
    recipientPlayerIds,
    documentIds: [],
    inlineTasks: [],
  });
}

describe('createEnrichedAnnouncement: a failed recipients insert must not leave a team-wide post (C-10)', () => {
  beforeEach(() => {
    logServerError.mockClear();
    inserted.length = 0;
    deletes.length = 0;
    outcomes.clear();
    insertErrors.clear();
    userDeleteRows = [{ id: 'golf_announcements-id' }];
    adminDeleteRows = [{ id: 'golf_announcements-id' }];
    outcomes.set('golf_coaches', { data: { id: 'c1', organization_id: 'o1', full_name: 'Coach' }, error: null });
    outcomes.set('golf_team_members', { data: ROSTER, error: null });
  });

  it('deletes the announcement and returns failure when the recipients insert fails', async () => {
    insertErrors.set('golf_announcement_recipients', { message: 'new row violates row-level security policy', code: '42501' });

    const result = await publishTo([P1, P2]);

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/wasn't sent/);
    // The announcement it created is the one it removed, via the caller's own client.
    expect(deletes).toEqual([{ client: 'user', id: 'golf_announcements-id' }]);
    expect(logServerError.mock.calls.some((call) => /recipients insert failed/.test(String((call as unknown[])[0])))).toBe(true);
  });

  it('does not send anything or create tasks after the failure', async () => {
    insertErrors.set('golf_announcement_recipients', { message: 'boom', code: 'XX000' });

    await publishTo([P1, P2]);

    expect(inserted.map((i) => i.table)).toEqual(['golf_announcements', 'golf_announcement_recipients']);
  });

  it('falls back to the service role when the caller cannot delete, and says so if even that fails', async () => {
    insertErrors.set('golf_announcement_recipients', { message: 'boom', code: 'XX000' });
    userDeleteRows = []; // RLS: zero rows, no error

    const recovered = await publishTo([P1]);
    expect(recovered.success).toBe(false);
    expect(recovered.error).toMatch(/wasn't sent/);
    expect(deletes.map((d) => d.client)).toEqual(['user', 'admin']);

    deletes.length = 0;
    adminDeleteRows = [];
    const stuck = await publishTo([P1]);
    expect(stuck.success).toBe(false);
    expect(stuck.error).toMatch(/visible to the whole team/);
    expect(logServerError.mock.calls.some((call) => /DELETE ALSO FAILED/.test(String((call as unknown[])[0])))).toBe(true);
  });

  it('a successful targeted post still succeeds and is not deleted', async () => {
    const result = await publishTo([P1, P2]);

    expect(result.success).toBe(true);
    expect(result.data?.announcementId).toBe('golf_announcements-id');
    expect(deletes).toEqual([]);
    expect(inserted.some((i) => i.table === 'golf_announcement_recipients')).toBe(true);
  });

  it('an all-team post writes no recipient rows and has nothing to delete', async () => {
    const result = await publishTo(null);

    expect(result.success).toBe(true);
    expect(inserted.some((i) => i.table === 'golf_announcement_recipients')).toBe(false);
    expect(deletes).toEqual([]);
  });
});

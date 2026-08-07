import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * "Send this to the whole team" is decided by one roster read, and that read
 * used to discard its error and return `[]`.
 *
 * `[]` is the worst possible value for it to return, because every guard
 * downstream is written as `targetPlayerIds.length > 0`. A failed roster read
 * therefore did not fail — it silently meant "send to nobody": the announcement
 * row was created, its inline tasks were created and assigned to no one, the
 * email/push fan-out was skipped, and the action returned success. A coach
 * publishing a mandatory waiver saw a success toast while zero players got it.
 *
 * The fix reads the roster ONCE and BEFORE any write, so a failure costs
 * nothing. These tests pin both halves: it must fail closed on a failed read,
 * and it must still work normally when the read succeeds.
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
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeClient() }));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const inserted: string[] = [];

const ROSTER = [{ player_id: 'p1' }, { player_id: 'p2' }];

function chain(table: string) {
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
    delete: self,
    insert: (rows: unknown) => {
      inserted.push(table);
      const n: Record<string, unknown> = {};
      Object.assign(n, {
        select: () => n,
        single: async () => ({ data: { id: `${table}-id`, team_id: 't1' }, error: null }),
        then: (r: (v: Outcome) => unknown) =>
          Promise.resolve({ data: Array.isArray(rows) ? rows.map(() => ({ id: 'x' })) : null, error: null }).then(r),
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

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => chain(table),
    rpc: async () => ({ data: null, error: null }),
  };
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: async () => 't1',
}));

async function publish() {
  const mod = await import('@/app/golf/actions/announcements');
  return mod.createEnrichedAnnouncement({
    title: 'Mandatory: sign the travel waiver',
    body: 'Due Friday.',
    urgency: 'high',
    requiresAcknowledgement: true,
    recipientPlayerIds: null,
    documentIds: [],
    inlineTasks: [{ title: 'Sign waiver' }],
  } as never);
}

describe('createEnrichedAnnouncement — a failed roster read must not mean "send to nobody"', () => {
  beforeEach(() => {
    logServerError.mockClear();
    inserted.length = 0;
    outcomes.clear();
    outcomes.set('golf_coaches', { data: { id: 'c1', organization_id: 'o1', full_name: 'Coach' }, error: null });
    outcomes.set('golf_team_members', { data: ROSTER, error: null });
  });

  it('fails closed, writes nothing, and names the cause when the roster read fails', async () => {
    outcomes.set('golf_team_members', { data: null, error: { message: 'permission denied', code: '42501' } });

    const result = await publish();

    expect(result.success).toBe(false);
    // The announcement must NOT exist — this is the whole point of resolving
    // the roster before the write.
    expect(inserted).not.toContain('golf_announcements');
    expect(
      logServerError.mock.calls.some((call) => /roster read failed/.test(String((call as unknown[])[0]))),
    ).toBe(true);
  });

  it('does not accuse the coach of picking players off their own team when the check could not run', async () => {
    outcomes.set('golf_team_members', { data: null, error: { message: 'statement timeout', code: '57014' } });

    const result = await publish();

    expect(result.success).toBe(false);
    expect(!result.success && result.error).not.toMatch(/not on your team/i);
  });

  it('still publishes normally when the roster read succeeds', async () => {
    const result = await publish();

    expect(result.success).toBe(true);
    expect(inserted).toContain('golf_announcements');
    expect(
      logServerError.mock.calls.some((call) => /roster read failed/.test(String((call as unknown[])[0]))),
    ).toBe(false);
  });
});

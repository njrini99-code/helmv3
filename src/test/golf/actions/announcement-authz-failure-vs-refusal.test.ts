import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Reading a team's announcements ran three identity reads before anything was
 * returned, in two separate copies (the list and the detail), and every copy
 * discarded its error.
 *
 * supabase-js resolves a failure as `{ data: null, error }`, so a dropped
 * connection produced no coach row and no player row, fell through to the final
 * `else`, and answered "Not authorized for this team" — to a coach, or to a
 * rostered player, about their own team. Announcements are how a team is told
 * things: the player sees a locked door where the message was, is given nothing
 * to retry, and concludes there is nothing to read.
 *
 * Denying when the check cannot run is correct and is kept. The authorization
 * RULES are unchanged too — including the dual coach/player case, where a coach
 * not staffed on this team is still let through if they also hold a player
 * profile. Only the sentence attached to a FAILED read is different.
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
// Staff-strict coach access is its own resolver and is not what this file
// exercises; keep it honest (true) so the coach cases turn on the reads.
vi.mock('@/lib/golf/validate-coach-team-access', () => ({
  validateCoachTeamAccess: vi.fn(async () => true),
}));

type Outcome = { data: unknown; error: unknown };

const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({ data: null, error: { message, code } });

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
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

const client = () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (table: string) => tableChain(table),
  rpc: async () => ({ data: null, error: null }),
});

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client() }));

async function list() {
  const { getAnnouncementsWithMeta } = await import('@/app/golf/actions/announcements');
  // The extra args are the caller's already-known context; authorization is
  // still re-derived from the reads inside, which is what this file exercises.
  return getAnnouncementsWithMeta('team-1', 'u1', false, 'p1');
}

type Refusal = { success: false; error: string };
function refused(result: Awaited<ReturnType<typeof list>>): Refusal {
  expect(result.success).toBe(false);
  return result as Refusal;
}

const RETRY = /Couldn't verify your access to this team's announcements/;

describe("announcements — a failed identity read is not a verdict on the reader", () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
    outcomes.set('golf_coaches', ok(null));
    outcomes.set('golf_players', ok({ id: 'p1' }));
    outcomes.set('golf_team_members', ok({ id: 'm1' }));
    outcomes.set('golf_announcements', ok([]));
  });

  it('does not deny the team when the coach read failed', async () => {
    outcomes.set('golf_coaches', fails('connection reset'));

    const result = refused(await list());

    expect(result.error).toMatch(RETRY);
    expect(result.error).not.toMatch(/Not authorized for this team/);
  });

  it('does not deny the team when the player read failed', async () => {
    outcomes.set('golf_players', fails('permission denied', '42501'));

    const result = refused(await list());

    expect(result.error).toMatch(RETRY);
    expect(result.error).not.toMatch(/Not authorized for this team/);
  });

  it('does not tell a rostered player they are not on the team when the membership read failed', async () => {
    outcomes.set('golf_team_members', fails('statement timeout', '57014'));

    const result = refused(await list());

    expect(result.error).toMatch(RETRY);
    expect(result.error).not.toMatch(/Not authorized for this team/);
  });

  it('records the cause so a run of denials is diagnosable', async () => {
    outcomes.set('golf_team_members', fails('statement timeout', '57014'));

    await list();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /membership read failed/.test(m))).toBe(true);
  });
});

describe('announcements — the genuine denials are unchanged', () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
    outcomes.set('golf_announcements', ok([]));
  });

  it('someone who is neither a coach nor a player is still denied', async () => {
    outcomes.set('golf_coaches', ok(null));
    outcomes.set('golf_players', ok(null));

    expect(refused(await list()).error).toBe('Not authorized for this team');
  });

  it("a player who really is not on the team is still denied", async () => {
    outcomes.set('golf_coaches', ok(null));
    outcomes.set('golf_players', ok({ id: 'p1' }));
    outcomes.set('golf_team_members', ok(null)); // maybeSingle: no row, no error

    expect(refused(await list()).error).toBe('Not authorized for this team');
  });

  it('a rostered player is let through', async () => {
    outcomes.set('golf_coaches', ok(null));
    outcomes.set('golf_players', ok({ id: 'p1' }));
    outcomes.set('golf_team_members', ok({ id: 'm1' }));

    const result = await list();

    expect(result.success).toBe(true);
  });
});

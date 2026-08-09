import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Player CoachHelm's shot analytics reads holes and shots for the player's
 * recent rounds. Both reads discarded their error, so a failure produced the
 * same empty arrays an unplayed season produces — and the surface then reports
 * 0 drives, 0 fairways hit, no shot patterns, as the player's actual game.
 *
 * This function already distinguishes those two things everywhere else: a
 * player with no rounds in the window gets a typed
 * { success: false, code: 'no_rounds_in_period' }, deliberately stable so the
 * soft-failure observer does not log an expected empty state at error severity.
 * The two reads below were the gap in that vocabulary — the one place a
 * failure was allowed to masquerade as an answer.
 *
 * So the fix stays in the file's own idiom: a distinct typed failure code
 * rather than a throw, which keeps the honest-empty case exactly as it was.
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
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_name: string, _opts: unknown, impl: unknown) => impl,
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({
  data: null,
  error: { message, code },
});

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    not: self,
    or: self,
    is: self,
    neq: self,
    gt: self,
    lt: self,
    gte: self,
    lte: self,
    order: self,
    limit: self,
    range: self,
    filter: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (table: string) => tableChain(table),
  rpc: async () => ({ data: null, error: null }),
};

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true })),
}));

async function analytics() {
  const mod = await import('@/app/golf/actions/shot-analytics');
  return mod.getPlayerShotAnalytics(PLAYER_ID);
}

type Failure = { success: false; error: string; code?: string };

/** Must be a real UUID — the action validates the shape before doing anything. */
const PLAYER_ID = '3f1a7c88-9b21-4d55-8e0f-6a2c4d7b1e93';

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_players', ok({ id: PLAYER_ID, user_id: 'u1' }));
  outcomes.set('golf_rounds', ok([{ id: 'r1', player_id: PLAYER_ID, status: 'completed' }]));
  outcomes.set('golf_holes', ok([]));
  outcomes.set('golf_shots', ok([]));
});

describe('shot analytics — a failed read is not a played-and-empty season', () => {
  it('does not report an analysed game when the holes read failed', async () => {
    outcomes.set('golf_holes', fails('statement timeout', '57014'));

    const result = (await analytics()) as Failure;

    expect(result.success).toBe(false);
    // Must NOT borrow the deliberately-stable expected-empty code.
    expect(result.code).not.toBe('no_rounds_in_period');
  });

  it('does not report an analysed game when the shot read failed', async () => {
    outcomes.set('golf_shots', fails('permission denied', '42501'));

    const result = (await analytics()) as Failure;

    expect(result.success).toBe(false);
    expect(result.code).not.toBe('no_rounds_in_period');
  });

  it('records the cause', async () => {
    outcomes.set('golf_holes', fails('connection reset'));

    await analytics();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /hole|shot|analytics/i.test(m))).toBe(true);
  });
});

describe('shot analytics — the honest empty state keeps its own meaning', () => {
  it('still reports no_rounds_in_period for a player who has not played', async () => {
    outcomes.set('golf_rounds', ok([]));

    const result = (await analytics()) as Failure;
    expect(result.success).toBe(false);
    expect(result.code).toBe('no_rounds_in_period');
  });
});

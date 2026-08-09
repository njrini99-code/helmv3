import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getPlayerProfileStats feeds My Game Profile. It reads shots, then holes, then
 * hands both to the stats calculator.
 *
 * The shots read was already handled — it binds its error, logs, and returns a
 * typed failure. The holes read next to it discarded its error, and the comment
 * sitting on that very read spells out why that is worse than an empty list:
 *
 *   "gir/score/sand_save are canonical inputs: without them the calculator
 *    falls back to shot-count for score and re-derives GIR from shot results,
 *    which corrupts scrambling, sand-save, and any score/par-based stat."
 *
 * So a failed holes read did not produce a blank profile. It produced a
 * COMPLETE-LOOKING one built on a silent fallback — wrong numbers wearing the
 * same face as right ones. A player reads their scrambling percentage off that
 * screen and has no way to know it was computed without the inputs.
 *
 * The fix uses the idiom already established one read above: bind, log, return
 * a typed failure.
 *
 * Honest states are unchanged: a player with rounds but no shots recorded still
 * gets success with null stats, which is the real "nothing to compute yet".
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

/** UUID-shaped: several actions in this area validate the id before doing work. */
const PLAYER_ID = '7c9e2b41-3d58-4a16-9f02-8b5d6e1c4a77';

async function profileStats() {
  const mod = await import('@/app/golf/actions/player-profile-stats');
  return mod.getPlayerProfileStats(PLAYER_ID, 'overall');
}

type Result = { success: boolean; error?: string; stats: unknown };

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  // Caller owns this player.
  outcomes.set('golf_players', ok({ id: PLAYER_ID }));
  outcomes.set('golf_rounds', ok([{ id: 'r1', round_date: '2026-09-01', course_name: 'X', holes_played: 18 }]));
  outcomes.set('golf_shots', ok([{ id: 's1', round_id: 'r1', hole_number: 1, shot_number: 1 }]));
  outcomes.set('golf_holes', ok([{ round_id: 'r1', hole_number: 1, par: 4, score: 4, putts: 2 }]));
});

describe('my game profile — a failed hole read must not become a computed stat line', () => {
  it('does not return stats when the hole read failed', async () => {
    outcomes.set('golf_holes', fails('statement timeout', '57014'));

    const result = (await profileStats()) as Result;

    // Pre-fix this returned success with a stat line silently computed without
    // gir/score/sand_save.
    expect(result.success).toBe(false);
  });

  it('records the cause', async () => {
    outcomes.set('golf_holes', fails('permission denied', '42501'));

    await profileStats();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /hole/i.test(m))).toBe(true);
  });
});

describe('my game profile — honest states are unchanged', () => {
  it('still succeeds with null stats when the player has no shots recorded', async () => {
    outcomes.set('golf_shots', ok([]));

    const result = (await profileStats()) as Result;

    expect(result.success).toBe(true);
    expect(result.stats).toBeNull();
  });

  it('still succeeds on the healthy path', async () => {
    expect(((await profileStats()) as Result).success).toBe(true);
  });
});

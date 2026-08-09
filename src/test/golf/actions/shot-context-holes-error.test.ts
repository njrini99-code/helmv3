import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getPlayerShotContext returns the CoachHelm shot context: weaknesses, yardage
 * curve, dead zones, resilience — and a scramble rate computed from a separate
 * holes read whose error was discarded.
 *
 * Being precise about the impact: calculateScrambleRate([]) returns null, not a
 * fabricated 0, so a failed read did NOT produce a wrong percentage. It
 * produced "insufficient data" — which a coach reads as "this player has not
 * scrambled enough to measure", sitting next to weaknesses and dead zones that
 * ARE real. A mixed payload, part measured and part unmeasurable, with nothing
 * marking which is which.
 *
 * Milder than a wrong number, still a claim the read never supported. The
 * function's catch already logs and returns { success: false }, so raising the
 * error routes it somewhere honest.
 *
 * A player who genuinely has no qualifying holes still gets the same null rate
 * — that case is unchanged and tested.
 */

const logServerError = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _o: unknown, impl: unknown) => impl,
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
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
    select: self, eq: self, in: self, not: self, or: self, is: self, neq: self,
    gt: self, lt: self, gte: self, lte: self, order: self, limit: self, range: self, filter: self,
    single: async () => settleSingle(),
    maybeSingle: async () => settleSingle(),
    then: (r: (v: Outcome) => unknown, j?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(r, j),
  });
  return node;
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (t: string) => tableChain(t),
  rpc: async () => ({ data: null, error: null }),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));

const PLAYER_ID = '2b6f1d90-4c73-4a12-9e58-1d0f7c3a9b44';

async function shotContext() {
  const mod = await import('@/app/golf/actions/coachhelm-data');
  return mod.getPlayerShotContext(PLAYER_ID);
}

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_players:single', ok({ id: PLAYER_ID, user_id: 'u1' }));
  outcomes.set('golf_rounds', ok([{ id: 'r1' }]));
  // Non-empty: the function bails with "No shot data available for analysis"
  // before it ever reaches the holes read, which would make the assertions
  // below pass for the wrong reason.
  outcomes.set('golf_shots', ok([
    {
      id: 's1', round_id: 'r1', hole_number: 1, shot_number: 1,
      lie_before: 'tee', lie_after: 'fairway',
      distance_to_hole_before: 400, distance_to_hole_after: 150,
      distance_unit_before: 'yards', distance_unit_after: 'yards',
      club_type: 'driver', result: 'fairway',
    },
    {
      id: 's2', round_id: 'r1', hole_number: 1, shot_number: 2,
      lie_before: 'fairway', lie_after: 'green',
      distance_to_hole_before: 150, distance_to_hole_after: 20,
      distance_unit_before: 'yards', distance_unit_after: 'feet',
      club_type: 'iron', result: 'green',
    },
  ]));
  outcomes.set('golf_holes', ok([]));
});

describe('shot context — a failed hole read is not "insufficient data"', () => {
  it('does not report success when the hole read failed', async () => {
    outcomes.set('golf_holes', fails('statement timeout', '57014'));
    expect((await shotContext()).success).toBe(false);
  });

  it('records the cause', async () => {
    outcomes.set('golf_holes', fails('permission denied', '42501'));
    await shotContext();
    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /hole/i.test(m))).toBe(true);
  });
});

describe('shot context — the genuine no-data case is unchanged', () => {
  it('still succeeds for a player with no qualifying holes', async () => {
    expect((await shotContext()).success).toBe(true);
  });
});

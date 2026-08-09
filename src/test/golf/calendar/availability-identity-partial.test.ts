import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * C19's team reads were already fixed: they bind their error, log it, and set
 * `partial` so the caller knows the busy-period list is incomplete rather than
 * empty. This is the hole left at the very first step.
 *
 * The player/coach identity lookups run in a Promise.all and only `.data` was
 * taken. If they fail, `player` and `coach` are both null, `isCoach` is false,
 * NEITHER team branch runs, `teamIds` stays empty, and the team-events query is
 * skipped by the `teamIds.length > 0` gate — so the function returns no busy
 * periods at all.
 *
 * And `partial` stays FALSE, which is the part that matters: the caller is told
 * this is a complete answer. The conflict checker then reports that everyone is
 * free, and a coach schedules a practice over an existing one.
 *
 * `partial` is not decorative — insights.ts:4628 counts it (`playersFailed`).
 *
 * The honest case is unchanged: a user who is genuinely neither a player nor a
 * coach also yields no busy periods, but with `error === null`, so `partial`
 * stays false and that answer is trusted correctly.
 */

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
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

const supabase = { from: (t: string) => tableChain(t) } as never;

async function busy() {
  const mod = await import('@/lib/calendar/availability');
  return mod.getUserBusyPeriodsWithStatus(
    'user-1',
    new Date('2026-09-01T00:00:00Z'),
    new Date('2026-09-08T00:00:00Z'),
    supabase,
  );
}

beforeEach(() => {
  outcomes.clear();
  outcomes.set('golf_players', ok({ id: 'p1', user_id: 'user-1' }));
  outcomes.set('golf_coaches', ok(null));
  outcomes.set('golf_team_members', ok([]));
  outcomes.set('golf_events', ok([]));
  outcomes.set('golf_coach_blocked_time', ok([]));
});

describe('busy periods — a failed identity read must not read as a free calendar', () => {
  it('marks the result partial when the player identity read failed', async () => {
    outcomes.set('golf_players', fails('connection reset'));

    expect((await busy()).partial).toBe(true);
  });

  it('marks the result partial when the coach identity read failed', async () => {
    outcomes.set('golf_coaches', fails('statement timeout', '57014'));

    expect((await busy()).partial).toBe(true);
  });
});

describe('busy periods — a genuinely free calendar is still reported as complete', () => {
  it('stays complete for a user who is neither a player nor a coach', async () => {
    // Both reads legitimately find nothing: { data: null, error: null }.
    outcomes.set('golf_players', ok(null));
    outcomes.set('golf_coaches', ok(null));

    const result = await busy();

    expect(result.partial).toBe(false);
    expect(result.periods).toEqual([]);
  });

  it('stays complete for a rostered player with no events', async () => {
    const result = await busy();

    expect(result.partial).toBe(false);
  });
});

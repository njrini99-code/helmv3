import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * C19 — the scheduling conflict checker reported "no conflicts" for everyone
 * when a read failed.
 *
 * Two distinct false all-clears, and the shorter one was the worse one:
 *
 *  1. `checkEventConflicts` reads the attendee list first and returned
 *     `{ hasConflict: false }` the moment it came back empty. A failed read is
 *     empty, so ONE bad query told a coach that EVERY attendee was free —
 *     without availability.ts ever being entered.
 *
 *  2. Inside `getUserBusyPeriods`, a failed team read leaves `teamIds = []`,
 *     which makes the team-events query be skipped entirely by the
 *     `teamIds.length > 0` gate. The player then has no team events, so no
 *     conflicts.
 *
 * The surface is advisory — the notice never blocks save — so this removes a
 * warning rather than corrupting data. But it removes it silently, and the
 * coach's next move is to schedule over someone's class.
 *
 * An empty attendee list with NO error is a real answer and must stay a clean
 * all-clear: there is genuinely nobody to conflict with.
 */

const logServerError = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

type Outcome = { data: unknown; error: unknown };

const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({ data: null, error: { message, code } });

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    or: self,
    gte: self,
    lte: self,
    gt: self,
    lt: self,
    neq: self,
    not: self,
    is: self,
    order: self,
    limit: self,
    range: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (table: string) => tableChain(table),
  rpc: async () => ({ data: null, error: null }),
};

async function check() {
  const { checkEventConflicts } = await import('@/lib/calendar/conflicts');
  return checkEventConflicts(
    new Date('2026-09-01T15:00:00Z'),
    new Date('2026-09-01T17:00:00Z'),
    ['p1'],
    supabase as never,
  );
}

describe('checkEventConflicts — a failed read is not an all-clear', () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
    outcomes.set('golf_players', ok([{ id: 'p1', user_id: 'u2', first_name: 'Ada', last_name: 'Byron', avatar_url: null }]));
  });

  it('marks the result partial when the attendee read fails', async () => {
    outcomes.set('golf_players', fails('connection reset'));

    const result = await check();

    // Still no conflicts listed — there is nothing to list. The difference is
    // that the caller can now tell "none found" from "could not look".
    expect(result.hasConflict).toBe(false);
    expect(result.partial).toBe(true);
  });

  it('records the cause of a failed attendee read', async () => {
    outcomes.set('golf_players', fails('permission denied', '42501'));

    await check();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /attendee read failed/.test(m))).toBe(true);
  });

  it('marks the result partial when a busy-period read fails one frame down', async () => {
    // The attendee read succeeds; the membership lookup inside
    // getUserBusyPeriods is what fails, emptying teamIds and skipping the
    // team-events query behind the `teamIds.length > 0` gate.
    outcomes.set('golf_players', ok([{ id: 'p1', user_id: 'u2', first_name: 'Ada', last_name: 'Byron', avatar_url: null }]));
    outcomes.set('golf_team_members', fails('statement timeout', '57014'));

    const result = await check();

    expect(result.partial).toBe(true);
  });
});

describe('checkEventConflicts — a genuine all-clear stays clean', () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
  });

  it('an empty attendee list is a real answer, not a partial one', async () => {
    // Nobody to conflict with. Flagging this as partial would put a
    // "couldn't check" warning on every event with no attendees.
    outcomes.set('golf_players', ok([]));

    const result = await check();

    expect(result.hasConflict).toBe(false);
    expect(result.partial).toBeUndefined();
  });

  it('a clean run with real attendees and no busy time omits partial entirely', async () => {
    outcomes.set('golf_players', ok([{ id: 'p1', user_id: 'u2', first_name: 'Ada', last_name: 'Byron', avatar_url: null }]));

    const result = await check();

    expect(result.hasConflict).toBe(false);
    expect(result.partial).toBeUndefined();
  });
});

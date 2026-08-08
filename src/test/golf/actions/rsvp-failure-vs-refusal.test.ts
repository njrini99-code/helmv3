import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tapping "Going" on an event runs three reads before anything is written, and
 * all three used to discard their error.
 *
 * Refusing the RSVP when a read fails is CORRECT and is kept — the same rule is
 * enforced by RLS at the write, and a check that could not run must not pass.
 * The bug was never the refusal, it was the sentence attached to it. A dropped
 * connection told a player with a profile "Player profile not found", told them
 * the event they were looking at did not exist, or told an active member of the
 * team that only active members may RSVP.
 *
 * Every one of those reads as the app having lost the player, and none of them
 * suggests trying again — so the player stops, and the coach's attendance list
 * is quietly wrong on the busiest table in the product.
 *
 * The genuine answers still have to survive: a player with no profile, an event
 * that really is gone, and someone who really is not on the team keep their own
 * specific messages.
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
  const settle = () => outcomes.get(table) ?? ok(null);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    order: self,
    limit: self,
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
  }),
}));

async function rsvp() {
  const { respondToEvent } = await import('@/app/golf/actions/golf');
  return respondToEvent('e1', 'accepted');
}

const RETRY = /Couldn't check your RSVP for this event/;

/**
 * `RespondToEventResult` is a discriminated union, and `expect(...).toBe(false)`
 * does not narrow it. Assert the refusal once, here, and hand back the branch
 * that actually carries `error` and `code`.
 */
type RsvpRefusal = { success: false; error: string; code?: string };
function refused(result: Awaited<ReturnType<typeof rsvp>>): RsvpRefusal {
  expect(result.success).toBe(false);
  return result as RsvpRefusal;
}

describe('respondToEvent — a failed read is not a finding about the player', () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
    outcomes.set('golf_players', ok({ id: 'p1' }));
    outcomes.set('golf_events', ok({ id: 'e1', team_id: 't1' }));
    outcomes.set('golf_team_members', ok({ id: 'm1' }));
  });

  it('does not say "Player profile not found" when the player read failed', async () => {
    outcomes.set('golf_players', fails('connection reset'));

    const result = refused(await rsvp());

    expect(result.error).toMatch(RETRY);
    expect(result.error).not.toMatch(/Player profile not found/);
  });

  it('does not say "Event not found" when the event read failed', async () => {
    outcomes.set('golf_events', fails('permission denied', '42501'));

    const result = refused(await rsvp());

    expect(result.error).toMatch(RETRY);
    expect(result.error).not.toMatch(/Event not found/);
  });

  it('does not tell an active member they are not on the team when the read failed', async () => {
    outcomes.set('golf_team_members', fails('statement timeout', '57014'));

    const result = refused(await rsvp());

    expect(result.error).toMatch(RETRY);
    expect(result.error).not.toMatch(/Only active members/);
    // The typed code drives UI that offers to contact the coach. Sending
    // someone down that path over a timeout wastes both their time.
    expect(result.code).not.toBe('not_team_member');
  });

  it('records the cause so a run of refusals is diagnosable', async () => {
    outcomes.set('golf_events', fails('permission denied', '42501'));

    await rsvp();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /RSVP event read failed/.test(m))).toBe(true);
  });
});

describe('respondToEvent — the genuine refusals still say what is actually wrong', () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
    outcomes.set('golf_players', ok({ id: 'p1' }));
    outcomes.set('golf_events', ok({ id: 'e1', team_id: 't1' }));
    outcomes.set('golf_team_members', ok({ id: 'm1' }));
  });

  it('a player with no profile is still told so', async () => {
    // `.single()` reports no-row as PGRST116 — an error, not empty data. It has
    // to stay on the genuine-answer side of the split, or the fix would turn
    // every real "no profile" into a retry prompt that never resolves.
    outcomes.set('golf_players', { data: null, error: { message: 'no rows', code: 'PGRST116' } });

    const result = refused(await rsvp());

    expect(result.error).toMatch(/Player profile not found/);
  });

  it('an event that really is gone is still reported as not found', async () => {
    outcomes.set('golf_events', ok(null));

    const result = refused(await rsvp());

    expect(result.error).toMatch(/Event not found/);
  });

  it('someone who really is not on the team still gets the typed refusal', async () => {
    outcomes.set('golf_team_members', ok(null));

    const result = refused(await rsvp());

    expect(result.error).toMatch(/Only active members/);
    expect(result.code).toBe('not_team_member');
  });
});

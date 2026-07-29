// =============================================================================
// src/app/baseball/actions/__tests__/roster-assignable-player-search.test.ts
//
// searchAssignablePlayers — the "Add existing player" lookup, after the
// baseball tenant-isolation fix (supabase/migrations/20260729000100_* and
// 20260729000200_*).
//
// WHAT THIS SUITE IS PROTECTING. The old implementation ILIKE'd a substring
// across first_name, last_name AND email over every row of baseball_players,
// gated only on holding can_manage_roster somewhere. Under
// `baseball_players_select ... USING (true)` that meant typing "sm" returned
// strangers' names and email addresses from every program in the database.
// The replacement keeps a name search (whose reach RLS — not this code —
// narrows once migration B lands) and adds an exact-email path through
// public.find_baseball_player_by_email_for_roster(), which re-checks
// can_manage_roster on the specific target team inside its definer body.
//
// Locked in here:
//   1. An email-shaped query calls the RPC, and the row it returns is merged
//      into the results and flagged as the exact-email match.
//   2. The RPC is scoped to the ACTING team (ctx.targetTeamId) — capability on
//      some other team is not authority to look someone up for this one.
//   3. A non-email query never reaches the RPC at all.
//   4. Existing members (any status) are excluded from BOTH paths.
//   5. Regression lock on the leak itself: `email` appears in neither the
//      substring filter nor the projection.
//   6. The two paths dedupe to one row when they find the same player.
//   7. An RPC failure degrades to "no extra matches", never a failed search —
//      the name path has to keep working (this is what makes deploying before
//      migration A safe rather than merely untested).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FinalResult {
  data: unknown;
  error: unknown;
}

/** PostgREST-shaped chainable/thenable stub (same pattern as
 * roster-lift-lab-propagation.test.ts). `.then` makes the builder itself
 * awaitable, so any chain length resolves to `finalResult`. Filter/projection
 * arguments are recorded because the leak this suite guards lives in them. */
function makeQueryBuilder(finalResult: FinalResult) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  builder.selectArgs = null as string | null;
  builder.select = vi.fn((columns?: string) => {
    builder.selectArgs = columns ?? null;
    return builder;
  });
  builder.eqCalls = [] as Array<[string, unknown]>;
  builder.eq = vi.fn((column: string, value: unknown) => {
    builder.eqCalls.push([column, value]);
    return builder;
  });
  builder.orArgs = null as string | null;
  builder.or = vi.fn((filter: string) => {
    builder.orArgs = filter;
    return builder;
  });
  builder.limitArgs = null as number | null;
  builder.limit = vi.fn((n: number) => {
    builder.limitArgs = n;
    return builder;
  });
  builder.maybeSingle = vi.fn(async () => finalResult);
  builder.then = (resolve: (v: FinalResult) => void) => resolve(finalResult);
  return builder;
}

const TEAM_ID = 'team-acting-1';
const TRANSFER_ID = '11111111-1111-4111-8111-111111111111';
const LOCAL_ID = '22222222-2222-4222-8222-222222222222';

const rpc = vi.fn();
const logServerError = vi.fn(async (..._args: unknown[]) => {});

let membersBuilder: ReturnType<typeof makeQueryBuilder>;
let playersBuilder: ReturnType<typeof makeQueryBuilder>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: vi.fn() },
    from: (table: string) =>
      table === 'baseball_team_members' ? membersBuilder : playersBuilder,
    rpc: (...args: unknown[]) => rpc(...args),
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// The capability gate is the wrapper's job and is exercised elsewhere; this
// suite runs the body with the gate already satisfied so it can assert what the
// body does with the team id it was handed.
vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, args: unknown) => unknown) =>
    (args: unknown) =>
      fn({ user: { id: 'coach-user-1' }, targetTeamId: TEAM_ID }, args),
}));

vi.mock('@/lib/baseball/capabilities', () => ({
  requireBaseballCapability: vi.fn(async () => {}),
}));

vi.mock('@/lib/baseball/timeline-writer', () => ({
  appendRosterTimelineEvent: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/lifting/resolve-baseball-context', () => ({
  resolveBaseballLiftingOrg: vi.fn(async () => null),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerError(...args),
}));

import { searchAssignablePlayers } from '@/app/baseball/actions/roster';

const TRANSFER_ROW = {
  id: TRANSFER_ID,
  first_name: 'Marcus',
  last_name: 'Ellery',
  primary_position: 'RHP',
  grad_year: 2027,
};

const LOCAL_ROW = {
  id: LOCAL_ID,
  first_name: 'Dana',
  last_name: 'Ellery',
  primary_position: 'C',
  grad_year: 2026,
};

/** Seed the two table reads: current membership rows, then name-search hits. */
function seed(options: { members?: string[]; nameHits?: unknown[] } = {}) {
  membersBuilder = makeQueryBuilder({
    data: (options.members ?? []).map((player_id) => ({ player_id })),
    error: null,
  });
  playersBuilder = makeQueryBuilder({ data: options.nameHits ?? [], error: null });
}

describe('searchAssignablePlayers — exact-email lookup + scoped name search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seed();
    rpc.mockResolvedValue({ data: [], error: null });
  });

  describe('exact-email path', () => {
    it('returns the player behind an exact email address the name search cannot reach', async () => {
      rpc.mockResolvedValue({ data: [TRANSFER_ROW], error: null });

      const result = await searchAssignablePlayers({ query: 'marcus.ellery@northfield.edu' });

      expect(result.success).toBe(true);
      expect(result.lookup).toBe('email');
      expect(result.data).toEqual([TRANSFER_ROW]);
      expect(result.exactEmailMatchId).toBe(TRANSFER_ID);
    });

    it('scopes the RPC to the ACTING team, and passes the address through verbatim', async () => {
      rpc.mockResolvedValue({ data: [TRANSFER_ROW], error: null });

      await searchAssignablePlayers({ query: '  marcus.ellery@northfield.edu  ' });

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith('find_baseball_player_by_email_for_roster', {
        p_team_id: TEAM_ID,
        p_email: 'marcus.ellery@northfield.edu',
      });
    });

    it('reports an email query that matched nobody as an email query, not a name one', async () => {
      const result = await searchAssignablePlayers({ query: 'nobody@nowhere.edu' });

      expect(result.success).toBe(true);
      expect(result.lookup).toBe('email');
      expect(result.data).toEqual([]);
      expect(result.exactEmailMatchId).toBeNull();
    });
  });

  describe('non-email queries never reach the RPC', () => {
    it('treats a plain name as a name lookup', async () => {
      seed({ nameHits: [LOCAL_ROW] });

      const result = await searchAssignablePlayers({ query: 'ellery' });

      expect(rpc).not.toHaveBeenCalled();
      expect(result.lookup).toBe('name');
      expect(result.data).toEqual([LOCAL_ROW]);
      expect(result.exactEmailMatchId).toBeNull();
    });

    it('treats a string that only became email-shaped after sanitisation as a name lookup', async () => {
      // The `.or()` sanitiser rewrites reserved DSL characters to spaces, so
      // "ellery,marcus@northfield.edu" arrives as two whitespace-separated
      // tokens — not a single address, and not something to hand the RPC.
      const result = await searchAssignablePlayers({ query: 'ellery,marcus@northfield.edu' });

      expect(rpc).not.toHaveBeenCalled();
      expect(result.lookup).toBe('name');
    });

    it('short-circuits a one-character query without touching the database', async () => {
      const result = await searchAssignablePlayers({ query: 'e' });

      expect(result.data).toEqual([]);
      expect(rpc).not.toHaveBeenCalled();
      expect(membersBuilder.select).not.toHaveBeenCalled();
      expect(playersBuilder.select).not.toHaveBeenCalled();
    });
  });

  describe('existing members are excluded from both paths', () => {
    it('drops an exact-email match who is already on this roster', async () => {
      seed({ members: [TRANSFER_ID] });
      rpc.mockResolvedValue({ data: [TRANSFER_ROW], error: null });

      const result = await searchAssignablePlayers({ query: 'marcus.ellery@northfield.edu' });

      expect(result.data).toEqual([]);
      // Nothing left in the list to label as the email match.
      expect(result.exactEmailMatchId).toBeNull();
      expect(membersBuilder.eqCalls).toContainEqual(['team_id', TEAM_ID]);
    });

    it('reports the drop, so an empty list is never mistaken for "nobody exists"', async () => {
      // THE bug this field exists for. The search found exactly the right
      // person and correctly refused to offer them twice — but with only an
      // empty `data` to go on, the modal told the coach "no account uses that
      // address … use Invite players to send them a join link" about a player
      // already sitting on their own roster. An excluded result and an absent
      // result are different facts and cannot share copy.
      seed({ members: [TRANSFER_ID] });
      rpc.mockResolvedValue({ data: [TRANSFER_ROW], error: null });

      const result = await searchAssignablePlayers({ query: 'marcus.ellery@northfield.edu' });

      expect(result.data).toEqual([]);
      expect(result.alreadyOnRoster).toBe(1);
    });

    it('drops a name-search hit who is already on this roster', async () => {
      seed({ members: [LOCAL_ID], nameHits: [LOCAL_ROW, TRANSFER_ROW] });

      const result = await searchAssignablePlayers({ query: 'ellery' });

      expect(result.data).toEqual([TRANSFER_ROW]);
      expect(result.alreadyOnRoster).toBe(1);
    });

    it('counts a player matched by BOTH paths once, not twice', async () => {
      // Exact-email and name hits are concatenated before exclusion, so the
      // same person can appear in both. A count of 2 would render "Every
      // player matching …" for a single human.
      seed({ members: [TRANSFER_ID], nameHits: [TRANSFER_ROW] });
      rpc.mockResolvedValue({ data: [TRANSFER_ROW], error: null });

      const result = await searchAssignablePlayers({ query: 'marcus.ellery@northfield.edu' });

      expect(result.alreadyOnRoster).toBe(1);
    });

    it('reports zero when the search genuinely found nobody', async () => {
      // The other half of the distinction: this IS the case where telling the
      // coach to send an invite is correct.
      seed({ members: [], nameHits: [] });
      rpc.mockResolvedValue({ data: [], error: null });

      const result = await searchAssignablePlayers({ query: 'nobody@nowhere.edu' });

      expect(result.data).toEqual([]);
      expect(result.alreadyOnRoster).toBe(0);
    });
  });

  describe('the cross-tenant substring browse is gone', () => {
    it('never filters on email, so a partial address cannot enumerate accounts', async () => {
      await searchAssignablePlayers({ query: 'ellery' });

      expect(playersBuilder.orArgs).toBe(
        'first_name.ilike.%ellery%,last_name.ilike.%ellery%',
      );
      expect(playersBuilder.orArgs).not.toContain('email');
    });

    it('never projects email, so no result can carry an address the caller did not already have', async () => {
      await searchAssignablePlayers({ query: 'ellery' });

      expect(playersBuilder.selectArgs).toBe('id, first_name, last_name, primary_position, grad_year');
      expect(playersBuilder.selectArgs).not.toContain('email');
    });

    it('still caps the name search, so it cannot degrade into a full-table browse', async () => {
      // The cap predates this change and survives it deliberately: even after
      // migration B narrows what the caller can read, an unbounded read of
      // everything they CAN see is not a lookup.
      await searchAssignablePlayers({ query: 'ellery' });

      expect(playersBuilder.limitArgs).toBe(10);
    });
  });

  describe('merge behaviour', () => {
    it('lists the exact-email match first and does not repeat a player both paths found', async () => {
      seed({ nameHits: [TRANSFER_ROW, LOCAL_ROW] });
      rpc.mockResolvedValue({ data: [TRANSFER_ROW], error: null });

      const result = await searchAssignablePlayers({ query: 'marcus.ellery@northfield.edu' });

      expect(result.data).toEqual([TRANSFER_ROW, LOCAL_ROW]);
      expect(result.exactEmailMatchId).toBe(TRANSFER_ID);
    });

    it('keeps the name search working when the RPC fails, and says so in the log', async () => {
      seed({ nameHits: [LOCAL_ROW] });
      rpc.mockResolvedValue({
        data: null,
        error: { message: 'function does not exist', code: '42883' },
      });

      const result = await searchAssignablePlayers({ query: 'marcus.ellery@northfield.edu' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([LOCAL_ROW]);
      expect(result.exactEmailMatchId).toBeNull();
      expect(logServerError).toHaveBeenCalledTimes(1);
    });
  });
});

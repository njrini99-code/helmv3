import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `sendEventInvitations` took a caller-supplied `playerIds` and used it as-is.
 * Nothing checked those players against the event's own team.
 *
 * RLS does not catch it: `golf_event_attendance` is gated on the coach's
 * relationship to the EVENT, and a program head staffed on both squads — Scott
 * Singhass at Shenandoah — genuinely satisfies that for either team. So
 * attaching the men's roster to a women's event is permitted end to end.
 *
 * The result is a men's player holding an RSVP for a women's event, counted in
 * its attendance totals, and notified about a trip he is not on.
 *
 * Two reads on the same path also discarded their error. The players read
 * returned silently, so a failure meant the coach was told the event was
 * created while nobody was invited to it.
 */

type Outcome = { data: unknown; error: unknown };

const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({ data: null, error: { message, code } });

const inserted: Array<{ table: string; rows: unknown }> = [];

const WOMENS = 'ffd6985f-14b4-4448-895f-d5af20da8d6a';

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    order: self,
    limit: self,
    upsert: (rows: unknown) => {
      inserted.push({ table, rows });
      const n: Record<string, unknown> = {};
      Object.assign(n, {
        select: async () => ({ data: Array.isArray(rows) ? rows : [], error: null }),
        then: (r: (v: Outcome) => unknown) => Promise.resolve(ok(rows)).then(r),
      });
      return n;
    },
    insert: (rows: unknown) => {
      inserted.push({ table, rows });
      return { then: (r: (v: Outcome) => unknown) => Promise.resolve(ok(rows)).then(r) };
    },
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

const supabase = { from: (t: string) => tableChain(t) } as never;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => tableChain(t) }),
}));

async function invite(playerIds: string[]) {
  const { sendEventInvitations } = await import('@/lib/calendar/rsvp');
  return sendEventInvitations('event-1', playerIds, supabase);
}

/** Attendance rows actually written. */
function invitedPlayerIds(): string[] {
  return inserted
    .filter((i) => i.table === 'golf_event_attendance')
    .flatMap((i) => (Array.isArray(i.rows) ? i.rows : []))
    .map((r) => (r as { player_id: string }).player_id);
}

beforeEach(() => {
  outcomes.clear();
  inserted.length = 0;
  outcomes.set('golf_events', ok({ id: 'event-1', team_id: WOMENS, title: 'Qualifier' }));
  // Only these two are on the women's team.
  outcomes.set('golf_team_members', ok([{ player_id: 'sofia' }, { player_id: 'carley' }]));
  outcomes.set('golf_players', ok([
    { id: 'sofia', user_id: 'u-sofia', first_name: 'Sofia', last_name: 'Bogaty' },
    { id: 'carley', user_id: 'u-carley', first_name: 'Carley', last_name: 'Westmoreland' },
  ]));
});

describe("sendEventInvitations — only the event's own team may be invited", () => {
  it("drops players who are not on the event's team", async () => {
    // 'mens-player' is on the sibling squad. The coach staffs both, so RLS
    // permits the write — the app has to be the one that refuses.
    await invite(['sofia', 'mens-player', 'carley']);

    const invited = invitedPlayerIds();
    expect(invited).toContain('sofia');
    expect(invited).toContain('carley');
    expect(invited).not.toContain('mens-player');
  });

  it('invites nobody when none of the requested players are on the team', async () => {
    await invite(['mens-player-1', 'mens-player-2']);

    expect(invitedPlayerIds()).toEqual([]);
  });

  it('still invites the whole roster when every player belongs', async () => {
    await invite(['sofia', 'carley']);

    expect(invitedPlayerIds().sort()).toEqual(['carley', 'sofia']);
  });
});

describe('sendEventInvitations — a failed read must not pass for a finding', () => {
  it('refuses rather than inviting the requested list when the roster read fails', async () => {
    // Without a roster there is no way to tell who belongs. Falling back to
    // the caller's list is exactly how the wrong squad gets attached.
    outcomes.set('golf_team_members', fails('statement timeout', '57014'));

    await expect(invite(['sofia'])).rejects.toThrow(/verify the event's roster/i);
    expect(invitedPlayerIds()).toEqual([]);
  });

  it('distinguishes a failed event read from an event that is not there', async () => {
    outcomes.set('golf_events', fails('connection reset'));

    await expect(invite(['sofia'])).rejects.toThrow(/Could not load the event/i);
  });

  it('still reports a genuinely missing event as not found', async () => {
    outcomes.set('golf_events', { data: null, error: { message: 'no rows', code: 'PGRST116' } });

    await expect(invite(['sofia'])).rejects.toThrow(/Event not found/);
  });

  it('does not silently invite nobody when the player read fails', async () => {
    // This returned void, so the coach was told the event was created and
    // nobody was invited to it.
    outcomes.set('golf_players', fails('permission denied', '42501'));

    await expect(invite(['sofia'])).rejects.toThrow(/Could not load players to invite/i);
  });
});

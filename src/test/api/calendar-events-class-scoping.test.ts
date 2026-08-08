import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `GET /api/calendar/events` returned every class meeting on the team.
 *
 * Academic class meetings are personal data stored on a TEAM row. `golf_events`
 * has no `player_id`, no visibility column, and `created_by` is NULL on every
 * synced class row — so there is no database-level way to scope them, and
 * `golf_events_select_team` (`is_golf_team_coach(team_id) OR
 * is_golf_team_player(team_id)`) positively grants every rostered player SELECT
 * on all of them. Scoping can only happen in application code.
 *
 * Measured on production 2026-08-08: Shenandoah's women's team carries 323 such
 * rows belonging to three players — Sofia Bogaty (185), Gabriella Frick (110),
 * Carley Westmoreland (28). Their full semester timetable: which building, what
 * time, all term.
 *
 * The calendar PAGE has always filtered this. This route did `select('*')`
 * scoped only by `team_id`, so the same data was one authenticated fetch away
 * for any of the five teammates.
 *
 * A coach still sees the whole squad's class blocks — that is the point of the
 * feature, and hiding them would break the conflict checker they rely on.
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

const SOFIAS_CLASS = 'class-sofia-1';
const CARLEYS_CLASS = 'class-carley-1';

/** Two class meetings and one real practice, exactly as they sit on the team. */
const TEAM_EVENTS = [
  { id: 'e1', event_type: 'class', description: `[class:${SOFIAS_CLASS}]`, title: 'BIO 214' },
  { id: 'e2', event_type: 'class', description: `[class:${CARLEYS_CLASS}]`, title: 'ENG 101' },
  { id: 'e3', event_type: 'practice', description: null, title: 'Team practice' },
];

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    gte: self,
    lte: self,
    order: self,
    limit: self,
    maybeSingle: async () => settle(),
    single: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'x@y.edu' } }, error: null }) },
    from: (table: string) => tableChain(table),
  }),
}));

async function get() {
  const { GET } = await import('@/app/api/calendar/events/route');
  const res = await GET(new Request('https://helmsportslabs.com/api/calendar/events'));
  return (await res.json()) as Array<{ id: string }>;
}

/** Sofia is the signed-in player; Carley is her teammate. */
function asPlayerSofia() {
  outcomes.set('golf_coaches', ok(null));
  outcomes.set('golf_players', ok({ id: 'sofia' }));
  outcomes.set('golf_team_members', ok({ team_id: 'womens' }));
  outcomes.set('golf_events', ok(TEAM_EVENTS));
  // RLS scopes this read to Sofia's own classes when Sofia is asking.
  outcomes.set('golf_player_classes', ok([
    { id: SOFIAS_CLASS, player_id: 'sofia', player: { first_name: 'Sofia', last_name: 'Bogaty' } },
  ]));
}

describe('GET /api/calendar/events — a teammate must not receive another player\'s class schedule', () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
  });

  it("drops the teammate's class meetings from a player's response", async () => {
    asPlayerSofia();

    const ids = (await get()).map((e) => e.id);

    expect(ids).toContain('e1'); // Sofia's own class — hers to see
    expect(ids).toContain('e3'); // the team practice — everyone's
    expect(ids).not.toContain('e2'); // Carley's class — not Sofia's business
  });

  it('a coach still receives the whole squad\'s class blocks', async () => {
    // Not a cosmetic exception: the conflict checker and "find a time" are
    // built on the coach seeing when players are in class.
    outcomes.set('golf_coaches', ok({ organization_id: 'org1' }));
    outcomes.set('golf_teams', ok({ id: 'womens' }));
    outcomes.set('golf_events', ok(TEAM_EVENTS));
    outcomes.set('golf_player_classes', ok([
      { id: SOFIAS_CLASS, player_id: 'sofia', player: { first_name: 'Sofia', last_name: 'Bogaty' } },
      { id: CARLEYS_CLASS, player_id: 'carley', player: { first_name: 'Carley', last_name: 'Westmoreland' } },
    ]));

    const ids = (await get()).map((e) => e.id);

    expect(ids).toEqual(expect.arrayContaining(['e1', 'e2', 'e3']));
  });

  it('records a failed owner lookup, which currently degrades OPEN', async () => {
    // attributeClassEvents treats an unresolved index as "nothing established
    // either way" and leaves the pre-existing rows in place, for BOTH this
    // route and the calendar page. That is a deliberate choice in the shared
    // helper, not an accident here — but on a privacy filter, open is the
    // wrong side to fail to, and the two surfaces must not drift apart.
    //
    // Pinned rather than quietly changed: flipping it alters what the calendar
    // page shows too, which is a product decision. What this route CAN
    // guarantee today is that the failure is no longer silent.
    asPlayerSofia();
    outcomes.set('golf_player_classes', fails('statement timeout', '57014'));

    const ids = (await get()).map((e) => e.id);

    expect(ids).toContain('e3'); // real team events are unaffected

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /class-owner lookup failed/.test(m))).toBe(true);
  });

  it('non-class events are never touched by the filter', async () => {
    asPlayerSofia();
    outcomes.set('golf_events', ok([TEAM_EVENTS[2]]));

    expect((await get()).map((e) => e.id)).toEqual(['e3']);
  });
});

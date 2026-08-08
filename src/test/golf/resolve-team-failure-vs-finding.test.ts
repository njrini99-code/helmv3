import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The team switcher's resolver had six unchecked reads and imported no logger
 * at all. Shenandoah is the deployment that makes each one bite: one org, two
 * teams, and Scott Singhass staffed head_coach on BOTH.
 *
 * Five of the six failed CLOSED but silently, and the silence is what made them
 * dangerous — the durable harm is not the refusal, it is where the coach lands
 * afterwards. `validateCoachTeamAccess` returning false is read by
 * `resolveCoachActiveTeamId` as "invalid cookie", so the coach is seated on
 * their DEFAULT team. For a program head that means the calendar, the roster
 * and every subsequent WRITE move to the other squad, and RLS permits all of it
 * because they genuinely are staffed there. An announcement composed on the
 * women's page reaches the wrong ten players and never reaches the intended six.
 *
 * The sixth failed OPEN: the legacy branch, meant only for a pre-backfill coach
 * with no staff rows anywhere, ran whenever that read errored — granting a
 * staffed coach any team in their org and collapsing the men's/women's wall
 * this function exists to enforce.
 */

/**
 * The resolver logs via `console.warn`, not the Bridge logger: it is part of
 * the CLIENT bundle (the round-review page calls it with a browser Supabase
 * client), and `@/lib/server-error-logger` reaches `node:async_hooks`, which
 * fails the webpack build. See the note in resolve-team.ts.
 */
const warn = vi.fn();
vi.stubGlobal('console', { ...console, warn });
// The helper is server-guarded (`typeof window !== 'undefined'` returns early)
// so a browser console is never filled with server diagnostics. This suite runs
// under jsdom, so stand in as the server to exercise the logging at all.
vi.stubGlobal('window', undefined);

type Outcome = { data: unknown; error: unknown };

const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({ data: null, error: { message, code } });

const MENS = 'a852910f-e5a6-4e34-8a72-998e718ff80d';
const WOMENS = 'ffd6985f-14b4-4448-895f-d5af20da8d6a';
const COACH = '2faf46f6-5c97-4a8b-bfdd-87929d906170';
const ORG = '1571b332-6fab-4d18-881e-a8363dace8a5';

/** Per-table queue so one table can answer differently on successive reads. */
const queues = new Map<string, Outcome[]>();
function nextFor(table: string): Outcome {
  const q = queues.get(table);
  if (q && q.length) return q.shift()!;
  return outcomes.get(table) ?? ok([]);
}

function tableChain(table: string) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    order: self,
    limit: self,
    single: async () => nextFor(table),
    maybeSingle: async () => nextFor(table),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(nextFor(table)).then(resolve, reject),
  });
  return node;
}

const supabase = { from: (t: string) => tableChain(t) } as never;

async function mod() {
  return import('@/lib/golf/resolve-team');
}

beforeEach(() => {
  warn.mockClear();
  outcomes.clear();
  queues.clear();
});

describe('validateCoachTeamAccess — the men\'s/women\'s wall', () => {
  it('denies when the staff check fails, and says so', async () => {
    outcomes.set('golf_team_coach_staff', fails('statement timeout', '57014'));

    const { validateCoachTeamAccess } = await mod();
    expect(await validateCoachTeamAccess(supabase, COACH, WOMENS, ORG)).toBe(false);

    const said = warn.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /staff check failed/.test(m))).toBe(true);
  });

  it('does NOT fall back to org-wide access when the legacy check fails', async () => {
    // This is the fail-OPEN. Read 1 legitimately finds no row (this coach is
    // not staffed on this team); read 2 — "does the coach have ANY staff rows"
    // — errors. Treating that as "no rows" ran the legacy branch and granted
    // any team in the org.
    queues.set('golf_team_coach_staff', [
      ok(null),                            // no staff row for THIS team
      fails('connection reset'),           // the legacy "any staff rows?" check
    ]);
    outcomes.set('golf_teams', ok({ id: WOMENS })); // same org — would have passed

    const { validateCoachTeamAccess } = await mod();
    expect(await validateCoachTeamAccess(supabase, COACH, WOMENS, ORG)).toBe(false);

    const said = warn.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /refusing rather than falling back to org-wide access/.test(m))).toBe(true);
  });

  it('still grants a genuinely staffed coach', async () => {
    outcomes.set('golf_team_coach_staff', ok({ id: 'staff-1' }));

    const { validateCoachTeamAccess } = await mod();
    expect(await validateCoachTeamAccess(supabase, COACH, WOMENS, ORG)).toBe(true);
  });

  it('still denies a coach staffed only on the sibling team', async () => {
    // The wall itself must survive the fix.
    queues.set('golf_team_coach_staff', [
      ok(null),                    // not staffed on the requested team
      ok([{ id: 'staff-mens' }]),  // but staffed somewhere → no legacy branch
    ]);

    const { validateCoachTeamAccess } = await mod();
    expect(await validateCoachTeamAccess(supabase, COACH, WOMENS, ORG)).toBe(false);
  });
});

describe('resolveCoachActiveTeamId — never guess a team', () => {
  it('returns null rather than the org\'s member-ranked pick when the staff read fails', async () => {
    // The org resolver ranks by active-player count: 10 men over 6 women. A
    // blip would have seated the women's head coach on the men's team and
    // stamped every write with it.
    outcomes.set('golf_team_coach_staff', fails('pool exhausted', '53300'));

    const { resolveCoachActiveTeamId } = await mod();
    expect(await resolveCoachActiveTeamId(supabase, ORG, COACH, null)).toBeNull();

    const said = warn.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /refusing to guess a team/.test(m))).toBe(true);
  });

  it('still returns the staffed default when the read succeeds', async () => {
    outcomes.set('golf_team_coach_staff', ok([{ team_id: WOMENS, is_primary: true }]));

    const { resolveCoachActiveTeamId } = await mod();
    expect(await resolveCoachActiveTeamId(supabase, ORG, COACH, null)).toBe(WOMENS);
  });

  it('honours a valid cookie', async () => {
    outcomes.set('golf_team_coach_staff', ok({ id: 'staff-1' }));

    const { resolveCoachActiveTeamId } = await mod();
    expect(await resolveCoachActiveTeamId(supabase, ORG, COACH, MENS)).toBe(MENS);
  });
});

describe('getCoachTeamSwitchContext — a hidden switcher must be a finding, not a failure', () => {
  it('does not fall through to the org list when the staff read fails', async () => {
    // The org branch lists teams the coach may not be staffed on, so the
    // switcher could offer a team the write path would then refuse.
    outcomes.set('golf_team_coach_staff', fails('statement timeout', '57014'));
    outcomes.set('golf_teams', ok([{ id: MENS, name: 'Mens', gender: 'mens' }]));

    const { getCoachTeamSwitchContext } = await mod();
    const ctx = await getCoachTeamSwitchContext(supabase, COACH, ORG);

    expect(ctx.teams).toEqual([]);
    expect(ctx.canSwitch).toBe(false);

    const said = warn.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /the team switcher will be hidden/.test(m))).toBe(true);
  });

  it('still gives a two-team head coach a working switcher', async () => {
    outcomes.set('golf_team_coach_staff', ok([
      { team_id: MENS, role: 'head_coach' },
      { team_id: WOMENS, role: 'head_coach' },
    ]));
    outcomes.set('golf_teams', ok([
      { id: MENS, name: 'Shenandoah University Golf', gender: 'mens' },
      { id: WOMENS, name: "Shenandoah University Women's Golf", gender: 'womens' },
    ]));

    const { getCoachTeamSwitchContext } = await mod();
    const ctx = await getCoachTeamSwitchContext(supabase, COACH, ORG);

    expect(ctx.canSwitch).toBe(true);
    expect(ctx.isHeadCoach).toBe(true);
    expect(ctx.teams).toHaveLength(2);
  });
});

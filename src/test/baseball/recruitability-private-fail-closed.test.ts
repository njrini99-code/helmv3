import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `isPlayerProfilePrivate` destructured only `data`, so a failed read returned
 * `false` — and `false` there does not mean "the read came back empty", it
 * means "this profile is NOT private".
 *
 * It is the PII gate. Every other check in `assertCoachCanRecruitPlayer` fails
 * closed by construction: a failed player read leaves `player` null and denies,
 * a failed discoverable-teams read leaves that Set empty and denies. This one
 * was the only gate whose failure produced the permissive answer, so a dropped
 * connection while checking a player who had set their profile to private
 * returned `{ allowed: true }` and handed a college coach their contact details.
 *
 * The documented default is unchanged and still tested below: a player with no
 * settings row at all is public. That is a genuine `{ data: null, error: null }`
 * from `.maybeSingle()`, which is a real answer. An error is not an answer.
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
    order: self,
    limit: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

const supabase = {
  from: (table: string) => tableChain(table),
} as never;

async function check() {
  const { assertCoachCanRecruitPlayer } = await import('@/lib/baseball/recruitability');
  return assertCoachCanRecruitPlayer(supabase, 'coach-1', 'college', 'player-1');
}

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  // A player who is fully recruitable on every axis EXCEPT the one under test,
  // so any denial below is attributable to the privacy gate alone.
  outcomes.set(
    'baseball_players',
    ok({ id: 'player-1', recruiting_activated: true, player_type: 'high_school' }),
  );
  outcomes.set('baseball_player_settings', ok({ profile_visibility: 'public' }));
  // No staff rows → getCoachRosterPlayerIds returns early, so it never reaches
  // baseball_team_members and does not contend with the discoverable-teams
  // resolver over that same table below.
  outcomes.set('baseball_team_coach_staff', ok([]));
  // The discoverable-teams gate must actually PASS, or every case below would
  // deny for that reason instead and the fail-closed assertion would be green
  // without proving anything.
  outcomes.set('organizations', ok([{ id: 'org-1' }]));
  outcomes.set('baseball_teams_public_profile', ok([{ id: 'team-1' }]));
  outcomes.set('baseball_team_members', ok([{ player_id: 'player-1' }]));
});

describe('assertCoachCanRecruitPlayer — a failed privacy read is not permission', () => {
  it('does not allow recruiting when the profile_visibility read failed', async () => {
    outcomes.set('baseball_player_settings', fails('connection reset'));

    const result = await check();

    expect(result.allowed).toBe(false);
  });

  it('records the cause instead of silently treating the player as public', async () => {
    outcomes.set('baseball_player_settings', fails('permission denied', '42501'));

    await check();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /profile visibility/i.test(m))).toBe(true);
  });
});

describe('assertCoachCanRecruitPlayer — the documented defaults are unchanged', () => {
  it('a player with no settings row at all is still public', async () => {
    // `.maybeSingle()` with no matching row: a real answer, not a failure.
    outcomes.set('baseball_player_settings', ok(null));

    expect((await check()).allowed).toBe(true);
  });

  it('a player who really is private is still refused, with that reason', async () => {
    outcomes.set('baseball_player_settings', ok({ profile_visibility: 'private' }));

    const result = await check();

    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toBe('profile_private');
  });

  it('a public player is still recruitable', async () => {
    expect((await check()).allowed).toBe(true);
  });
});

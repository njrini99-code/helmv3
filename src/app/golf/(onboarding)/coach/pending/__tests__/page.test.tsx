import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-R-13: /golf/coach/pending is for an assistant coach waiting on the head coach. Someone with no coach row never
 * asked, so they are sent on (to finish player onboarding, or to the dashboard); a real pending coach still sees the
 * page. "Who is this" is read with the caller's own session; the admin client is used only for the team and program.
 */
type Row = { data: unknown; error: unknown };
const own: Record<string, Row> = {};
const adminTables: string[] = [];

const redirect = vi.fn((href: string) => {
  throw new Error(`REDIRECT ${href}`);
});
vi.mock('next/navigation', () => ({ redirect: (h: string) => redirect(h) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/clubhouse/routes/auth', () => ({ ClubhouseCoachPendingRoute: () => null }));
const programOf = (el: unknown) => (el as { props: { programName: string | null } }).props.programName;

function chain(result: () => Row) {
  const c = { select: () => c, eq: () => c, limit: () => c, maybeSingle: async () => result() };
  return c;
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => chain(() => own[table] ?? { data: null, error: null }),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      adminTables.push(table);
      if (table === 'golf_team_coach_staff') return chain(() => ({ data: null, error: null }));
      if (table === 'organizations') return chain(() => ({ data: { name: 'Coastal State' }, error: null }));
      throw new Error(`admin read of ${table}: who-is-this reads go through the session`);
    },
  }),
}));

const { default: CoachPendingPage } = await import('../page');

beforeEach(() => {
  redirect.mockClear();
  adminTables.length = 0;
  for (const k of Object.keys(own)) delete own[k];
});

describe('/golf/coach/pending', () => {
  it('a player who never asked, still onboarding, goes back to player onboarding', async () => {
    own.golf_players = { data: { id: 'p1', onboarding_completed: false }, error: null };
    await expect(CoachPendingPage()).rejects.toThrow('REDIRECT /golf/player');
    expect(adminTables).toEqual([]);
  });

  it('an onboarded player, or someone with no row at all, goes to the dashboard', async () => {
    own.golf_players = { data: { id: 'p1', onboarding_completed: true }, error: null };
    await expect(CoachPendingPage()).rejects.toThrow('REDIRECT /golf/dashboard');
    delete own.golf_players;
    await expect(CoachPendingPage()).rejects.toThrow('REDIRECT /golf/dashboard');
    expect(adminTables).toEqual([]);
  });

  it('a pending assistant coach still sees the page, with their program', async () => {
    own.golf_coaches = { data: { id: 'c1', organization_id: 'o1' }, error: null };
    expect(programOf(await CoachPendingPage())).toBe('Coastal State');
    expect(redirect).not.toHaveBeenCalled();
    expect(adminTables).toEqual(['golf_team_coach_staff', 'organizations']);
  });

  it('a failed coach read keeps the page rather than bouncing a real pending coach away', async () => {
    own.golf_coaches = { data: null, error: { message: 'timeout' } };
    expect(programOf(await CoachPendingPage())).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });
});

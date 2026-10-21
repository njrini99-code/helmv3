import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * getAnnouncementsWithMeta takes the reader's role and player from the session,
 * never from its arguments (security review S5, 2026-10-16).
 *
 * It used to take `isCoach` and `playerId` from the caller. A server action is
 * an endpoint, so a player could pass isCoach=true and get the coach view of
 * their team: every targeted announcement and the names of whoever had
 * acknowledged each one. And a coach who was not staffed on a team but held any
 * player profile was resolved as that team's coach with no membership check.
 */

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

const coachAuthorized = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/golf/resolve-team', () => ({ validateCoachTeamAccess: vi.fn(async () => coachAuthorized.value) }));

type Outcome = { data: unknown; error: unknown };
/** Per table: what a single-row read (maybeSingle) and a list read resolve to. */
const tables = new Map<string, { one?: unknown; many?: unknown[] }>();
const ok = (data: unknown): Outcome => ({ data, error: null });

function chain(table: string) {
  const t = () => tables.get(table) ?? {};
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    order: self,
    limit: self,
    range: self,
    maybeSingle: async () => ok(t().one ?? null),
    single: async () => ok(t().one ?? null),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(ok(t().many ?? [])).then(resolve, reject),
  });
  return node;
}

const client = () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'u-viewer' } }, error: null }) },
  from: (table: string) => chain(table),
});
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client() }));

const ANNOUNCEMENTS = [
  { id: 'a-all', team_id: 'team-1', title: 'Everyone', published_at: '2026-10-15T10:00:00Z' },
  { id: 'a-p2', team_id: 'team-1', title: 'Only p2', published_at: '2026-10-14T10:00:00Z' },
];

beforeEach(() => {
  coachAuthorized.value = false;
  tables.clear();
  tables.set('golf_announcements', { many: ANNOUNCEMENTS });
  tables.set('golf_announcement_recipients', { many: [{ announcement_id: 'a-p2', player_id: 'p2' }] });
  tables.set('golf_announcement_acknowledgements', { many: [{ announcement_id: 'a-all', player_id: 'p2' }] });
});

async function list(isCoach: boolean, playerId: string | null) {
  const { getAnnouncementsWithMeta } = await import('@/app/golf/actions/announcements');
  return getAnnouncementsWithMeta('team-1', 'u-viewer', isCoach, playerId);
}

describe('getAnnouncementsWithMeta — the role comes from the session', () => {
  it('a rostered player who claims to be a coach still gets the player view', async () => {
    tables.set('golf_coaches', { one: null });
    tables.set('golf_players', { one: { id: 'p1' }, many: [{ id: 'p2', first_name: 'Pat', last_name: 'Two', avatar_url: null }] });
    tables.set('golf_team_members', { one: { id: 'm1' }, many: [{ player_id: 'p1' }, { player_id: 'p2' }] });

    const res = await list(true, 'p2');

    expect(res.success).toBe(true);
    const rows = res.success ? res.data ?? [] : [];
    // The announcement addressed to p2 alone is not theirs to read.
    expect(rows.map((r) => r.id)).toEqual(['a-all']);
    // No teammates' names, and the acknowledgement is their own (p1), not p2's.
    expect(rows[0]!.acknowledged_players).toBeUndefined();
    expect(rows[0]!.has_player_acknowledged).toBe(false);
  });

  it('a staffed coach gets the coach view whatever the arguments say', async () => {
    coachAuthorized.value = true;
    tables.set('golf_coaches', { one: { id: 'c1', organization_id: 'org-1' } });
    tables.set('golf_players', { one: null, many: [{ id: 'p2', first_name: 'Pat', last_name: 'Two', avatar_url: null }] });
    tables.set('golf_team_members', { many: [{ player_id: 'p1' }, { player_id: 'p2' }] });

    const res = await list(false, 'p1');

    expect(res.success).toBe(true);
    const rows = res.success ? res.data ?? [] : [];
    expect(rows.map((r) => r.id)).toEqual(['a-all', 'a-p2']);
    expect(rows[0]!.acknowledged_players?.map((p) => p.player_id)).toEqual(['p2']);
  });

  it('a coach not staffed here who holds a player profile is not this team\'s coach', async () => {
    coachAuthorized.value = false;
    tables.set('golf_coaches', { one: { id: 'c9', organization_id: 'org-9' } });
    tables.set('golf_players', { one: { id: 'p9' } });
    // Not a member of team-1.
    tables.set('golf_team_members', { one: null, many: [] });

    const res = await list(true, null);

    expect(res.success).toBe(false);
    expect(res.success ? '' : res.error).toBe('Not authorized for this team');
  });

  it('a coach not staffed here who is rostered on the team reads it as a player', async () => {
    coachAuthorized.value = false;
    tables.set('golf_coaches', { one: { id: 'c9', organization_id: 'org-9' } });
    tables.set('golf_players', { one: { id: 'p1' } });
    tables.set('golf_team_members', { one: { id: 'm1' }, many: [{ player_id: 'p1' }, { player_id: 'p2' }] });

    const res = await list(true, null);

    expect(res.success).toBe(true);
    const rows = res.success ? res.data ?? [] : [];
    expect(rows.map((r) => r.id)).toEqual(['a-all']);
    expect(rows[0]!.acknowledged_players).toBeUndefined();
  });
});

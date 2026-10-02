/**
 * @vitest-environment node
 *
 * C-13. createGolfQualifier trusted the playerIds the browser sent (any uuid became an entrant, with a leaderboard row
 * and a notification) and was not atomic: the qualifier row was committed before the entries insert, so a failed
 * entries insert returned failure with the qualifier left behind, and the coach's Retry made a second one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: unknown;
let entriesInsertError: unknown = null;
let qualifierDeleteFails = false;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: async () => 'team-1' }));
vi.mock('next/server', () => ({ after: vi.fn((cb: () => unknown) => cb()) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({ postRoundTrigger: vi.fn(async () => {}) }));
vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => {}),
  invalidateStatsCache: vi.fn(async () => {}),
}));
vi.mock('@/lib/admin-logger', () => ({ logRoundSubmitted: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications', () => ({ notifyQualifierCreated: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications/email', () => ({ sendEmailNotification: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/notifications/push', () => ({ sendBulkPushNotification: vi.fn(async () => {}) }));

import { createGolfQualifier } from '../golf';

type Row = Record<string, unknown>;

const ON_ROSTER = '11111111-1111-4111-8111-111111111111';
const ALSO_ON_ROSTER = '22222222-2222-4222-8222-222222222222';
const OTHER_TEAMS = '33333333-3333-4333-8333-333333333333';

function world() {
  const tables: Record<string, Row[]> = {
    golf_coaches: [{ id: 'coach-1', user_id: 'user-1', organization_id: 'org-1' }],
    golf_team_members: [
      { player_id: ON_ROSTER, team_id: 'team-1', status: 'active' },
      { player_id: ALSO_ON_ROSTER, team_id: 'team-1', status: 'active' },
      { player_id: OTHER_TEAMS, team_id: 'team-2', status: 'active' },
    ],
    golf_players: [
      { id: ON_ROSTER, user_id: 'u-a' },
      { id: ALSO_ON_ROSTER, user_id: 'u-b' },
      { id: OTHER_TEAMS, user_id: 'u-c' },
    ],
    users: [],
    golf_qualifiers: [],
    golf_qualifier_entries: [],
  };
  const real = createFakeSupabase({ user: { id: 'user-1' }, tables, idFactory: () => crypto.randomUUID() });
  fake = {
    ...real,
    from: (table: string) => {
      const b = real.from(table);
      if (table === 'golf_qualifier_entries' && entriesInsertError) {
        return {
          ...b,
          insert: () => {
            const n: Record<string, unknown> = {};
            Object.assign(n, {
              select: () => n,
              then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: entriesInsertError }).then(resolve),
            });
            return n;
          },
        };
      }
      if (table === 'golf_qualifiers' && qualifierDeleteFails) {
        return {
          ...b,
          delete: () => {
            const n: Record<string, unknown> = {};
            Object.assign(n, {
              eq: () => n,
              select: () => n,
              then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'permission denied' } }).then(resolve),
            });
            return n;
          },
        };
      }
      return b;
    },
  };
  return tables;
}

const input = (playerIds: string[]) => ({ name: 'Fall Qualifying', startDate: '2026-10-01', playerIds, numRounds: 2 });

beforeEach(() => {
  vi.clearAllMocks();
  entriesInsertError = null;
  qualifierDeleteFails = false;
});

describe('createGolfQualifier roster check (C-13)', () => {
  it('enters players who are on this team\'s active roster', async () => {
    const tables = world();
    const result = await createGolfQualifier(input([ON_ROSTER, ALSO_ON_ROSTER]));
    expect(result.success).toBe(true);
    expect(tables.golf_qualifier_entries!.map((e) => e.player_id).sort()).toEqual([ON_ROSTER, ALSO_ON_ROSTER].sort());
  });

  it('refuses a player from another team, and writes nothing', async () => {
    const tables = world();
    const result = await createGolfQualifier(input([ON_ROSTER, OTHER_TEAMS]));
    expect(result).toEqual({ success: false, error: 'Some selected players are not on your team' });
    expect(tables.golf_qualifiers).toEqual([]);
    expect(tables.golf_qualifier_entries).toEqual([]);
  });

  it('refuses a player who has left the roster', async () => {
    const tables = world();
    tables.golf_team_members![1]!.status = 'inactive';
    const result = await createGolfQualifier(input([ON_ROSTER, ALSO_ON_ROSTER]));
    expect(result.success).toBe(false);
    expect(tables.golf_qualifiers).toEqual([]);
  });

  it('a duplicated id is entered once instead of failing the unique key', async () => {
    const tables = world();
    const result = await createGolfQualifier(input([ON_ROSTER, ON_ROSTER]));
    expect(result.success).toBe(true);
    expect(tables.golf_qualifier_entries).toHaveLength(1);
  });
});

describe('createGolfQualifier is not left half-made (C-13)', () => {
  it('removes the qualifier it created when the entries insert fails, so Retry cannot duplicate it', async () => {
    entriesInsertError = { code: '42501', message: 'new row violates row-level security policy' };
    const tables = world();

    const result = await createGolfQualifier(input([ON_ROSTER]));

    expect(result).toEqual({ success: false, error: 'Failed to add players to qualifier. Please try again.' });
    expect(tables.golf_qualifiers).toEqual([]);

    // Retry after the fault clears: exactly one qualifier.
    entriesInsertError = null;
    expect((await createGolfQualifier(input([ON_ROSTER]))).success).toBe(true);
    expect(tables.golf_qualifiers).toHaveLength(1);
  });

  it('says so, and tells the coach not to recreate it, when the qualifier cannot be removed', async () => {
    entriesInsertError = { code: '42501', message: 'boom' };
    qualifierDeleteFails = true;
    const tables = world();

    const result = (await createGolfQualifier(input([ON_ROSTER]))) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/do not create it again/);
    expect(tables.golf_qualifiers).toHaveLength(1);
  });
});

/**
 * Pkg 9 slice 4 — `listDueFocusAreas`: team-access scoping and the due-queue
 * assembly (roster resolution -> golf_player_focus_areas read -> the shared
 * `computeDueFocusAreas` derivation from due-for-review.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ notifyDevPlanAssigned: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', () => ({
  recordInsightAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyTeamAccess: (...args: unknown[]) => verifyTeamAccessMock(...args),
}));

const verifyTeamAccessMock = vi.fn();

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

const createAdminClientMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClientMock() }));

import { listDueFocusAreas } from '@/app/golf/actions/development';

interface FaFixture {
  id: string;
  player_id: string;
  title: string;
  target_metric: string | null;
  target_kind: string | null;
  target_date: string | null;
  status: string | null;
}

/**
 * The `golf_player_focus_areas` table mock: a single thenable terminal that
 * filters the fixture rows against the REAL `.in('player_id', …)`,
 * `.eq('target_kind', 'date')`, and `.in('status', …)` arguments the code
 * builds up on the chain — so a query-shape regression (wrong table filter,
 * a dropped status) actually changes what these tests see, not just what a
 * mock returns.
 */
function makeFocusAreaTable(rows: FaFixture[]) {
  return {
    select: () => {
      const state: { playerIds?: string[]; targetKind?: string; statuses?: string[] } = {};
      const builder = {
        in: (col: string, values: string[]) => {
          if (col === 'player_id') state.playerIds = values;
          if (col === 'status') state.statuses = values;
          return builder;
        },
        eq: (col: string, value: string) => {
          if (col === 'target_kind') state.targetKind = value;
          return builder;
        },
        not: (_col: string, _op: string, _value: unknown) => builder,
        then: (resolve: (v: { data: FaFixture[]; error: null }) => unknown) => {
          const filtered = rows.filter((r) => {
            if (state.playerIds && !state.playerIds.includes(r.player_id)) return false;
            if (state.targetKind && r.target_kind !== state.targetKind) return false;
            if (state.statuses && (!r.status || !state.statuses.includes(r.status))) return false;
            return true;
          });
          return resolve({ data: filtered, error: null });
        },
      };
      return builder;
    },
  };
}

function makeRealClient(opts: { memberPlayerIds: string[] | 'error'; focusAreas: FaFixture[] }) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'golf_team_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () =>
                opts.memberPlayerIds === 'error'
                  ? { data: null, error: { message: 'boom' } }
                  : { data: opts.memberPlayerIds.map((player_id) => ({ player_id })), error: null },
            }),
          }),
        };
      }
      if (table === 'golf_player_focus_areas') {
        return makeFocusAreaTable(opts.focusAreas);
      }
      return {};
    },
  };
}

const TODAY_FIXTURE_DATE = new Date().toISOString().slice(0, 10);
const OVERDUE_DATE = '2000-01-01';

function fa(overrides: Partial<FaFixture> = {}): FaFixture {
  return {
    id: 'fa-1',
    player_id: 'p1',
    title: 'Cut three-putts',
    target_metric: 'three_putt_pct',
    target_kind: 'date',
    target_date: OVERDUE_DATE,
    status: 'active',
    ...overrides,
  };
}

describe('listDueFocusAreas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies a coach who does not staff the team (access scoping)', async () => {
    verifyTeamAccessMock.mockResolvedValue({ allowed: false, reason: 'denied' });
    createClientMock.mockResolvedValue(makeRealClient({ memberPlayerIds: [], focusAreas: [] }));

    const result = await listDueFocusAreas('team-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authorized/i);
  });

  it('returns an empty list for a team with no active roster (empty state)', async () => {
    verifyTeamAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });
    createClientMock.mockResolvedValue(makeRealClient({ memberPlayerIds: [], focusAreas: [] }));

    const result = await listDueFocusAreas('team-1');

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('returns an empty list when the roster has focus areas but none are due (empty state)', async () => {
    verifyTeamAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });
    createClientMock.mockResolvedValue(
      makeRealClient({
        memberPlayerIds: ['p1'],
        focusAreas: [fa({ target_date: '2999-01-01' })],
      }),
    );

    const result = await listDueFocusAreas('team-1');

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('scopes the focus-area read to the resolved roster only', async () => {
    verifyTeamAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });
    // p2 is NOT on this team's active roster — its overdue area must not appear.
    createClientMock.mockResolvedValue(
      makeRealClient({
        memberPlayerIds: ['p1'],
        focusAreas: [fa({ id: 'fa-on-roster', player_id: 'p1' }), fa({ id: 'fa-off-roster', player_id: 'p2' })],
      }),
    );

    const result = await listDueFocusAreas('team-1');

    expect(result.success).toBe(true);
    expect(result.data?.map((d) => d.id)).toEqual(['fa-on-roster']);
  });

  it('returns overdue and due-soon areas with their reason, sorted, excluding non-actionable statuses', async () => {
    verifyTeamAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });
    createClientMock.mockResolvedValue(
      makeRealClient({
        memberPlayerIds: ['p1', 'p2', 'p3'],
        focusAreas: [
          fa({ id: 'fa-overdue', player_id: 'p1', target_date: OVERDUE_DATE, status: 'active' }),
          fa({ id: 'fa-due-soon', player_id: 'p2', target_date: TODAY_FIXTURE_DATE, status: 'in_progress' }),
          fa({ id: 'fa-completed', player_id: 'p3', target_date: OVERDUE_DATE, status: 'completed' }),
        ],
      }),
    );

    const result = await listDueFocusAreas('team-1');

    expect(result.success).toBe(true);
    expect(result.data?.map((d) => d.id)).toEqual(['fa-overdue', 'fa-due-soon']);
    expect(result.data?.[0]).toMatchObject({ reason: 'overdue', player_id: 'p1' });
    expect(result.data?.[1]).toMatchObject({ reason: 'due_soon', player_id: 'p2' });
  });

  it('fails closed on a roster read error rather than returning a partial or empty list', async () => {
    verifyTeamAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });
    createClientMock.mockResolvedValue(makeRealClient({ memberPlayerIds: 'error', focusAreas: [] }));

    const result = await listDueFocusAreas('team-1');

    expect(result.success).toBe(false);
  });

  it('rejects a missing teamId before any read', async () => {
    const result = await listDueFocusAreas('');
    expect(result.success).toBe(false);
    expect(verifyTeamAccessMock).not.toHaveBeenCalled();
  });
});

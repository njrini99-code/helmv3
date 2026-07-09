// =============================================================================
// src/app/api/account/delete/__tests__/route.test.ts
//
// P1 (Production-Readiness Mission W0a) — /api/account/delete RESTRICT FK
// failure. A live-schema check found several ON DELETE NO ACTION
// "who-did-this" attribution columns referencing baseball_coaches.id /
// golf_coaches.id / users.id that blocked the final `users` delete for ANY
// coach/admin who had ever created a game, practice block, academic
// exclusion, announcement, assigned goal, travel itinerary, or touched the
// CRM tables. This locks in:
//   1. Those attribution columns are nulled out (reassigned) BEFORE the
//      final users delete, scoped to the correct coach id — not the raw
//      auth user id.
//   2. The engagement-events cleanup now matches on baseball_coaches.id
//      (previously compared against the auth user id and silently deleted
//      nothing).
//   3. A residual FK violation (23503) on the final delete returns an
//      honest, actionable 409 — never a generic 500, never silently
//      swallowed.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const BASEBALL_COACH_ID = 'bcoach-1';
const USER_ID = 'user-1';

const getUser = vi.fn();
const deleteUserMock = vi.fn(async () => ({ error: null }));
const logServerError = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/lib/server-error-logger', () => ({ logServerError }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

// Records every update/delete call so tests can assert on exactly which
// table + column + value each cleanup step touched.
type Call = { table: string; op: 'update' | 'delete'; column?: string; value?: unknown; payload?: unknown };
let calls: Call[] = [];
let usersDeleteError: { code: string; message: string } | null = null;

function makeTable(table: string) {
  return {
    select: () => ({
      eq: (col: string, value: unknown) => ({
        maybeSingle: async () => {
          if (table === 'baseball_coaches' && col === 'user_id' && value === USER_ID) {
            return { data: { id: BASEBALL_COACH_ID }, error: null };
          }
          if (table === 'golf_coaches') {
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
      }),
    }),
    update: (payload: unknown) => ({
      eq: async (column: string, value: unknown) => {
        calls.push({ table, op: 'update', column, value, payload });
        return { error: null };
      },
    }),
    delete: () => ({
      eq: async (column: string, value: unknown) => {
        calls.push({ table, op: 'delete', column, value });
        if (table === 'users' && usersDeleteError) {
          return { error: usersDeleteError };
        }
        return { error: null };
      },
    }),
  };
}

const adminFrom = vi.fn((table: string) => makeTable(table));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: adminFrom,
    auth: { admin: { deleteUser: deleteUserMock } },
  })),
}));

import { DELETE } from '@/app/api/account/delete/route';

describe('/api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    usersDeleteError = null;
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    deleteUserMock.mockResolvedValue({ error: null });
  });

  it('rejects unauthenticated callers', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await DELETE();

    expect(res.status).toBe(401);
  });

  it('reassigns NO ACTION coach-attribution columns using the resolved baseball_coaches.id (not the raw auth user id) before deleting the user', async () => {
    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const gamesUpdate = calls.find((c) => c.table === 'baseball_games' && c.op === 'update');
    expect(gamesUpdate?.column).toBe('created_by');
    expect(gamesUpdate?.value).toBe(BASEBALL_COACH_ID);
    expect(gamesUpdate?.payload).toEqual({ created_by: null });

    const practiceBlocksUpdate = calls.find((c) => c.table === 'baseball_practice_blocks' && c.op === 'update');
    expect(practiceBlocksUpdate?.value).toBe(BASEBALL_COACH_ID);

    const invitationsDelete = calls.find((c) => c.table === 'baseball_team_invitations' && c.op === 'delete');
    expect(invitationsDelete?.column).toBe('created_by_coach_id');
    expect(invitationsDelete?.value).toBe(BASEBALL_COACH_ID);

    // REGRESSION: engagement events must be matched on the resolved coach id,
    // never the raw auth user id (the pre-fix bug matched coach_id against
    // user.id, which is a different id space and silently deleted 0 rows).
    const engagementDelete = calls.find((c) => c.table === 'baseball_player_engagement_events' && c.op === 'delete');
    expect(engagementDelete?.column).toBe('coach_id');
    expect(engagementDelete?.value).toBe(BASEBALL_COACH_ID);
    expect(engagementDelete?.value).not.toBe(USER_ID);
  });

  it('reassigns NO ACTION user-attribution (CRM/admin) columns using the raw auth user id', async () => {
    await DELETE();

    const crmCreated = calls.find(
      (c) => c.table === 'crm_coaches' && c.op === 'update' && c.column === 'created_by',
    );
    expect(crmCreated?.value).toBe(USER_ID);

    const crmArchived = calls.find(
      (c) => c.table === 'crm_coaches' && c.op === 'update' && c.column === 'archived_by',
    );
    expect(crmArchived?.value).toBe(USER_ID);

    const taskTemplates = calls.find((c) => c.table === 'golf_task_templates' && c.op === 'update');
    expect(taskTemplates?.value).toBe(USER_ID);
  });

  it('returns an honest 409 (not a generic 500, not a silent swallow) when the final delete still hits a residual FK violation', async () => {
    usersDeleteError = { code: '23503', message: 'update or delete on table "users" violates foreign key constraint' };

    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/reassigned by an admin/i);
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('Account deletion blocked by FK constraint'),
      expect.objectContaining({ userId: USER_ID, errorCode: '23503' }),
    );
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('returns a generic 500 for a non-FK users-delete failure', async () => {
    usersDeleteError = { code: '42501', message: 'permission denied' };

    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to delete account data');
  });
});

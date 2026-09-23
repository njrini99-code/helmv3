/**
 * A8 slice 2 — the practice-completion log (golf_focus_area_practice_sessions)
 * and coach-authored criteria (golf_player_focus_areas.criteria) actions.
 * Both surfaces sit behind coachhelm_focus_area_practice_log (default off);
 * every exported action here must make ZERO `.from()` calls while the flag
 * mock returns false.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

const isFlagEnabledMock = vi.fn();
vi.mock('@/lib/flags', () => ({
  isFlagEnabled: (...args: unknown[]) => isFlagEnabledMock(...args),
}));

const verifyPlayerAccessMock = vi.fn();
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => verifyPlayerAccessMock(...args),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

import {
  logFocusAreaPracticeSession,
  addFocusAreaCriterion,
  setFocusAreaCriterionMet,
} from '@/app/golf/actions/focus-area-practice-log';

const USER_ID = 'user-1';
const FOCUS_AREA_ID = 'fa-1';

type QueryResult<T> = { data: T; error: unknown };

/** In-memory `golf_player_focus_areas` handle supporting the exact chains
 *  the implementation uses: `.select(...).eq(...).maybeSingle()` and
 *  `.update(...).eq(...).eq(...|.is(...)).select(...)`. Each queue is
 *  consumed in order, one entry per call, sticking on the last entry once
 *  exhausted (models "read again, same steady state" for a retry test). */
function makeFocusAreaTable(
  selectQueue: QueryResult<unknown>[],
  updateQueue: QueryResult<unknown>[] = [{ data: [{ id: FOCUS_AREA_ID }], error: null }],
) {
  let selectCalls = 0;
  const updateCalls: Array<{ payload: Record<string, unknown>; versionCheck: [string, unknown] }> = [];
  let updateCalls_n = 0;

  return {
    select: (_cols: string) => ({
      eq: (_col: string, _val: unknown) => ({
        maybeSingle: async () => {
          const result = selectQueue[Math.min(selectCalls, selectQueue.length - 1)];
          selectCalls++;
          return result;
        },
      }),
    }),
    update: (payload: Record<string, unknown>) => ({
      eq: (_idCol: string, _idVal: unknown) => ({
        eq: (col2: string, val2: unknown) => ({
          select: async (_cols: string) => {
            updateCalls.push({ payload, versionCheck: [col2, val2] });
            const result = updateQueue[Math.min(updateCalls_n, updateQueue.length - 1)];
            updateCalls_n++;
            return result;
          },
        }),
        is: (col2: string, val2: unknown) => ({
          select: async (_cols: string) => {
            updateCalls.push({ payload, versionCheck: [col2, val2] });
            const result = updateQueue[Math.min(updateCalls_n, updateQueue.length - 1)];
            updateCalls_n++;
            return result;
          },
        }),
      }),
    }),
    _updateCalls: updateCalls,
    _selectCallCount: () => selectCalls,
  };
}

function makeSessionsTable(upsertResult: QueryResult<unknown> = { data: [{ id: 'session-1' }], error: null }) {
  let lastPayload: Record<string, unknown> | undefined;
  let lastOpts: Record<string, unknown> | undefined;
  return {
    upsert: (payload: Record<string, unknown>, opts: Record<string, unknown>) => {
      lastPayload = payload;
      lastOpts = opts;
      return { select: async (_cols: string) => upsertResult };
    },
    _lastPayload: () => lastPayload,
    _lastOpts: () => lastOpts,
  };
}

function makeClient(opts: {
  user?: { id: string } | null;
  focusAreaTable: ReturnType<typeof makeFocusAreaTable>;
  sessionsTable?: ReturnType<typeof makeSessionsTable>;
}) {
  const user = opts.user === undefined ? { id: USER_ID } : opts.user;
  return {
    auth: {
      getUser: async () => (user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'no session' } }),
    },
    from: (table: string) => {
      if (table === 'golf_player_focus_areas') return opts.focusAreaTable;
      if (table === 'golf_focus_area_practice_sessions') return opts.sessionsTable ?? makeSessionsTable();
      throw new Error(`unexpected table in test: ${table}`);
    },
  };
}

beforeEach(() => {
  isFlagEnabledMock.mockReset().mockReturnValue(true);
  verifyPlayerAccessMock.mockReset();
  createClientMock.mockReset();
});

describe('logFocusAreaPracticeSession', () => {
  it('returns Not enabled and never reads/writes a table when the flag is off', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    // No createClientMock.mockReturnValue configured: if the implementation
    // reached a `.from(...)` call before the flag check short-circuited, this
    // would throw (calling `.from` on `undefined`) instead of returning
    // cleanly — the flag-gate wrapper's own bridge-observability read of
    // `.auth.getUser()` on a failed action is a separate, expected call and
    // is not what this assertion is about.
    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: 'req-1',
    });
    expect(result).toEqual({ success: false, error: 'Not enabled' });
  });

  it('denies an unauthenticated caller', async () => {
    const focusAreaTable = makeFocusAreaTable([{ data: null, error: null }]);
    createClientMock.mockReturnValue(makeClient({ user: null, focusAreaTable }));

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: 'req-1',
    });
    expect(result).toEqual({ success: false, error: 'Not authenticated' });
  });

  it('reports a missing focus area', async () => {
    const focusAreaTable = makeFocusAreaTable([{ data: null, error: null }]);
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: 'req-1',
    });
    expect(result).toEqual({ success: false, error: 'Focus area not found' });
    expect(verifyPlayerAccessMock).not.toHaveBeenCalled();
  });

  it('denies a caller verifyPlayerAccess rejects', async () => {
    const focusAreaTable = makeFocusAreaTable([
      { data: { player_id: 'player-1', status: 'active' }, error: null },
    ]);
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: false, reason: 'denied' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: 'req-1',
    });
    expect(result).toEqual({ success: false, error: 'Forbidden' });
  });

  it('rejects a proposed (not yet accepted) focus area', async () => {
    const focusAreaTable = makeFocusAreaTable([
      { data: { player_id: 'player-1', status: 'proposed' }, error: null },
    ]);
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: 'req-1',
    });
    expect(result).toEqual({
      success: false,
      error: "This focus area hasn't been accepted by the player yet.",
    });
  });

  it('logs a session for the owning player and derives logged_by_role from access, not input', async () => {
    const focusAreaTable = makeFocusAreaTable([
      { data: { player_id: 'player-1', status: 'active' }, error: null },
    ]);
    const sessionsTable = makeSessionsTable();
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, sessionsTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: 'req-1',
      note: 'felt good',
    });

    expect(result).toEqual({ success: true });
    expect(sessionsTable._lastPayload()).toMatchObject({
      focus_area_id: FOCUS_AREA_ID,
      player_id: 'player-1',
      logged_by_user_id: USER_ID,
      logged_by_role: 'player',
      note: 'felt good',
      client_request_id: 'req-1',
    });
    expect(sessionsTable._lastOpts()).toEqual({
      onConflict: 'focus_area_id,client_request_id',
      ignoreDuplicates: true,
    });
  });

  it('logs a session for a coach as logged_by_role coach', async () => {
    const focusAreaTable = makeFocusAreaTable([
      { data: { player_id: 'player-1', status: 'active' }, error: null },
    ]);
    const sessionsTable = makeSessionsTable();
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, sessionsTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: 'req-2',
    });

    expect(result).toEqual({ success: true });
    expect(sessionsTable._lastPayload()).toMatchObject({ logged_by_role: 'coach' });
  });

  it('treats a duplicate client_request_id (0 rows, no error) as success, not a failure', async () => {
    const focusAreaTable = makeFocusAreaTable([
      { data: { player_id: 'player-1', status: 'active' }, error: null },
    ]);
    // ignoreDuplicates: a repeat submit matches the UNIQUE constraint and
    // ON CONFLICT DO NOTHING returns zero rows with no error.
    const sessionsTable = makeSessionsTable({ data: [], error: null });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, sessionsTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: 'req-1',
    });
    expect(result).toEqual({ success: true });
  });
});

describe('addFocusAreaCriterion', () => {
  it('returns Not enabled and never reads/writes a table when the flag is off', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });
    expect(result).toEqual({ success: false, error: 'Not enabled' });
  });

  it('denies a player (non-coach) caller — only coaches may author criteria', async () => {
    const focusAreaTable = makeFocusAreaTable([
      { data: { player_id: 'player-1', status: 'active', updated_at: '2026-09-01T00:00:00Z', criteria: null }, error: null },
    ]);
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });
    expect(result).toEqual({ success: false, error: 'Forbidden' });
  });

  it('rejects a duplicate label, case- and whitespace-insensitive', async () => {
    const focusAreaTable = makeFocusAreaTable([
      {
        data: {
          player_id: 'player-1',
          status: 'active',
          updated_at: '2026-09-01T00:00:00Z',
          criteria: { entries: [{ id: 'c1', label: 'Tempo', source: 'coach', created_at: 't', met: false, met_at: null }] },
        },
        error: null,
      },
    ]);
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: '  tempo  ' });
    expect(result).toEqual({ success: false, error: 'A criterion with this label already exists.' });
  });

  it('rejects a 10th+ entry (the cap)', async () => {
    const tenEntries = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      label: `Criterion ${i}`,
      source: 'coach' as const,
      created_at: 't',
      met: false,
      met_at: null,
    }));
    const focusAreaTable = makeFocusAreaTable([
      {
        data: { player_id: 'player-1', status: 'active', updated_at: '2026-09-01T00:00:00Z', criteria: { entries: tenEntries } },
        error: null,
      },
    ]);
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'One more' });
    expect(result).toEqual({ success: false, error: 'A focus area can have at most 10 criteria.' });
  });

  it('appends a new coach-authored entry with the version pinned to the read updated_at', async () => {
    const focusAreaTable = makeFocusAreaTable([
      { data: { player_id: 'player-1', status: 'active', updated_at: '2026-09-01T00:00:00Z', criteria: null }, error: null },
    ]);
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });

    expect(result).toEqual({ success: true });
    expect(focusAreaTable._updateCalls).toHaveLength(1);
    const call = focusAreaTable._updateCalls[0]!;
    expect(call.versionCheck).toEqual(['updated_at', '2026-09-01T00:00:00Z']);
    const criteria = call.payload.criteria as { entries: Array<{ label: string; source: string; met: boolean }> };
    expect(criteria.entries).toHaveLength(1);
    expect(criteria.entries[0]).toMatchObject({ label: 'Tempo', source: 'coach', met: false });
  });

  it('retries once on a lost compare-and-swap race, then succeeds', async () => {
    const focusAreaTable = makeFocusAreaTable(
      [
        { data: { player_id: 'player-1', status: 'active', updated_at: '2026-09-01T00:00:00Z', criteria: null }, error: null },
        { data: { player_id: 'player-1', status: 'active', updated_at: '2026-09-01T00:05:00Z', criteria: null }, error: null },
      ],
      [
        { data: [], error: null }, // first UPDATE: 0 rows — someone else wrote first
        { data: [{ id: FOCUS_AREA_ID }], error: null }, // retry: succeeds
      ],
    );
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });

    expect(result).toEqual({ success: true });
    expect(focusAreaTable._selectCallCount()).toBe(2);
    expect(focusAreaTable._updateCalls).toHaveLength(2);
  });

  it('reports a conflict when the race is lost twice in a row', async () => {
    const focusAreaTable = makeFocusAreaTable(
      [{ data: { player_id: 'player-1', status: 'active', updated_at: '2026-09-01T00:00:00Z', criteria: null }, error: null }],
      [
        { data: [], error: null },
        { data: [], error: null },
      ],
    );
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });
    expect(result).toEqual({
      success: false,
      error: 'This focus area changed while you were editing. Please try again.',
    });
  });
});

describe('setFocusAreaCriterionMet', () => {
  it('marks the target entry met and stamps met_at, leaving other entries untouched', async () => {
    const focusAreaTable = makeFocusAreaTable([
      {
        data: {
          player_id: 'player-1',
          status: 'active',
          updated_at: '2026-09-01T00:00:00Z',
          criteria: {
            entries: [
              { id: 'c1', label: 'Tempo', source: 'coach', created_at: 't', met: false, met_at: null },
              { id: 'c2', label: 'Follow-through', source: 'coach', created_at: 't', met: false, met_at: null },
            ],
          },
        },
        error: null,
      },
    ]);
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await setFocusAreaCriterionMet({ focusAreaId: FOCUS_AREA_ID, criterionId: 'c1', met: true });

    expect(result).toEqual({ success: true });
    const call = focusAreaTable._updateCalls[0]!;
    const criteria = call.payload.criteria as { entries: Array<{ id: string; met: boolean; met_at: string | null }> };
    const c1 = criteria.entries.find((e) => e.id === 'c1')!;
    const c2 = criteria.entries.find((e) => e.id === 'c2')!;
    expect(c1.met).toBe(true);
    expect(c1.met_at).not.toBeNull();
    expect(c2.met).toBe(false);
    expect(c2.met_at).toBeNull();
  });

  it('reports a missing criterion id', async () => {
    const focusAreaTable = makeFocusAreaTable([
      {
        data: {
          player_id: 'player-1',
          status: 'active',
          updated_at: '2026-09-01T00:00:00Z',
          criteria: { entries: [] },
        },
        error: null,
      },
    ]);
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await setFocusAreaCriterionMet({ focusAreaId: FOCUS_AREA_ID, criterionId: 'missing', met: true });
    expect(result).toEqual({ success: false, error: 'Criterion not found' });
  });
});

/**
 * A8 slice 2 — the practice-completion log (golf_focus_area_practice_sessions)
 * and coach-authored criteria (golf_focus_area_criteria) actions. Criteria
 * live in their own table, not a jsonb column on golf_player_focus_areas —
 * the db-migration-reviewer's design change (see the migration's header).
 * Both surfaces sit behind coachhelm_focus_area_practice_log (default off);
 * every exported action here must make ZERO `.from()` calls while the flag
 * mock returns false, and validation failures must return BEFORE any
 * `createClient()` call.
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
const FOCUS_AREA_ID = '00000000-0000-0000-0000-000000000001';
const REQ_ID = '00000000-0000-0000-0000-0000000000f1';
const CRITERION_ID = '00000000-0000-0000-0000-0000000000c1';
const CRITERION_ID_2 = '00000000-0000-0000-0000-0000000000c2';
const MISSING_CRITERION_ID = '00000000-0000-0000-0000-0000000000ff';

type QueryResult<T> = { data: T; error: unknown };

/** In-memory `golf_player_focus_areas` handle: `.select(...).eq(...).maybeSingle()`
 *  is the only chain either action uses against this table now that criteria
 *  moved off it (no more CAS `.update(...)` here). */
function makeFocusAreaTable(result: QueryResult<unknown>) {
  return {
    select: (_cols: string) => ({
      eq: (_col: string, _val: unknown) => ({
        maybeSingle: async () => result,
      }),
    }),
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

/** In-memory `golf_focus_area_criteria` handle supporting the three chains
 *  the implementation uses: the cap-check count, the coach-only INSERT, and
 *  the single-row UPDATE (met, met_at, updated_at) — no CAS/version pin,
 *  since one row per criterion means there's no shared blob to race on. */
function makeCriteriaTable(opts: {
  countResult?: { count: number | null; error: unknown };
  insertResult?: QueryResult<unknown>;
  updateResult?: QueryResult<unknown>;
} = {}) {
  const countResult = opts.countResult ?? { count: 0, error: null };
  const insertResult = opts.insertResult ?? { data: [{ id: 'new-criterion' }], error: null };
  const updateResult = opts.updateResult ?? { data: [{ id: CRITERION_ID }], error: null };
  let lastInsertPayload: Record<string, unknown> | undefined;
  let lastUpdatePayload: Record<string, unknown> | undefined;
  const updateEqCalls: unknown[] = [];

  return {
    select: (_cols: string, _selOpts?: Record<string, unknown>) => ({
      eq: async (_col: string, _val: unknown) => countResult,
    }),
    insert: (payload: Record<string, unknown>) => {
      lastInsertPayload = payload;
      return { select: async (_cols: string) => insertResult };
    },
    update: (payload: Record<string, unknown>) => {
      lastUpdatePayload = payload;
      return {
        eq: (_c1: string, v1: unknown) => {
          updateEqCalls.push(v1);
          return {
            eq: (_c2: string, v2: unknown) => {
              updateEqCalls.push(v2);
              return { select: async (_cols: string) => updateResult };
            },
          };
        },
      };
    },
    _lastInsertPayload: () => lastInsertPayload,
    _lastUpdatePayload: () => lastUpdatePayload,
    _updateEqCalls: () => updateEqCalls,
  };
}

function makeClient(opts: {
  user?: { id: string } | null;
  focusAreaTable?: ReturnType<typeof makeFocusAreaTable>;
  sessionsTable?: ReturnType<typeof makeSessionsTable>;
  criteriaTable?: ReturnType<typeof makeCriteriaTable>;
}) {
  const user = opts.user === undefined ? { id: USER_ID } : opts.user;
  return {
    auth: {
      getUser: async () => (user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'no session' } }),
    },
    from: (table: string) => {
      if (table === 'golf_player_focus_areas') return opts.focusAreaTable ?? makeFocusAreaTable({ data: null, error: null });
      if (table === 'golf_focus_area_practice_sessions') return opts.sessionsTable ?? makeSessionsTable();
      if (table === 'golf_focus_area_criteria') return opts.criteriaTable ?? makeCriteriaTable();
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
  it('returns Not enabled and never calls createClient when the flag is off', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
    });
    expect(result).toEqual({ success: false, error: 'Not enabled' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID focusAreaId before calling createClient', async () => {
    const result = await logFocusAreaPracticeSession({
      focusAreaId: 'not-a-uuid',
      clientRequestId: REQ_ID,
    });
    expect(result).toEqual({ success: false, error: 'Invalid focus area.' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID clientRequestId', async () => {
    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: 'not-a-uuid',
    });
    expect(result).toEqual({ success: false, error: 'Invalid request id.' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects a drillId over the length cap', async () => {
    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
      drillId: 'x'.repeat(101),
    });
    expect(result).toEqual({ success: false, error: 'Drill id must be 100 characters or fewer.' });
  });

  it('rejects a note over the length cap', async () => {
    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
      note: 'x'.repeat(1001),
    });
    expect(result).toEqual({ success: false, error: 'Note must be 1000 characters or fewer.' });
  });

  it('rejects a non-integer or out-of-range reps value', async () => {
    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
      reps: 1001,
    });
    expect(result).toEqual({
      success: false,
      error: 'Reps must be a whole number between 0 and 1000.',
    });

    const fractional = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
      reps: 1.5,
    });
    expect(fractional).toEqual({
      success: false,
      error: 'Reps must be a whole number between 0 and 1000.',
    });
  });

  it('rejects an unparsable practicedAt', async () => {
    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
      practicedAt: 'not-a-date',
    });
    expect(result).toEqual({ success: false, error: 'Invalid practice date.' });
  });

  it('rejects a practicedAt more than a day in the future', async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
      practicedAt: future,
    });
    expect(result).toEqual({
      success: false,
      error: 'Practice date cannot be more than a day in the future.',
    });
  });

  it('rejects a practicedAt more than a year in the past', async () => {
    const past = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
      practicedAt: past,
    });
    expect(result).toEqual({
      success: false,
      error: 'Practice date cannot be more than a year in the past.',
    });
  });

  it('denies an unauthenticated caller', async () => {
    createClientMock.mockReturnValue(makeClient({ user: null }));

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
    });
    expect(result).toEqual({ success: false, error: 'Not authenticated' });
  });

  it('reports a missing focus area', async () => {
    const focusAreaTable = makeFocusAreaTable({ data: null, error: null });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
    });
    expect(result).toEqual({ success: false, error: 'Focus area not found' });
    expect(verifyPlayerAccessMock).not.toHaveBeenCalled();
  });

  it('denies a caller verifyPlayerAccess rejects', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: false, reason: 'denied' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
    });
    expect(result).toEqual({ success: false, error: 'Forbidden' });
  });

  it('rejects a proposed (not yet accepted) focus area', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'proposed' },
      error: null,
    });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
    });
    expect(result).toEqual({
      success: false,
      error: "This focus area hasn't been accepted by the player yet.",
    });
  });

  it('logs a session for the owning player and derives logged_by_role from access, not input', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const sessionsTable = makeSessionsTable();
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, sessionsTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
      note: 'felt good',
    });

    expect(result).toEqual({ success: true });
    expect(sessionsTable._lastPayload()).toMatchObject({
      focus_area_id: FOCUS_AREA_ID,
      player_id: 'player-1',
      logged_by_user_id: USER_ID,
      logged_by_role: 'player',
      note: 'felt good',
      client_request_id: REQ_ID,
    });
    expect(sessionsTable._lastOpts()).toEqual({
      onConflict: 'focus_area_id,client_request_id',
      ignoreDuplicates: true,
    });
  });

  it('stores the trimmed drillId and note, not the raw untrimmed values', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const sessionsTable = makeSessionsTable();
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, sessionsTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
      drillId: '  putting-drill-1  ',
      note: '  felt good  ',
    });

    expect(result).toEqual({ success: true });
    expect(sessionsTable._lastPayload()).toMatchObject({
      drill_id: 'putting-drill-1',
      note: 'felt good',
    });
  });

  it('rejects a drillId/note that only exceeds the cap once trimmed is validated on the trimmed value', async () => {
    // Padding on both sides that pushes the RAW length over 100/1000 but the
    // TRIMMED length is exactly at the cap -- must be accepted, matching the
    // migration's DB CHECKs which apply to the stored (trimmed) value.
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const sessionsTable = makeSessionsTable();
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, sessionsTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
      drillId: `  ${'x'.repeat(100)}  `,
    });

    expect(result).toEqual({ success: true });
    expect(sessionsTable._lastPayload()).toMatchObject({ drill_id: 'x'.repeat(100) });
  });

  it('logs a session for a coach as logged_by_role coach', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const sessionsTable = makeSessionsTable();
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, sessionsTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
    });

    expect(result).toEqual({ success: true });
    expect(sessionsTable._lastPayload()).toMatchObject({ logged_by_role: 'coach' });
  });

  it('treats a duplicate client_request_id (0 rows, no error) as success, not a failure', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    // ignoreDuplicates: a repeat submit matches the UNIQUE constraint and
    // ON CONFLICT DO NOTHING returns zero rows with no error.
    const sessionsTable = makeSessionsTable({ data: [], error: null });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, sessionsTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
    });
    expect(result).toEqual({ success: true });
  });

  it('maps an RLS denial (42501) on insert to Forbidden, not a generic outage error', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const sessionsTable = makeSessionsTable({ data: null, error: { code: '42501', message: 'denied' } });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, sessionsTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await logFocusAreaPracticeSession({
      focusAreaId: FOCUS_AREA_ID,
      clientRequestId: REQ_ID,
    });
    expect(result).toEqual({ success: false, error: 'Forbidden' });
  });
});

describe('addFocusAreaCriterion', () => {
  it('returns Not enabled and never calls createClient when the flag is off', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });
    expect(result).toEqual({ success: false, error: 'Not enabled' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID focusAreaId before calling createClient', async () => {
    const result = await addFocusAreaCriterion({ focusAreaId: 'not-a-uuid', label: 'Tempo' });
    expect(result).toEqual({ success: false, error: 'Invalid focus area.' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects a non-string label', async () => {
    const result = await addFocusAreaCriterion({
      focusAreaId: FOCUS_AREA_ID,
      label: 42 as unknown as string,
    });
    expect(result).toEqual({ success: false, error: 'A criterion needs a label.' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects an empty/whitespace-only label', async () => {
    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: '   ' });
    expect(result).toEqual({ success: false, error: 'A criterion needs a label.' });
  });

  it('rejects a label over the length cap', async () => {
    const result = await addFocusAreaCriterion({
      focusAreaId: FOCUS_AREA_ID,
      label: 'x'.repeat(201),
    });
    expect(result).toEqual({ success: false, error: 'Label must be 200 characters or fewer.' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('denies an unauthenticated caller', async () => {
    createClientMock.mockReturnValue(makeClient({ user: null }));
    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });
    expect(result).toEqual({ success: false, error: 'Not authenticated' });
  });

  it('reports a missing focus area', async () => {
    const focusAreaTable = makeFocusAreaTable({ data: null, error: null });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });
    expect(result).toEqual({ success: false, error: 'Focus area not found' });
  });

  it('denies a player (non-coach) caller — only coaches may author criteria', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });
    expect(result).toEqual({ success: false, error: 'Forbidden' });
  });

  it('rejects a proposed (not yet accepted) focus area', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'proposed' },
      error: null,
    });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });
    expect(result).toEqual({
      success: false,
      error: "This focus area hasn't been accepted by the player yet.",
    });
  });

  it('rejects a 10th+ entry (the cap), checked via a count query', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const criteriaTable = makeCriteriaTable({ countResult: { count: 10, error: null } });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, criteriaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'One more' });
    expect(result).toEqual({ success: false, error: 'A focus area can have at most 10 criteria.' });
  });

  it('inserts a new coach-authored row with created_by_user_id pinned to the caller', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const criteriaTable = makeCriteriaTable();
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, criteriaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: '  Tempo  ' });

    expect(result).toEqual({ success: true });
    expect(criteriaTable._lastInsertPayload()).toMatchObject({
      focus_area_id: FOCUS_AREA_ID,
      player_id: 'player-1',
      label: 'Tempo',
      source: 'coach',
      created_by_user_id: USER_ID,
    });
  });

  it('maps a unique-label violation (23505) to a clean already-exists error', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const criteriaTable = makeCriteriaTable({
      insertResult: { data: null, error: { code: '23505', message: 'duplicate key' } },
    });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, criteriaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });
    expect(result).toEqual({ success: false, error: 'A criterion with this label already exists.' });
  });

  it('maps an RLS denial (42501) on insert to Forbidden', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const criteriaTable = makeCriteriaTable({
      insertResult: { data: null, error: { code: '42501', message: 'denied' } },
    });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, criteriaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await addFocusAreaCriterion({ focusAreaId: FOCUS_AREA_ID, label: 'Tempo' });
    expect(result).toEqual({ success: false, error: 'Forbidden' });
  });
});

describe('setFocusAreaCriterionMet', () => {
  it('returns Not enabled and never calls createClient when the flag is off', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const result = await setFocusAreaCriterionMet({
      focusAreaId: FOCUS_AREA_ID,
      criterionId: CRITERION_ID,
      met: true,
    });
    expect(result).toEqual({ success: false, error: 'Not enabled' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID focusAreaId', async () => {
    const result = await setFocusAreaCriterionMet({
      focusAreaId: 'not-a-uuid',
      criterionId: CRITERION_ID,
      met: true,
    });
    expect(result).toEqual({ success: false, error: 'Invalid focus area.' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID criterionId', async () => {
    const result = await setFocusAreaCriterionMet({
      focusAreaId: FOCUS_AREA_ID,
      criterionId: 'not-a-uuid',
      met: true,
    });
    expect(result).toEqual({ success: false, error: 'Invalid criterion.' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean met as a clean validation error, before createClient', async () => {
    const result = await setFocusAreaCriterionMet({
      focusAreaId: FOCUS_AREA_ID,
      criterionId: CRITERION_ID,
      met: 'true' as unknown as boolean,
    });
    expect(result).toEqual({ success: false, error: 'Invalid value for met.' });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('denies an unauthenticated caller', async () => {
    createClientMock.mockReturnValue(makeClient({ user: null }));
    const result = await setFocusAreaCriterionMet({
      focusAreaId: FOCUS_AREA_ID,
      criterionId: CRITERION_ID,
      met: true,
    });
    expect(result).toEqual({ success: false, error: 'Not authenticated' });
  });

  it('denies a player (non-coach) caller', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await setFocusAreaCriterionMet({
      focusAreaId: FOCUS_AREA_ID,
      criterionId: CRITERION_ID,
      met: true,
    });
    expect(result).toEqual({ success: false, error: 'Forbidden' });
  });

  it('marks the target criterion met and stamps met_at', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const criteriaTable = makeCriteriaTable({ updateResult: { data: [{ id: CRITERION_ID }], error: null } });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, criteriaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await setFocusAreaCriterionMet({
      focusAreaId: FOCUS_AREA_ID,
      criterionId: CRITERION_ID,
      met: true,
    });

    expect(result).toEqual({ success: true });
    const payload = criteriaTable._lastUpdatePayload()!;
    expect(payload.met).toBe(true);
    expect(payload.met_at).not.toBeNull();
    expect(criteriaTable._updateEqCalls()).toEqual([CRITERION_ID, FOCUS_AREA_ID]);
  });

  it('clears met_at when unmarking a criterion', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const criteriaTable = makeCriteriaTable({ updateResult: { data: [{ id: CRITERION_ID_2 }], error: null } });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, criteriaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await setFocusAreaCriterionMet({
      focusAreaId: FOCUS_AREA_ID,
      criterionId: CRITERION_ID_2,
      met: false,
    });

    expect(result).toEqual({ success: true });
    expect(criteriaTable._lastUpdatePayload()!.met_at).toBeNull();
  });

  it('reports a missing criterion id (0 rows, no error)', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const criteriaTable = makeCriteriaTable({ updateResult: { data: [], error: null } });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, criteriaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await setFocusAreaCriterionMet({
      focusAreaId: FOCUS_AREA_ID,
      criterionId: MISSING_CRITERION_ID,
      met: true,
    });
    expect(result).toEqual({ success: false, error: 'Criterion not found' });
  });

  it('maps an RLS denial (42501) on update to Forbidden', async () => {
    const focusAreaTable = makeFocusAreaTable({
      data: { player_id: 'player-1', status: 'active' },
      error: null,
    });
    const criteriaTable = makeCriteriaTable({
      updateResult: { data: null, error: { code: '42501', message: 'denied' } },
    });
    createClientMock.mockReturnValue(makeClient({ focusAreaTable, criteriaTable }));
    verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await setFocusAreaCriterionMet({
      focusAreaId: FOCUS_AREA_ID,
      criterionId: CRITERION_ID,
      met: true,
    });
    expect(result).toEqual({ success: false, error: 'Forbidden' });
  });
});

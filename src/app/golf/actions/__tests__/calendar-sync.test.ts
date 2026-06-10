/**
 * calendar-sync action tests (calendar audit 2026-06-10, finding #14).
 *
 * Class→calendar sync had never written a row (player RLS silently blocked
 * every insert) and carried two armed traps: a banned delete-then-reinsert
 * rebuild and offset-naive timestamps. The fix:
 *   - explicit authz (caller IS the player, player IS a member of the team)
 *     BEFORE any admin-client write — verified here
 *   - DIFF upsert: insert new occurrences, update changed ones, delete ONLY
 *     rows whose source occurrence disappeared — never a blanket delete
 *   - timestamps via the golf.ts timezone-offset convention
 *   - every write error surfaces to the caller
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Admin-client mock (golf_events writes) ---------------------------------

interface RecordedCall {
  name: string;
  args: unknown[];
}

interface AdminOp {
  table: string;
  calls: RecordedCall[];
}

interface ExistingRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  description: string | null;
}

interface AdminConfig {
  existingRows?: ExistingRow[];
  existingError?: { message: string } | null;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
  deleteError?: { message: string } | null;
}

let adminCfg: AdminConfig;
let adminOps: AdminOp[];

function makeAdminBuilder(table: string) {
  const op: AdminOp = { table, calls: [] };
  adminOps.push(op);
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'like', 'order', 'in', 'insert', 'update', 'delete']) {
    builder[m] = vi.fn((...args: unknown[]) => {
      op.calls.push({ name: m, args });
      return builder;
    });
  }
  builder.range = vi.fn((from: number, to: number) => {
    op.calls.push({ name: 'range', args: [from, to] });
    if (adminCfg.existingError) {
      return Promise.resolve({ data: null, error: adminCfg.existingError });
    }
    return Promise.resolve({
      data: (adminCfg.existingRows ?? []).slice(from, to + 1),
      error: null,
    });
  });
  builder.then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => {
    const verb = op.calls.find((c) => ['insert', 'update', 'delete'].includes(c.name))?.name;
    const error =
      verb === 'insert'
        ? adminCfg.insertError ?? null
        : verb === 'update'
          ? adminCfg.updateError ?? null
          : verb === 'delete'
            ? adminCfg.deleteError ?? null
            : null;
    return Promise.resolve({ data: null, error }).then(onfulfilled, onrejected);
  };
  return builder;
}

const adminFrom = vi.fn((table: string) => makeAdminBuilder(table));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFrom }),
}));

// ---- Server-client mock (auth + membership checks) --------------------------

let authedUserId: string | null;
let playerRow: { id: string } | null;
let membershipRow: { team_id: string } | null;
let membershipList: Array<{ team_id: string }>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: authedUserId ? { id: authedUserId } : null },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'golf_players') {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(async () =>
            playerRow
              ? { data: playerRow, error: null }
              : { data: null, error: { message: 'no rows' } },
          ),
          maybeSingle: vi.fn(async () => ({ data: playerRow, error: null })),
        };
        return chain;
      }
      if (table === 'golf_team_members') {
        const eqCalls: unknown[][] = [];
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn((...args: unknown[]) => {
            eqCalls.push(args);
            return chain;
          }),
          maybeSingle: vi.fn(async () => ({ data: membershipRow, error: null })),
          then: (
            onfulfilled?: ((value: unknown) => unknown) | null,
            onrejected?: ((reason: unknown) => unknown) | null,
          ) => Promise.resolve({ data: membershipList, error: null }).then(onfulfilled, onrejected),
        };
        return chain;
      }
      throw new Error(`unexpected server table ${table}`);
    }),
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { syncClassToCalendar, removeClassFromCalendar } from '../calendar-sync';

// ---- Fixtures ----------------------------------------------------------------
// Winter 2025, custom start 2025-12-15 (a Monday), Mondays only.
// Desired occurrences: 12-15, 12-22, 12-29, 01-05, 01-12 (5 rows; semester
// ends 2026-01-15).

const CLASS_ID = 'c1';
const TAG = '[class:c1]';
const TEAM_ID = 'team-1';
const PLAYER_ID = 'player-1';
const DESIRED_DATES = ['2025-12-15', '2025-12-22', '2025-12-29', '2026-01-05', '2026-01-12'];

function classData(overrides: Record<string, unknown> = {}) {
  return {
    course_code: 'BIO101',
    course_name: 'Biology',
    instructor: 'Dr. X',
    days: ['M'],
    start_time: '09:00',
    end_time: '10:15',
    location: '',
    building: 'Sci',
    room: '101',
    credits: 3,
    semester: 'Winter 2025',
    semesterStartDate: '2025-12-15',
    color: '#16A34A',
    notes: '',
    ...overrides,
  };
}

const EXPECTED_TITLE = 'BIO101: Biology';
const EXPECTED_LOCATION = 'Sci - 101';
const EXPECTED_DESCRIPTION = `Instructor: Dr. X\nCredits: 3\n${TAG}`;

function existingRowOn(date: string, id: string, overrides: Partial<ExistingRow> = {}): ExistingRow {
  return {
    id,
    title: EXPECTED_TITLE,
    start_time: `${date}T09:00:00+00:00`,
    end_time: `${date}T10:15:00+00:00`,
    location: EXPECTED_LOCATION,
    description: EXPECTED_DESCRIPTION,
    ...overrides,
  };
}

function opsByVerb(verb: string): AdminOp[] {
  return adminOps.filter((o) => o.calls.some((c) => c.name === verb));
}

function insertedRows(): Array<Record<string, unknown>> {
  return opsByVerb('insert').flatMap(
    (o) => (o.calls.find((c) => c.name === 'insert')?.args[0] ?? []) as Array<
      Record<string, unknown>
    >,
  );
}

describe('syncClassToCalendar — authz', () => {
  beforeEach(() => {
    adminCfg = {};
    adminOps = [];
    authedUserId = 'user-1';
    playerRow = { id: PLAYER_ID };
    membershipRow = { team_id: TEAM_ID };
    membershipList = [{ team_id: TEAM_ID }];
    vi.clearAllMocks();
  });

  it('rejects unauthenticated callers before touching anything', async () => {
    authedUserId = null;
    const result = await syncClassToCalendar(classData(), CLASS_ID, PLAYER_ID, TEAM_ID);
    expect(result).toEqual({ success: false, error: 'Not authenticated' });
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it("rejects a caller syncing somebody ELSE's playerId — admin client never used", async () => {
    const result = await syncClassToCalendar(classData(), CLASS_ID, 'player-OTHER', TEAM_ID);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not authorized to sync this calendar');
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it('rejects when the player is not a member of the target team — admin client never used', async () => {
    membershipRow = null;
    const result = await syncClassToCalendar(classData(), CLASS_ID, PLAYER_ID, TEAM_ID);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Player is not a member of this team');
    expect(adminFrom).not.toHaveBeenCalled();
  });
});

describe('syncClassToCalendar — diff upsert (no blanket delete)', () => {
  beforeEach(() => {
    adminCfg = {};
    adminOps = [];
    authedUserId = 'user-1';
    playerRow = { id: PLAYER_ID };
    membershipRow = { team_id: TEAM_ID };
    membershipList = [{ team_id: TEAM_ID }];
    vi.clearAllMocks();
  });

  it('first sync inserts one row per weekly occurrence, scoped to the team, no deletes', async () => {
    adminCfg = { existingRows: [] };
    const result = await syncClassToCalendar(classData(), CLASS_ID, PLAYER_ID, TEAM_ID);

    expect(result.success).toBe(true);
    expect(result.eventsCreated).toBe(5);
    expect(result.eventsUpdated).toBe(0);
    expect(result.eventsDeleted).toBe(0);

    const rows = insertedRows();
    expect(rows.map((r) => (r.start_time as string).slice(0, 10)).sort()).toEqual(DESIRED_DATES);
    for (const r of rows) {
      expect(r.team_id).toBe(TEAM_ID);
      expect(r.title).toBe(EXPECTED_TITLE);
      expect(r.description).toContain(TAG);
      expect(r.start_time).toMatch(/T09:00:00\+00:00$/);
      expect(r.end_time).toMatch(/T10:15:00\+00:00$/);
    }
    expect(opsByVerb('delete')).toHaveLength(0);
  });

  it('re-sync with identical state is a complete no-op (no insert, no update, NO delete)', async () => {
    adminCfg = {
      existingRows: DESIRED_DATES.map((d, i) => existingRowOn(d, `ex-${i}`)),
    };
    const result = await syncClassToCalendar(classData(), CLASS_ID, PLAYER_ID, TEAM_ID);

    expect(result.success).toBe(true);
    expect(result.eventsCreated).toBe(0);
    expect(result.eventsUpdated).toBe(0);
    expect(result.eventsDeleted).toBe(0);
    expect(opsByVerb('insert')).toHaveLength(0);
    expect(opsByVerb('update')).toHaveLength(0);
    expect(opsByVerb('delete')).toHaveLength(0);
  });

  it('diff: inserts missing occurrences, updates changed rows, deletes ONLY orphaned rows by id', async () => {
    adminCfg = {
      existingRows: [
        existingRowOn('2025-12-15', 'ex-keep'), // identical → untouched
        existingRowOn('2025-12-22', 'ex-stale-title', { title: 'OLD: Biology' }), // → update
        existingRowOn('2025-12-16', 'ex-orphan'), // Tuesday — no longer meets → delete
      ],
    };
    const result = await syncClassToCalendar(classData(), CLASS_ID, PLAYER_ID, TEAM_ID);

    expect(result.success).toBe(true);
    expect(result.eventsCreated).toBe(3); // 12-29, 01-05, 01-12
    expect(result.eventsUpdated).toBe(1);
    expect(result.eventsDeleted).toBe(1);

    expect(insertedRows().map((r) => (r.start_time as string).slice(0, 10)).sort()).toEqual([
      '2025-12-29',
      '2026-01-05',
      '2026-01-12',
    ]);

    const updateOp = opsByVerb('update')[0]!;
    const updateEqs = updateOp.calls.filter((c) => c.name === 'eq').map((c) => c.args);
    expect(updateEqs).toContainEqual(['id', 'ex-stale-title']);
    expect(updateEqs).toContainEqual(['team_id', TEAM_ID]);

    // Deletion is scoped to the orphaned ids + team — NEVER tag-wide.
    const deletes = opsByVerb('delete');
    expect(deletes).toHaveLength(1);
    const deleteOp = deletes[0]!;
    expect(deleteOp.calls.find((c) => c.name === 'in')?.args).toEqual(['id', ['ex-orphan']]);
    expect(deleteOp.calls.find((c) => c.name === 'eq')?.args).toEqual(['team_id', TEAM_ID]);
    expect(deleteOp.calls.some((c) => c.name === 'like')).toBe(false);
  });

  it('writes timestamps with the caller timezone offset (golf.ts convention)', async () => {
    adminCfg = { existingRows: [] };
    const result = await syncClassToCalendar(
      classData({ timezoneOffset: 300 }), // 300 min west of UTC → -05:00
      CLASS_ID,
      PLAYER_ID,
      TEAM_ID,
    );
    expect(result.success).toBe(true);
    for (const r of insertedRows()) {
      expect(r.start_time).toMatch(/T09:00:00-05:00$/);
      expect(r.end_time).toMatch(/T10:15:00-05:00$/);
    }
  });

  it('matches existing UTC-normalized rows back to their caller-local date (no churn after offset sync)', async () => {
    // Stored rows come back from PostgREST normalized to UTC: 09:00 -05:00
    // is 14:00Z, whose raw date is still 12-15 — but a 20:00 -05:00 class
    // would roll to the NEXT UTC day; localDateKey must undo the offset.
    adminCfg = {
      existingRows: DESIRED_DATES.map((d, i) =>
        existingRowOn(d, `ex-${i}`, {
          start_time: `${d}T14:00:00+00:00`,
          end_time: `${d}T15:15:00+00:00`,
        }),
      ),
    };
    const result = await syncClassToCalendar(
      classData({ timezoneOffset: 300 }),
      CLASS_ID,
      PLAYER_ID,
      TEAM_ID,
    );
    expect(result.success).toBe(true);
    // Same instants, same dates → pure no-op.
    expect(result.eventsCreated).toBe(0);
    expect(result.eventsUpdated).toBe(0);
    expect(result.eventsDeleted).toBe(0);
  });

  it('surfaces insert errors to the caller', async () => {
    adminCfg = { existingRows: [], insertError: { message: 'permission denied' } };
    const result = await syncClassToCalendar(classData(), CLASS_ID, PLAYER_ID, TEAM_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain('permission denied');
  });

  it('surfaces existing-rows fetch errors to the caller (no writes attempted)', async () => {
    adminCfg = { existingError: { message: 'db unreachable' } };
    const result = await syncClassToCalendar(classData(), CLASS_ID, PLAYER_ID, TEAM_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain('db unreachable');
    expect(opsByVerb('insert')).toHaveLength(0);
    expect(opsByVerb('delete')).toHaveLength(0);
  });
});

describe('removeClassFromCalendar — scoped removal', () => {
  beforeEach(() => {
    adminCfg = {};
    adminOps = [];
    authedUserId = 'user-1';
    playerRow = { id: PLAYER_ID };
    membershipRow = { team_id: TEAM_ID };
    membershipList = [{ team_id: TEAM_ID }, { team_id: 'team-2' }];
    vi.clearAllMocks();
  });

  it("deletes by class tag scoped to the player's own teams", async () => {
    const result = await removeClassFromCalendar(CLASS_ID);
    expect(result.success).toBe(true);

    const deleteOp = opsByVerb('delete')[0]!;
    expect(deleteOp.calls.find((c) => c.name === 'like')?.args).toEqual([
      'description',
      `%${TAG}%`,
    ]);
    expect(deleteOp.calls.find((c) => c.name === 'in')?.args).toEqual([
      'team_id',
      [TEAM_ID, 'team-2'],
    ]);
  });

  it('rejects a teamId the player is not a member of', async () => {
    const result = await removeClassFromCalendar(CLASS_ID, 'team-NOT-MINE');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Player is not a member of this team');
    expect(adminFrom).not.toHaveBeenCalled();
  });
});

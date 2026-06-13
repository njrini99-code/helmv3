import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (declared before importing the action module) ──────────────────────
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));

const resolveCoachTeamIdWithCookie = vi.fn(async () => 'team-1');
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: (...a: unknown[]) => resolveCoachTeamIdWithCookie(...(a as [])),
}));

let currentClient: unknown = null;
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => currentClient }));

import { createCourse, listCourses, saveTeamCourse, updateTee, getTeeRoundDefaults } from '../course-library';

// ── A scriptable, chainable Supabase query-builder mock ──────────────────────
type Scripted = { maybeSingle?: unknown; single?: unknown; resolve?: unknown };

function tableBuilder(scripted: Scripted = {}) {
  const calls: Record<string, unknown[][]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  const record = (m: string) => (...args: unknown[]) => { (calls[m] ||= []).push(args); return b; };
  for (const m of ['select', 'eq', 'is', 'in', 'or', 'order', 'range', 'limit', 'not', 'insert', 'upsert', 'update', 'delete']) {
    b[m] = vi.fn(record(m));
  }
  b.maybeSingle = vi.fn(async () => scripted.maybeSingle ?? { data: null, error: null });
  b.single = vi.fn(async () => scripted.single ?? { data: null, error: null });
  // Thenable: awaiting the builder (insert/update/delete without .single()) resolves here.
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(scripted.resolve ?? { data: [], error: null }).then(res, rej);
  b._calls = calls;
  return b;
}

function makeClient(user: { id: string } | null, tables: Record<string, ReturnType<typeof tableBuilder>> = {}) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn((t: string) => tables[t] ?? tableBuilder()),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveCoachTeamIdWithCookie.mockResolvedValue('team-1');
});

describe('createCourse', () => {
  it('rejects an unauthenticated caller (no destructive work)', async () => {
    currentClient = makeClient(null);
    const res = await createCourse({ name: 'Bandon Dunes' });
    expect(res).toEqual({ success: false, error: 'You must be logged in' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('DEDUPES to an existing active course instead of inserting a duplicate', async () => {
    const existing = { id: 'c-existing', name: 'Pinehurst No. 2', normalized_name: 'pinehurst 2', par: 72 };
    const courses = tableBuilder({ maybeSingle: { data: existing, error: null } });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder({ maybeSingle: { data: null, error: null } }),
      golf_courses: courses,
    });

    const res = await createCourse({ name: 'Pinehurst #2' });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.deduped).toBe(true);
      expect(res.data.course.id).toBe('c-existing');
    }
    // Critically: no INSERT happened — we linked the existing course.
    expect(courses._calls.insert).toBeUndefined();
  });

  it('inserts with normalized_name + attribution and appends a create history row', async () => {
    const created = { id: 'c-new', name: 'Bandon Dunes', normalized_name: 'bandon dunes', par: 72 };
    const courses = tableBuilder({ maybeSingle: { data: null, error: null }, single: { data: created, error: null } });
    const history = tableBuilder({ resolve: { data: null, error: null } });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder({ maybeSingle: { data: null, error: null } }),
      golf_courses: courses,
      golf_course_edit_history: history,
    });

    const res = await createCourse({ name: '  Bandon Dunes  ', city: 'Bandon' });

    expect(res.success).toBe(true);
    if (res.success) expect(res.data.deduped).toBe(false);

    const insertPayload = courses._calls.insert?.[0]?.[0] as Record<string, unknown>;
    expect(insertPayload.name).toBe('Bandon Dunes');            // trimmed
    expect(insertPayload.normalized_name).toBe('bandon dunes'); // dedup key set client-side
    expect(insertPayload.created_by_user_id).toBe('u1');        // attribution
    expect(insertPayload.last_edited_by_user_id).toBe('u1');
    expect(insertPayload.source).toBe('manual');

    const historyPayload = history._calls.insert?.[0]?.[0] as Record<string, unknown>;
    expect(historyPayload.action).toBe('create');
    expect(historyPayload.edited_by_user_id).toBe('u1');

    expect(revalidatePath).toHaveBeenCalled();
  });
});

describe('saveTeamCourse', () => {
  it('rejects a non-coach (team library is coach-managed)', async () => {
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder({ maybeSingle: { data: null, error: null } }),
    });
    const res = await saveTeamCourse('c1');
    expect(res).toEqual({ success: false, error: 'Only coaches can manage the team course library' });
  });
});

describe('listCourses', () => {
  it('returns [] for an unauthenticated caller', async () => {
    currentClient = makeClient(null);
    expect(await listCourses()).toEqual([]);
  });

  it('maps active course rows', async () => {
    const row = { id: 'c1', name: 'Pebble Beach', city: 'Pebble Beach', par: 72, normalized_name: 'pebble beach' };
    currentClient = makeClient({ id: 'u1' }, {
      golf_courses: tableBuilder({ resolve: { data: [row], error: null } }),
    });
    const res = await listCourses();
    expect(res).toHaveLength(1);
    expect(res[0]!.id).toBe('c1');
    expect(res[0]!.total_par).toBe(72);
  });

  it('sanitizes PostgREST metacharacters in the search query (no filter injection)', async () => {
    const courses = tableBuilder({ resolve: { data: [], error: null } });
    currentClient = makeClient({ id: 'u1' }, { golf_courses: courses });

    // A comma would inject an extra OR-condition bypassing the deleted_at guard.
    await listCourses({ query: 'x,deleted_at.not.is.null' });

    const orArg = courses._calls.or?.[0]?.[0] as string;
    expect(orArg).toBeDefined();
    // Exactly ONE comma — our own separator between the two ilike conditions.
    expect(orArg.split(',')).toHaveLength(2);
    expect(orArg).not.toContain(',deleted_at');
  });
});

describe('getTeeRoundDefaults (new-round loader)', () => {
  it('shapes a tee + its holes (sorted) as new-round defaults', async () => {
    const teeRow = {
      id: 't1', course_id: 'c1', tee_name: 'Blue', normalized_tee_name: 'blue',
      holes_count: 18, is_draft: false, category: 'mens', course_rating: 72.1,
      slope_rating: 132, deleted_at: null,
    };
    const holeRows = [
      { id: 'h2', tee_id: 't1', hole_number: 2, par: 4, yardage: 410, handicap_index: 5 },
      { id: 'h1', tee_id: 't1', hole_number: 1, par: 4, yardage: 400, handicap_index: 7 },
    ];
    currentClient = makeClient({ id: 'u1' }, {
      golf_course_tees: tableBuilder({ maybeSingle: { data: teeRow, error: null } }),
      golf_course_tee_holes: tableBuilder({ resolve: { data: holeRows, error: null } }),
      golf_courses: tableBuilder({ maybeSingle: { data: { name: 'Pebble Beach' }, error: null } }),
    });

    const res = await getTeeRoundDefaults('t1');
    expect(res).not.toBeNull();
    expect(res!.courseName).toBe('Pebble Beach');
    expect(res!.teeName).toBe('Blue');
    expect(res!.courseId).toBe('c1');
    expect(res!.holes.map((h) => h.holeNumber)).toEqual([1, 2]); // sorted
    expect(res!.holes[0]).toEqual({ holeNumber: 1, par: 4, yardage: 400, handicapIndex: 7 });
  });

  it('returns null for a soft-deleted tee (not offered as a default)', async () => {
    const teeRow = {
      id: 't1', course_id: 'c1', tee_name: 'Blue', normalized_tee_name: 'blue',
      holes_count: 18, is_draft: false, deleted_at: '2026-01-01T00:00:00Z',
    };
    currentClient = makeClient({ id: 'u1' }, {
      golf_course_tees: tableBuilder({ maybeSingle: { data: teeRow, error: null } }),
      golf_course_tee_holes: tableBuilder({ resolve: { data: [], error: null } }),
    });
    expect(await getTeeRoundDefaults('t1')).toBeNull();
  });
});

describe('updateTee — destructive-write guard', () => {
  it('refuses to wipe the hole set when given holes: [] (never reaches a delete)', async () => {
    const tees = tableBuilder({ maybeSingle: { data: { id: 't1', holes_count: 18, deleted_at: null }, error: null } });
    const client = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder({ maybeSingle: { data: null, error: null } }),
      golf_course_tees: tees,
    });
    currentClient = client;

    const res = await updateTee('t1', { holes: [] });

    expect(res).toEqual({ success: false, error: 'At least one valid hole is required to replace the hole set' });
    // The early return must prevent ever touching the holes table.
    expect(client.from).not.toHaveBeenCalledWith('golf_course_tee_holes');
  });
});

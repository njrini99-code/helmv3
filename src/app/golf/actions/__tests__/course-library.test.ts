import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { createCourse, createTee, listCourses, saveTeamCourse, updateTee, getTeeRoundDefaults, getTeamSavedCourses, updateCourse, restoreCourse, softDeleteCourse, getCourseTeeHoles, contributeCourseFromRound, listCoursesStrict, getCourseTeeCountsStrict, getTeamSavedCoursesStrict } from '../course-library';

/** A caller WITH a golf_coaches row — passes the course-library-write-scoping coach gate. */
const asCoach = { maybeSingle: { data: { id: 'co1', organization_id: 'org1' }, error: null } };
/** A caller with NO golf_coaches row — a player; blocked by the coach gate. */
const asPlayer = { maybeSingle: { data: null, error: null } };

// ── A scriptable, chainable Supabase query-builder mock ──────────────────────
type Scripted = {
  maybeSingle?: unknown;
  /** When a single scripted answer isn't enough (the same table is queried
   *  for two different things in one call — e.g. createCourseImpl's dedup
   *  check THEN createTeeImpl's course-exists check), consumed in order;
   *  the last entry repeats once exhausted. */
  maybeSingleSequence?: unknown[];
  single?: unknown;
  resolve?: unknown;
};

function tableBuilder(scripted: Scripted = {}) {
  const calls: Record<string, unknown[][]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  const record = (m: string) => (...args: unknown[]) => { (calls[m] ||= []).push(args); return b; };
  for (const m of ['select', 'eq', 'is', 'in', 'or', 'order', 'range', 'limit', 'not', 'insert', 'upsert', 'update', 'delete']) {
    b[m] = vi.fn(record(m));
  }
  let maybeSingleCallIndex = 0;
  b.maybeSingle = vi.fn(async () => {
    if (scripted.maybeSingleSequence) {
      const i = Math.min(maybeSingleCallIndex, scripted.maybeSingleSequence.length - 1);
      maybeSingleCallIndex += 1;
      return scripted.maybeSingleSequence[i] ?? { data: null, error: null };
    }
    return scripted.maybeSingle ?? { data: null, error: null };
  });
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

  it('rejects a non-coach (player) caller with an explicit auth error — even called directly (#36/#187)', async () => {
    const courses = tableBuilder();
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asPlayer),
      golf_courses: courses,
    });

    const res = await createCourse({ name: 'Bandon Dunes' });

    expect(res).toEqual({ success: false, error: 'Only coaches can manage the course library' });
    expect(courses._calls.insert).toBeUndefined();
  });

  it('DEDUPES to an existing active course instead of inserting a duplicate', async () => {
    const existing = { id: 'c-existing', name: 'Pinehurst No. 2', normalized_name: 'pinehurst 2', par: 72 };
    const courses = tableBuilder({ maybeSingle: { data: existing, error: null } });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asCoach),
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
      golf_coaches: tableBuilder(asCoach),
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

describe('createTee', () => {
  it('rejects a non-coach (player) caller with an explicit auth error — even called directly (#36/#187)', async () => {
    const tees = tableBuilder();
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asPlayer),
      golf_courses: tableBuilder({ maybeSingle: { data: { id: 'c1' }, error: null } }),
      golf_course_tees: tees,
    });

    const res = await createTee('c1', { teeName: 'Blue', holes: [] });

    expect(res).toEqual({ success: false, error: 'Only coaches can manage the course library' });
    expect(tees._calls.insert).toBeUndefined();
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

describe('getTeamSavedCourses — soft-delete must not leak into a team library', () => {
  it('filters soft-deleted courses AND default tees out of the saved library', async () => {
    // A saved row pointing at a course (and default tee) that have since been
    // soft-deleted from the global catalog. Every other read path filters them
    // out; loadTeamSaved must too, or a deleted course lingers in team libraries.
    const savedRow = { course_id: 'c-del', default_tee_id: 't-del', pinned: false, last_played_at: null };
    const courses = tableBuilder({ resolve: { data: [], error: null } }); // soft-deleted ⇒ filtered ⇒ none returned
    const tees = tableBuilder({ resolve: { data: [], error: null } });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder({ maybeSingle: { data: { id: 'co1', organization_id: 'org1' }, error: null } }),
      golf_team_saved_courses: tableBuilder({ resolve: { data: [savedRow], error: null } }),
      golf_courses: courses,
      golf_course_tees: tees,
    });

    const res = await getTeamSavedCourses();

    // Both backing queries scope to active rows (the fix being locked).
    expect(courses._calls.is).toContainEqual(['deleted_at', null]);
    expect(tees._calls.is).toContainEqual(['deleted_at', null]);
    // And the soft-deleted course drops out of the library entirely.
    expect(res).toEqual([]);
  });
});

describe('Phase 5 — unique normalized_name index: 23505 collision handling', () => {
  it('updateCourse surfaces a rename collision as a clear message (not a generic failure)', async () => {
    // created_by_user_id set: a user-owned course, not a library row — keeps
    // this test isolated to the 23505 collision path (see the ownership-gate
    // describe block below for the library-row-blocks-edit behavior itself).
    const before = { id: 'c1', name: 'Old Name', normalized_name: 'old name', deleted_at: null, created_by_user_id: 'u1' };
    const courses = tableBuilder({
      maybeSingle: { data: before, error: null },                              // the "before" fetch
      single: { data: null, error: { code: '23505', message: 'duplicate key' } }, // the update collides
    });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asCoach),
      golf_courses: courses,
    });

    const res = await updateCourse('c1', { name: 'Pinehurst No. 2' });
    expect(res).toEqual({ success: false, error: 'Another course already uses that name' });
  });

  it('restoreCourse refuses to un-delete into an active name collision (23505)', async () => {
    // maybeSingle: the ownership-gate lookup in setCourseDeleted — created_by_user_id
    // set so this stays a user-owned-course scenario, isolated to the 23505 path.
    const courses = tableBuilder({
      maybeSingle: { data: { id: 'c1', created_by_user_id: 'u1' }, error: null },
      resolve: { data: null, error: { code: '23505', message: 'duplicate key' } },
    });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asCoach),
      golf_courses: courses,
    });

    const res = await restoreCourse('c1');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain('Rename the active one');
  });
});

describe('contributeCourseFromRound — grow the cloud catalog from a saved round', () => {
  it('dedups to the existing course AND reuses a same-named tee (no duplicate tee insert)', async () => {
    const existingCourse = { id: 'c1', name: 'Pebble Beach', normalized_name: 'pebble beach', par: 72, deleted_at: null };
    const tees = tableBuilder({ resolve: { data: [{ id: 't1', normalized_tee_name: 'white' }], error: null } });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder({ maybeSingle: { data: null, error: null } }),
      golf_courses: tableBuilder({ maybeSingle: { data: existingCourse, error: null } }), // createCourse dedup hit
      golf_course_tees: tees,
    });

    const res = await contributeCourseFromRound({
      courseName: 'Pebble Beach',
      teeName: 'White',
      holes: [{ holeNumber: 1, par: 4, yardage: 400 }],
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.courseId).toBe('c1');
      expect(res.data.teeId).toBe('t1');
    }
    // The whole point: a same-named tee is REUSED, never re-inserted (which would
    // trip the per-course (course_id, normalized_tee_name) unique → 23505).
    expect(tees._calls.insert).toBeUndefined();
  });

  it('rejects an empty course name and writes nothing', async () => {
    const courses = tableBuilder();
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder({ maybeSingle: { data: null, error: null } }),
      golf_courses: courses,
    });
    const res = await contributeCourseFromRound({ courseName: '   ', holes: [] });
    expect(res).toEqual({ success: false, error: 'Course name is required' });
    expect(courses._calls.insert).toBeUndefined();
  });

  it('still lets a NON-COACH PLAYER insert a brand-new course + tee (#36/#187 regression guard: the coach gate on createCourse/createTee must not break round-time catalog growth)', async () => {
    const created = { id: 'c-new', name: 'Whistling Straits', normalized_name: 'whistling straits', par: 72 };
    const courses = tableBuilder({
      // 1st .maybeSingle(): createCourseImpl's dedup check — no hit, genuinely new.
      // 2nd .maybeSingle(): createTeeImpl's "does this course exist" check — yes.
      maybeSingleSequence: [{ data: null, error: null }, { data: created, error: null }],
      single: { data: created, error: null },
    });
    const tees = tableBuilder({
      resolve: { data: [], error: null }, // no existing tee of this name — genuinely new
      single: { data: { id: 't-new', tee_name: 'Blue', normalized_tee_name: 'blue' }, error: null },
      // reused by getTeeWithHoles' reload (same table, .maybeSingle()) after insert
      maybeSingle: { data: { id: 't-new', tee_name: 'Blue', normalized_tee_name: 'blue' }, error: null },
    });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asPlayer), // NOT a coach
      golf_courses: courses,
      golf_course_tees: tees,
      golf_course_tee_holes: tableBuilder({ resolve: { data: null, error: null } }),
      golf_course_tee_edit_history: tableBuilder({ resolve: { data: null, error: null } }),
    });

    const res = await contributeCourseFromRound({
      courseName: 'Whistling Straits',
      teeName: 'Blue',
      holes: [{ holeNumber: 1, par: 4, yardage: 400 }],
    });

    expect(res.success).toBe(true);
    if (res.success) expect(res.data.courseId).toBe('c-new');
    // The whole point: unlike a direct createCourse()/createTee() call, this
    // player-authored insert is NOT rejected by the coach gate.
    expect(courses._calls.insert).toBeDefined();
    expect(tees._calls.insert).toBeDefined();
  });
});

describe('strict page-load readers — failure is distinguishable from empty (P339)', () => {
  it('listCoursesStrict THROWS on a hard DB error (so error.tsx engages, not the empty state)', async () => {
    currentClient = makeClient({ id: 'u1' }, {
      golf_courses: tableBuilder({ resolve: { data: null, error: { message: 'connection reset' } } }),
    });
    await expect(listCoursesStrict({ limit: 200 })).rejects.toThrow(/listCourses failed/);
  });

  it('listCoursesStrict returns [] when the library is GENUINELY empty (no error)', async () => {
    currentClient = makeClient({ id: 'u1' }, {
      golf_courses: tableBuilder({ resolve: { data: [], error: null } }),
    });
    await expect(listCoursesStrict({ limit: 200 })).resolves.toEqual([]);
  });

  it('getCourseTeeCountsStrict THROWS on a hard DB error rather than undercounting', async () => {
    currentClient = makeClient({ id: 'u1' }, {
      golf_course_tees: tableBuilder({ resolve: { data: null, error: { message: 'timeout' } } }),
    });
    await expect(getCourseTeeCountsStrict(['c1'])).rejects.toThrow(/getCourseTeeCounts failed/);
  });

  it('getTeamSavedCoursesStrict THROWS on a hard DB error (failure ≠ "saved nothing yet")', async () => {
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder({ maybeSingle: { data: { id: 'co1', organization_id: 'org1' }, error: null } }),
      golf_team_saved_courses: tableBuilder({ resolve: { data: null, error: { message: 'permission denied' } } }),
    });
    await expect(getTeamSavedCoursesStrict()).rejects.toThrow(/getTeamSavedCourses failed/);
  });

  it('getTeamSavedCoursesStrict returns [] for a team with no saves (no error)', async () => {
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder({ maybeSingle: { data: { id: 'co1', organization_id: 'org1' }, error: null } }),
      golf_team_saved_courses: tableBuilder({ resolve: { data: [], error: null } }),
    });
    await expect(getTeamSavedCoursesStrict()).resolves.toEqual([]);
  });
});

describe('updateTee — destructive-write guard', () => {
  it('refuses to wipe the hole set when given holes: [] (never reaches a delete)', async () => {
    const tees = tableBuilder({ maybeSingle: { data: { id: 't1', holes_count: 18, deleted_at: null }, error: null } });
    const client = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asCoach),
      golf_course_tees: tees,
    });
    currentClient = client;

    const res = await updateTee('t1', { holes: [] });

    expect(res).toEqual({ success: false, error: 'At least one valid hole is required to replace the hole set' });
    // The early return must prevent ever touching the holes table.
    expect(client.from).not.toHaveBeenCalledWith('golf_course_tee_holes');
  });

  it('rejects a non-coach (player) caller with an explicit auth error (#36/#187)', async () => {
    const tees = tableBuilder({ maybeSingle: { data: { id: 't1', holes_count: 18, deleted_at: null }, error: null } });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asPlayer),
      golf_course_tees: tees,
    });

    const res = await updateTee('t1', { teeName: 'Renamed' });

    expect(res).toEqual({ success: false, error: 'Only coaches can manage the course library' });
    expect(tees._calls.update).toBeUndefined();
  });
});

describe('#913 part 2 — library-owned courses require a super admin to edit/remove', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('updateCourse blocks a non-admin coach from editing a library row (created_by_user_id null)', async () => {
    const before = {
      id: 'c1', name: 'Pinehurst No. 2', normalized_name: 'pinehurst 2',
      deleted_at: null, created_by_user_id: null,
    };
    const courses = tableBuilder({ maybeSingle: { data: before, error: null } });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asCoach),
      golf_courses: courses,
    });

    const res = await updateCourse('c1', { name: 'Renamed' });

    expect(res).toEqual({ success: false, error: 'This is a shared library course — only an admin can edit it.' });
    expect(courses._calls.update).toBeUndefined(); // never reaches the write
  });

  it('updateCourse allows a super admin (SUPER_ADMIN_USER_IDS allowlist) to edit a library row', async () => {
    vi.stubEnv('SUPER_ADMIN_USER_IDS', 'u1,someone-else');
    const before = {
      id: 'c1', name: 'Pinehurst No. 2', normalized_name: 'pinehurst 2',
      deleted_at: null, created_by_user_id: null,
    };
    const after = { ...before, name: 'Renamed', normalized_name: 'renamed' };
    const courses = tableBuilder({
      maybeSingle: { data: before, error: null },
      single: { data: after, error: null },
    });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder({ maybeSingle: { data: null, error: null } }),
      golf_courses: courses,
      golf_course_edit_history: tableBuilder({ resolve: { data: null, error: null } }),
    });

    const res = await updateCourse('c1', { name: 'Renamed' });
    expect(res.success).toBe(true);
  });

  it('updateCourse leaves a team/user-contributed course editable by any authenticated coach (open-contribution model unchanged)', async () => {
    const before = {
      id: 'c1', name: 'My Local Club', normalized_name: 'my local club',
      deleted_at: null, created_by_user_id: 'some-other-real-user',
    };
    const after = { ...before, name: 'Renamed', normalized_name: 'renamed' };
    const courses = tableBuilder({
      maybeSingle: { data: before, error: null },
      single: { data: after, error: null },
    });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asCoach),
      golf_courses: courses,
      golf_course_edit_history: tableBuilder({ resolve: { data: null, error: null } }),
    });

    const res = await updateCourse('c1', { name: 'Renamed' });
    expect(res.success).toBe(true);
  });

  it('softDeleteCourse blocks a non-admin coach from removing a library row', async () => {
    const courses = tableBuilder({
      maybeSingle: { data: { id: 'c1', created_by_user_id: null }, error: null },
    });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asCoach),
      golf_courses: courses,
    });

    const res = await softDeleteCourse('c1');

    expect(res).toEqual({ success: false, error: 'This is a shared library course — only an admin can remove it.' });
    expect(courses._calls.update).toBeUndefined();
  });

  it('softDeleteCourse allows a super admin to remove a library row', async () => {
    vi.stubEnv('SUPER_ADMIN_USER_IDS', 'u1');
    const courses = tableBuilder({
      maybeSingle: { data: { id: 'c1', created_by_user_id: null }, error: null },
      resolve: { data: null, error: null },
    });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder({ maybeSingle: { data: null, error: null } }),
      golf_courses: courses,
      golf_course_edit_history: tableBuilder({ resolve: { data: null, error: null } }),
    });

    const res = await softDeleteCourse('c1');
    expect(res.success).toBe(true);
  });

  it('softDeleteCourse leaves a team/user-contributed course removable by any authenticated coach (open-contribution model unchanged)', async () => {
    const courses = tableBuilder({
      maybeSingle: { data: { id: 'c1', created_by_user_id: 'some-other-real-user' }, error: null },
      resolve: { data: null, error: null },
    });
    currentClient = makeClient({ id: 'u1' }, {
      golf_coaches: tableBuilder(asCoach),
      golf_courses: courses,
      golf_course_edit_history: tableBuilder({ resolve: { data: null, error: null } }),
    });

    const res = await softDeleteCourse('c1');
    expect(res.success).toBe(true);
  });
});

describe('getCourseTeeHoles — #913 part 3 (course detail "Holes" summary)', () => {
  it('returns {} for an unauthenticated caller', async () => {
    currentClient = makeClient(null);
    expect(await getCourseTeeHoles('c1')).toEqual({});
  });

  it('returns {} when the course has no active tees (skips the holes query)', async () => {
    const tees = tableBuilder({ resolve: { data: [], error: null } });
    const client = makeClient({ id: 'u1' }, { golf_course_tees: tees });
    currentClient = client;

    expect(await getCourseTeeHoles('c1')).toEqual({});
    expect(client.from).not.toHaveBeenCalledWith('golf_course_tee_holes');
  });

  it('groups hole rows by tee_id, scoped to only this course’s active tee ids', async () => {
    const tees = tableBuilder({ resolve: { data: [{ id: 't1' }, { id: 't2' }], error: null } });
    const holes = tableBuilder({
      resolve: {
        data: [
          { id: 'h1', tee_id: 't1', hole_number: 1, par: 4, yardage: 400, handicap_index: 7 },
          { id: 'h2', tee_id: 't2', hole_number: 1, par: 5, yardage: 520, handicap_index: 3 },
          { id: 'h3', tee_id: 't1', hole_number: 2, par: 3, yardage: 175, handicap_index: 15 },
        ],
        error: null,
      },
    });
    currentClient = makeClient({ id: 'u1' }, { golf_course_tees: tees, golf_course_tee_holes: holes });

    const res = await getCourseTeeHoles('c1');

    expect(res['t1']).toHaveLength(2);
    expect(res['t2']).toHaveLength(1);
    expect(res['t1']![0]!.hole_number).toBe(1);
    expect(res['t1']![1]!.hole_number).toBe(2);
    expect(holes._calls.in).toContainEqual(['tee_id', ['t1', 't2']]);
  });
});

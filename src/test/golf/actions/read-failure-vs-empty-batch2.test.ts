import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Two more reads that turned a failure into a confident "there is nothing here".
 *
 * The course library is the sharper of the two, because the strict loader's own
 * docstring says it exists so that a failure "can't masquerade as 'this team has
 * saved nothing yet'" — and that guarantee covered only the first of its two
 * reads. The second one resolves each saved row's course, and any row whose
 * course is missing is dropped, so a failed courses read produced exactly the
 * empty library the strict variant was written to prevent.
 *
 * Task reminders is the same shape: two identity lookups whose errors were
 * discarded, feeding a filter where a null id fails every clause.
 */

const logServerError = vi.fn(async () => {});
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({ data: null, error: { message, code } });

function chain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    is: self,
    gte: self,
    order: self,
    limit: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => chain(table),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

const SAVED_ROW = { id: 's1', team_id: 't1', course_id: 'c1', default_tee_id: null, pinned: false, last_played_at: null };
const COURSE_ROW = { id: 'c1', name: 'Pinehurst No. 2', city: 'Pinehurst', state: 'NC', deleted_at: null };

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_coaches', ok({ id: 'coach1', organization_id: 'o1' }));
  outcomes.set('golf_players', ok({ id: 'p1' }));
  outcomes.set('golf_team_members', ok({ team_id: 't1' }));
  outcomes.set('golf_team_saved_courses', ok([SAVED_ROW]));
  outcomes.set('golf_courses', ok([COURSE_ROW]));
  outcomes.set('golf_course_tees', ok([]));
});

describe('course library — a failed course resolve is not an empty library', () => {
  it('throws when the courses fetch fails, honouring the strict loader’s own promise', async () => {
    outcomes.set('golf_courses', fails('statement timeout', '57014'));
    const { getTeamSavedCoursesStrict } = await import('@/app/golf/actions/course-library');

    await expect(getTeamSavedCoursesStrict()).rejects.toThrow(/resolving saved courses/i);
  });

  it('still returns the saved library when every read succeeds', async () => {
    const { getTeamSavedCoursesStrict } = await import('@/app/golf/actions/course-library');

    const rows = await getTeamSavedCoursesStrict();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.course?.name).toBe('Pinehurst No. 2');
  });

  it('the lenient reader stays lenient but stops failing in silence', async () => {
    outcomes.set('golf_courses', fails('permission denied', '42501'));
    const { getTeamSavedCourses } = await import('@/app/golf/actions/course-library');

    const rows = await getTeamSavedCourses();

    expect(rows).toEqual([]);
    expect(
      logServerError.mock.calls.some((call) => /course\/tee resolve failed/.test(String((call as unknown[])[0]))),
    ).toBe(true);
  });
});

describe('task reminders — not knowing who you are is not "nothing is due"', () => {
  it('fails instead of silently filtering every reminder away', async () => {
    outcomes.set('golf_coaches', fails('connection terminated'));
    const { getUpcomingReminders } = await import('@/app/golf/actions/task-reminders');

    const result = await getUpcomingReminders('u1');

    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    expect(
      logServerError.mock.calls.some((call) => /identity lookup failed/.test(String((call as unknown[])[0]))),
    ).toBe(true);
  });

  it('a user who is genuinely neither coach nor player still gets a clean empty list', async () => {
    outcomes.set('golf_coaches', ok(null));
    outcomes.set('golf_players', ok(null));
    outcomes.set('golf_task_reminders', ok([]));
    const { getUpcomingReminders } = await import('@/app/golf/actions/task-reminders');

    const result = await getUpcomingReminders('u1');

    expect(result.error).toBeFalsy();
    expect(result.data).toEqual([]);
    expect(
      logServerError.mock.calls.some((call) => /identity lookup failed/.test(String((call as unknown[])[0]))),
    ).toBe(false);
  });
});

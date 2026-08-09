import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Four existence/dedup guards in the Cloud Course Library discarded their
 * error, and each one turns a failed read into a WRONG WRITE — not a wrong
 * message, an actual bad row.
 *
 *  - createCourse's dedup read: a failure looks like "no such course", so it
 *    mints a DUPLICATE into the library every team shares.
 *  - saveTeamCourse's existing-row read: a failure looks like "nothing saved
 *    yet", so the upsert overwrites the team's default tee and pinned state
 *    with defaults and reassigns created_by_user_id.
 *  - updateTee's existingHoles read: a failure looks like "no holes", so a
 *    COMPLETE tee set is silently flipped back to is_draft.
 *  - the tee-reuse read: a failure looks like "no such tee", so it tries to
 *    create one that exists and the coach gets a spurious failure.
 *
 * These are the ones worth fixing. Most unchecked reads in this file are coach
 * identity lookups whose failure produces a misleading refusal — annoying, but
 * fail-closed. These four write.
 */

const logServerError = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (d: unknown): Outcome => ({ data: d, error: null });
const fails = (m: string, code = '08006'): Outcome => ({ data: null, error: { message: m, code } });

/** Rows the code tried to INSERT — a duplicate here is the bug. */
const inserted: Array<{ table: string; payload: unknown }> = [];

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const settleSingle = () => outcomes.get(`${table}:single`) ?? outcomes.get(table) ?? ok(null);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, is: self, in: self, order: self, limit: self, update: self,
    insert: (p: unknown) => { inserted.push({ table, payload: p }); return node; },
    upsert: (p: unknown) => { inserted.push({ table, payload: p }); return node; },
    single: async () => settleSingle(),
    maybeSingle: async () => settleSingle(),
    then: (r: (v: Outcome) => unknown, j?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(r, j),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (t: string) => tableChain(t),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

async function createCourse(name: string) {
  const mod = await import('@/app/golf/actions/course-library');
  return mod.createCourse({ name } as never);
}

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  inserted.length = 0;
  // getActor() gates on a coach row; without it every case below returns
  // "Only coaches can manage the course library" and proves nothing.
  outcomes.set('golf_coaches:single', ok({ id: 'coach-1', organization_id: 'org-1' }));
  outcomes.set('golf_courses:single', ok(null));
  outcomes.set('golf_courses', ok([]));
});

describe('createCourse dedup — a failed read must not mint a duplicate', () => {
  it('does not insert when the dedup read failed', async () => {
    outcomes.set('golf_courses:single', fails('statement timeout', '57014'));

    const res = await createCourse('Wolf Laurel');

    expect(res.success).toBe(false);
    // The bug: pre-fix this fell through and INSERTed a second Wolf Laurel into
    // the library every team shares.
    expect(inserted.filter((i) => i.table === 'golf_courses')).toEqual([]);
  });

  it('records the cause', async () => {
    outcomes.set('golf_courses:single', fails('permission denied', '42501'));

    await createCourse('Wolf Laurel');

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    // Deliberately narrow: the pre-existing "createCourse failed" log also
    // fires on this path, so a loose regex would pass without the fix.
    expect(said.some((m) => /dedup read failed/i.test(m))).toBe(true);
  });
});

describe('createCourse dedup — the honest paths are unchanged', () => {
  it('still returns the existing course as a dedup hit', async () => {
    outcomes.set('golf_courses:single', ok({ id: 'c1', name: 'Wolf Laurel', normalized_name: 'wolf laurel' }));

    const res = await createCourse('Wolf Laurel');

    expect(res.success).toBe(true);
    expect(inserted.filter((i) => i.table === 'golf_courses')).toEqual([]);
  });
});

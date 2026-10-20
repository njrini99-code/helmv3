/**
 * P011: when createTee's tee-holes insert fails, the just-inserted tee is
 * soft-deleted. golf_course_tees_update requires is_golf_coach() OR
 * is_super_admin(), so on the session client a PLAYER's rollback (the
 * contributeCourseFromRound path, skipCoachGate) was filtered to zero rows with
 * no error and a holeless tee stayed live. The rollback now runs on the
 * service-role client, scoped to the tee id this call just inserted, its
 * creator, and a still-live row; a failed rollback is logged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const { logServerError } = vi.hoisted(() => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));

let currentClient: unknown = null;
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => currentClient }));
let adminClient: unknown = null;
const createAdminClient = vi.fn(() => {
  if (adminClient instanceof Error) throw adminClient;
  return adminClient;
});
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }));

import { contributeCourseFromRound } from '../course-library';

type Scripted = { maybeSingle?: unknown; maybeSingleSequence?: unknown[]; single?: unknown; resolve?: unknown };

function tableBuilder(scripted: Scripted = {}) {
  const calls: Record<string, unknown[][]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  const record = (m: string) => (...args: unknown[]) => { (calls[m] ||= []).push(args); return b; };
  for (const m of ['select', 'eq', 'is', 'in', 'or', 'order', 'range', 'limit', 'not', 'insert', 'upsert', 'update', 'delete']) {
    b[m] = vi.fn(record(m));
  }
  let i = 0;
  b.maybeSingle = vi.fn(async () => {
    if (scripted.maybeSingleSequence) {
      const v = scripted.maybeSingleSequence[Math.min(i, scripted.maybeSingleSequence.length - 1)];
      i += 1;
      return v ?? { data: null, error: null };
    }
    return scripted.maybeSingle ?? { data: null, error: null };
  });
  b.single = vi.fn(async () => scripted.single ?? { data: null, error: null });
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(scripted.resolve ?? { data: [], error: null }).then(res, rej);
  b._calls = calls;
  return b;
}

function makeClient(user: { id: string } | null, tables: Record<string, ReturnType<typeof tableBuilder>>) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn((t: string) => tables[t] ?? tableBuilder()),
  };
}

/** A player (no golf_coaches row) contributing a brand-new course + tee whose holes insert fails. */
function playerWithFailingHoles() {
  const created = { id: 'c-new', name: 'Whistling Straits', normalized_name: 'whistling straits', par: 72 };
  const sessionTees = tableBuilder({
    resolve: { data: [], error: null },
    single: { data: { id: 't-new', tee_name: 'Blue', normalized_tee_name: 'blue' }, error: null },
  });
  currentClient = makeClient({ id: 'u1' }, {
    golf_coaches: tableBuilder({ maybeSingle: { data: null, error: null } }),
    golf_courses: tableBuilder({
      maybeSingleSequence: [{ data: null, error: null }, { data: created, error: null }],
      single: { data: created, error: null },
    }),
    golf_course_tees: sessionTees,
    golf_course_tee_holes: tableBuilder({ resolve: { data: null, error: { message: 'boom', code: '23514' } } }),
  });
  return sessionTees;
}

const input = { courseName: 'Whistling Straits', teeName: 'Blue', holes: [{ holeNumber: 1, par: 4, yardage: 400 }] };

beforeEach(() => {
  vi.clearAllMocks();
  adminClient = null;
});

describe('createTee rollback after a failed tee-holes insert (P011)', () => {
  it("soft-deletes a PLAYER's just-created tee on the service-role client, scoped to that tee, its creator and a live row", async () => {
    const sessionTees = playerWithFailingHoles();
    const adminTees = tableBuilder({ resolve: { data: [{ id: 't-new' }], error: null } });
    adminClient = makeClient(null, { golf_course_tees: adminTees });

    const res = await contributeCourseFromRound(input);

    // The facility link still lands; the tee is dropped (teeId null).
    expect(res).toEqual({ success: true, data: { courseId: 'c-new', teeId: null } });
    // The session client (refused by golf_course_tees_update for a player) is not used for the rollback.
    expect(sessionTees._calls.update).toBeUndefined();
    expect(adminTees._calls.update?.[0]?.[0]).toEqual({ deleted_at: expect.any(String) });
    expect(adminTees._calls.eq).toEqual([['id', 't-new'], ['created_by_user_id', 'u1']]);
    expect(adminTees._calls.is).toEqual([['deleted_at', null]]);
    expect(adminTees._calls.select).toEqual([['id']]);
    expect(logServerError).not.toHaveBeenCalledWith(expect.stringContaining('rollback'), expect.anything());
  });

  it('logs when the rollback updates no row', async () => {
    playerWithFailingHoles();
    adminClient = makeClient(null, { golf_course_tees: tableBuilder({ resolve: { data: [], error: null } }) });

    const res = await contributeCourseFromRound(input);

    expect(res).toEqual({ success: true, data: { courseId: 'c-new', teeId: null } });
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('createTee rollback failed'),
      expect.objectContaining({ action: 'createTee', extra: expect.objectContaining({ teeId: 't-new', courseId: 'c-new' }) }),
    );
  });

  it('logs, and still returns its clean result, when the rollback errors or the admin client cannot be built', async () => {
    playerWithFailingHoles();
    adminClient = makeClient(null, {
      golf_course_tees: tableBuilder({ resolve: { data: null, error: { message: 'down', code: '57014' } } }),
    });
    await expect(contributeCourseFromRound(input)).resolves.toEqual({ success: true, data: { courseId: 'c-new', teeId: null } });
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('createTee rollback failed'),
      expect.objectContaining({ extra: expect.objectContaining({ teeId: 't-new', code: '57014' }) }),
    );

    vi.clearAllMocks();
    playerWithFailingHoles();
    adminClient = new Error('SUPABASE_SECRET_KEY missing');
    await expect(contributeCourseFromRound(input)).resolves.toEqual({ success: true, data: { courseId: 'c-new', teeId: null } });
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('createTee rollback threw'),
      expect.objectContaining({ extra: expect.objectContaining({ teeId: 't-new' }) }),
    );
  });
});

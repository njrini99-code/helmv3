import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The course library's coach gate is resolved by one read of `golf_coaches`,
 * and that read discarded its error.
 *
 * Keeping a caller OUT when the check could not run is correct, and is kept —
 * an authorization check that did not complete has not passed. The defect was
 * the sentence: a dropped connection told a coach "Only coaches can manage the
 * course library". That is a statement about who they are, it is false, and it
 * offers nothing to do about it. Meanwhile the read failure itself left no
 * trace, so a run of them looked like players poking at coach controls.
 *
 * A player who genuinely has no coach row must still get the original message —
 * that one is true, and softening it into "try again" would send someone back
 * to retry a thing that will never work.
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

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok(null);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    is: self,
    in: self,
    order: self,
    limit: self,
    insert: self,
    update: self,
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
    from: (table: string) => tableChain(table),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

async function create() {
  const { createCourse } = await import('@/app/golf/actions/course-library');
  return createCourse({ name: 'Sedgefield Country Club' });
}

/**
 * `Result<T>` is a discriminated union and `expect(...).toBe(false)` does not
 * narrow it. Assert the refusal once, here, and hand back the branch that
 * actually carries `error`.
 */
type Refusal = { success: false; error: string };
function refused(result: Awaited<ReturnType<typeof create>>): Refusal {
  expect(result.success).toBe(false);
  return result as Refusal;
}

describe('course-library coach gate — a failed lookup is not a verdict on the user', () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
    // No SUPER_ADMIN_USER_IDS in the test env, so the super-admin escape hatch
    // stays shut and the gate itself is what is under test.
    delete process.env.SUPER_ADMIN_USER_IDS;
  });

  it('does not tell a coach they are not a coach when the read failed', async () => {
    outcomes.set('golf_coaches', fails('connection reset'));

    // Still refused — that part was never the bug.
    const result = refused(await create());

    expect(result.error).toMatch(/Couldn't verify your coach access/);
    expect(result.error).not.toMatch(/Only coaches can manage/);
  });

  it('records the cause, so a run of refusals is not read as player misuse', async () => {
    outcomes.set('golf_coaches', fails('permission denied', '42501'));

    await create();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /coach lookup failed/.test(m))).toBe(true);
  });

  it('a genuine non-coach still gets the message that is actually true', async () => {
    // No row, no error — this person really is not a coach. Turning this into
    // "try again" would send them back to retry something that cannot succeed.
    outcomes.set('golf_coaches', ok(null));

    const result = refused(await create());

    expect(result.error).toMatch(/Only coaches can manage the course library/);
  });
});

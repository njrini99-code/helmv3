import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

/**
 * `src/app/golf/(dashboard)/layout.tsx` — the post-onboarding retry branch.
 *
 * This branch (the `else` reached only when NEITHER profile has
 * `onboarding_completed`) used to `await setTimeout(300)` unconditionally
 * before re-reading the profiles. The wait is real protection against
 * eventual consistency after an onboarding write, but it was paid even when
 * the row was already visible. It now reads FIRST and sleeps only on a miss.
 *
 * Nothing covered this layout before — the file that looks like its test,
 * `dashboard-player-team-read.test.ts`, covers `dashboard/page.tsx`. So the
 * full unit suite produced byte-identical results before and after that
 * change, which proves absence of coverage, not safety. These three cases are
 * the ones that distinguish the new shape from the old:
 *
 *   1. row already visible  → NO 300ms wait is paid   (the behavior change)
 *   2. row lands late       → the wait still happens and the retry sees it
 *                             (the protection that must survive)
 *   3. reads ERROR          → the profile already in hand is NOT clobbered
 *                             (the fail-open regression class this repo has
 *                             a documented history of: a failed read
 *                             rendering as "you have no team"/"no profile")
 *
 * Fake timers throughout, so case 2 does not really sleep.
 */

const logServerError = vi.fn(async () => {});
const redirect = vi.fn((path: string) => {
  const err = new Error(`REDIRECT:${path}`);
  (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${path}`;
  throw err;
});

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

// The client shell and the theme boot are irrelevant here — stub them so the
// layout's returned tree is cheap to inspect.
vi.mock('@/app/golf/(dashboard)/FairwayDashboardShell', () => ({
  FairwayDashboardShell: function FairwayDashboardShell() {
    return null;
  },
}));
vi.mock('@/components/golf/theme/ThemeApplier', () => ({
  ThemeApplier: function ThemeApplier() {
    return null;
  },
}));

// Team resolution is a separate concern with its own coverage
// (resolve-team-failure-vs-finding.test.ts). Pin it so these cases isolate the
// retry branch.
vi.mock('@/lib/golf/resolve-team', () => ({
  resolveCoachActiveTeamId: vi.fn(async () => 'team-1'),
  getCoachTeamSwitchContext: vi.fn(async () => ({
    teams: [{ id: 'team-1', name: 'Demo University', gender: 'mens' }],
    isHeadCoach: false,
    canSwitch: false,
  })),
}));
vi.mock('@/app/golf/actions/team-switcher', () => ({
  getActiveTeamCookie: vi.fn(async () => null),
}));

// --- session -----------------------------------------------------------------
type GolfSession = {
  userId: string;
  role: 'coach' | 'player' | null;
  coach: Record<string, unknown> | null;
  player: Record<string, unknown> | null;
};
let session: GolfSession;
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => session,
}));

// --- supabase ----------------------------------------------------------------
type Outcome = { data: unknown; error: unknown };
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({
  data: null,
  error: { message, code },
});

/**
 * Per-table QUEUE of outcomes, so one table can answer differently on the
 * first and second attempt — which is the whole point of these cases. The
 * last entry repeats once the queue is down to one.
 */
const queues = new Map<string, Outcome[]>();
const callCounts = new Map<string, number>();

function nextOutcome(table: string): Outcome {
  callCounts.set(table, (callCounts.get(table) ?? 0) + 1);
  const q = queues.get(table);
  if (!q || q.length === 0) return ok(null);
  return q.length === 1 ? q[0]! : q.shift()!;
}

function tableChain(table: string) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, is: self, not: self, or: self, neq: self,
    gt: self, lt: self, gte: self, lte: self, order: self, limit: self, filter: self,
    single: async () => nextOutcome(table),
    maybeSingle: async () => nextOutcome(table),
    then: (res: (v: Outcome) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(nextOutcome(table)).then(res, rej),
  });
  return node;
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (t: string) => tableChain(t),
  rpc: async () => ({ data: null, error: null }),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

// --- helpers -----------------------------------------------------------------
const ONBOARDED_COACH = {
  id: 'coach-1',
  user_id: 'u1',
  full_name: 'Rick Nini',
  avatar_url: null,
  organization_id: 'org-1',
  onboarding_completed: true,
};

/**
 * Imported ONCE, up front, and deliberately never `vi.resetModules()`d.
 *
 * A dynamic `import()` settles on the macrotask queue, not the microtask
 * queue, so importing inside a case would never complete under
 * `flushMicrotasks()` — every case would look "still waiting" whether or not
 * a timer was actually pending, which is precisely the signal these tests
 * read. The layout holds no module state; all per-case state lives in
 * `session` and `queues`, which the mocks read at call time.
 */
let Layout: (p: { children: unknown }) => Promise<unknown>;

beforeAll(async () => {
  const mod = await import('@/app/golf/(dashboard)/layout');
  Layout = mod.default as (p: { children: unknown }) => Promise<unknown>;
}, 60_000);

function renderLayout() {
  return Layout({ children: null });
}

/** Drain the microtask queue without letting any faked timer fire. */
async function flushMicrotasks(times = 100) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Find the node carrying `userData` in the returned element tree. */
function userDataOf(tree: unknown): Record<string, unknown> | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    const props = (node as { props?: Record<string, unknown> }).props;
    if (props && typeof props === 'object') {
      if (props.userData) return props.userData as Record<string, unknown>;
      const kids = props.children;
      for (const kid of Array.isArray(kids) ? kids : [kids]) {
        const hit = walk(kid);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(tree);
}

beforeEach(() => {
  vi.useFakeTimers();
  logServerError.mockClear();
  redirect.mockClear();
  queues.clear();
  callCounts.clear();
  // Neither profile onboarded ⇒ the retry branch. This is the ONLY way in;
  // an onboarded coach or player takes the fast path and never reaches it.
  session = { userId: 'u1', role: null, coach: null, player: null };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('golf dashboard layout — retry branch pays the 300ms wait only on a miss', () => {
  it('does NOT wait when the first read already returns the profile', async () => {
    queues.set('users', [ok({ role: 'coach' })]);
    queues.set('golf_coaches', [ok(ONBOARDED_COACH)]);
    queues.set('golf_players', [ok(null)]);

    let settled = false;
    const pending = renderLayout().then((tree) => {
      settled = true;
      return tree;
    });

    // No timer is advanced anywhere in this test. Under fake timers, a
    // `setTimeout(300)` on this path would leave the promise unsettled.
    await flushMicrotasks();

    expect(settled).toBe(true);
    expect(callCounts.get('golf_coaches')).toBe(1);
    expect(userDataOf(await pending)).toMatchObject({
      role: 'coach',
      name: 'Rick Nini',
      teamName: 'Demo University',
    });
  });

  it('still waits, and still picks the profile up, when the row lands late', async () => {
    queues.set('users', [ok({ role: 'coach' })]);
    // Empty on the first attempt, present on the second — the eventual
    // consistency window this branch exists to cover.
    queues.set('golf_coaches', [ok(null), ok(ONBOARDED_COACH)]);
    queues.set('golf_players', [ok(null)]);

    let settled = false;
    const pending = renderLayout().then((tree) => {
      settled = true;
      return tree;
    });

    await flushMicrotasks();
    // The protection must be REAL: with the row still missing, the layout is
    // parked on the timer and has not resolved.
    expect(settled).toBe(false);
    expect(callCounts.get('golf_coaches')).toBe(1);

    await vi.advanceTimersByTimeAsync(300);
    await flushMicrotasks();

    expect(settled).toBe(true);
    expect(callCounts.get('golf_coaches')).toBe(2);
    expect(userDataOf(await pending)).toMatchObject({ role: 'coach', name: 'Rick Nini' });
  });
});

describe('golf dashboard layout — a failed read must not fail open', () => {
  it('keeps the profile already in hand when both retry reads error', async () => {
    // A coach who exists but has not finished onboarding: the branch is
    // entered, and `coach` is already populated from the session.
    session = {
      userId: 'u1',
      role: null,
      coach: { ...ONBOARDED_COACH, onboarding_completed: false },
      player: null,
    };
    queues.set('users', [ok({ role: 'coach' })]);
    queues.set('golf_coaches', [fails('connection reset')]);
    queues.set('golf_players', [fails('connection reset')]);

    const pending = renderLayout().catch((e: Error) => e);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(300);
    await flushMicrotasks();
    await pending;

    // Had the failed read overwritten `coach` with its null `data`, the
    // resolved role would have collapsed to null and this would be
    // '/golf/signup' — telling a real coach to create an account.
    expect(redirect).toHaveBeenCalledWith('/golf/coach');
    expect(redirect).not.toHaveBeenCalledWith('/golf/signup');
  });

  it('records a failed role read instead of silently reading it as "not an admin"', async () => {
    queues.set('users', [fails('permission denied', '42501')]);
    queues.set('golf_coaches', [ok(null)]);
    queues.set('golf_players', [ok(null)]);

    const pending = renderLayout().catch((e: Error) => e);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(300);
    await flushMicrotasks();
    await pending;

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /role lookup failed/i.test(m))).toBe(true);
    // No profile and no readable role is genuinely "start onboarding" — but it
    // must be reached with the failure recorded, not inferred from silence.
    expect(redirect).toHaveBeenCalledWith('/golf/signup');
  });
});

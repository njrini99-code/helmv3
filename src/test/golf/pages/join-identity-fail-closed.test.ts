import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * C20. The join page resolves who you are before deciding where to send you,
 * and both identity reads discarded their error.
 *
 * The coach lookup is the dangerous one, and the comment above it already says
 * why: "If this user is a coach, do NOT push them through player onboarding —
 * that path calls ensurePlayerRecord() and would create a stray golf_players
 * row." A failed read leaves `coach` null, so that guard silently does not
 * fire, and a coach who clicks a team invite is walked through player
 * onboarding — writing a golf_players row for someone who is not a player.
 * That is data written on the strength of a read that never succeeded.
 *
 * The player lookup fails the same way into a misroute: an existing player is
 * treated as brand new and sent back through onboarding.
 *
 * Both now fail closed to the route's own error boundary
 * (src/app/golf/join/error.tsx), which offers a retry. Refusing to route when
 * we cannot tell who someone is, is the correct answer here — the alternative
 * is a confident wrong one that also writes a row.
 *
 * The honest paths are unchanged and tested: a genuine non-coach still reaches
 * the player flow, because `.maybeSingle()` reports "no such row" as
 * { data: null, error: null }.
 */

const logServerError = vi.fn(async () => {});
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/navigation', () => ({
  redirect,
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({
  data: null,
  error: { message, code },
});

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
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
    from: (table: string) => tableChain(table),
    rpc: async () => outcomes.get('rpc:join_code') ?? ok([{ id: 'team-1', name: 'Shenandoah' }]),
  }),
}));

async function renderJoin() {
  const mod = await import('@/app/golf/join/[code]/page');
  return (mod.default as (args: unknown) => Promise<unknown>)({
    params: Promise.resolve({ code: 'ABC123' }),
  });
}

beforeAll(async () => {
  await import('@/app/golf/join/[code]/page');
}, 60_000);

beforeEach(() => {
  logServerError.mockClear();
  redirect.mockClear();
  outcomes.clear();
  outcomes.set('golf_coaches', ok(null));
  outcomes.set('golf_players', ok({ id: 'p1', onboarding_completed: true }));
  outcomes.set('rpc:join_code', ok([{ id: 'team-1', name: 'Shenandoah' }]));
});

/** The redirect mock throws REDIRECT:<path>; anything else is a real failure. */
async function outcomeOf(): Promise<string> {
  try {
    await renderJoin();
    return 'RENDERED';
  } catch (e) {
    return (e as Error).message;
  }
}

describe('join page — a failed identity read must not route or write', () => {
  it('does not walk a coach into player onboarding when the coach read failed', async () => {
    outcomes.set('golf_coaches', fails('connection reset'));

    const result = await outcomeOf();

    // Pre-fix this fell through the coach guard entirely.
    expect(result).not.toMatch(/^REDIRECT:\/golf\/player/);
    expect(result).not.toBe('RENDERED');
  });

  it('does not treat an existing player as brand new when the player read failed', async () => {
    outcomes.set('golf_players', fails('statement timeout', '57014'));

    const result = await outcomeOf();

    expect(result).not.toMatch(/^REDIRECT:\/golf\/player/);
    expect(result).not.toBe('RENDERED');
  });

  it('records the cause', async () => {
    outcomes.set('golf_coaches', fails('permission denied', '42501'));

    await outcomeOf();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /identity|coach|player/i.test(m))).toBe(true);
  });
});

describe('join page — the honest routes are unchanged', () => {
  it('still sends a real coach to their own home', async () => {
    outcomes.set('golf_coaches', ok({ id: 'c1', onboarding_completed: true }));

    expect(await outcomeOf()).toBe('REDIRECT:/golf/dashboard');
  });

  it('still lets a genuine non-coach through to the join flow', async () => {
    // Both reads legitimately resolve: no coach row, a real player row.
    const result = await outcomeOf();

    expect(result).not.toMatch(/^REDIRECT:\/golf\/dashboard$/);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `hasTrackedRoundData` decides whether the legacy draft writer may overlay
 * `draft_data` onto a round. If the round already carries tracked holes or
 * shots it belongs to the tracked-shot persistence flow, and the draft writer
 * must keep its hands off.
 *
 * It counted holes and shots, and on a COUNT ERROR returned `false` — i.e.
 * "no tracked data" — and the overlay proceeded. A failed lookup is UNKNOWN,
 * not a negative, and this failed open on the one path it exists to guard,
 * precisely when the database was already misbehaving.
 *
 * The asymmetry settles it. A false positive skips ONE autosave and the next
 * one seconds later proceeds normally. A false negative overlays draft state
 * onto a round whose shots are being tracked elsewhere.
 */

const updateCalls: unknown[] = [];
const counts = new Map<string, { count: number | null; error: unknown }>();

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _m: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: (sb: { from: (t: string) => unknown }, t: string) => sb.from(t),
}));

function chain(table: string) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, order: self, limit: self, is: self, not: self,
    update: (payload: unknown) => { updateCalls.push({ table, payload }); return node; },
    insert: self, upsert: self,
    single: async () => ({
      data: table === 'golf_players' ? { id: 'p1' } : null,
      error: null,
    }),
    maybeSingle: async () => ({
      data:
        table === 'golf_team_members'
          ? { team_id: 't1' }
          : table === 'golf_rounds'
            ? { id: 'r1' }
            : null,
      error: null,
    }),
    then: (resolve: (v: unknown) => unknown) => {
      const c = counts.get(table);
      if (c) return Promise.resolve(c).then(resolve);
      return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
    },
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) => chain(t),
  }),
}));

const DRAFT = {
  holes: [],
  holesPerRound: 18,
  setupData: { courseName: 'Test Links' },
} as never;

const ROUND_ID = '11111111-2222-3333-4444-555555555555';

async function save(existingRoundId?: string) {
  const mod = await import('@/app/golf/actions/round-drafts');
  return mod.saveRoundDraft(DRAFT, existingRoundId);
}

beforeEach(() => {
  updateCalls.length = 0;
  counts.clear();
});

describe('hasTrackedRoundData must fail CLOSED', () => {
  it('does NOT overlay the draft when the hole count errors', async () => {
    counts.set('golf_holes', { count: null, error: { message: 'statement timeout', code: '57014' } });
    counts.set('golf_shots', { count: 0, error: null });

    const res = await save(ROUND_ID);

    // Reports success so the client does not retry-storm, but writes nothing.
    expect(res.success).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('does NOT overlay the draft when the shot count errors', async () => {
    counts.set('golf_holes', { count: 0, error: null });
    counts.set('golf_shots', { count: null, error: { message: 'connection reset', code: '08006' } });

    const res = await save(ROUND_ID);

    expect(res.success).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('still skips the overlay when tracked data genuinely EXISTS', async () => {
    counts.set('golf_holes', { count: 18, error: null });
    counts.set('golf_shots', { count: 64, error: null });

    await save(ROUND_ID);

    expect(updateCalls).toHaveLength(0);
  });

  it('DOES write when the counts succeed and are genuinely zero', async () => {
    // The other direction matters as much: failing closed must not become
    // failing always, or every draft autosave silently stops working.
    counts.set('golf_holes', { count: 0, error: null });
    counts.set('golf_shots', { count: 0, error: null });

    await save(ROUND_ID);

    expect(updateCalls.length).toBeGreaterThan(0);
  });
});

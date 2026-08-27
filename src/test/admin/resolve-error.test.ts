import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * admin_events has carried resolved/resolved_at/resolved_by since it was
 * created, and the admin surface reads all three — but nothing in the product
 * could write them, so every error ever logged stayed unresolved forever.
 *
 * A defect fixed and deployed weeks ago therefore sat in the dashboard beside
 * one that broke five minutes ago, indistinguishable. That is what made the
 * channel untrustworthy, and an untrustworthy channel is how the Stripe webhook
 * failure went unnoticed for three days.
 *
 * Unified 2026-08-25: resolveErrorFingerprint no longer writes directly via a
 * service-role UPDATE. It does a service-role READ to find the still-open
 * event ids for the fingerprint, then resolves them through the SAME
 * user-scoped resolve_admin_event() RPC path resolveTriageEvents uses, with
 * the same resolve-failure translation and the same nav-badge cache bust.
 * These tests cover that pipeline, including the RPC-failure translation.
 */

const requireSuperAdmin = vi.fn(async () => ({ userId: 'admin-1', email: 'a@b.c' }));
const logServerError = vi.fn(async () => {});
const revalidatePath = vi.fn();
const updateTag = vi.fn();

vi.mock('@/lib/admin/require-super-admin', () => ({ requireSuperAdmin }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath,
  revalidateTag: vi.fn(),
  updateTag,
}));
vi.mock('@/lib/admin/data/overview', () => ({ BRIDGE_INCIDENT_CACHE_TAG: 'bridge-incidents' }));

// ─── service-role READ: admin.from('admin_events').select('id').eq(...).eq(...) ──
let readOutcome: { data: unknown; error: unknown } = {
  // created_at added 2026-08-27: the action selects `id, created_at`, orders
  // DESC and takes rows[0].created_at as the p_last_seen_at regression
  // baseline. Without it the fixture cannot exercise that logic at all.
  data: [
    { id: 'e1', created_at: '2026-08-26T10:00:00.000Z' },
    { id: 'e2', created_at: '2026-08-25T09:00:00.000Z' },
  ],
  error: null,
};
const readEqCalls: Array<[string, unknown]> = [];
const readOrderCalls: Array<[string, boolean]> = [];
let selectColumns: string | null = null;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const node: Record<string, unknown> = {};
      Object.assign(node, {
        select: (cols: string) => {
          selectColumns = cols;
          return node;
        },
        eq: (col: string, val: unknown) => {
          readEqCalls.push([col, val]);
          return node;
        },
        // Added 2026-08-27 with the ordering fix in resolve-error.ts. The
        // action now ends the read with `.order('created_at', { ascending:
        // false })` so rows[0] is the genuine newest occurrence regardless of
        // PostgREST's 1000-row cap — without it the p_last_seen_at regression
        // baseline could silently understate on a large fingerprint. This stub
        // stopped at .eq(), so the chain threw
        // "admin.from(...).select(...).eq(...).eq(...).order is not a function"
        // and took 6 tests with it. Recorded so the assertion below can prove
        // the ordering is actually requested, not just tolerated.
        order: (col: string, opts: { ascending: boolean }) => {
          readOrderCalls.push([col, opts.ascending]);
          return node;
        },
        // The query builder itself is a thenable — no `.select()` at the end
        // of the chain like the old direct-UPDATE path, `select` is now
        // FIRST, so whichever `.eq()` call is last in the chain must resolve
        // the whole thing (matches supabase-js's real PromiseLike builder).
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          Promise.resolve(readOutcome).then(resolve, reject),
      });
      return node;
    },
  }),
}));

// ─── user-scoped RPC: (await createClient()).rpc('resolve_admin_event', {...}) ──
let rpcOutcome: { data: unknown; error: unknown } = { data: 2, error: null };
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return rpcOutcome;
    },
  }),
}));

async function resolve(fp: string) {
  const mod = await import('@/app/admin/actions/resolve-error');
  return mod.resolveErrorFingerprint(fp);
}

beforeEach(() => {
  requireSuperAdmin.mockClear();
  logServerError.mockClear();
  revalidatePath.mockClear();
  updateTag.mockClear();
  readEqCalls.length = 0;
  readOrderCalls.length = 0;
  rpcCalls.length = 0;
  selectColumns = null;
  readOutcome = {
    data: [
      { id: 'e1', created_at: '2026-08-26T10:00:00.000Z' },
      { id: 'e2', created_at: '2026-08-25T09:00:00.000Z' },
    ],
    error: null,
  };
  rpcOutcome = { data: 2, error: null };
  requireSuperAdmin.mockResolvedValue({ userId: 'admin-1', email: 'a@b.c' });
});

describe('resolveErrorFingerprint — the write the dashboard never had', () => {
  it('resolves the fingerprint through the user-scoped RPC, not a direct UPDATE', async () => {
    const r = await resolve('abc123');

    // `fingerprint` was added 2026-08-27: the action now records the resolve
    // at fingerprint level too, and reports that write's outcome separately
    // so a fingerprint failure after a successful row resolve cannot collapse
    // into a plain `success: true`.
    expect(r).toEqual({ success: true, resolvedCount: 2, fingerprint: { recorded: true } });
    // The read step looked up ids by fingerprint...
    // `created_at` joined `id` on 2026-08-27: the action orders by it to pick
    // the genuine newest occurrence for the p_last_seen_at regression
    // baseline, so it has to be selected.
    expect(selectColumns).toBe('id, created_at');
    // And prove the ordering is actually REQUESTED, not merely tolerated by
    // the stub — an unordered read would silently understate the baseline
    // once a fingerprint exceeds PostgREST's 1000-row page.
    expect(readOrderCalls).toContainEqual(['created_at', false]);
    expect(readEqCalls).toContainEqual(['fingerprint', 'abc123']);
    expect(readEqCalls).toContainEqual(['resolved', false]);
    // ...and the write went through resolve_admin_event with those exact ids.
    // TWO rpcs now, in order: the row-level resolve, then the new
    // fingerprint-level record. The second is the whole point of this
    // change — admin_error_resolutions had no writer, so the Bridge kept
    // no memory that anything was ever fixed.
    expect(rpcCalls).toEqual([
      { fn: 'resolve_admin_event', args: { p_event_ids: ['e1', 'e2'] } },
      {
        fn: 'admin_resolve_error_fingerprint',
        args: {
          p_fingerprint: 'abc123',
          p_pr_number: undefined,
          p_pr_url: undefined,
          p_fixed_in_sha: undefined,
          p_note: undefined,
          // rows[0] — the NEWEST occurrence, not the last row in the page.
          p_last_seen_at: '2026-08-26T10:00:00.000Z',
        },
      },
    ]);
  });

  it('busts the same nav-badge cache tag resolveTriageEvents busts', async () => {
    await resolve('abc123');

    expect(revalidatePath).toHaveBeenCalledWith('/admin');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/errors');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/errors/abc123');
    expect(updateTag).toHaveBeenCalledWith('bridge-incidents');
  });

  it('reports 0 rather than failure when the fingerprint was already resolved, and skips the RPC entirely', async () => {
    readOutcome = { data: [], error: null };

    // Zero open rows and no options => the RPC is deliberately SKIPPED, so a
    // stray re-click cannot bump resolved_at, relabel resolution_source to
    // 'manual', or clear a live reopened_at. Reported as recorded:true
    // because nothing failed — there was simply nothing new to record.
    expect(await resolve('abc123')).toEqual({
      success: true,
      resolvedCount: 0,
      fingerprint: { recorded: true },
    });
    expect(rpcCalls).toEqual([]);
  });
});

describe('resolveErrorFingerprint — refuses rather than claiming success', () => {
  it('is super-admin gated on the first line', async () => {
    requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(resolve('abc123')).rejects.toThrow('Forbidden');
  });

  it('does not report success when the lookup read failed', async () => {
    readOutcome = { data: null, error: { message: 'permission denied', code: '42501' } };

    const r = await resolve('abc123');

    expect(r.success).toBe(false);
    expect(rpcCalls).toEqual([]);
    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /resolve/i.test(m))).toBe(true);
  });

  it('does not report success when the RPC write failed', async () => {
    rpcOutcome = { data: null, error: { message: 'boom' } };

    const r = await resolve('abc123');

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('resolve_admin_event failed: boom');
  });

  it('translates the Forbidden/42501 RPC error into the two-gate explanation (resolve-failure.ts)', async () => {
    rpcOutcome = { data: null, error: { message: 'Forbidden' } };

    const r = await resolve('abc123');

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain('Resolve was rejected by the database, not by the console');
      expect(r.error).toContain('admin_allowlist');
    }
    // The RPC failure is still logged for the operational trail.
    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /resolve/i.test(m))).toBe(true);
  });

  it('rejects an empty fingerprint instead of resolving everything', async () => {
    const r = await resolve('   ');

    expect(r.success).toBe(false);
    expect(readEqCalls).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });
});

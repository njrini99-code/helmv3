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
  data: [{ id: 'e1' }, { id: 'e2' }],
  error: null,
};
const readEqCalls: Array<[string, unknown]> = [];
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
  rpcCalls.length = 0;
  selectColumns = null;
  readOutcome = { data: [{ id: 'e1' }, { id: 'e2' }], error: null };
  rpcOutcome = { data: 2, error: null };
  requireSuperAdmin.mockResolvedValue({ userId: 'admin-1', email: 'a@b.c' });
});

describe('resolveErrorFingerprint — the write the dashboard never had', () => {
  it('resolves the fingerprint through the user-scoped RPC, not a direct UPDATE', async () => {
    const r = await resolve('abc123');

    expect(r).toEqual({ success: true, resolvedCount: 2 });
    // The read step looked up ids by fingerprint...
    expect(selectColumns).toBe('id');
    expect(readEqCalls).toContainEqual(['fingerprint', 'abc123']);
    expect(readEqCalls).toContainEqual(['resolved', false]);
    // ...and the write went through resolve_admin_event with those exact ids.
    expect(rpcCalls).toEqual([{ fn: 'resolve_admin_event', args: { p_event_ids: ['e1', 'e2'] } }]);
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

    expect(await resolve('abc123')).toEqual({ success: true, resolvedCount: 0 });
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

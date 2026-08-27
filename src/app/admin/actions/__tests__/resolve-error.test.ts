import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Covers the fingerprint-level recording added to resolveErrorFingerprint
 * (and the new unresolveErrorFingerprint) alongside
 * `public.admin_error_resolutions` (migration 20260827031754). The
 * pre-existing row-level behavior is covered by
 * `src/test/admin/resolve-error.test.ts`; this file focuses on what's new:
 *
 *   - admin_resolve_error_fingerprint is called through the SAME user-scoped
 *     client as resolve_admin_event, never the service-role admin client
 *     (that RPC is is_super_admin()-gated and reads auth.uid(), which is
 *     NULL under service_role);
 *   - the open-rows read is ordered newest-first so the freshest row is
 *     always rows[0], regardless of PostgREST's 1000-row cap — that value
 *     becomes p_last_seen_at;
 *   - a fingerprint-record failure after a successful row resolve is
 *     reported honestly (fingerprint.recorded === false with a cause), never
 *     collapsed into a bare success;
 *   - a row-level resolve failure stops the action before the fingerprint
 *     RPC is ever attempted;
 *   - a re-click that resolves zero rows AND carries no PR/SHA/note metadata
 *     skips admin_resolve_error_fingerprint entirely, so an idle click can
 *     never clear a live regression flag or relabel an 'auto' resolution;
 *   - unresolveErrorFingerprint mirrors the same gate and client shape.
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

// ─── service-role READ: admin.from('admin_events').select('id, created_at')
//     .eq(...).eq(...).order('created_at', { ascending: false }) ──
// Fixture rows are supplied ALREADY in the newest-first order the real
// `.order()` call would produce — the mock doesn't sort, so rows[0] must be
// the fixture's own intended "freshest" row for the production code's
// `rows[0]` shortcut to be exercised honestly.
let readOutcome: { data: unknown; error: unknown } = {
  data: [
    { id: 'e2', created_at: '2026-08-25T12:30:00.000Z' },
    { id: 'e1', created_at: '2026-08-20T10:00:00.000Z' },
  ],
  error: null,
};
const readEqCalls: Array<[string, unknown]> = [];
const orderCalls: Array<[string, unknown]> = [];
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
        order: (col: string, opts: unknown) => {
          orderCalls.push([col, opts]);
          return node;
        },
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          Promise.resolve(readOutcome).then(resolve, reject),
      });
      return node;
    },
  }),
}));

// ─── user-scoped RPCs: (await createClient()).rpc(fn, args) ──
type RpcOutcome = { data: unknown; error: { message: string } | null };
const rpcOutcomes: Record<string, RpcOutcome> = {
  resolve_admin_event: { data: 2, error: null },
  admin_resolve_error_fingerprint: { data: null, error: null },
  admin_unresolve_error_fingerprint: { data: null, error: null },
};
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return rpcOutcomes[fn] ?? { data: null, error: { message: `unmocked rpc ${fn}` } };
    },
  }),
}));

async function resolve(fp: string, options?: Record<string, unknown>) {
  const mod = await import('@/app/admin/actions/resolve-error');
  return mod.resolveErrorFingerprint(fp, options as never);
}

async function unresolve(fp: string) {
  const mod = await import('@/app/admin/actions/resolve-error');
  return mod.unresolveErrorFingerprint(fp);
}

beforeEach(() => {
  requireSuperAdmin.mockClear();
  logServerError.mockClear();
  revalidatePath.mockClear();
  updateTag.mockClear();
  readEqCalls.length = 0;
  orderCalls.length = 0;
  rpcCalls.length = 0;
  selectColumns = null;
  readOutcome = {
    data: [
      { id: 'e2', created_at: '2026-08-25T12:30:00.000Z' },
      { id: 'e1', created_at: '2026-08-20T10:00:00.000Z' },
    ],
    error: null,
  };
  rpcOutcomes.resolve_admin_event = { data: 2, error: null };
  rpcOutcomes.admin_resolve_error_fingerprint = { data: null, error: null };
  rpcOutcomes.admin_unresolve_error_fingerprint = { data: null, error: null };
  requireSuperAdmin.mockResolvedValue({ userId: 'admin-1', email: 'a@b.c' });
});

describe('resolveErrorFingerprint — fingerprint-level recording', () => {
  it('resolves the rows and records the fingerprint with the PR/SHA/note the operator supplied, through the user-scoped client', async () => {
    const r = await resolve('abc123', {
      prNumber: 4242,
      prUrl: 'https://github.com/org/repo/pull/4242',
      fixedInSha: 'deadbeef',
      note: 'fixed the null check',
    });

    expect(r).toEqual({
      success: true,
      resolvedCount: 2,
      fingerprint: { recorded: true },
    });

    const rowCall = rpcCalls.find((c) => c.fn === 'resolve_admin_event');
    expect(rowCall?.args).toEqual({ p_event_ids: ['e2', 'e1'] });

    const fpCall = rpcCalls.find((c) => c.fn === 'admin_resolve_error_fingerprint');
    expect(fpCall?.args).toEqual({
      p_fingerprint: 'abc123',
      p_pr_number: 4242,
      p_pr_url: 'https://github.com/org/repo/pull/4242',
      p_fixed_in_sha: 'deadbeef',
      p_note: 'fixed the null check',
      // The freshest created_at among the two rows just read.
      p_last_seen_at: '2026-08-25T12:30:00.000Z',
    });

    // The admin client mock defines only `.from()`, no `.rpc()` — if the
    // implementation ever called the gated RPCs on the service-role client
    // instead of the user-scoped one, this whole test would throw a
    // TypeError before reaching these assertions.
    expect(selectColumns).toBe('id, created_at');
    expect(orderCalls).toEqual([['created_at', { ascending: false }]]);
    expect(revalidatePath).toHaveBeenCalledWith('/admin');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/errors');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/errors/abc123');
    expect(updateTag).toHaveBeenCalledWith('bridge-incidents');
  });

  it('still records the fingerprint (with no last-seen baseline) when every row was already resolved', async () => {
    readOutcome = { data: [], error: null };

    const r = await resolve('abc123', { note: 'documenting after the fact' });

    expect(r).toEqual({
      success: true,
      resolvedCount: 0,
      fingerprint: { recorded: true },
    });

    expect(rpcCalls.some((c) => c.fn === 'resolve_admin_event')).toBe(false);
    const fpCall = rpcCalls.find((c) => c.fn === 'admin_resolve_error_fingerprint');
    expect(fpCall?.args).toEqual({
      p_fingerprint: 'abc123',
      p_pr_number: undefined,
      p_pr_url: undefined,
      p_fixed_in_sha: undefined,
      p_note: 'documenting after the fact',
      p_last_seen_at: undefined,
    });
  });

  it('skips the fingerprint RPC entirely on a plain re-click that resolves zero rows and carries no metadata', async () => {
    readOutcome = { data: [], error: null };

    const r = await resolve('abc123');

    expect(r).toEqual({
      success: true,
      resolvedCount: 0,
      fingerprint: { recorded: true },
    });
    // Not just "no fingerprint RPC" — no RPC at all, and nothing revalidated.
    // An idle re-click that resolved nothing must be inert, so it can never
    // clear a live regression flag or relabel an 'auto' resolution 'manual'.
    expect(rpcCalls).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it('reports the fingerprint failure honestly rather than collapsing it into plain success', async () => {
    rpcOutcomes.admin_resolve_error_fingerprint = { data: null, error: { message: 'boom' } };

    const r = await resolve('abc123');

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.resolvedCount).toBe(2);
      expect(r.fingerprint).toEqual({
        recorded: false,
        error: 'admin_resolve_error_fingerprint failed: boom',
      });
    }
    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /fingerprint record failed/i.test(m))).toBe(true);
  });

  it('translates a Forbidden fingerprint-RPC error into the two-gate explanation', async () => {
    rpcOutcomes.admin_resolve_error_fingerprint = { data: null, error: { message: 'Forbidden' } };

    const r = await resolve('abc123');

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.fingerprint.recorded).toBe(false);
      if (!r.fingerprint.recorded) {
        expect(r.fingerprint.error).toContain('Resolve was rejected by the database, not by the console');
        expect(r.fingerprint.error).toContain('admin_allowlist');
      }
    }
  });

  it('stops before the fingerprint RPC when the row-level resolve itself fails', async () => {
    rpcOutcomes.resolve_admin_event = { data: null, error: { message: 'row resolve boom' } };

    const r = await resolve('abc123');

    expect(r).toEqual({ success: false, error: 'resolve_admin_event failed: row resolve boom' });
    expect(rpcCalls.some((c) => c.fn === 'admin_resolve_error_fingerprint')).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects an empty fingerprint before any read or write', async () => {
    const r = await resolve('   ');

    expect(r).toEqual({ success: false, error: 'A fingerprint is required' });
    expect(readEqCalls).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it('is super-admin gated on the first line', async () => {
    requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(resolve('abc123')).rejects.toThrow('Forbidden');
    expect(rpcCalls).toEqual([]);
  });
});

describe('unresolveErrorFingerprint', () => {
  it('un-archives through the user-scoped RPC and busts the same cache tags', async () => {
    const r = await unresolve('  abc123  ');

    expect(r).toEqual({ success: true });
    expect(rpcCalls).toEqual([
      { fn: 'admin_unresolve_error_fingerprint', args: { p_fingerprint: 'abc123' } },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/admin');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/errors');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/errors/abc123');
    expect(updateTag).toHaveBeenCalledWith('bridge-incidents');
  });

  it('reports failure rather than success when the RPC errors', async () => {
    rpcOutcomes.admin_unresolve_error_fingerprint = { data: null, error: { message: 'boom' } };

    const r = await unresolve('abc123');

    expect(r).toEqual({
      success: false,
      error: 'admin_unresolve_error_fingerprint failed: boom',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('translates Forbidden the same way the resolve path does', async () => {
    rpcOutcomes.admin_unresolve_error_fingerprint = { data: null, error: { message: 'Forbidden' } };

    const r = await unresolve('abc123');

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain('Resolve was rejected by the database, not by the console');
    }
  });

  it('rejects an empty fingerprint without calling the RPC', async () => {
    const r = await unresolve('   ');

    expect(r).toEqual({ success: false, error: 'A fingerprint is required' });
    expect(rpcCalls).toEqual([]);
  });

  it('is super-admin gated on the first line', async () => {
    requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(unresolve('abc123')).rejects.toThrow('Forbidden');
    expect(rpcCalls).toEqual([]);
  });
});

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
 */

const requireSuperAdmin = vi.fn(async () => ({ userId: 'admin-1', email: 'a@b.c' }));
const logServerError = vi.fn(async () => {});

vi.mock('@/lib/admin/require-super-admin', () => ({ requireSuperAdmin }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

let outcome: { data: unknown; error: unknown } = { data: [{ id: '1' }], error: null };
const eqCalls: Array<[string, unknown]> = [];
let updatePayload: Record<string, unknown> = {};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const node: Record<string, unknown> = {};
      Object.assign(node, {
        update: (p: Record<string, unknown>) => {
          updatePayload = p;
          return node;
        },
        eq: (col: string, val: unknown) => {
          eqCalls.push([col, val]);
          return node;
        },
        select: async () => outcome,
      });
      return node;
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
  eqCalls.length = 0;
  updatePayload = {};
  outcome = { data: [{ id: '1' }, { id: '2' }], error: null };
  requireSuperAdmin.mockResolvedValue({ userId: 'admin-1', email: 'a@b.c' });
});

describe('resolveErrorFingerprint — the write the dashboard never had', () => {
  it('marks the fingerprint resolved and records who did it', async () => {
    const r = await resolve('abc123');

    expect(r).toEqual({ success: true, resolvedCount: 2 });
    expect(updatePayload.resolved).toBe(true);
    expect(updatePayload.resolved_by).toBe('admin-1');
    expect(updatePayload.resolved_at).toBeTruthy();
  });

  it('only touches rows that are still open, so a re-run cannot rewrite the resolver', async () => {
    await resolve('abc123');

    expect(eqCalls).toContainEqual(['fingerprint', 'abc123']);
    expect(eqCalls).toContainEqual(['resolved', false]);
  });

  it('reports 0 rather than failure when the fingerprint was already resolved', async () => {
    outcome = { data: [], error: null };

    expect(await resolve('abc123')).toEqual({ success: true, resolvedCount: 0 });
  });
});

describe('resolveErrorFingerprint — refuses rather than claiming success', () => {
  it('is super-admin gated on the first line', async () => {
    requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(resolve('abc123')).rejects.toThrow('Forbidden');
  });

  it('does not report success when the write failed', async () => {
    outcome = { data: null, error: { message: 'permission denied', code: '42501' } };

    const r = await resolve('abc123');

    expect(r.success).toBe(false);
    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /resolve/i.test(m))).toBe(true);
  });

  it('rejects an empty fingerprint instead of resolving everything', async () => {
    const r = await resolve('   ');

    expect(r.success).toBe(false);
    expect(eqCalls).toEqual([]);
  });
});

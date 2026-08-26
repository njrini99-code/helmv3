import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * resolveSentryIssueAction lets a Bridge operator resolve a Sentry issue
 * without leaving the console. Mirrors resolve-error.test.ts's mocking shape
 * (src/test/admin/resolve-error.test.ts): mock the super-admin gate, the
 * Sentry client call, and next/cache, then assert on the returned shape.
 */

const requireSuperAdmin = vi.fn(async () => ({ userId: 'admin-1', email: 'a@b.c' }));
const updateSentryIssueStatus = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/admin/require-super-admin', () => ({ requireSuperAdmin }));
vi.mock('@/lib/admin/sentry-api', () => ({ updateSentryIssueStatus }));
vi.mock('next/cache', () => ({
  revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

async function resolve(issueId: string) {
  const mod = await import('@/app/admin/actions/sentry-resolve');
  return mod.resolveSentryIssueAction(issueId);
}

beforeEach(() => {
  requireSuperAdmin.mockClear();
  updateSentryIssueStatus.mockReset();
  revalidatePath.mockClear();
  requireSuperAdmin.mockResolvedValue({ userId: 'admin-1', email: 'a@b.c' });
});

describe('resolveSentryIssueAction', () => {
  it('is super-admin gated on the first line', async () => {
    requireSuperAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(resolve('123')).rejects.toThrow('Forbidden');
    expect(updateSentryIssueStatus).not.toHaveBeenCalled();
  });

  it('rejects an empty issue id without calling the Sentry client', async () => {
    const r = await resolve('   ');

    expect(r).toEqual({ ok: false, error: 'A Sentry issue id is required' });
    expect(updateSentryIssueStatus).not.toHaveBeenCalled();
  });

  it('resolves the trimmed issue id, revalidates the errors page, and returns ok', async () => {
    updateSentryIssueStatus.mockResolvedValue({
      status: 'ok',
      data: { id: '123', status: 'resolved' },
      fetchedAt: '2026-08-25T00:00:00Z',
    });

    const r = await resolve('  123  ');

    expect(updateSentryIssueStatus).toHaveBeenCalledWith('123', 'resolved');
    expect(r).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/errors');
  });

  it('maps the missing-config case to unconfigured:true, not a plain error', async () => {
    updateSentryIssueStatus.mockResolvedValue({
      status: 'unconfigured',
      data: null,
      fetchedAt: null,
      error: 'Sentry read API not configured',
    });

    const r = await resolve('123');

    expect(r).toEqual({
      ok: false,
      unconfigured: true,
      error: 'Sentry read API not configured',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('maps a 401/403 write-scope rejection to unconfigured:true as well', async () => {
    updateSentryIssueStatus.mockResolvedValue({
      status: 'error',
      data: null,
      fetchedAt: null,
      error: 'Sentry issue update failed: 403 — token lacks event:write / issue write scope — add a token with write scope',
    });

    const r = await resolve('123');

    expect(r.ok).toBe(false);
    expect(r.unconfigured).toBe(true);
    expect(r.error).toContain('write scope');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('surfaces a non-scope error (e.g. 404/5xx) as a plain error, not unconfigured', async () => {
    updateSentryIssueStatus.mockResolvedValue({
      status: 'error',
      data: null,
      fetchedAt: null,
      error: 'Sentry issue update failed: 404',
    });

    const r = await resolve('123');

    expect(r).toEqual({ ok: false, error: 'Sentry issue update failed: 404' });
    expect(r.unconfigured).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('never throws on a Sentry-side failure — the fail-soft contract holds all the way to the client', async () => {
    updateSentryIssueStatus.mockResolvedValue({
      status: 'error',
      data: null,
      fetchedAt: null,
      error: 'Sentry issue update threw: ECONNRESET',
    });

    await expect(resolve('123')).resolves.toEqual({
      ok: false,
      error: 'Sentry issue update threw: ECONNRESET',
    });
  });
});

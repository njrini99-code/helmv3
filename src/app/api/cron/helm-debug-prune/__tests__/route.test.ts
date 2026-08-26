import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * `helm_debug_prune` is HELD — neither its migration nor its dependency
 * (`helm_debug` schema) has been applied to production yet (see
 * supabase/migrations/HELD.md). Three contracts matter for this route:
 *
 *   1. Auth: an unauthenticated/wrong-secret caller is rejected before the
 *      RPC is ever called.
 *   2. Missing-function degradation: while the migration is unapplied, the
 *      RPC call fails with a PostgREST/Postgres "does not exist" shape, and
 *      the route MUST answer 200 with a `skipped` reason instead of throwing
 *      — recordJobRun would otherwise log a nightly `failed` run and write an
 *      `admin_events` error row for a state that is expected and ongoing
 *      until the owner applies the migration.
 *   3. Once applied: a genuine success returns the RPC's jsonb counts, and
 *      any OTHER RPC failure (not a missing-function shape) still throws —
 *      that path must stay a real, page-worthy failure.
 */

const mocks = vi.hoisted(() => ({
  rpc: vi.fn<(name: string, args?: unknown) => Promise<{ data: unknown; error: unknown }>>(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));

vi.mock('@/lib/admin/job-log', () => ({
  recordJobRun: async <T,>(_jobType: string, fn: () => Promise<T>): Promise<T> => fn(),
}));

function request(secret = 'cron-secret'): NextRequest {
  return new NextRequest('https://helmsportslabs.com/api/cron/helm-debug-prune', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

async function loadRoute() {
  const mod = await import('@/app/api/cron/helm-debug-prune/route');
  return mod.GET;
}

describe('GET /api/cron/helm-debug-prune', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.rpc.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects a request without the correct cron secret', async () => {
    const GET = await loadRoute();
    const res = await GET(request('wrong-secret'));
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects x-vercel-cron header alone, no bearer token', async () => {
    const GET = await loadRoute();
    const res = await GET(
      new NextRequest('https://helmsportslabs.com/api/cron/helm-debug-prune', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('calls helm_debug_prune with the 30-day retention default on an authorized call', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        cutoff: '2026-07-27T04:30:00.000Z',
        retention_days: 30,
        deleted_trace_steps: 12,
        deleted_trace_runs: 4,
      },
      error: null,
    });

    const GET = await loadRoute();
    const res = await GET(request());
    expect(res.status).toBe(200);

    expect(mocks.rpc).toHaveBeenCalledWith('helm_debug_prune', { p_retention_days: 30 });

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      retention_days: 30,
      deleted_trace_steps: 12,
      deleted_trace_runs: 4,
    });
    expect(body.skipped).toBeUndefined();
  });

  it.each([
    ['PGRST202 — function unknown to PostgREST', { code: 'PGRST202', message: 'Could not find the function public.helm_debug_prune(p_retention_days) in the schema cache' }, 'PGRST202'],
    ['42883 — undefined_function', { code: '42883', message: 'function helm_debug_prune(integer) does not exist' }, '42883'],
    ['42P01 — helm_debug.trace_runs undefined_table', { code: '42P01', message: 'relation "helm_debug.trace_runs" does not exist' }, '42P01'],
    ['3F000 — helm_debug schema missing', { code: '3F000', message: 'schema "helm_debug" does not exist' }, '3F000'],
    ['no code, message-only match', { code: null, message: 'ERROR: relation "helm_debug.trace_steps" does not exist' }, 'unknown'],
  ])('degrades to a no-op (not a failure) on %s', async (_label, error, expectedCode) => {
    mocks.rpc.mockResolvedValue({ data: null, error });

    const GET = await loadRoute();
    const res = await GET(request());

    // 200, not 4xx/5xx — recordJobRun only marks a run 'failed' on a thrown
    // error or a >=400 Response, and this state must log as a routine
    // 'completed' run, not page anyone every night.
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe('migration-not-applied');
    // The code rides along so a FUTURE regression (function live, tables
    // gone: 42P01/3F000) stays distinguishable on the Jobs board from
    // "nothing applied yet, expected" (PGRST202/42883) — see the route's
    // comment on this branch. A no-op response that can never again say
    // WHICH no-op is the "unknown → healthy" failure mode the engineering OS
    // forbids.
    expect(body.code).toBe(expectedCode);
  });

  it('throws (does not silently swallow) on a real, unrelated RPC error', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for schema helm_debug' },
    });

    const GET = await loadRoute();
    await expect(GET(request())).rejects.toThrow(/helm_debug_prune failed/);
  });
});

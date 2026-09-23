import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `createAdminClient()` (src/lib/supabase/admin.ts) used to call
 * `Sentry.instrumentSupabaseClient(client, ...)` unconditionally. That
 * export is `undefined` when `@sentry/nextjs` is loaded outside the Next.js
 * runtime — e.g. any repo script run with plain `tsx`
 * (scripts/run-triage.ts, scripts/run-pattern-miner-for-team.ts,
 * scripts/coachhelm-prewarm-round-reviews.ts) — so every such script crashed
 * inside `createAdminClient()`, before making a single query. The fix guards
 * the call with `typeof Sentry.instrumentSupabaseClient === 'function'`; the
 * two tests below cover both branches directly, mocking `@sentry/nextjs`
 * with and without that export, rather than asserting on the source text.
 */

const ORIGINAL_URL = 'https://example.supabase.co';
const ORIGINAL_KEY = 'test-service-role-key';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', ORIGINAL_URL);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', ORIGINAL_KEY);
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('@sentry/nextjs');
});

describe('createAdminClient — Sentry instrumentation guard', () => {
  it('still returns a working client when Sentry.instrumentSupabaseClient is not exported (tsx/node, outside the Next.js runtime)', async () => {
    vi.doMock('@sentry/nextjs', () => ({ instrumentSupabaseClient: undefined }));

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const client = createAdminClient();

    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });

  it('still instruments the client when Sentry.instrumentSupabaseClient IS a function (Next.js runtime) — behavior unchanged', async () => {
    const instrumentSupabaseClient = vi.fn();
    vi.doMock('@sentry/nextjs', () => ({ instrumentSupabaseClient }));

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const client = createAdminClient();

    expect(instrumentSupabaseClient).toHaveBeenCalledTimes(1);
    expect(instrumentSupabaseClient.mock.calls[0]?.[0]).toBe(client);
    expect(instrumentSupabaseClient.mock.calls[0]?.[1]).toEqual({ sendOperationData: false });
  });
});

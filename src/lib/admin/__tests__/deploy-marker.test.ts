import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  existing: [] as Array<{ id: string }>,
  inserted: [] as Record<string, unknown>[],
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          contains: () => ({
            limit: async () => ({ data: mocks.existing, error: null }),
          }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        mocks.inserted.push(row);
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

import { recordDeployMarker } from '@/lib/admin/deploy-marker';

describe('recordDeployMarker', () => {
  beforeEach(() => {
    mocks.existing.length = 0;
    mocks.inserted.length = 0;
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc123def456');
    vi.stubEnv('VERCEL_GIT_COMMIT_MESSAGE', 'feat: something');
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'main');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('writes a deploy event for a new production sha, already resolved', async () => {
    // A deploy marker is a pure activity record, not an incident — nothing
    // ever triages or resolves event_type='deploy' (both auto-resolve.ts and
    // the triage UI filter event_type='error'), so it sat resolved=false
    // forever with no consumer that cared. Born resolved instead.
    //
    // Both assertions live in ONE test: `attemptedThisBoot` is process-wide
    // module state with no reset hook, so only the FIRST successful insert in
    // this file ever actually reaches the insert() call — a second test
    // expecting its own fresh insert would silently see nothing.
    await recordDeployMarker();
    expect(mocks.inserted[0]).toMatchObject({
      event_type: 'deploy',
      source: 'system',
      title: expect.stringContaining('abc123d'),
      resolved: true,
      resolved_at: expect.any(String),
    });
  });

  it('is idempotent — an existing marker for the sha suppresses the insert', async () => {
    mocks.existing.push({ id: 'evt-1' });
    await recordDeployMarker();
    expect(mocks.inserted).toHaveLength(0);
  });

  it('does nothing outside production or without a sha', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    await recordDeployMarker();
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    await recordDeployMarker();
    expect(mocks.inserted).toHaveLength(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        mocks.inserts.push({ table, row });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => void) =>
    fn({
      setLevel: vi.fn(), setTag: vi.fn(), setUser: vi.fn(),
      setContext: vi.fn(), setFingerprint: vi.fn(),
    }),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { logServerError } from '@/lib/server-error-logger';

describe('server-error-logger bridge columns', () => {
  beforeEach(() => { mocks.inserts.length = 0; });

  it('writes sport/team_id/fingerprint/source onto the admin_events row', async () => {
    await logServerError('boom', {
      action: 'test.bridge',
      source: 'server_action',
      sport: 'golf',
      teamId: 'team-1',
      dbFingerprint: 'abc123ff',
    });
    const adminEvent = mocks.inserts.find((i) => i.table === 'admin_events');
    expect(adminEvent?.row).toMatchObject({
      sport: 'golf',
      team_id: 'team-1',
      fingerprint: 'abc123ff',
      source: 'server_action',
    });
  });

  it('derives a deterministic fingerprint when dbFingerprint is omitted', async () => {
    await logServerError('same message', { action: 'test.bridge', route: '/x' });
    await logServerError('same message', { action: 'test.bridge', route: '/x' });
    const rows = mocks.inserts.filter((i) => i.table === 'admin_events');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.row.fingerprint).toBeTruthy();
    expect(rows[0]!.row.fingerprint).toEqual(rows[1]!.row.fingerprint);
  });

  it('stays backward-compatible: legacy context without new fields still writes', async () => {
    await logServerError('legacy', { action: 'legacy.caller' });
    const adminEvent = mocks.inserts.find((i) => i.table === 'admin_events');
    expect(adminEvent?.row).toMatchObject({ sport: null, team_id: null, source: 'server_action' });
  });

  it('writes feature onto the admin_events row (W15 Task 2)', async () => {
    await logServerError('feature-tagged', {
      action: 'test.feature',
      sport: 'golf',
      feature: 'round_tracking',
    });
    const adminEvent = mocks.inserts.find((i) => i.table === 'admin_events');
    expect(adminEvent?.row).toMatchObject({ feature: 'round_tracking' });
  });

  it('falls back to featureArea for feature when feature is omitted (continuity)', async () => {
    await logServerError('legacy-feature-area', {
      action: 'test.featureArea',
      featureArea: 'rounds',
    });
    const adminEvent = mocks.inserts.find((i) => i.table === 'admin_events');
    expect(adminEvent?.row).toMatchObject({ feature: 'rounds' });
  });

  it('feature is null when neither feature nor featureArea is given', async () => {
    await logServerError('no-feature', { action: 'test.none' });
    const adminEvent = mocks.inserts.find((i) => i.table === 'admin_events');
    expect(adminEvent?.row).toMatchObject({ feature: null });
  });
});

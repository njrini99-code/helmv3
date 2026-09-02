import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  transientFailures: {} as Record<string, number>,
  /** Durable collapse: the unresolved row the lookup finds inside the window, if any. */
  recentRow: null as { id: string; metadata: unknown } | null,
  lookupError: null as { message: string } | null,
  lookups: 0,
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  scope: {
    setLevel: vi.fn(), setTag: vi.fn(), setUser: vi.fn(),
    setContext: vi.fn(), setFingerprint: vi.fn(),
  },
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: async () => {
          mocks.lookups += 1;
          return { data: mocks.recentRow ? [mocks.recentRow] : [], error: mocks.lookupError };
        },
        // The durable-collapse bump is a guarded UPDATE: `.eq('id')`, then an
        // `.eq`/`.is` on the counter as it was read, then `.select('id')` so
        // a guard miss is visible as zero rows. Always matches here.
        update: (patch: Record<string, unknown>) => {
          let id = '';
          const builder = {
            eq: (col: string, v: unknown) => {
              if (col === 'id') id = String(v);
              return builder;
            },
            is: () => builder,
            select: async () => {
              mocks.updates.push({ id, patch });
              return { data: [{ id }], error: null };
            },
          };
          return builder;
        },
        upsert: (row: Record<string, unknown>) => {
          mocks.inserts.push({ table, row });
          if ((mocks.transientFailures[table] ?? 0) > 0) {
            mocks.transientFailures[table] = (mocks.transientFailures[table] ?? 0) - 1;
            return Promise.reject(new TypeError('fetch failed'));
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => void) => fn(mocks.scope),
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));

import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { buildIncidentSignature } from '@/lib/admin/incident-grouping';

describe('server-error-logger bridge columns', () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.transientFailures = {};
    mocks.recentRow = null;
    mocks.lookupError = null;
    mocks.lookups = 0;
    mocks.updates.length = 0;
    mocks.captureException.mockClear();
    for (const fn of Object.values(mocks.scope)) fn.mockClear();
    // Writers are prod-gated by shouldPersistAdminTables(); the force-capture
    // hatch keeps these column-mapping tests exercising the real write path.
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

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

  it('infers baseball sport from legacy emitters that only mention Baseball in the message', async () => {
    await logServerError('Baseball document action error: permission denied', {
      action: 'documents.handleError',
    });
    const adminEvent = mocks.inserts.find((i) => i.table === 'admin_events');
    expect(adminEvent?.row).toMatchObject({
      sport: 'baseball',
      feature: 'baseball_documents',
    });
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

  it('falls back to featureArea for feature when feature is omitted (continuity) — an unregistered area stays visible raw', async () => {
    await logServerError('legacy-feature-area', {
      action: 'test.featureArea',
      featureArea: 'legacy-area-nobody-registered',
    });
    const adminEvent = mocks.inserts.find((i) => i.table === 'admin_events');
    expect(adminEvent?.row).toMatchObject({ feature: 'legacy-area-nobody-registered' });
  });

  it('aliases BOTH featureArea and an explicit feature through the registry alias table', async () => {
    await logServerError('legacy-feature-area', { action: 'test.featureArea', featureArea: 'rounds' });
    await logServerError('explicit-feature', { action: 'test.feature', feature: 'coachhelm_chat' });
    const rows = mocks.inserts.filter((i) => i.table === 'admin_events').map((i) => i.row.feature);
    expect(rows).toEqual(['round_tracking', 'coachhelm_ai_engine']);
  });

  it('feature is null when neither feature nor featureArea is given', async () => {
    await logServerError('no-feature', { action: 'test.none' });
    const adminEvent = mocks.inserts.find((i) => i.table === 'admin_events');
    expect(adminEvent?.row).toMatchObject({ feature: null });
  });

  // 99 identical provider_vercel_unavailable rows in 2h05m, collapsed_count
  // NULL on every one: the per-process throttle cannot see across lambdas.
  describe('durable collapse for provider_ faults', () => {
    it('bumps the open row inside the window instead of inserting — both tables untouched', async () => {
      mocks.recentRow = { id: 'evt-open', metadata: { metadata: { collapsed_count: 3 } } };

      await logServerEvent('vercel could not be reached', {
        action: 'integration.vercel',
        source: 'integrity',
        errorCode: 'provider_vercel_unavailable',
        metadata: { collapsed_count: 4 }, // what this process's throttle suppressed
      }, 'error');

      expect(mocks.inserts).toHaveLength(0);
      expect(mocks.updates).toHaveLength(1);
      expect(mocks.updates[0]!.id).toBe('evt-open');
      // 3 already there + this occurrence + the 4 the throttle collapsed
      expect(mocks.updates[0]!.patch.metadata).toMatchObject({ metadata: { collapsed_count: 8 } });
      expect((mocks.updates[0]!.patch.metadata as { metadata: { last_seen_at: string } }).metadata.last_seen_at).toMatch(/T/);
    });

    it('inserts when no open row is inside the window', async () => {
      await logServerEvent('vercel could not be reached', {
        action: 'integration.vercel', source: 'integrity', errorCode: 'provider_vercel_unavailable',
      }, 'error');
      expect(mocks.lookups).toBe(1);
      expect(mocks.inserts.filter((i) => i.table === 'admin_events')).toHaveLength(1);
    });

    it('FAILS OPEN — an unreadable lookup still inserts, never loses the signal', async () => {
      mocks.lookupError = { message: 'statement timeout' };
      await logServerEvent('vercel could not be reached', {
        action: 'integration.vercel', source: 'integrity', errorCode: 'provider_vercel_unavailable',
      }, 'error');
      expect(mocks.inserts.filter((i) => i.table === 'admin_events')).toHaveLength(1);
    });

    it('does not even look for a row for an ordinary (non-provider) error', async () => {
      mocks.recentRow = { id: 'evt-open', metadata: null };
      await logServerError('save failed', { action: 'saveThing', errorCode: '23505' });
      expect(mocks.lookups).toBe(0);
      expect(mocks.inserts.filter((i) => i.table === 'admin_events')).toHaveLength(1);
    });

    it('can be opted in for a non-provider code and out for a provider one', async () => {
      mocks.recentRow = { id: 'evt-open', metadata: null };
      await logServerError('rpc failed', { action: 'admin.fetchFeatureHealth', errorCode: 'feature_health_rpc_failed', durableCollapse: true });
      expect(mocks.updates).toHaveLength(1);
      expect(mocks.inserts).toHaveLength(0);

      await logServerError('x', { action: 'y', errorCode: 'provider_x_unavailable', durableCollapse: false });
      expect(mocks.lookups).toBe(1);
      expect(mocks.inserts.filter((i) => i.table === 'admin_events')).toHaveLength(1);
    });
  });

  // Six Sentry issues in one week all titled "Error: Server trace error".
  describe('Sentry title and grouping for message-shaped traces', () => {
    it('captures an Error whose message carries the errorCode and a short summary', async () => {
      await logServerError('Vercel web insights fetch failed: 403 and then some more words', {
        action: 'integration.vercel',
        errorCode: 'provider_vercel_invalid_credential',
      });
      expect(mocks.captureException).toHaveBeenCalledTimes(1);
      const captured = mocks.captureException.mock.calls[0]![0] as Error;
      expect(captured.name).toBe('ServerTrace');
      expect(captured.message).toBe(
        'provider_vercel_invalid_credential: Vercel web insights fetch failed: 403 and then some more words',
      );
      expect(captured.message).not.toBe('Server trace error');
    });

    it('caps the summary and collapses whitespace so the title stays readable', async () => {
      await logServerError(`boom ${'x'.repeat(500)}\n\n  tail`, { action: 'a' });
      const captured = mocks.captureException.mock.calls[0]![0] as Error;
      expect(captured.message.length).toBeLessThanOrEqual(160);
      expect(captured.message).not.toContain('\n');
    });

    it('pins the Sentry fingerprint to the admin_events fingerprint, so a varying title cannot fragment grouping', async () => {
      await logServerError('save failed for row 12345678', { action: 'saveThing', route: '/golf/x', errorCode: '23505' });
      const row = mocks.inserts.find((i) => i.table === 'admin_events')!.row;
      expect(mocks.scope.setFingerprint).toHaveBeenCalledWith(['helm-server-trace', row.fingerprint]);
      expect(mocks.scope.setTag).toHaveBeenCalledWith('bridge_fingerprint', row.fingerprint);
      // The same signature the Bridge computes.
      expect(row.fingerprint).toBe(
        buildIncidentSignature({ severity: 'error', errorCode: '23505', route: '/golf/x', message: 'save failed for row 12345678' }),
      );
    });

    it('an explicit context.fingerprint still wins', async () => {
      await logServerError('soft', { action: 'a', fingerprint: ['server_action_soft', 'f', 'a'] });
      expect(mocks.scope.setFingerprint).toHaveBeenCalledWith(['server_action_soft', 'f', 'a']);
    });
  });

  it('retries a transient bridge failure with the same idempotency key', async () => {
    mocks.transientFailures.error_logs = 1;

    await logServerError('transient write', { action: 'test.retry' });

    const attempts = mocks.inserts.filter((i) => i.table === 'error_logs');
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.row.id).toBeTruthy();
    expect(attempts[1]!.row.id).toBe(attempts[0]!.row.id);
  });
});

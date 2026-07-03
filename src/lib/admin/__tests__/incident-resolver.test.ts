import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; severity: string; metadata: unknown; message: string }>,
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  failUpdateForId: null as string | null,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'admin_events') throw new Error(`unexpected table ${table}`);
      const chain = {
        select: () => chain,
        in: () => chain,
        ilike: () => chain,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: mocks.rows, error: null }).then(resolve),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            if (mocks.failUpdateForId === id) {
              return Promise.resolve({ data: null, error: { message: 'update failed' } });
            }
            mocks.updates.push({ id, patch });
            const row = mocks.rows.find((r) => r.id === id);
            if (row) {
              row.severity = (patch.severity as string) ?? row.severity;
              row.metadata = patch.metadata ?? row.metadata;
            }
            return Promise.resolve({ data: null, error: null });
          },
        }),
      };
      return chain;
    },
  }),
}));

import { archiveIncidentsByCriteria } from '@/lib/admin/incident-resolver';

describe('archiveIncidentsByCriteria', () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.updates = [];
    mocks.failUpdateForId = null;
  });

  it('sets resolved=true and resolved_at alongside the severity demotion — the live feed filters on `resolved`, not severity', async () => {
    mocks.rows = [{ id: 'evt-1', severity: 'error', metadata: { errorCode: '42P10' }, message: 'boom' }];

    const result = await archiveIncidentsByCriteria({ errorCode: '42P10', resolution: 'fixed in PR #1' });

    expect(result.archived).toBe(1);
    expect(mocks.updates).toHaveLength(1);
    const patch = mocks.updates[0]!.patch;
    expect(patch.severity).toBe('info');
    expect(patch.resolved).toBe(true);
    expect(typeof patch.resolved_at).toBe('string');
    // resolved_by is deliberately left unset — it's a FK to public.users(id)
    // and this path has no invoking admin user to attribute it to.
    expect(patch.resolved_by).toBeUndefined();
    expect((patch.metadata as Record<string, unknown>).auto_resolved).toBe(true);
  });

  it('skips rows already auto-resolved (metadata.auto_resolved === true)', async () => {
    mocks.rows = [
      { id: 'evt-1', severity: 'error', metadata: { errorCode: 'X', auto_resolved: true }, message: 'boom' },
    ];
    const result = await archiveIncidentsByCriteria({ errorCode: 'X', resolution: 'r' });
    expect(result.archived).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it('continues past a failed row update and reports the count that actually succeeded', async () => {
    mocks.rows = [
      { id: 'evt-1', severity: 'error', metadata: { errorCode: 'X' }, message: 'a' },
      { id: 'evt-2', severity: 'error', metadata: { errorCode: 'X' }, message: 'b' },
    ];
    mocks.failUpdateForId = 'evt-1';
    const result = await archiveIncidentsByCriteria({ errorCode: 'X', resolution: 'r' });
    expect(result.archived).toBe(1);
    expect(mocks.updates.map((u) => u.id)).toEqual(['evt-2']);
  });

  it('throws when no criteria field is provided', async () => {
    await expect(archiveIncidentsByCriteria({ resolution: 'r' })).rejects.toThrow(
      /at least one of metricPrefix/,
    );
  });
});

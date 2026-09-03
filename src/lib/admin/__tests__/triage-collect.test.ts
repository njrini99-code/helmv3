import { describe, it, expect } from 'vitest';
import {
  collectAdminEvents,
  collectReliabilitySignals,
  collectRelAnalyses,
  type AdminClient,
} from '@/lib/admin/triage-collect';

/**
 * A minimal fake Supabase query-builder. Every chain method returns the same
 * object (so any call order/depth works), and the object is itself thenable
 * — `await` on it at any point in the chain resolves to whatever
 * `resolveFor(table, filters)` decides from the filters applied so far. This
 * mirrors how supabase-js query builders are PromiseLike at every step, not
 * only after a specific terminal call.
 */
function makeAdmin(resolveFor: (table: string, filters: Record<string, unknown>) => unknown): AdminClient {
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        gte: (col: string, val: unknown) => {
          filters[`gte:${col}`] = val;
          return chain;
        },
        not: () => chain,
        like: (col: string, val: unknown) => {
          filters[`like:${col}`] = val;
          return chain;
        },
        order: () => chain,
        range: () => chain,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(resolveFor(table, filters)).then(resolve, reject),
      };
      return chain;
    },
  };
  return admin as unknown as AdminClient;
}

describe('collectAdminEvents', () => {
  it('groups rows by fingerprint, counts occurrences, and attaches the newest existing analysis fix', async () => {
    const admin = makeAdmin((table, filters) => {
      if (table !== 'admin_events') throw new Error(`unexpected table ${table}`);
      if (filters.event_type === 'error') {
        return {
          data: [
            {
              fingerprint: 'fp-1',
              title: 'Boom',
              message: 'insert failed',
              severity: 'error',
              source: 'server_action',
              feature: 'golf',
              url: '/golf/dashboard',
              metadata: { errorCode: 'E1' },
              created_at: '2026-09-01T10:00:00.000Z',
              id: 'e2',
            },
            {
              fingerprint: 'fp-1',
              title: 'Boom',
              message: 'insert failed',
              severity: 'error',
              source: 'server_action',
              feature: 'golf',
              url: '/golf/dashboard',
              metadata: {},
              created_at: '2026-09-01T09:00:00.000Z',
              id: 'e1',
            },
          ],
          error: null,
        };
      }
      if (filters.event_type === 'rca_analysis') {
        return {
          data: [
            {
              fingerprint: 'fp-1',
              metadata: { suggestedFix: 'ALREADY FIXED: shipped in abc123' },
              created_at: '2026-09-01T11:00:00.000Z',
              id: 'a1',
            },
          ],
          error: null,
        };
      }
      throw new Error(`unexpected filters ${JSON.stringify(filters)}`);
    });

    const { candidates, health } = await collectAdminEvents(admin, '2026-08-29T00:00:00.000Z');

    expect(health).toEqual({ source: 'admin_events', status: 'ok', reason: null });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      key: 'fp-1',
      origin: 'admin_events',
      occurrences: 2,
      firstSeen: '2026-09-01T09:00:00.000Z',
      lastSeen: '2026-09-01T10:00:00.000Z',
      existingAnalysisFix: 'ALREADY FIXED: shipped in abc123',
    });
  });

  it('reports a read failure as blind, never as zero problems', async () => {
    const admin = makeAdmin(() => ({ data: null, error: { message: 'connection reset' } }));
    const { candidates, health } = await collectAdminEvents(admin, '2026-08-29T00:00:00.000Z');
    expect(candidates).toEqual([]);
    expect(health).toEqual({ source: 'admin_events', status: 'blind', reason: 'connection reset' });
  });
});

describe('collectRelAnalyses', () => {
  it('keys the newest suggestedFix by fingerprint, restricted to rel: keys', async () => {
    const admin = makeAdmin((table, filters) => {
      expect(table).toBe('admin_events');
      expect(filters['like:fingerprint']).toBe('rel:%');
      return {
        data: [
          { fingerprint: 'rel:sig-1', metadata: { suggestedFix: 'NOT A DEFECT: routine' }, created_at: '2026-09-01T00:00:00.000Z', id: 'a1' },
        ],
        error: null,
      };
    });
    const out = await collectRelAnalyses(admin);
    expect(out.get('rel:sig-1')).toBe('NOT A DEFECT: routine');
  });
});

describe('collectReliabilitySignals', () => {
  const since = '2026-09-01T00:00:00.000Z';

  function snapshotRow(startedAt: string, metadata: Record<string, unknown>) {
    return { started_at: startedAt, metadata };
  }

  it('unions a signal that appears only in an OLDER snapshot row, not the newest', async () => {
    // The bug this fixes: reading only the newest row would miss a signal
    // that fired earlier in the window and quieted down by the latest run.
    const admin = makeAdmin(() => ({
      data: [
        snapshotRow('2026-09-02T00:00:00.000Z', {
          sources: [{ source: 'sentry', status: 'ok', reason: null }],
          signals: [], // nothing in the newest run
        }),
        snapshotRow('2026-09-01T06:00:00.000Z', {
          sources: [{ source: 'sentry', status: 'ok', reason: null }],
          signals: [
            {
              signature: 'sig-old',
              title: 'Old signal',
              summary: 'fired earlier in the window',
              severity: 'error',
              count: 3,
              firstSeen: '2026-09-01T06:00:00.000Z',
              lastSeen: '2026-09-01T06:30:00.000Z',
              sources: ['sentry'],
            },
          ],
        }),
      ],
      error: null,
    }));

    const { candidates } = await collectReliabilitySignals(admin, since, new Map());
    expect(candidates.map((c) => c.key)).toContain('rel:sig-old');
  });

  it('merges the same signature across rows with different counts by taking the MAX, never the sum', async () => {
    const admin = makeAdmin(() => ({
      data: [
        snapshotRow('2026-09-02T00:00:00.000Z', {
          sources: [{ source: 'sentry', status: 'ok', reason: null }],
          signals: [
            {
              signature: 'sig-a',
              title: 'Repeated signal',
              summary: 'still happening',
              severity: 'error',
              count: 5,
              firstSeen: '2026-09-01T06:00:00.000Z',
              lastSeen: '2026-09-02T00:00:00.000Z',
              sources: ['sentry'],
            },
          ],
        }),
        snapshotRow('2026-09-01T06:00:00.000Z', {
          sources: [{ source: 'sentry', status: 'ok', reason: null }],
          signals: [
            {
              signature: 'sig-a',
              title: 'Repeated signal',
              summary: 'still happening',
              severity: 'error',
              count: 9,
              firstSeen: '2026-09-01T05:00:00.000Z',
              lastSeen: '2026-09-01T06:00:00.000Z',
              sources: ['sentry', 'supabase'],
            },
          ],
        }),
      ],
      error: null,
    }));

    const { candidates } = await collectReliabilitySignals(admin, since, new Map());
    const merged = candidates.find((c) => c.key === 'rel:sig-a')!;
    expect(merged.occurrences).toBe(9); // max(5, 9), never 14
    expect(merged.firstSeen).toBe('2026-09-01T05:00:00.000Z'); // earliest across rows
    expect(merged.lastSeen).toBe('2026-09-02T00:00:00.000Z'); // latest across rows
    expect(new Set(merged.seenBy)).toEqual(new Set(['sentry', 'supabase'])); // union
  });

  it('takes sourceHealth from the NEWEST row only, even when an older row reports different health', async () => {
    const admin = makeAdmin(() => ({
      data: [
        snapshotRow('2026-09-02T00:00:00.000Z', {
          sources: [{ source: 'sentry', status: 'ok', reason: null }],
          signals: [],
        }),
        snapshotRow('2026-09-01T06:00:00.000Z', {
          sources: [{ source: 'sentry', status: 'blind', reason: 'stale token' }],
          signals: [],
        }),
      ],
      error: null,
    }));

    const { health } = await collectReliabilitySignals(admin, since, new Map());
    expect(health).toEqual([{ source: 'sentry', status: 'ok', reason: null }]);
  });

  it('reports three-way blind when zero snapshot rows exist in the window', async () => {
    const admin = makeAdmin(() => ({ data: [], error: null }));
    const { candidates, health } = await collectReliabilitySignals(admin, since, new Map());
    expect(candidates).toEqual([]);
    expect(health).toEqual([
      { source: 'sentry', status: 'blind', reason: 'no reliability-snapshot row on record' },
      { source: 'supabase', status: 'blind', reason: 'no reliability-snapshot row on record' },
      { source: 'vercel', status: 'blind', reason: 'no reliability-snapshot row on record' },
    ]);
  });

  it('reports three-way blind on a read error', async () => {
    const admin = makeAdmin(() => ({ data: null, error: { message: 'timeout' } }));
    const { candidates, health } = await collectReliabilitySignals(admin, since, new Map());
    expect(candidates).toEqual([]);
    expect(health).toEqual([
      { source: 'sentry', status: 'blind', reason: 'timeout' },
      { source: 'supabase', status: 'blind', reason: 'timeout' },
      { source: 'vercel', status: 'blind', reason: 'timeout' },
    ]);
  });

  it('attaches an existing rel: analysis fix by key', async () => {
    const admin = makeAdmin(() => ({
      data: [
        snapshotRow('2026-09-02T00:00:00.000Z', {
          sources: [],
          signals: [
            {
              signature: 'sig-fixed',
              title: 'Known signal',
              summary: 'already analysed',
              severity: 'warning',
              count: 1,
              firstSeen: since,
              lastSeen: since,
              sources: ['vercel'],
            },
          ],
        }),
      ],
      error: null,
    }));
    const fixByKey = new Map([['rel:sig-fixed', 'NOT A DEFECT: routine']]);
    const { candidates } = await collectReliabilitySignals(admin, since, fixByKey);
    expect(candidates[0]?.existingAnalysisFix).toBe('NOT A DEFECT: routine');
  });
});

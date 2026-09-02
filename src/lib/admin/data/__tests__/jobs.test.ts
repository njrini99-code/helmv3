import { describe, it, expect } from 'vitest';
import { parseIntegrityRows } from '@/lib/admin/data/jobs';

/**
 * Bridge audit 2026-08-21, two findings in one function:
 *
 * 1. The integrity-check cron's write path
 *    (src/app/api/cron/integrity-check/route.ts -> logServerEvent ->
 *    writeAdminTables/normalizeContext) stores the caller's `{count, sample}`
 *    payload nested one level deeper than a flat read expects: the real
 *    admin_events row shape is `metadata: { metadata: { count, sample }, ... }`
 *    (normalizeContext always writes the caller's context as ONE field named
 *    `metadata` inside the envelope it persists). A flat `row.metadata.count`
 *    read silently finds `undefined` and falls back to 0/[] — masked in
 *    production because every live check currently passes with count 0.
 *
 * 2. `source='integrity'` is also written by integration-health.ts's
 *    reportIntegrationFault() (Sentry/Vercel/GitHub reachability faults),
 *    whose titles don't match the integrity-check cron's own
 *    "Integrity PASS/FAIL: <check> (<count>)" convention. Before this fix,
 *    a non-matching title passed through `.replace()` unchanged and was
 *    parsed as if it were a real check name.
 */
describe('parseIntegrityRows', () => {
  it('reads count/sample from the real nested metadata.metadata shape', () => {
    const result = parseIntegrityRows([
      {
        title: 'Integrity FAIL: orphaned_round_shots (7)',
        severity: 'error',
        created_at: '2026-08-21T07:00:00Z',
        // The real write shape: the caller's {count, sample} is nested
        // under a `metadata` key inside the envelope, not the top level.
        metadata: {
          metadata: { count: 7, sample: [{ round_id: 'r1' }, { round_id: 'r2' }] },
        },
      },
    ]);
    const row = result.get('orphaned_round_shots');
    expect(row?.status).toBe('fail');
    expect(row?.count).toBe(7);
    expect(row?.sample).toEqual([{ round_id: 'r1' }, { round_id: 'r2' }]);
  });

  it('falls back to 0/[] (not a crash) when metadata is genuinely absent', () => {
    const result = parseIntegrityRows([
      { title: 'Integrity PASS: no_metadata_check (0)', severity: 'info', created_at: '2026-08-21T07:00:00Z', metadata: null },
    ]);
    const row = result.get('no_metadata_check');
    expect(row?.status).toBe('pass');
    expect(row?.count).toBe(0);
    expect(row?.sample).toEqual([]);
  });

  it('a flat (wrong-shape) metadata.count is NOT read — regression guard for the old bug', () => {
    // If this ever reads 99, the fix regressed back to the flat read.
    const result = parseIntegrityRows([
      {
        title: 'Integrity FAIL: flat_shape_check (99)',
        severity: 'error',
        created_at: '2026-08-21T07:00:00Z',
        metadata: { count: 99, sample: ['x'] } as unknown as { metadata?: { count?: number; sample?: unknown[] } },
      },
    ]);
    expect(result.get('flat_shape_check')?.count).toBe(0);
    expect(result.get('flat_shape_check')?.sample).toEqual([]);
  });

  it('skips an integration-health reachability fault row instead of parsing its sentence as a check name', () => {
    const result = parseIntegrityRows([
      {
        title: 'vercel is rate-limiting the Bridge. This usually clears on its own. (deployments fetch)',
        severity: 'warning',
        created_at: '2026-08-21T07:05:00Z',
        metadata: { metadata: { collapsed_count: 3 } as unknown as { count?: number; sample?: unknown[] } },
      },
      {
        title: 'Integrity FAIL: real_check (2)',
        severity: 'error',
        created_at: '2026-08-21T07:00:00Z',
        metadata: { metadata: { count: 2, sample: [] } },
      },
    ]);
    expect(result.size).toBe(1);
    expect(result.has('real_check')).toBe(true);
    expect([...result.keys()].some((k) => k.includes('rate-limiting'))).toBe(false);
  });

  it('keeps only the first (newest) row per check name, matching the newest-first query order', () => {
    const result = parseIntegrityRows([
      { title: 'Integrity FAIL: flaky_check (1)', severity: 'error', created_at: '2026-08-21T08:00:00Z', metadata: { metadata: { count: 1, sample: [] } } },
      { title: 'Integrity PASS: flaky_check (0)', severity: 'info', created_at: '2026-08-21T02:00:00Z', metadata: { metadata: { count: 0, sample: [] } } },
    ]);
    expect(result.get('flaky_check')?.status).toBe('fail');
    expect(result.get('flaky_check')?.lastRunAt).toBe('2026-08-21T08:00:00Z');
  });
});

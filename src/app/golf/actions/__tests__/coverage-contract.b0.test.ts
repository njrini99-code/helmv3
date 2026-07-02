import { describe, it, expect } from 'vitest';
import { assertAreaFullyWrapped } from '@/lib/admin/__tests__/coverage-contract.shared';

/**
 * W15 Batch 0 (admin dogfood) — coverage-contract gate.
 *
 * Feature: `admin_dashboard`. Files: the 7 admin action files that back
 * `/golf/admin` + `/admin` triage. Wrapped FIRST per the plan (these actions
 * read/write `admin_events` itself — the wrapper's own fire-and-forget catch
 * path must never recurse into a synchronous write during a successful read).
 *
 * RED before the Batch 0 retrofit (14 unwrapped exports); GREEN after.
 */
describe('coverage-contract — B0 admin dogfood (admin_dashboard)', () => {
  it('every export in the 7 B0 files is wrapped with withAdminObserved({ feature: "admin_dashboard" })', () => {
    expect(() =>
      assertAreaFullyWrapped([
        'src/app/golf/actions/admin-bi-data.ts',
        'src/app/golf/actions/admin-data.ts',
        'src/app/golf/actions/admin-people-data.ts',
        'src/app/golf/actions/admin-system-data.ts',
        'src/app/golf/actions/admin-tracer-data.ts',
        'src/app/golf/actions/admin/rollup-c.ts',
        'src/app/admin/actions/triage.ts',
      ]),
    ).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { assertAreaFullyWrapped } from '@/lib/admin/__tests__/coverage-contract.shared';

/**
 * W15 Batch 3 (tasks + travel + documents) — coverage-contract gate.
 *
 * Features: task_management, travel, documents.
 * Files fully wrapped this batch: tasks.ts, task-templates.ts,
 * task-reminders.ts (task_management), travel.ts (travel), documents.ts
 * (documents). All 5 files are fully-owned by this batch (no golf.ts /
 * insights.ts multi-feature overrides here — see plan "Batch notes").
 *
 * documents.ts already called `logServerError` internally at several sites
 * pre-retrofit (plan line 380) — every one of those sites logs-and-RETURNS a
 * handled `{ success: false, error }` / `{ data: null, error }` envelope
 * (never rethrows the same error), so none double-log with the wrapper
 * (which only fires on `throw`) and all were left untouched. Same pattern
 * confirmed across tasks.ts, task-templates.ts, task-reminders.ts, travel.ts
 * — zero log-and-rethrow sites found in any of the 5 files.
 *
 * RED before the Batch 3 retrofit (63 unwrapped exports); GREEN after.
 */
describe('coverage-contract — B3 tasks + travel + documents (task_management, travel, documents)', () => {
  it('every B3 export is wrapped with withAdminObserved({ feature: <its registry key> })', () => {
    expect(() =>
      assertAreaFullyWrapped([
        'src/app/golf/actions/tasks.ts',
        'src/app/golf/actions/task-templates.ts',
        'src/app/golf/actions/task-reminders.ts',
        'src/app/golf/actions/travel.ts',
        'src/app/golf/actions/documents.ts',
      ]),
    ).not.toThrow();
  });
});

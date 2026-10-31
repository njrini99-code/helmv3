import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { sgChange } from '../stats-common';

/**
 * F-0067 (audit 2026-10-29, §7: no change). The player hero's "+3.3" beside a −3.3 SG was read as a mirror. It is not:
 * the change is current minus previous, and only when both windows exist. −3.3 now against −6.6 before is +3.3 better.
 */
describe('the SG change is current minus previous (F-0067 pin)', () => {
  it('−3.3 now against −6.6 before is +3.3', () => {
    expect(sgChange(-3.3, -6.6, 'last10', 10).delta).toBeCloseTo(3.3, 10);
  });
  it('with no previous window there is no delta, never one against zero', () => {
    expect(sgChange(-3.3, null, 'last10', 10).delta).toBeNull();
    expect(sgChange(-3.3, null, 'last10', 0).context).toBe('No earlier rounds');
  });
});

/**
 * The composite synthesis input must not include resolved rows: a leak the
 * recent-window recheck resolved (engine/recent-recheck.ts) is not a live
 * cause, and a composite built on it would re-surface the closed problem.
 */
import { describe, it, expect, vi } from 'vitest';

const calls: Array<{ op: string; args: unknown[] }> = [];

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: () => {
    const b: Record<string, unknown> = {};
    for (const op of ['select', 'eq', 'gte', 'or', 'in', 'neq']) {
      b[op] = (...args: unknown[]) => (calls.push({ op, args }), b);
    }
    b.order = () => Promise.resolve({ data: [], error: null });
    return b;
  },
}));

import { loadRecentInsightsForPlayer } from '@/lib/coachhelm/v3/composite/loader';

describe('loadRecentInsightsForPlayer', () => {
  it('excludes resolved rows alongside the shared visibility predicates', async () => {
    await loadRecentInsightsForPlayer('player-1');
    expect(calls).toContainEqual({ op: 'neq', args: ['lifecycle_state', 'resolved'] });
    expect(calls).toContainEqual({ op: 'neq', args: ['status', 'dismissed'] });
    expect(calls).toContainEqual({ op: 'neq', args: ['category', 'course_management'] });
  });
});

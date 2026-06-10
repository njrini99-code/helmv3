/**
 * Unit test for the shared `applyInsightVisibility` query-builder helper
 * (audit P3). Every `golf_coach_insights` reader outside the canonical delivery
 * layer must apply the SAME product-visibility contract through THIS one helper:
 *
 *   .or(V3_ENGINE_FILTER).in('lifecycle_state', VISIBLE).neq('status','dismissed')
 *
 * These tests pin the exact methods, order, and shared-constant arguments, so a
 * future drift in the contract (or a reader that hand-rolls a copy) is caught.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  applyInsightVisibility,
  V3_ENGINE_FILTER,
  VISIBLE_LIFECYCLE_STATES,
} from '@/lib/coachhelm/v3/insight-visibility';

function makeBuilder() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder = {
    or: vi.fn((...args: unknown[]) => (calls.push({ method: 'or', args }), builder)),
    in: vi.fn((...args: unknown[]) => (calls.push({ method: 'in', args }), builder)),
    neq: vi.fn((...args: unknown[]) => (calls.push({ method: 'neq', args }), builder)),
    // A downstream method to prove the result is still chainable.
    eq: vi.fn((...args: unknown[]) => (calls.push({ method: 'eq', args }), builder)),
  };
  return { builder, calls };
}

describe('applyInsightVisibility', () => {
  it('chains the three contract predicates in order with the shared constants', () => {
    const { builder, calls } = makeBuilder();

    const out = applyInsightVisibility(builder);

    // Same builder returned so the caller keeps chaining.
    expect(out).toBe(builder);

    expect(calls).toEqual([
      { method: 'or', args: [V3_ENGINE_FILTER] },
      { method: 'in', args: ['lifecycle_state', [...VISIBLE_LIFECYCLE_STATES]] },
      { method: 'neq', args: ['status', 'dismissed'] },
    ]);
  });

  it('returns a still-chainable builder (downstream .eq works)', () => {
    const { builder } = makeBuilder();
    // Should compile + run: keep chaining after the helper.
    expect(() => applyInsightVisibility(builder).eq('coach_id', 'c1')).not.toThrow();
  });

  it('passes the EXACT V3 engine OR-filter (no stale v2 rows)', () => {
    const { builder } = makeBuilder();
    applyInsightVisibility(builder);
    // The OR filter is the single source of truth for the v3 engine scope.
    expect(builder.or).toHaveBeenCalledWith('engine_version.eq.v3,signature.like.v3:%');
    expect(builder.or).toHaveBeenCalledWith(V3_ENGINE_FILTER);
  });
});

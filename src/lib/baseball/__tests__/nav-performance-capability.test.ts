import { describe, expect, it } from 'vitest';
import {
  getBaseballNavEntry,
  isBaseballNavEntryVisible,
  getVisibleBaseballNav,
  type BaseballNavContext,
} from '@/lib/baseball/nav-registry';

function coachCtx(
  capabilities: BaseballNavContext['capabilities'],
): BaseballNavContext {
  return { role: 'coach', capabilities, programType: 'college' };
}

describe('performance nav capability (#408)', () => {
  const performance = getBaseballNavEntry('performance');
  if (!performance) throw new Error('performance nav entry missing');

  it('hides performance when coach lacks lifting and readiness', () => {
    const ctx = coachCtx({ can_manage_stats: true });
    expect(isBaseballNavEntryVisible(performance, ctx)).toBe(false);
    expect(getVisibleBaseballNav(ctx).some((e) => e.id === 'performance')).toBe(false);
  });

  it('shows performance when coach has can_view_readiness', () => {
    const ctx = coachCtx({ can_view_readiness: true });
    expect(getVisibleBaseballNav(ctx).some((e) => e.id === 'performance')).toBe(true);
  });

  it('shows performance when coach has can_manage_lifting', () => {
    const ctx = coachCtx({ can_manage_lifting: true });
    expect(getVisibleBaseballNav(ctx).some((e) => e.id === 'performance')).toBe(true);
  });
});

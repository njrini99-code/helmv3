import { beforeEach, describe, expect, it, vi } from 'vitest';

const next = vi.hoisted(() => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/cache', () => next);

import { invalidateTags, isServerActionOnlyError, updateTag } from '../safe-update-tag';

// Next 16.3: updateTag throws this, before it does anything, outside a Server Action (a route handler, a plain function).
const routeError = () => new Error('updateTag can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead.');

beforeEach(() => vi.clearAllMocks());

describe('updateTag that works in a Server Action and in a route handler', () => {
  it('in a Server Action it is Next’s updateTag, and nothing else runs', () => {
    updateTag('dashboard');
    expect(next.updateTag).toHaveBeenCalledWith('dashboard');
    expect(next.revalidateTag).not.toHaveBeenCalled();
  });

  it('in a route handler it falls back to revalidateTag(tag, "max") instead of throwing', () => {
    next.updateTag.mockImplementation(() => {
      throw routeError();
    });
    expect(() => updateTag('calendar')).not.toThrow();
    expect(next.revalidateTag).toHaveBeenCalledWith('calendar', 'max');
  });

  it('any other error is not its to hide', () => {
    next.updateTag.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing in updateTag dashboard');
    });
    expect(() => updateTag('dashboard')).toThrow(/static generation store missing/);
    expect(next.revalidateTag).not.toHaveBeenCalled();
    // And a failing fallback surfaces too.
    next.updateTag.mockImplementation(() => {
      throw routeError();
    });
    next.revalidateTag.mockImplementation(() => {
      throw new Error('revalidate failed');
    });
    expect(() => updateTag('dashboard')).toThrow('revalidate failed');
  });

  it('invalidateTags runs each tag', () => {
    next.updateTag.mockImplementation(() => {
      throw routeError();
    });
    next.revalidateTag.mockReset();
    invalidateTags(['dashboard', 'calendar']);
    expect(next.revalidateTag.mock.calls).toEqual([['dashboard', 'max'], ['calendar', 'max']]);
    expect(isServerActionOnlyError(routeError())).toBe(true);
    expect(isServerActionOnlyError(new Error('other'))).toBe(false);
    expect(isServerActionOnlyError('updateTag can only be called from within a Server Action')).toBe(false);
  });
});

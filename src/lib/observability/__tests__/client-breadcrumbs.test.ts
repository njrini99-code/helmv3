import { describe, it, expect, vi, beforeEach } from 'vitest';

const addBreadcrumbMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: (...args: unknown[]) => addBreadcrumbMock(...args),
}));

import { recordHelmBreadcrumb } from '@/lib/observability/client-breadcrumbs';

describe('recordHelmBreadcrumb', () => {
  beforeEach(() => {
    addBreadcrumbMock.mockReset();
  });

  it('forwards category, message, and level to Sentry.addBreadcrumb', () => {
    recordHelmBreadcrumb('golf.round', 'autosave');
    expect(addBreadcrumbMock).toHaveBeenCalledWith({
      category: 'golf.round',
      message: 'autosave',
      level: 'info',
    });
  });

  it('forwards allow-listed data keys', () => {
    recordHelmBreadcrumb('golf.shot', 'shot-edit-save', {
      action: 'edit',
      result: 'success',
      count: 3,
      round_ordinal: 7,
      feature: 'round_tracking',
    });
    expect(addBreadcrumbMock).toHaveBeenCalledWith({
      category: 'golf.shot',
      message: 'shot-edit-save',
      level: 'info',
      data: {
        action: 'edit',
        result: 'success',
        count: 3,
        round_ordinal: 7,
        feature: 'round_tracking',
      },
    });
  });

  it('strips any key outside the allow-list even if forced past the type via a cast', () => {
    const unsafeData = {
      action: 'save',
      playerId: 'abc-123',
      playerName: 'Jordan Rivera',
      email: 'jordan@example.com',
      roundId: 'round-999',
    } as unknown as Parameters<typeof recordHelmBreadcrumb>[2];

    recordHelmBreadcrumb('golf.round', 'autosave', unsafeData);

    const call = addBreadcrumbMock.mock.calls[0]![0];
    expect(call.data).toEqual({ action: 'save' });
    expect(call.data.playerId).toBeUndefined();
    expect(call.data.playerName).toBeUndefined();
    expect(call.data.email).toBeUndefined();
    expect(call.data.roundId).toBeUndefined();
  });

  it('omits the data field entirely when no allow-listed key is present', () => {
    recordHelmBreadcrumb('navigation', 'route-change', {} as never);
    expect(addBreadcrumbMock).toHaveBeenCalledWith({
      category: 'navigation',
      message: 'route-change',
      level: 'info',
    });
  });

  it('never throws when Sentry.addBreadcrumb itself throws', () => {
    addBreadcrumbMock.mockImplementation(() => {
      throw new Error('SDK not initialized');
    });
    expect(() => recordHelmBreadcrumb('auth', 'login-outcome', { result: 'success' })).not.toThrow();
  });

  it('accepts every documented category without a type error', () => {
    recordHelmBreadcrumb('golf.round', 'm');
    recordHelmBreadcrumb('golf.shot', 'm');
    recordHelmBreadcrumb('coachhelm', 'm');
    recordHelmBreadcrumb('auth', 'm');
    recordHelmBreadcrumb('navigation', 'm');
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(5);
  });
});

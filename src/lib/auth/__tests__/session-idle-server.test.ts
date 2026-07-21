import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: mocks.set })),
}));

import { resetSessionIdleMarker } from '@/lib/auth/session-idle-server';
import {
  SESSION_IDLE_COOKIE,
  SESSION_IDLE_COOKIE_MAX_AGE_S,
} from '@/lib/auth/session-idle-shared';

describe('resetSessionIdleMarker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces a previous session marker with the successful-login timestamp', async () => {
    await resetSessionIdleMarker(1_784_590_000_000);

    expect(mocks.set).toHaveBeenCalledWith(
      SESSION_IDLE_COOKIE,
      '1784590000000',
      expect.objectContaining({
        path: '/',
        maxAge: SESSION_IDLE_COOKIE_MAX_AGE_S,
        sameSite: 'lax',
        httpOnly: false,
      }),
    );
  });
});

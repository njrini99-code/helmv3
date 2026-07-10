// =============================================================================
// redirectOnUnauthorized — shared guard used by every Server Component page
// that calls a withBaseballAction-wrapped getter directly (decision-room,
// settings/audit, settings/imports, settings/integrations,
// settings/permissions, settings/program, settings/roles, settings/season,
// settings/teams — and the previously-fixed scout-packet/preview and
// scout-packets pages). Pins the three behaviors every caller relies on:
//   1. isUnauthorized(error) === true  -> redirect(returnTo), never resolves.
//   2. isUnauthorized(error) === false -> rethrows the ORIGINAL error, no redirect.
//   3. action() succeeds                -> returns the value, no redirect.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import { redirectOnUnauthorized } from '../redirect-on-unauthorized';

class FakeUnauthorizedError extends Error {}

describe('redirectOnUnauthorized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to the given returnTo (URL-encoded) when isUnauthorized matches the thrown error', async () => {
    const action = vi.fn(async () => {
      throw new FakeUnauthorizedError('session expired');
    });

    await expect(
      redirectOnUnauthorized(
        action,
        (error) => error instanceof FakeUnauthorizedError,
        '/baseball/dashboard/settings/program',
      ),
    ).rejects.toThrow(
      'REDIRECT:/baseball/login?returnTo=' +
        encodeURIComponent('/baseball/dashboard/settings/program'),
    );
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
  });

  it('URL-encodes query params already present in returnTo', async () => {
    const action = vi.fn(async () => {
      throw new FakeUnauthorizedError();
    });

    await expect(
      redirectOnUnauthorized(
        action,
        () => true,
        '/baseball/dashboard/players/player-1/scout-packet/preview',
      ),
    ).rejects.toThrow(
      'REDIRECT:/baseball/login?returnTo=' +
        encodeURIComponent('/baseball/dashboard/players/player-1/scout-packet/preview'),
    );
  });

  it('rethrows the original error unchanged when isUnauthorized returns false, without redirecting', async () => {
    const realError = new Error('a genuine capability failure');
    const action = vi.fn(async () => {
      throw realError;
    });

    await expect(
      redirectOnUnauthorized(action, () => false, '/baseball/dashboard/settings/program'),
    ).rejects.toBe(realError);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('returns the resolved value when action succeeds, without redirecting', async () => {
    const action = vi.fn(async () => ({ ok: true as const }));

    const result = await redirectOnUnauthorized(
      action,
      () => true,
      '/baseball/dashboard/settings/program',
    );

    expect(result).toEqual({ ok: true });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

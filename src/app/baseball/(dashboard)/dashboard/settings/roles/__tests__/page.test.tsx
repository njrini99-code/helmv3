// =============================================================================
// RolesPage — BaseballUnauthorizedError must redirect, not raw-throw.
//
// getRoleTemplates (withBaseballAction) independently re-resolves auth, so a
// session that expires between the page's own supabase.auth.getUser() check
// and this call throws BaseballUnauthorizedError. Before this fix, that error
// propagated straight out of the Server Component render to error.tsx and the
// error tracker (Sentry/Vercel) — the same class of bug fixed on the
// scout-packet/preview and scout-packets pages. This test pins the fix: the
// unauthorized case now redirects to /baseball/login (preserving returnTo),
// while any OTHER thrown error (a real failure for a signed-in, authorized
// coach) still propagates so error.tsx keeps handling genuine failures.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'coach-1' } } })),
  getRoleTemplates: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock('@/app/baseball/actions/roles-permissions', () => ({
  getRoleTemplates: mocks.getRoleTemplates,
}));

// Mocked locally (not the real with-baseball-action module) so the page's
// `instanceof BaseballUnauthorizedError` check runs against the SAME class
// reference this test constructs errors with — no need to pull in the real
// module's Sentry/Supabase/capability dependency graph just to reach one
// error class. Defined inside vi.hoisted since vi.mock factories are hoisted
// above normal top-level declarations.
const { FakeBaseballUnauthorizedError } = vi.hoisted(() => ({
  FakeBaseballUnauthorizedError: class FakeBaseballUnauthorizedError extends Error {
    readonly status = 401;
    constructor(message = 'You must be signed in.') {
      super(message);
      this.name = 'BaseballUnauthorizedError';
    }
  },
}));
vi.mock('@/lib/baseball/with-baseball-action', () => ({
  BaseballUnauthorizedError: FakeBaseballUnauthorizedError,
}));

import RolesPage from '../page';

describe('RolesPage — BaseballUnauthorizedError redirects instead of raw-throwing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'coach-1' } } });
  });

  it('redirects to /baseball/login (with returnTo) when the session expired between the auth check and the templates fetch', async () => {
    mocks.getRoleTemplates.mockRejectedValue(new FakeBaseballUnauthorizedError());

    await expect(RolesPage()).rejects.toThrow(
      'REDIRECT:/baseball/login?returnTo=' +
        encodeURIComponent('/baseball/dashboard/settings/roles'),
    );
  });

  it('re-throws any OTHER error (a real failure for a signed-in, authorized coach) instead of redirecting', async () => {
    mocks.getRoleTemplates.mockRejectedValue(new Error('role templates query failed'));

    await expect(RolesPage()).rejects.toThrow('role templates query failed');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('renders normally when the templates fetch succeeds', async () => {
    mocks.getRoleTemplates.mockResolvedValue({
      programLabel: 'College',
      roleTemplates: [],
      viewerCanInviteStaff: false,
    });

    const element = await RolesPage();
    expect(element).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

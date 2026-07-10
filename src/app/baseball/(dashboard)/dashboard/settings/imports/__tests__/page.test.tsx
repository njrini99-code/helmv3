// =============================================================================
// ImportSourcesPage — BaseballUnauthorizedError must redirect, not raw-throw.
//
// getProgramSettings and listImportSources (both withBaseballAction)
// independently re-resolve auth, so a session that expires between the
// page's own supabase.auth.getUser() check and these calls throws
// BaseballUnauthorizedError. Before this fix, that error propagated straight
// out of the Server Component render to error.tsx and the error tracker
// (Sentry/Vercel) — the same class of bug fixed on the scout-packet/preview
// and scout-packets pages. This test pins the fix: the unauthorized case now
// redirects to /baseball/login (preserving returnTo) whether it surfaces on
// the FIRST or the SECOND sequential getter call, while any OTHER thrown
// error (a real failure for a signed-in, authorized coach) still propagates
// so error.tsx keeps handling genuine failures.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'coach-1' } } })),
  getProgramSettings: vi.fn(),
  listImportSources: vi.fn(),
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

vi.mock('@/app/baseball/actions/program-settings', () => ({
  getProgramSettings: mocks.getProgramSettings,
  listImportSources: mocks.listImportSources,
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

vi.mock('@/components/baseball/settings/ImportSourcesClient', () => ({
  ImportSourcesClient: () => null,
}));

import ImportSourcesPage from '../page';

describe('ImportSourcesPage — BaseballUnauthorizedError redirects instead of raw-throwing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'coach-1' } } });
  });

  it('redirects to /baseball/login (with returnTo) when the session expired before the FIRST getter call', async () => {
    mocks.getProgramSettings.mockRejectedValue(new FakeBaseballUnauthorizedError());

    await expect(ImportSourcesPage()).rejects.toThrow(
      'REDIRECT:/baseball/login?returnTo=' +
        encodeURIComponent('/baseball/dashboard/settings/imports'),
    );
    expect(mocks.listImportSources).not.toHaveBeenCalled();
  });

  it('redirects to /baseball/login (with returnTo) when the session expired before the SECOND getter call', async () => {
    mocks.getProgramSettings.mockResolvedValue({
      teamName: 'Rini U',
      viewerCanManageImports: true,
    });
    mocks.listImportSources.mockRejectedValue(new FakeBaseballUnauthorizedError());

    await expect(ImportSourcesPage()).rejects.toThrow(
      'REDIRECT:/baseball/login?returnTo=' +
        encodeURIComponent('/baseball/dashboard/settings/imports'),
    );
  });

  it('re-throws any OTHER error (a real failure for a signed-in, authorized coach) instead of redirecting', async () => {
    mocks.getProgramSettings.mockResolvedValue({
      teamName: 'Rini U',
      viewerCanManageImports: true,
    });
    mocks.listImportSources.mockRejectedValue(new Error('import sources query failed'));

    await expect(ImportSourcesPage()).rejects.toThrow('import sources query failed');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('renders normally when both fetches succeed', async () => {
    mocks.getProgramSettings.mockResolvedValue({
      teamName: 'Rini U',
      viewerCanManageImports: true,
    });
    mocks.listImportSources.mockResolvedValue([]);

    const element = await ImportSourcesPage();
    expect(element).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

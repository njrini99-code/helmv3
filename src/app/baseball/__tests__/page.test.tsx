// =============================================================================
// BaseballLandingPage — signed-in redirect preserved, signed-out renders the
// marketing page.
//
// The bare `/baseball` route used to unconditionally redirect (even
// signed-out visitors got bounced to /baseball/login with zero context).
// This pins the fix: a signed-in session still redirects straight to the
// right dashboard (coach vs. player), while no session renders the public
// landing content instead of redirecting.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionProfile: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: mocks.getSessionProfile,
}));

import BaseballLandingPage from '../page';

describe('BaseballLandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a coach session straight to the command center', async () => {
    mocks.getSessionProfile.mockResolvedValue({
      userId: 'coach-1',
      role: 'coach',
      coach: { id: 'coach-1' },
      player: null,
    });

    await expect(BaseballLandingPage()).rejects.toThrow(
      'REDIRECT:/baseball/dashboard/command-center',
    );
  });

  it('redirects a player session straight to their daily hub', async () => {
    mocks.getSessionProfile.mockResolvedValue({
      userId: 'player-1',
      role: 'player',
      coach: null,
      player: { id: 'player-1' },
    });

    await expect(BaseballLandingPage()).rejects.toThrow('REDIRECT:/baseball/player/today');
  });

  it('renders the public marketing page for a signed-out visitor instead of redirecting', async () => {
    mocks.getSessionProfile.mockResolvedValue(null);

    const element = await BaseballLandingPage();

    expect(element).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

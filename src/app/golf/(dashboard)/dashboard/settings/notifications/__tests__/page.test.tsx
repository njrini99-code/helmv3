// =============================================================================
// NotificationPrefsPage — a coach must reach working notification settings
// WITHOUT a redirect, and never a near-blank stand-in card.
//
// A coach landing on /dashboard/settings/notifications (direct URL / stale
// bookmark) once got a card with one paragraph and zero controls (audit W4 —
// no blank pages). That was first fixed with `redirect('/golf/dashboard/settings')`.
//
// #1251 — the redirect itself crashed React (#310, "rendered more hooks than
// during the previous render") on 3/3 coach loads, thrown inside Next's client
// router. The page now draws Clubhouse's one Settings page on its
// Notifications section for both roles (each has one), in place.
//
// This test pins BOTH properties, because satisfying one by breaking the
// other is exactly how this regressed: no redirect (no crash) AND a real
// notifications surface (no dead end), for a coach and for a player.
// =============================================================================

import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGolfSessionProfile: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
function ClubhouseSettingsRouteStub() {
  return null;
}
vi.mock('@/clubhouse/routes/settings', () => ({ ClubhouseSettingsRoute: ClubhouseSettingsRouteStub }));
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: mocks.getGolfSessionProfile,
}));

import NotificationPrefsPage from '../page';

describe('NotificationPrefsPage — no redirect and no blank card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /golf/login when there is no session at all', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue(null);

    await expect(NotificationPrefsPage()).rejects.toThrow('REDIRECT:/golf/login');
  });

  it.each([
    ['a coach (#1251)', { userId: 'coach-1', role: 'coach', coach: { id: 'coach-1' }, player: null }],
    ['a player', { userId: 'player-1', role: 'player', coach: null, player: { id: 'player-1' } }],
  ])('opens the Notifications section of Settings for %s, WITHOUT redirecting', async (_who, session) => {
    mocks.getGolfSessionProfile.mockResolvedValue(session);

    const element = (await NotificationPrefsPage()) as ReactElement<{ section?: string }>;

    // No redirect at all — that is what crashed the client router.
    expect(mocks.redirect).not.toHaveBeenCalled();
    // ...and still no dead end: the section that holds the delivery preferences.
    expect(element.type).toBe(ClubhouseSettingsRouteStub);
    expect(element.props.section).toBe('notifications');
  });
});

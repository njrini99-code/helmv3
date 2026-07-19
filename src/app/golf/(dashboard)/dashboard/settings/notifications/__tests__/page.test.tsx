// =============================================================================
// NotificationPrefsPage — coaches must redirect to the working Settings
// surface, not render a near-blank stand-in card.
//
// /dashboard/settings/notifications renders the player-only per-category
// notification-channel matrix (golf_player_notification_state has no coach
// equivalent). Before this fix, a coach landing here (direct URL / stale
// bookmark) got a card with one paragraph of text and zero controls — a dead
// end that contradicted the real, working Notifications panel already on the
// general Settings page. This test pins the fix: no player profile now
// redirects straight to /golf/dashboard/settings instead of rendering that
// near-empty card, while a real player session still gets the full matrix.
// (audit W4 — no blank pages.)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGolfSessionProfile: vi.fn(),
  maybeSingle: vi.fn(async (): Promise<{ data: unknown }> => ({ data: null })),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: mocks.getGolfSessionProfile,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
    }),
  })),
}));

vi.mock('@/components/fairway/pages/settings', () => ({
  FairwaySettingsNotifications: (props: { prefs: unknown; quietMode: boolean }) => ({
    type: 'FairwaySettingsNotifications',
    props,
  }),
}));

import NotificationPrefsPage from '../page';

describe('NotificationPrefsPage — coach dead-end redirects instead of rendering a near-blank card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingle.mockResolvedValue({ data: null });
  });

  it('redirects to /golf/login when there is no session at all', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue(null);

    await expect(NotificationPrefsPage()).rejects.toThrow('REDIRECT:/golf/login');
  });

  it('redirects a coach (no player profile) to the general Settings page instead of rendering a stand-in card', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue({
      userId: 'coach-1',
      role: 'coach',
      coach: { id: 'coach-1' },
      player: null,
    });

    await expect(NotificationPrefsPage()).rejects.toThrow(
      'REDIRECT:/golf/dashboard/settings',
    );
  });

  it('renders the real per-category notification matrix for a player session', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue({
      userId: 'player-1',
      role: 'player',
      coach: null,
      player: { id: 'player-1' },
    });
    mocks.maybeSingle.mockResolvedValue({
      data: { prefs: { round_review_ready: { push: true, email: false, in_app: true } }, quiet_mode: true },
    });

    const element = await NotificationPrefsPage();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element).toBeTruthy();
  });
});

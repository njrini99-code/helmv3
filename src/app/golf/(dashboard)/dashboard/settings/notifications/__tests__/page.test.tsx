// =============================================================================
// NotificationPrefsPage — a coach must be sent to the working Settings surface
// WITHOUT a redirect, and never shown a near-blank stand-in card.
//
// /dashboard/settings/notifications renders the player-only per-category
// notification-channel matrix (golf_player_notification_state has no coach
// equivalent). A coach landing here (direct URL / stale bookmark) originally
// got a card with one paragraph and zero controls — a dead end that
// contradicted the real, working Notifications panel on the general Settings
// page (audit W4 — no blank pages). That was first fixed with
// `redirect('/golf/dashboard/settings')`.
//
// #1251 — the redirect itself crashed React (#310, "rendered more hooks than
// during the previous render") on 3/3 coach loads, thrown inside Next's client
// router. The role-conditional check cannot be hoisted into `next.config.mjs`
// `redirects()` (the config layer has no session), so the redirect is gone and
// the page renders <FeatureUnavailable> IN PLACE instead.
//
// This test now pins BOTH properties, because satisfying one by breaking the
// other is exactly how this regressed: a coach gets no redirect (no crash) AND
// a real explanation plus a CTA to the working surface (no dead end).
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

vi.mock('@/components/fairway', () => ({
  FeatureUnavailable: (props: {
    title: string;
    message: string;
    actionHref?: string;
    actionLabel?: string;
  }) => ({ type: 'FeatureUnavailable', props }),
}));

vi.mock('@/components/fairway/pages/settings', () => ({
  FairwaySettingsNotifications: (props: { prefs: unknown; quietMode: boolean }) => ({
    type: 'FairwaySettingsNotifications',
    props,
  }),
}));

import NotificationPrefsPage from '../page';

describe('NotificationPrefsPage — a coach gets an explained hand-off, not a redirect and not a blank card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingle.mockResolvedValue({ data: null });
  });

  it('redirects to /golf/login when there is no session at all', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue(null);

    await expect(NotificationPrefsPage()).rejects.toThrow('REDIRECT:/golf/login');
  });

  it('sends a coach to the general Settings page WITHOUT redirecting (#1251)', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue({
      userId: 'coach-1',
      role: 'coach',
      coach: { id: 'coach-1' },
      player: null,
    });

    const element = (await NotificationPrefsPage()) as unknown as {
      type: { name: string };
      props: { title: string; message: string; actionHref?: string; actionLabel?: string };
    };

    // No redirect at all — that is what crashed the client router.
    expect(mocks.redirect).not.toHaveBeenCalled();

    // ...and still no dead end: a stated reason plus a CTA to the surface that
    // actually holds the coach's delivery preferences.
    expect(element.type.name).toBe('FeatureUnavailable');
    expect(element.props.actionHref).toBe('/golf/dashboard/settings');
    expect(element.props.message.trim().length).toBeGreaterThan(0);
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

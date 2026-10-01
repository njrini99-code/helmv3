import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The iOS app shell: what Clubhouse owes the native layer (docs/clubhouse/MOBILE.md). */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({ notificationsUnread: 0, calendarNotifications: 0, refetch: vi.fn() }) }));

const order = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/utils/push-registration', () => ({ teardownDeviceTokenOnSignOut: () => order.push('teardown') }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: async () => void order.push('signOut') } }) }));
vi.mock('@/app/golf/actions/team-switcher', () => ({ clearActiveTeam: async () => void order.push('clearActiveTeam') }));
vi.mock('@/lib/golf/client-resource-cache', () => ({ clearAllCachedResources: vi.fn() }));
vi.mock('@/app/actions/notification-preferences', () => ({ updateNotificationPreferences: vi.fn() }));
vi.mock('@/app/golf/actions/v3/notification-prefs', () => ({ setAllChannels: vi.fn(), setCategoryChannel: vi.fn(), setQuietMode: vi.fn() }));
vi.mock('@/app/golf/actions/coaching-philosophy', () => ({ revalidateCoachingPhilosophyPaths: vi.fn(), saveCoachingPhilosophy: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ cancelJoinRequest: vi.fn(), createTeamJoinRequest: vi.fn(), regenerateJoinCode: vi.fn() }));
vi.mock('@/app/golf/actions/insights', () => ({ updateTeamCoachHelmSettings: vi.fn() }));

import { NativeSwipeBackBridge } from '@/components/golf/NativeSwipeBackBridge';
import { createLiveWrites } from '../screens/settings/writes';
import { TabBar } from '../shell/TabBar';
import { PREVIEW_SHELL } from '../preview/fixtures';

type HelmWindow = { webkit?: { messageHandlers?: { helmNav?: { postMessage: (b: { overlayOpen: boolean }) => void } } } };
afterEach(() => {
  delete (window as unknown as HelmWindow).webkit;
});

describe('Clubhouse in the iOS app', () => {
  it('signing out stops this phone getting pushes first, while still signed in', async () => {
    order.length = 0;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, href: '' } });
    const writes = createLiveWrites({ role: 'coach', userId: 'u', email: null, coachId: 'c', playerId: null, teamId: 't', refresh: () => {} });
    await writes.signOut();
    expect(order).toEqual(['teardown', 'clearActiveTeam', 'signOut']);
  });

  it('the More sheet tells the shell a sheet is open, so an edge swipe cannot leave the page under it', async () => {
    const postMessage = vi.fn();
    (window as unknown as HelmWindow).webkit = { messageHandlers: { helmNav: { postMessage } } };
    const user = userEvent.setup();
    render(
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <NativeSwipeBackBridge />
          {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
          <TabBar pathname="/golf/dashboard" shell={PREVIEW_SHELL} role="coach" />
        </div>
      </LazyMotion>,
    );
    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith({ overlayOpen: false }));
    await user.click(screen.getByRole('button', { name: 'More' }));
    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith({ overlayOpen: true }));
  });
});

describe('phone width', () => {
  it('useChPhone follows the 820px breakpoint the stylesheets use', async () => {
    const { useChPhone, CH_PHONE_QUERY } = await import('../lib/use-phone');
    const { renderHook } = await import('@testing-library/react');
    const seen: string[] = [];
    window.matchMedia = ((q: string) => {
      seen.push(q);
      return { matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} };
    }) as never;
    expect(renderHook(() => useChPhone()).result.current).toBe(true);
    expect(seen).toContain(CH_PHONE_QUERY);
    expect(CH_PHONE_QUERY).toBe('(max-width: 820px)');
  });
});

import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GolfUserData } from '@/contexts/golf-user-context';

const signOutSpy = vi.hoisted(() => vi.fn());
vi.mock('../../lib/sign-out', () => ({ chSignOut: signOutSpy }));
vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false, updatePreferences: vi.fn() }) }));
vi.mock('@/contexts/notification-badge-context', () => ({
  useNotificationBadges: () => ({ notificationsUnread: 0, calendarNotifications: 0, messages: 0, announcements: 0, tasks: 0, travel: 0, refetch: vi.fn() }),
}));
const setActiveTeam = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/team-switcher', () => ({ setActiveTeam }));

import { ToastProvider } from '../../ui/Toast';
import { Sidebar } from '../Sidebar';
import type { ChShellData } from '../../data/shell';

const coach = { role: 'coach', name: 'Maya Reyes', teamName: 'Varsity' } as unknown as GolfUserData;
const shell = { nextEvent: null, pendingJoinRequests: null, viewerIsHeadCoach: true } as unknown as ChShellData;

function mount(teamSwitch: Parameters<typeof Sidebar>[0]['teamSwitch'] = null) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Sidebar userData={coach} shell={shell} pathname="/golf/dashboard" teamSwitch={teamSwitch} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}

const trigger = () => screen.getByRole('button', { name: 'Maya Reyes. Account' });
const open = () => act(() => void fireEvent.click(trigger()));
const menu = () => screen.getByRole('menu', { name: 'Account' });
const rows = () => Array.from(menu().querySelectorAll('[role="menuitem"],[role="menuitemradio"]')).map((r) => r.textContent);

beforeEach(() => {
  signOutSpy.mockReset();
  setActiveTeam.mockReset();
});
afterEach(cleanup);

describe('the sidebar identity is the account menu (B11)', () => {
  it('keeps the identity block when closed, and opens a menu of Settings, Help and Sign out', async () => {
    mount();
    const key = trigger();
    expect(key).toHaveClass('ch-identity');
    expect(key.querySelector('.ch-identity__meta')?.textContent).toBe('Head coach · Varsity');
    expect(key).toHaveAttribute('aria-haspopup', 'menu');
    expect(key).toHaveAttribute('aria-expanded', 'false');
    open();
    expect(key).toHaveAttribute('aria-expanded', 'true');
    expect(rows()).toEqual(['Settings', 'Help', 'Sign out']);
    expect(within(menu()).getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/golf/dashboard/settings');
    expect(within(menu()).getByRole('menuitem', { name: 'Help' })).toHaveAttribute('href', '/golf/dashboard/settings#set-help');
    // Focus goes into the list, as every Menu does.
    await waitFor(() => expect(document.activeElement).toBe(within(menu()).getByRole('menuitem', { name: 'Settings' })));
  });

  it('Sign out is the one sign-out path (lib/sign-out.ts)', async () => {
    signOutSpy.mockResolvedValue(undefined);
    mount();
    open();
    act(() => void fireEvent.click(within(menu()).getByRole('menuitem', { name: 'Sign out' })));
    await waitFor(() => expect(signOutSpy).toHaveBeenCalledTimes(1));
  });

  it('a sign-out that fails says so, with a retry', async () => {
    signOutSpy.mockRejectedValue(new Error('offline'));
    mount();
    open();
    act(() => void fireEvent.click(within(menu()).getByRole('menuitem', { name: 'Sign out' })));
    expect(await screen.findByText('Couldn’t sign you out')).toBeInTheDocument();
  });

  it('a head coach on more than one team switches teams from it, the current one ticked', async () => {
    setActiveTeam.mockResolvedValue({ success: true });
    mount({ activeId: 't1', choices: [{ id: 't1', label: 'Varsity' }, { id: 't2', label: 'JV' }] });
    open();
    expect(rows()).toEqual(['Settings', 'Varsity', 'JV', 'Help', 'Sign out']);
    expect(within(menu()).getByRole('menuitemradio', { name: 'Varsity' })).toHaveAttribute('aria-checked', 'true');
    act(() => void fireEvent.click(within(menu()).getByRole('menuitemradio', { name: 'JV' })));
    await waitFor(() => expect(setActiveTeam).toHaveBeenCalledWith('t2'));
  });
});

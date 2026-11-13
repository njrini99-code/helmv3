import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Coach audit 13 Nov 2026 (§2 Notifications): with Guilford active, every item in the bell was Demo University's, with
 * no team on it, and opening "Message from Cole Bennett" landed on Guilford's Messages saying "Pick a conversation".
 * Now another team's item names its team, and opening it switches to that team first ("Switched to …"), then opens it.
 * A coach who can't switch is told so and stays where they are.
 */

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const routerSpy = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routerSpy, usePathname: () => '/golf/dashboard' }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({ notificationsUnread: 3, calendarNotifications: 0, messages: 0, announcements: 0, tasks: 0, travel: 0, refetch: vi.fn() }) }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));
const switcher = vi.hoisted(() => ({ setActiveTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-switcher', () => switcher);
const who = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
const phone = vi.hoisted(() => ({ on: false }));
vi.mock('../../lib/use-phone', async (orig) => ({ ...(await orig<object>()), useChPhone: () => phone.on }));
vi.mock('@/contexts/golf-user-context', () => ({ useGolfUserOptional: () => who.user, useGolfUser: () => who.user }));

import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { Bell, BellSourceProvider, type ChBellApi } from '../Bell';
import { ToastProvider } from '../../ui/Toast';

const GUILFORD = { id: 'guilford', name: 'Guilford College Men’s Golf (Test Copy)' };
const DEMO = { id: 'demo', name: 'Demo University Golf' };
const DEMO_LINK = '/golf/dashboard/messages?conversation=c-demo';

const item = (id: string, title: string, team: UnifiedNotificationItem['team'], action_url = `/golf/dashboard/messages?conversation=${id}`): UnifiedNotificationItem => ({
  id,
  source: 'golf_calendar_notifications',
  category: 'messages',
  title,
  body: null,
  action_url,
  created_at: new Date().toISOString(),
  read_at: null,
  team,
});

const FEED = [
  item('c-demo', 'Message from Cole Bennett', DEMO, DEMO_LINK),
  item('c-mine', 'Message from Samanyu', GUILFORD),
  item('c-dm', 'Message from Ava', null),
];

const headCoach = { role: 'coach', userId: 'u1', name: 'Nick', teamId: GUILFORD.id, canSwitchTeams: true, coachTeams: [{ ...GUILFORD, gender: 'men' }, { ...DEMO, gender: 'men' }] };
const assistant = { ...headCoach, canSwitchTeams: false };

function openBell() {
  const api: ChBellApi = {
    unread: 3,
    load: vi.fn(() => Promise.resolve({ success: true, data: { items: FEED } })),
    markRead: vi.fn(() => Promise.resolve({ success: true })),
    markAll: vi.fn(() => Promise.resolve({ success: true })),
    refetchCount: vi.fn(),
  };
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <BellSourceProvider api={api}>
            <Bell />
          </BellSourceProvider>
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return api;
}

async function showAll(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole('button', { name: /Notifications/ }));
  // The three unread messages are the only New stack, which opens by itself: each card is its own button.
  await screen.findByText('Message from Ava');
}

const card = (title: string) => screen.getByText(title).closest('button')!;

beforeEach(() => {
  phone.on = false;
  who.user = headCoach;
  switcher.setActiveTeam.mockReset();
});
afterEach(() => routerSpy.push.mockClear());

describe('another team’s notification', () => {
  it('names its team in the bell; this team’s and a direct message name none', async () => {
    const u = userEvent.setup();
    openBell();
    await showAll(u);
    expect(within(card('Message from Cole Bennett')).getByText('Demo University Golf')).toBeTruthy();
    expect(within(card('Message from Samanyu')).queryByText(GUILFORD.name)).toBeNull();
    expect(within(card('Message from Ava')).queryByText(/Golf/)).toBeNull();
  });

  it('names its team on the phone’s cards too', async () => {
    phone.on = true;
    const u = userEvent.setup();
    openBell();
    await showAll(u);
    expect(within(card('Message from Cole Bennett')).getByText('Demo University Golf')).toBeTruthy();
    expect(within(card('Message from Samanyu')).queryByText(GUILFORD.name)).toBeNull();
  });

  it('opening it switches to that team, says so, then opens it', async () => {
    const u = userEvent.setup();
    let release: (v: { success: true }) => void = () => {};
    switcher.setActiveTeam.mockImplementation(() => new Promise((r) => (release = r)));
    openBell();
    await showAll(u);
    await u.click(card('Message from Cole Bennett'));
    expect(switcher.setActiveTeam).toHaveBeenCalledWith(DEMO.id);
    expect(routerSpy.push).not.toHaveBeenCalled();
    release({ success: true });
    await waitFor(() => expect(routerSpy.push).toHaveBeenCalledWith(DEMO_LINK));
    expect(await screen.findByText('Switched to Demo University Golf')).toBeTruthy();
  });

  it('when the switch is refused, it says why and opens nothing', async () => {
    const u = userEvent.setup();
    switcher.setActiveTeam.mockResolvedValue({ success: false, reason: 'unauthorized' });
    openBell();
    await showAll(u);
    await u.click(card('Message from Cole Bennett'));
    expect(await screen.findByText('Couldn’t switch to Demo University Golf')).toBeTruthy();
    expect(screen.getByText('You aren’t staffed on that team.')).toBeTruthy();
    expect(routerSpy.push).not.toHaveBeenCalled();
  });

  it('a coach who can’t switch teams is told so, and nothing is switched or opened', async () => {
    who.user = assistant;
    const u = userEvent.setup();
    openBell();
    await showAll(u);
    await u.click(card('Message from Cole Bennett'));
    expect(await screen.findByText('Couldn’t switch to Demo University Golf')).toBeTruthy();
    expect(screen.getByText('Only a head coach staffed on more than one team can switch.')).toBeTruthy();
    expect(switcher.setActiveTeam).not.toHaveBeenCalled();
    expect(routerSpy.push).not.toHaveBeenCalled();
  });
});

describe('this team’s notification, or one with no team', () => {
  it('opens at once, with no switch', async () => {
    const u = userEvent.setup();
    openBell();
    await showAll(u);
    await u.click(card('Message from Ava'));
    expect(switcher.setActiveTeam).not.toHaveBeenCalled();
    expect(routerSpy.push).toHaveBeenCalledWith('/golf/dashboard/messages?conversation=c-dm');
  });
});

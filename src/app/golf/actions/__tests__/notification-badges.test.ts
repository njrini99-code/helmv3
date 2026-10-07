import { beforeEach, describe, expect, it, vi } from 'vitest';

const { playerMock, coachMock, alertsMock, unreadMock } = vi.hoisted(() => ({
  playerMock: vi.fn(),
  coachMock: vi.fn(),
  alertsMock: vi.fn(),
  unreadMock: vi.fn(),
}));

vi.mock('../player-notifications', () => ({ getPlayerNotificationCounts: playerMock }));
vi.mock('../coach-notifications', () => ({ getCoachNotificationCounts: coachMock }));
vi.mock('../alerts', () => ({ getAlertCounts: alertsMock }));
vi.mock('../unified-notifications', () => ({ getNotificationsUnreadCount: unreadMock }));

import { getNotificationBadgeBundle } from '../notification-badges';

describe('getNotificationBadgeBundle', () => {
  beforeEach(() => {
    playerMock.mockReset().mockResolvedValue({ success: true, data: { unreadMessages: 1 } });
    coachMock.mockReset().mockResolvedValue({ success: true, data: { unreadMessages: 2, calendarNotifications: 0 } });
    alertsMock.mockReset().mockResolvedValue({ success: true, counts: { critical: 1, warning: 0, info: 0, total: 1 } });
    unreadMock.mockReset().mockResolvedValue({ success: true, data: { unread: 3 } });
  });

  it('runs the player reads and never the coach-only ones for a player', async () => {
    const out = await getNotificationBadgeBundle({ role: 'player', userId: 'u', playerId: 'p', teamId: 't' });
    expect(playerMock).toHaveBeenCalledWith('p', 'u', 't');
    expect(coachMock).not.toHaveBeenCalled();
    expect(alertsMock).not.toHaveBeenCalled();
    expect(out.player?.data).toEqual({ unreadMessages: 1 });
    expect(out.coach).toBeNull();
    expect(out.alerts).toBeNull();
    expect(out.unread?.data).toEqual({ unread: 3 });
  });

  it('runs the coach reads in parallel (all started before any resolves)', async () => {
    const started: string[] = [];
    const gate = new Promise<void>((r) => setTimeout(r, 0));
    coachMock.mockImplementation(async () => { started.push('coach'); await gate; return { success: true, data: { unreadMessages: 0, calendarNotifications: 0 } }; });
    alertsMock.mockImplementation(async () => { started.push('alerts'); await gate; return { success: true, counts: { critical: 0, warning: 0, info: 0, total: 0 } }; });
    unreadMock.mockImplementation(async () => { started.push('unread'); await gate; return { success: true, data: { unread: 0 } }; });

    const pending = getNotificationBadgeBundle({ role: 'coach', userId: 'u', coachId: 'c', teamId: 't' });
    await Promise.resolve();
    expect(started.sort()).toEqual(['alerts', 'coach', 'unread']);
    const out = await pending;
    expect(coachMock).toHaveBeenCalledWith('u', 't');
    expect(alertsMock).toHaveBeenCalledWith('c');
    expect(out.player).toBeNull();
  });

  it('degrades one thrown read to null without failing the others', async () => {
    alertsMock.mockRejectedValue(new Error('boom'));
    const out = await getNotificationBadgeBundle({ role: 'coach', userId: 'u', coachId: 'c' });
    expect(out.alerts).toBeNull();
    expect(out.coach?.success).toBe(true);
    expect(out.unread?.success).toBe(true);
  });

  it('skips the player read when the team is not resolved', async () => {
    const out = await getNotificationBadgeBundle({ role: 'player', userId: 'u', playerId: 'p', teamId: null });
    expect(playerMock).not.toHaveBeenCalled();
    expect(out.player).toBeNull();
  });
});

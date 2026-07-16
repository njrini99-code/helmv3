// =============================================================================
// AnalyticsPage — player_type gate.
//
// Fix: the player recruiting hub (My Journey / Discover Colleges / My
// Analytics) had NO `player_type` gate. Per the Recruiting Activation Model,
// a `college` player's recruiting status is "Never" — recruiting profile-view
// analytics mean nothing for their situation — yet a college player could
// reach and fully use this page. This locks in the new gate: a college
// player sees an honest "not available" state instead of the live
// AnalyticsClient; every other player type still gets the real page, and the
// pre-existing coach → command-center redirect is unchanged.
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const getSessionProfileMock = vi.hoisted(() => vi.fn());
const analyticsClientMock = vi.hoisted(() => vi.fn(() => null));

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: getSessionProfileMock,
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock('../AnalyticsClient', () => ({
  default: () => analyticsClientMock(),
}));

import AnalyticsPage from '../page';

describe('AnalyticsPage — player_type gate', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders an honest "not available" state for a college player, WITHOUT rendering AnalyticsClient', async () => {
    getSessionProfileMock.mockResolvedValue({
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'college' },
    });

    const element = await AnalyticsPage();
    render(element);

    expect(screen.getByText("My Analytics isn't for college players")).toBeTruthy();
    expect(analyticsClientMock).not.toHaveBeenCalled();
  });

  it('renders the real AnalyticsClient for a juco player', async () => {
    getSessionProfileMock.mockResolvedValue({
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'juco' },
    });

    const element = await AnalyticsPage();
    render(element);

    expect(analyticsClientMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("My Analytics isn't for college players")).toBeNull();
  });

  it('still redirects coaches to command-center (unchanged behavior)', async () => {
    getSessionProfileMock.mockResolvedValue({
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'college' },
      player: null,
    });

    await expect(AnalyticsPage()).rejects.toThrow('REDIRECT:/baseball/dashboard/command-center');
  });
});

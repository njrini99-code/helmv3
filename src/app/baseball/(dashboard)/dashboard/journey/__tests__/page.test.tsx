// =============================================================================
// JourneyPage — player_type gate.
//
// Fix: the player recruiting hub (My Journey / Discover Colleges / My
// Analytics) had NO `player_type` gate — `requireBaseballPlayerRoute` only
// checks role === 'player'. Per the Recruiting Activation Model, a `college`
// player's recruiting status is "Never" — team features only — yet a college
// player could reach and fully use the school-interest tracker. This locks
// in the new gate: a college player sees an honest "not available" state
// (mirrors the existing `/dashboard/activate` pattern) instead of the live
// JourneyClient; every other player type still gets the real page.
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const getSessionProfileMock = vi.hoisted(() => vi.fn());
const journeyClientMock = vi.hoisted(() => vi.fn((_props: unknown) => null));

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: getSessionProfileMock,
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock('../JourneyClient', () => ({
  default: (props: unknown) => journeyClientMock(props),
}));

import JourneyPage from '../page';

describe('JourneyPage — player_type gate', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders an honest "not available" state for a college player, WITHOUT rendering JourneyClient', async () => {
    getSessionProfileMock.mockResolvedValue({
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'college' },
    });

    const element = await JourneyPage();
    render(element);

    expect(screen.getByText("My Journey isn't for college players")).toBeTruthy();
    expect(journeyClientMock).not.toHaveBeenCalled();
  });

  it('renders the real JourneyClient for a high_school player', async () => {
    getSessionProfileMock.mockResolvedValue({
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'high_school' },
    });

    const element = await JourneyPage();
    render(element);

    expect(journeyClientMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("My Journey isn't for college players")).toBeNull();
  });

  it('still redirects coaches away (unchanged behavior)', async () => {
    getSessionProfileMock.mockResolvedValue({
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'college' },
      player: null,
    });

    await expect(JourneyPage()).rejects.toThrow('REDIRECT:/baseball/dashboard/stats-center');
  });
});

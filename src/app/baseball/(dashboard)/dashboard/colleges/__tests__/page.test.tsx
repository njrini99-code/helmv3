// =============================================================================
// CollegesPage — player_type gate.
//
// Fix: the player recruiting hub (My Journey / Discover Colleges / My
// Analytics) had NO `player_type` gate. Per the Recruiting Activation Model,
// a `college` player's recruiting status is "Never" — team features only —
// yet a college player could reach and fully use college discovery/search.
// This locks in the new gate: a college player sees an honest "not
// available" state instead of the live CollegesClient; every other player
// type still gets the real page.
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const getSessionProfileMock = vi.hoisted(() => vi.fn());
const collegesClientMock = vi.hoisted(() => vi.fn(() => null));

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: getSessionProfileMock,
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock('../CollegesClient', () => ({
  default: () => collegesClientMock(),
}));

import CollegesPage from '../page';

describe('CollegesPage — player_type gate', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders an honest "not available" state for a college player, WITHOUT rendering CollegesClient', async () => {
    getSessionProfileMock.mockResolvedValue({
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'college' },
    });

    const element = await CollegesPage();
    render(element);

    expect(screen.getByText("Discover Colleges isn't for college players")).toBeTruthy();
    expect(collegesClientMock).not.toHaveBeenCalled();
  });

  it('renders the real CollegesClient for a showcase player', async () => {
    getSessionProfileMock.mockResolvedValue({
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'showcase' },
    });

    const element = await CollegesPage();
    render(element);

    expect(collegesClientMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discover Colleges isn't for college players")).toBeNull();
  });
});

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

// Recruiting sunset (src/lib/baseball/product-modules.ts): while the module is
// disabled this route is closed for EVERY player, so the player_type gate
// below never runs in production. The gate is preserved, not deleted — its
// assertions run under a mock-enabled module so the restoration path stays
// covered.
const moduleFlags = vi.hoisted(() => ({ recruitingEnabled: false }));

vi.mock('@/lib/baseball/product-modules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baseball/product-modules')>();
  return { ...actual, isRecruitingEnabled: () => moduleFlags.recruitingEnabled };
});

async function withRecruitingEnabled<T>(fn: () => Promise<T>): Promise<T> {
  moduleFlags.recruitingEnabled = true;
  try {
    return await fn();
  } finally {
    moduleFlags.recruitingEnabled = false;
  }
}

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
    moduleFlags.recruitingEnabled = false;
  });

  it('is closed for EVERY player type while the recruiting module is sunset', async () => {
    for (const player_type of ['college', 'high_school', 'juco', 'showcase']) {
      getSessionProfileMock.mockResolvedValue({
        userId: 'u1',
        role: 'player',
        coach: null,
        player: { id: 'p1', player_type },
      });

      await expect(CollegesPage(), player_type).rejects.toThrow('REDIRECT:/baseball/player/today');
    }
    expect(collegesClientMock).not.toHaveBeenCalled();
  });

  it('renders an honest "not available" state for a college player, WITHOUT rendering CollegesClient — restoration path', async () => {
    getSessionProfileMock.mockResolvedValue({
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'college' },
    });

    const element = await withRecruitingEnabled(() => CollegesPage());
    render(element);

    expect(screen.getByText("Discover Colleges isn't for college players")).toBeTruthy();
    expect(collegesClientMock).not.toHaveBeenCalled();
  });

  it('renders the real CollegesClient for a showcase player — restoration path', async () => {
    getSessionProfileMock.mockResolvedValue({
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'showcase' },
    });

    const element = await withRecruitingEnabled(() => CollegesPage());
    render(element);

    expect(collegesClientMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discover Colleges isn't for college players")).toBeNull();
  });
});

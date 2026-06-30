import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionProfile: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: mocks.getSessionProfile,
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { requireBaseballPlayerRoute } from '../server-route-guards';

describe('requireBaseballPlayerRoute (#410)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated users to login', async () => {
    mocks.getSessionProfile.mockResolvedValue(null);
    await expect(requireBaseballPlayerRoute()).rejects.toThrow('REDIRECT:/baseball/login');
  });

  it('redirects coaches to stats center', async () => {
    mocks.getSessionProfile.mockResolvedValue({
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'college' },
      player: null,
    });
    await expect(requireBaseballPlayerRoute()).rejects.toThrow(
      'REDIRECT:/baseball/dashboard/stats-center',
    );
  });

  it('returns session for players', async () => {
    const session = {
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'high_school' },
    };
    mocks.getSessionProfile.mockResolvedValue(session);
    await expect(requireBaseballPlayerRoute()).resolves.toEqual(session);
  });
});

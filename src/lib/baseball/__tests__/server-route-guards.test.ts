import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionProfile: vi.fn(),
  getActiveBaseballContext: vi.fn(),
  createClient: vi.fn(),
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
  getActiveBaseballContext: mocks.getActiveBaseballContext,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

import {
  requireBaseballPlayerRoute,
  requireRecruitingCoachRoute,
  requireShowcaseOrgRoute,
} from '../server-route-guards';

/** Builds a fake Supabase client whose `.from(table).select().eq().maybeSingle()`
 * chain resolves to `{ data, error: null }` regardless of the table queried —
 * enough surface for the program-type lookups under test. */
function fakeSupabaseClient(data: unknown) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return { from: vi.fn().mockReturnValue(query) };
}

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

describe('getActiveProgramType team_type fallback (Discover redirect-guard fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveBaseballContext.mockResolvedValue({ activeTeamId: 'team-1' });
  });

  it('requireRecruitingCoachRoute allows a college coach when program_type is unset but team_type is set (the exact "left unset" scenario documented in nav-context.ts)', async () => {
    const session = {
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'college' },
      player: null,
    };
    mocks.getSessionProfile.mockResolvedValue(session);
    mocks.createClient.mockResolvedValue(
      fakeSupabaseClient({ program_type: null, team_type: 'college' }),
    );

    await expect(requireRecruitingCoachRoute()).resolves.toEqual(session);
  });

  it('requireShowcaseOrgRoute falls back to team_type so a coach whose coach_type alone would NOT satisfy the gate is still let through via the resolved program type', async () => {
    // coach_type is 'juco' — not in requireShowcaseOrgRoute's allowedCoachTypes
    // (['showcase']) — so this ONLY passes if the program-type half of the OR
    // resolves via the team_type fallback (program_type left null, team_type
    // set to an allowed showcase-family value).
    const session = {
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'juco' },
      player: null,
    };
    mocks.getSessionProfile.mockResolvedValue(session);
    mocks.createClient.mockResolvedValue(
      fakeSupabaseClient({ program_type: null, team_type: 'academy' }),
    );

    await expect(requireShowcaseOrgRoute()).resolves.toEqual(session);
  });

  it('requireShowcaseOrgRoute still redirects when neither coach_type nor the (fallback-resolved) program_type is allowed', async () => {
    const session = {
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'juco' },
      player: null,
    };
    mocks.getSessionProfile.mockResolvedValue(session);
    mocks.createClient.mockResolvedValue(
      fakeSupabaseClient({ program_type: null, team_type: 'college' }),
    );

    await expect(requireShowcaseOrgRoute()).rejects.toThrow(
      'REDIRECT:/baseball/dashboard/command-center',
    );
  });
});

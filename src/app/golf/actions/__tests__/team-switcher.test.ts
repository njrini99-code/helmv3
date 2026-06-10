/**
 * setActiveTeam — the head-coach (program-head) gate.
 *
 * Switching is permitted ONLY when the coach staffs >1 team via
 * golf_team_coach_staff AND holds role 'head_coach' on at least one staff
 * row, AND the requested team is one of their staffed teams. Everyone else
 * (assistants, single-team head coaches, unauthenticated callers) is refused
 * and no cookie is written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (declared before importing the action)
// ---------------------------------------------------------------------------

const cookieSet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: cookieSet,
    get: vi.fn(() => undefined),
  })),
}));

const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

const sessionMock = vi.fn();
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: () => sessionMock(),
}));

const switchContextMock = vi.fn();
vi.mock('@/lib/golf/resolve-team', () => ({
  getCoachTeamSwitchContext: (...args: unknown[]) => switchContextMock(...args),
  getCoachTeams: vi.fn(async () => []),
}));

import { setActiveTeam } from '../team-switcher';

const MENS = { id: 'team-m', name: "Men's Golf", gender: 'mens' };
const WOMENS = { id: 'team-w', name: "Women's Golf", gender: 'womens' };

const coachSession = {
  userId: 'user-1',
  coach: { id: 'coach-1', organization_id: 'org-1' },
  player: null,
};

describe('setActiveTeam — head-coach gate', () => {
  beforeEach(() => {
    cookieSet.mockClear();
    revalidatePathMock.mockClear();
    sessionMock.mockReset();
    switchContextMock.mockReset();
  });

  it('PROGRAM HEAD: multi-team head coach switching to a staffed team → cookie written + revalidated', async () => {
    sessionMock.mockResolvedValue(coachSession);
    switchContextMock.mockResolvedValue({
      teams: [MENS, WOMENS],
      isHeadCoach: true,
      canSwitch: true,
    });

    const result = await setActiveTeam('team-w');

    expect(result).toEqual({ success: true });
    expect(cookieSet).toHaveBeenCalledWith(
      'golf_active_team',
      'team-w',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/golf/dashboard', 'layout');
  });

  it('MULTI-TEAM ASSISTANT: canSwitch=false → refused, no cookie written', async () => {
    sessionMock.mockResolvedValue(coachSession);
    switchContextMock.mockResolvedValue({
      teams: [MENS, WOMENS],
      isHeadCoach: false,
      canSwitch: false,
    });

    const result = await setActiveTeam('team-w');

    expect(result).toEqual({ success: false, reason: 'switching-not-permitted' });
    expect(cookieSet).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("SINGLE-TEAM HEAD COACH (women's head coach): canSwitch=false → refused", async () => {
    sessionMock.mockResolvedValue(coachSession);
    switchContextMock.mockResolvedValue({
      teams: [WOMENS],
      isHeadCoach: true,
      canSwitch: false,
    });

    const result = await setActiveTeam('team-m');

    expect(result).toEqual({ success: false, reason: 'switching-not-permitted' });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('FORGED TARGET: head coach switching to a team they do NOT staff → unauthorized', async () => {
    sessionMock.mockResolvedValue(coachSession);
    switchContextMock.mockResolvedValue({
      teams: [MENS, WOMENS],
      isHeadCoach: true,
      canSwitch: true,
    });

    const result = await setActiveTeam('team-other-org');

    expect(result).toEqual({ success: false, reason: 'unauthorized' });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('UNAUTHENTICATED / non-coach: refused before any lookup', async () => {
    sessionMock.mockResolvedValue(null);

    const result = await setActiveTeam('team-w');

    expect(result).toEqual({ success: false, reason: 'unauthenticated' });
    expect(switchContextMock).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });
});

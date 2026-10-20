// =============================================================================
// Recruiting's Clubhouse branch follows the dashboard layout's role.
//
// Recruiting is a coach screen. Clubhouse Recruiting is drawn only when the gate
// is on for the coach AND the dashboard layout's role (getGolfDashboardRole,
// computed for real here from the session's profiles) is the coach's. A user
// whose coach row was never onboarded beside an onboarded player profile is on
// the player dashboard, so never gets coach Clubhouse Recruiting. The page's own
// coach check, and its Fairway branch, are unchanged.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Profile = { id: string; onboarding_completed: boolean } | null;

const mocks = vi.hoisted(() => ({
  session: { userId: 'u-1', role: 'coach' as 'coach' | 'player', coach: null as Profile, player: null as Profile },
  clubhouse: true,
  getRecruits: vi.fn(async () => ({ success: true, data: [] })),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

function ClubhouseRecruitingRoute() {
  return null;
}
function FairwayRecruitingPage() {
  return null;
}

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn(async () => mocks.session) }));
vi.mock('@/clubhouse/gate', () => ({
  isClubhouseFor: vi.fn(async (role: string | null | undefined) => (role === 'coach' || role === 'player') && mocks.clubhouse),
}));
vi.mock('@/clubhouse/routes/recruiting', () => ({ ClubhouseRecruitingRoute }));
vi.mock('@/components/fairway/pages/recruiting', () => ({ FairwayRecruitingPage }));
vi.mock('@/components/fairway', () => ({ Button: () => null, EmptyState: () => null }));
vi.mock('@/lib/redesign/flag', () => ({ fairwayScope: (s: string) => s }));
vi.mock('@/app/golf/actions/recruiting', () => ({ getRecruits: mocks.getRecruits }));

import RecruitingPage from '../page';

type El = { type: unknown; props: Record<string, unknown> };

beforeEach(() => {
  mocks.clubhouse = true;
  mocks.redirect.mockClear();
  mocks.getRecruits.mockClear();
});

describe('Recruiting (coach only)', () => {
  it('a dual-profile user on the coach dashboard gets Clubhouse Recruiting', async () => {
    mocks.session = { userId: 'u-1', role: 'coach', coach: { id: 'c-1', onboarding_completed: true }, player: { id: 'p-1', onboarding_completed: true } };
    expect(((await RecruitingPage()) as El).type).toBe(ClubhouseRecruitingRoute);
    expect(mocks.getRecruits).not.toHaveBeenCalled();
  });

  it('a dual-profile user on the player dashboard never gets coach Clubhouse Recruiting; the Fairway branch is unchanged', async () => {
    mocks.session = { userId: 'u-1', role: 'coach', coach: { id: 'c-1', onboarding_completed: false }, player: { id: 'p-1', onboarding_completed: true } };
    const page = (await RecruitingPage()) as El;
    expect((page.props.children as El).type).toBe(FairwayRecruitingPage);
    expect(mocks.getRecruits).toHaveBeenCalledTimes(1);
  });

  it('a player-only session is still sent Home before any Clubhouse decision', async () => {
    mocks.session = { userId: 'u-1', role: 'player', coach: null, player: { id: 'p-1', onboarding_completed: true } };
    await expect(RecruitingPage()).rejects.toThrow('REDIRECT:/golf/dashboard');
  });
});

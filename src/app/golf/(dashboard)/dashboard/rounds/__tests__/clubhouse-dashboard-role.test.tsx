// =============================================================================
// Single-role Clubhouse pages follow the dashboard layout's role.
//
// Round entry and recovery are the player's Clubhouse screens; Recruiting is the
// coach's. Each draws its Clubhouse route only when the gate is on for that role
// AND the dashboard layout's role (getGolfDashboardRole, computed for real here
// from the session's profiles) is that role. A user with both profiles whose
// dashboard is the other role keeps the Fairway branch, as with the gate off.
// The pages' own access checks (player profile, coach role) are unchanged.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Profile = { id: string; onboarding_completed: boolean } | null;

const mocks = vi.hoisted(() => ({
  session: { userId: 'u-1', role: 'player' as 'coach' | 'player', coach: null as Profile, player: null as Profile },
  clubhouse: true,
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn(async () => mocks.session) }));
vi.mock('@/clubhouse/gate', () => ({
  isClubhouseFor: vi.fn(async (role: string | null | undefined) => (role === 'coach' || role === 'player') && mocks.clubhouse),
}));

function ClubhouseNewRoundRoute() {
  return null;
}
function ClubhouseRoundRecoverRoute() {
  return null;
}
function ClubhouseRecruitingRoute() {
  return null;
}
function NewRoundClient() {
  return null;
}
function FairwayRecoverRound() {
  return null;
}
vi.mock('@/clubhouse/routes/round-new', () => ({ ClubhouseNewRoundRoute }));
vi.mock('@/clubhouse/routes/round-recover', () => ({ ClubhouseRoundRecoverRoute }));
vi.mock('@/clubhouse/routes/recruiting', () => ({ ClubhouseRecruitingRoute }));
vi.mock('../new/new-round-client', () => ({ default: NewRoundClient }));
vi.mock('@/components/golf/layout/AnimatedPage', () => ({
  AnimatedPage: ({ children }: { children: unknown }) => children,
  AnimatedItem: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/components/fairway/pages/rounds-recover', () => ({ FairwayRecoverRound }));
vi.mock('@/components/fairway/pages/recruiting', () => ({ FairwayRecruitingPage: () => null }));
vi.mock('@/components/fairway', () => ({ FeatureUnavailable: () => null, Button: () => null, EmptyState: () => null }));
vi.mock('@/lib/redesign/flag', () => ({ fairwayScope: (s: string) => s }));
const getRecruits = vi.hoisted(() => vi.fn(async () => ({ success: true, data: [] })));
vi.mock('@/app/golf/actions/recruiting', () => ({ getRecruits }));

import NewRoundPage from '../new/page';
import RecoverRoundPage from '../recover/page';
import RecruitingPage from '../../recruiting/page';

type El = { type: unknown; props: Record<string, unknown> };

/** A coach row never onboarded beside an onboarded player profile: session.role says coach, the layout draws the player's dashboard. */
function dualPlayerDashboard() {
  mocks.session = { userId: 'u-1', role: 'coach', coach: { id: 'c-1', onboarding_completed: false }, player: { id: 'p-1', onboarding_completed: true } };
}
/** Both profiles onboarded: the layout draws the coach's dashboard. */
function dualCoachDashboard() {
  mocks.session = { userId: 'u-1', role: 'coach', coach: { id: 'c-1', onboarding_completed: true }, player: { id: 'p-1', onboarding_completed: true } };
}

beforeEach(() => {
  mocks.clubhouse = true;
  mocks.redirect.mockClear();
  getRecruits.mockClear();
});

describe('player round pages', () => {
  it('a dual-profile user on the player dashboard gets Clubhouse round entry and recovery', async () => {
    dualPlayerDashboard();
    expect(((await NewRoundPage()) as El).type).toBe(ClubhouseNewRoundRoute);
    expect(((await RecoverRoundPage()) as El).type).toBe(ClubhouseRoundRecoverRoute);
  });

  it('a dual-profile user on the coach dashboard keeps the Fairway pages', async () => {
    dualCoachDashboard();
    const newRound = (await NewRoundPage()) as El;
    expect(((newRound.props.children as El).props.children as El).type).toBe(NewRoundClient);
    const recover = (await RecoverRoundPage()) as El;
    expect(recover.type).not.toBe(ClubhouseRoundRecoverRoute);
    expect((recover.props.children as El).type).toBe(FairwayRecoverRound);
  });

  it('with the gate off, the player dashboard keeps the Fairway pages', async () => {
    dualPlayerDashboard();
    mocks.clubhouse = false;
    expect(((((await NewRoundPage()) as El).props.children as El).props.children as El).type).toBe(NewRoundClient);
    expect((((await RecoverRoundPage()) as El).props.children as El).type).toBe(FairwayRecoverRound);
  });
});

describe('Recruiting (coach only)', () => {
  it('a dual-profile user on the coach dashboard gets Clubhouse Recruiting', async () => {
    dualCoachDashboard();
    expect(((await RecruitingPage()) as El).type).toBe(ClubhouseRecruitingRoute);
    expect(getRecruits).not.toHaveBeenCalled();
  });

  it('a dual-profile user on the player dashboard never gets coach Clubhouse Recruiting; the Fairway branch is unchanged', async () => {
    dualPlayerDashboard();
    const page = (await RecruitingPage()) as El;
    expect(page.type).not.toBe(ClubhouseRecruitingRoute);
    expect(getRecruits).toHaveBeenCalledTimes(1);
  });

  it('a player-only session is still sent Home before any Clubhouse decision', async () => {
    mocks.session = { userId: 'u-1', role: 'player', coach: null, player: { id: 'p-1', onboarding_completed: true } };
    await expect(RecruitingPage()).rejects.toThrow('REDIRECT:/golf/dashboard');
  });
});

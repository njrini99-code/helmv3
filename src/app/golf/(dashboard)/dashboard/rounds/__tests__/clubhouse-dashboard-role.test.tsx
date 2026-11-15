// =============================================================================
// Player round pages follow the dashboard layout's role.
//
// Round entry and recovery are the player's Clubhouse screens. Each draws its Clubhouse route only when the dashboard
// layout's role (getGolfDashboardRole, computed for real here from the session's profiles) is the player's. A user with
// both profiles whose dashboard is the coach's gets nothing from the page: the Clubhouse frame shows a coach its
// not-rebuilt state for these addresses (src/clubhouse/shell/nav.ts). The pages' own player-profile checks are
// unchanged. Recruiting (coach) has its own case in ../../recruiting/__tests__.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Profile = { id: string; onboarding_completed: boolean } | null;

const mocks = vi.hoisted(() => ({
  session: { userId: 'u-1', role: 'player' as 'coach' | 'player', coach: null as Profile, player: null as Profile },
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn(async () => mocks.session) }));

function ClubhouseNewRoundRoute() {
  return null;
}
function ClubhouseRoundRecoverRoute() {
  return null;
}
vi.mock('@/clubhouse/routes/round-new', () => ({ ClubhouseNewRoundRoute }));
vi.mock('@/clubhouse/routes/round-recover', () => ({ ClubhouseRoundRecoverRoute }));
vi.mock('@/components/fairway', () => ({ FeatureUnavailable: () => null }));

import NewRoundPage from '../new/page';
import RecoverRoundPage from '../recover/page';

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
  mocks.redirect.mockClear();
});

describe('player round pages', () => {
  it('a dual-profile user on the player dashboard gets Clubhouse round entry and recovery', async () => {
    dualPlayerDashboard();
    expect(((await NewRoundPage()) as El).type).toBe(ClubhouseNewRoundRoute);
    expect(((await RecoverRoundPage()) as El).type).toBe(ClubhouseRoundRecoverRoute);
  });

  it('a dual-profile user on the coach dashboard gets neither player screen (the frame shows its not-rebuilt state)', async () => {
    dualCoachDashboard();
    expect(await NewRoundPage()).toBeNull();
    expect(await RecoverRoundPage()).toBeNull();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

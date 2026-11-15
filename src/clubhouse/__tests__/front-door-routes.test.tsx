import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The front door's routes (P015). The old entrance pages and the golf_clubhouse_front_door flag were retired on
 * 2026-11-14: every page draws Clubhouse's screen, a page that reads before it draws keeps every read and redirect,
 * and each loading boundary is drawn in the sign-in room.
 */

vi.mock('@/clubhouse/routes/auth', () => ({
  ClubhouseSignInRoute: () => <p>clubhouse sign in</p>,
  ClubhouseResetPasswordRoute: () => <p>clubhouse reset</p>,
  ClubhouseDemoRoute: () => <p>clubhouse demo</p>,
  ClubhouseWelcomeRoute: () => <p>clubhouse welcome</p>,
  ClubhouseStaffInviteRoute: ({ token }: { token: string }) => <p>clubhouse staff {token}</p>,
  ClubhouseCoachPendingRoute: () => <p>clubhouse pending</p>,
  ClubhouseJoinTeamRoute: () => <p>clubhouse join confirm</p>,
  ClubhouseJoinInvalidRoute: () => <p>clubhouse join invalid</p>,
}));
vi.mock('@/clubhouse/routes/onboard', () => ({
  ClubhouseSignupRoute: () => <p>clubhouse sign up</p>,
  ClubhousePlayerOnboardRoute: () => <p>clubhouse player</p>,
}));
vi.mock('@/clubhouse/screens/auth/JoinCode', () => ({ JoinCode: () => <p>clubhouse code</p> }));
vi.mock('@/clubhouse/screens/auth/GateLoading', () => ({ GateLoading: ({ title }: { title: string }) => <p>clubhouse loading {title}</p> }));
vi.mock('@/clubhouse/screens/onboard/CoachOnboard', () => ({ CoachOnboard: () => <p>clubhouse coach</p> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const preview = vi.hoisted(() => vi.fn(async () => ({ valid: true })));
vi.mock('@/app/golf/actions/teams', () => ({ previewStaffInvite: preview }));

import LoginPage from '../../app/golf/(auth)/login/page';
import SignupPage from '../../app/golf/(auth)/signup/page';
import ResetPage from '../../app/golf/(auth)/reset-password/page';
import DemoPage from '../../app/golf/(auth)/demo/page';
import WelcomePage from '../../app/golf/(auth)/welcome/page';
import JoinPage from '../../app/golf/join/page';
import JoinLoading from '../../app/golf/join/loading';
import CoachPage from '../../app/golf/(onboarding)/coach/page';
import PlayerPage from '../../app/golf/(onboarding)/player/page';
import StaffPage from '../../app/golf/staff/join/[token]/page';

afterEach(cleanup);

describe('every entrance page draws Clubhouse’s screen', () => {
  it.each([
    ['/golf/login', LoginPage, 'clubhouse sign in'],
    ['/golf/signup', SignupPage, 'clubhouse sign up'],
    ['/golf/reset-password', ResetPage, 'clubhouse reset'],
    ['/golf/demo', DemoPage, 'clubhouse demo'],
    ['/golf/welcome', WelcomePage, 'clubhouse welcome'],
    ['/golf/join', JoinPage, 'clubhouse code'],
    ['/golf/coach', CoachPage, 'clubhouse coach'],
    ['/golf/player', PlayerPage, 'clubhouse player'],
  ])('%s', (_path, Page, text) => {
    render(<Page />);
    expect(screen.getByText(text)).toBeTruthy();
  });
});

describe('a page that reads before it draws keeps every read', () => {
  it('staff invitation: the preview is read, and Clubhouse draws the answer', async () => {
    render(await StaffPage({ params: Promise.resolve({ token: 'tok' }) }));
    expect(screen.getByText('clubhouse staff tok')).toBeTruthy();
    expect(preview).toHaveBeenCalledWith('tok');
  });

  it('a loading boundary is drawn in the same room as the page that follows it', () => {
    render(<JoinLoading />);
    expect(screen.getByText('clubhouse loading Join a team')).toBeTruthy();
  });
});

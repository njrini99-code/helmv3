import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The front door's other routes under golf_clubhouse_front_door (P015, front-door completion): flag off draws today's page
 * untouched, flag on draws Clubhouse's, and a client page with children under it (join, coach) is switched by the flag
 * the layout hands it rather than by replacing the children.
 */

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFrontDoor: () => flag.on }));
vi.mock('@/clubhouse/routes/auth', () => ({
  ClubhouseResetPasswordRoute: () => <p>clubhouse reset</p>,
  ClubhouseDemoRoute: () => <p>clubhouse demo</p>,
  ClubhouseStaffInviteRoute: ({ token }: { token: string }) => <p>clubhouse staff {token}</p>,
  ClubhouseCoachPendingRoute: () => <p>clubhouse pending</p>,
  ClubhouseJoinTeamRoute: () => <p>clubhouse join confirm</p>,
  ClubhouseJoinInvalidRoute: () => <p>clubhouse join invalid</p>,
}));
vi.mock('next/font/google', () => ({ Poppins: () => ({ variable: 'poppins' }) }));
vi.mock('@/clubhouse/screens/auth/JoinCode', () => ({ JoinCode: () => <p>clubhouse code</p> }));
vi.mock('@/clubhouse/screens/auth/GateLoading', () => ({ GateLoading: ({ title }: { title: string }) => <p>clubhouse loading {title}</p> }));
vi.mock('@/clubhouse/screens/onboard/CoachOnboard', () => ({ CoachOnboard: () => <p>clubhouse coach</p> }));
vi.mock('@/components/auth/golf-auth-canvas', () => ({
  AuthCanvas: ({ title }: { title: string }) => <p>today {title}</p>,
  AuthFieldError: () => null,
  AuthSubmitButton: () => null,
  GroupedFieldRow: () => null,
  GroupedFields: () => null,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const preview = vi.hoisted(() => vi.fn(async () => ({ valid: true })));
vi.mock('@/app/golf/actions/teams', () => ({ previewStaffInvite: preview }));
vi.mock('../../app/golf/staff/join/[token]/staff-join-client', () => ({ StaffJoinClient: () => <p>today staff</p> }));
vi.mock('@/components/ui/skeleton', () => ({ FormPageSkeleton: () => <p>today skeleton</p>, GenericPageSkeleton: () => <p>today skeleton</p> }));

import ResetLayout from '../../app/golf/(auth)/reset-password/layout';
import DemoLayout from '../../app/golf/(auth)/demo/layout';
import JoinLayout from '../../app/golf/join/layout';
import JoinPage from '../../app/golf/join/page';
import JoinLoading from '../../app/golf/join/loading';
import CoachLayout from '../../app/golf/(onboarding)/coach/layout';
import StaffPage from '../../app/golf/staff/join/[token]/page';
import { useClubhouseFrontDoor } from '../routes/front-door';

const today = <p>today page</p>;

beforeEach(() => {
  flag.on = false;
});
afterEach(cleanup);

describe('a layout that chooses the page (no routes under it)', () => {
  it('reset password: flag off is today’s page untouched, flag on is Clubhouse’s', () => {
    const off = render(<ResetLayout>{today}</ResetLayout>);
    expect(screen.getByText('today page')).toBeTruthy();
    expect(screen.queryByText('clubhouse reset')).toBeNull();
    off.unmount();
    flag.on = true;
    render(<ResetLayout>{today}</ResetLayout>);
    expect(screen.getByText('clubhouse reset')).toBeTruthy();
    expect(screen.queryByText('today page')).toBeNull();
  });

  it('demo: the same', () => {
    const off = render(<DemoLayout>{today}</DemoLayout>);
    expect(screen.getByText('today page')).toBeTruthy();
    off.unmount();
    flag.on = true;
    render(<DemoLayout>{today}</DemoLayout>);
    expect(screen.getByText('clubhouse demo')).toBeTruthy();
  });
});

describe('a layout that hands the flag to a client page (join, coach)', () => {
  const Probe = () => <p>{useClubhouseFrontDoor() ? 'on' : 'off'}</p>;

  it('never replaces its children: the pages under it still render', () => {
    flag.on = true;
    render(
      <>
        <JoinLayout>
          <Probe />
        </JoinLayout>
        <CoachLayout>
          <Probe />
        </CoachLayout>
      </>,
    );
    expect(screen.getAllByText('on')).toHaveLength(2);
  });

  it('flag off hands down off', () => {
    render(
      <JoinLayout>
        <Probe />
      </JoinLayout>,
    );
    expect(screen.getByText('off')).toBeTruthy();
  });

  it('/golf/join draws today’s page with the flag off and the code entry with it on', () => {
    const off = render(
      <JoinLayout>
        <JoinPage />
      </JoinLayout>,
    );
    expect(screen.getByText('today Join a Team')).toBeTruthy();
    off.unmount();
    flag.on = true;
    render(
      <JoinLayout>
        <JoinPage />
      </JoinLayout>,
    );
    expect(screen.getByText('clubhouse code')).toBeTruthy();
    expect(screen.queryByText('today Join a Team')).toBeNull();
  });
});

describe('a page that keeps every read and redirect and chooses only what it draws', () => {
  it('staff invitation: the same preview is read either way', async () => {
    const off = render(await StaffPage({ params: Promise.resolve({ token: 'tok' }) }));
    expect(screen.getByText('today staff')).toBeTruthy();
    expect(preview).toHaveBeenCalledWith('tok');
    off.unmount();
    flag.on = true;
    render(await StaffPage({ params: Promise.resolve({ token: 'tok' }) }));
    expect(screen.getByText('clubhouse staff tok')).toBeTruthy();
    expect(preview).toHaveBeenCalledTimes(2);
  });

  it('a loading boundary is drawn in the same room as the page that follows it', () => {
    const off = render(<JoinLoading />);
    expect(screen.getByText('today skeleton')).toBeTruthy();
    off.unmount();
    flag.on = true;
    render(<JoinLoading />);
    expect(screen.getByText('clubhouse loading Join a team')).toBeTruthy();
  });
});

import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-management', () => ({ updatePlayerStatus: vi.fn(), setPlayerAvailability: vi.fn(), setPlayerAvailabilityCoachNote: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: vi.fn(), rejectJoinRequest: vi.fn(), getTeamJoinRequests: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));

import type { ChRoster } from '../../../data/roster';
import { PREVIEW_ROSTER } from '../../../preview/fixtures-roster';
import { clearPeople } from '../../../shell/command/people';
import { ToastProvider } from '../../../ui/Toast';
import { Roster } from '../Roster';

/** W-CRH-4, W-CRH-20, CP-8: a link to a player who isn't here names nobody and cleans the address; a player removed while open pops and says so. */

const media = (phone: boolean) =>
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: (phone && query === '(max-width: 820px)') || query.includes('hover: hover'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );

const ui = (data: ChRoster, crh = true) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <Roster data={data} crh={crh} />
      </div>
    </ToastProvider>
  </LazyMotion>
);
const TOAST = 'That player isn’t on your roster.';
const ROUTE = '/golf/dashboard/roster';

beforeEach(() => {
  clearPeople();
  window.localStorage.clear();
  window.sessionStorage.clear();
  media(true);
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('?player= for someone not on this roster (W-CRH-4)', () => {
  it('shows the roster, the toast and no profile, and drops the param', async () => {
    window.history.replaceState(null, '', `${ROUTE}?player=not-on-this-team&keep=1`);
    render(ui(PREVIEW_ROSTER));
    expect(await screen.findByText(TOAST)).toBeTruthy();
    expect(window.location.search).toBe('?keep=1');
    expect(screen.queryByRole('button', { name: 'Player actions' })).toBeNull();
  });

  it('a roster that failed to load is not called missing', async () => {
    window.history.replaceState(null, '', `${ROUTE}?player=not-on-this-team`);
    render(ui({ ...PREVIEW_ROSTER, players: [], playersError: true } as ChRoster));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.queryByText(TOAST)).toBeNull();
  });
});

describe('the open player left the roster (W-CRH-20)', () => {
  const first = PREVIEW_ROSTER.players[0]!;

  it('a read without them pops the profile and says so, by first name', async () => {
    window.history.replaceState(null, '', `${ROUTE}?player=${first.id}`);
    const { rerender } = render(ui(PREVIEW_ROSTER));
    expect(await screen.findByRole('button', { name: 'Player actions' })).toBeTruthy();
    rerender(ui({ ...PREVIEW_ROSTER, players: PREVIEW_ROSTER.players.filter((p) => p.id !== first.id) } as ChRoster));
    expect(await screen.findByText(`${first.firstName} is no longer on the roster.`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Player actions' })).toBeNull();
  });

  it('a read that still has them keeps the profile, with no toast', async () => {
    window.history.replaceState(null, '', `${ROUTE}?player=${first.id}`);
    const { rerender } = render(ui(PREVIEW_ROSTER));
    await screen.findByRole('button', { name: 'Player actions' });
    rerender(ui({ ...PREVIEW_ROSTER }));
    expect(screen.getByRole('button', { name: 'Player actions' })).toBeTruthy();
    expect(screen.queryByText(`${first.firstName} is no longer on the roster.`)).toBeNull();
  });
});

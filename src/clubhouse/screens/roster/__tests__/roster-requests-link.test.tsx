import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

/**
 * P003 30102: the bell's join-request notice links to `roster?tab=requests` (createTeamJoinRequest). The phone opens the
 * requests sheet (wiring-p003-roster.test.tsx); desktop takes focus to the requests card and drops the param, which it
 * used to leave in the address and ignore.
 */

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-management', () => ({ updatePlayerStatus: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: vi.fn(), rejectJoinRequest: vi.fn(), getTeamJoinRequests: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));

import type { ChRoster } from '../../../data/roster';
import { PREVIEW_ROSTER } from '../../../preview/fixtures-roster';
import { clearPeople } from '../../../shell/command/people';
import { ToastProvider } from '../../../ui/Toast';
import { Roster } from '../Roster';

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

beforeEach(() => {
  clearPeople();
  window.sessionStorage.clear();
  media(false);
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

const desktop = (data: ChRoster) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Roster data={data} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );

describe('P003 · 30102 the bell’s join-request link on desktop (?tab=requests)', () => {
  it('takes focus to the join requests card and drops the param, so a reload shows the roster as it is', async () => {
    expect(PREVIEW_ROSTER.requests.length).toBeGreaterThan(0);
    window.history.replaceState(null, '', '/golf/dashboard/roster?tab=requests');
    desktop(PREVIEW_ROSTER);
    const card = screen.getByRole('region', { name: 'Join requests' });
    await waitFor(() => expect(document.activeElement).toBe(card));
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/golf/dashboard/roster');
    // A reading destination, not a stop in the Tab order.
    expect(card.tabIndex).toBe(-1);
  });

  it('keeps any other param', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?tab=requests&team=t1');
    desktop(PREVIEW_ROSTER);
    await waitFor(() => expect(window.location.search).toBe('?team=t1'));
  });

  it('with no request waiting there is no card: nothing takes focus, and the param is still dropped', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?tab=requests');
    desktop({ ...PREVIEW_ROSTER, requests: [] });
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.queryByRole('region', { name: 'Join requests' })).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('without the param nothing takes focus', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster');
    desktop(PREVIEW_ROSTER);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByRole('region', { name: 'Join requests' })).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
  });
});

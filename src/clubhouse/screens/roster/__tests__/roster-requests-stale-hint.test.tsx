import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

/**
 * P003 30102: the bell's join-request notice links to `roster?tab=requests` (createTeamJoinRequest). The phone opens the
 * requests sheet (wiring-p003-roster.test.tsx); desktop takes focus to the requests card and drops the param, which it
 * used to leave in the address and ignore.
 *
 * A stale phone-layout hint mounts the phone copy at hydration and corrects a render later: the focus waits for the
 * desktop card (review of #2220).
 */

const phoneHint = vi.hoisted(() => ({ value: true }));
vi.mock('../../../lib/use-phone', async (orig) => ({
  ...(await orig<typeof import('../../../lib/use-phone')>()),
  useChPhone: () => phoneHint.value,
}));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-management', () => ({ updatePlayerStatus: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: vi.fn(), rejectJoinRequest: vi.fn(), getTeamJoinRequests: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));

import { PREVIEW_ROSTER } from '../../../preview/fixtures-roster';
import { clearPeople } from '../../../shell/command/people';
import { ToastProvider } from '../../../ui/Toast';
import { Roster } from '../Roster';
import { act } from '@testing-library/react';

beforeEach(() => {
  clearPeople();
  window.sessionStorage.clear();
  phoneHint.value = true;
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({ matches: query.includes('hover: hover'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

const tree = () => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <Roster data={PREVIEW_ROSTER} />
      </div>
    </ToastProvider>
  </LazyMotion>
);

describe('P003 · 30102 desktop link when the layout hint was stale', () => {
  it('keeps the request to focus the card until the desktop card mounts', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?tab=requests');
    const view = render(tree());
    // The hint said phone: no desktop card yet, the param is already spent.
    expect(screen.queryByRole('region', { name: 'Join requests' })).toBeNull();
    expect(window.location.search).toBe('');
    // The layout corrects to desktop a render later.
    phoneHint.value = false;
    await act(async () => {
      view.rerender(tree());
    });
    const card = await screen.findByRole('region', { name: 'Join requests' });
    await waitFor(() => expect(document.activeElement).toBe(card));
  });
});

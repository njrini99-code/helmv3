import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-management', () => ({ updatePlayerStatus: vi.fn(), setPlayerAvailability: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: vi.fn(), rejectJoinRequest: vi.fn(), getTeamJoinRequests: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));

import { PREVIEW_ROSTER } from '../../../preview/fixtures-roster';
import { clearPeople, usePeople } from '../../../shell/command/people';
import { ToastProvider } from '../../../ui/Toast';
import { Roster } from '../Roster';

beforeEach(() => {
  clearPeople();
  window.sessionStorage.clear();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) => ({ matches: query.includes('hover: hover'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => cleanup());

function People() {
  return <output aria-label="people">{usePeople().map((p) => p.name).join('|')}</output>;
}
const treeOf = (data: typeof PREVIEW_ROSTER) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <Roster data={data} />
        <People />
      </div>
    </ToastProvider>
  </LazyMotion>
);
const tree = treeOf(PREVIEW_ROSTER);

describe('Roster right-click menu', () => {

  it('hands the loaded players to the command palette, and only those', () => {
    render(tree);
    const names = screen.getByLabelText('people').textContent!.split('|');
    expect(names).toContain('Jonah Okafor');
    expect(names).toHaveLength(PREVIEW_ROSTER.players.length);
  });
});

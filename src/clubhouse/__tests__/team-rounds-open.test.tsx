import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Opening a round from Team rounds notes it for the review's Back, but only for a same-tab open. */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/rounds' }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));

import { PREVIEW_TEAM_ROUNDS } from '../preview/fixtures-team-rounds';
import { openedFromLibrary } from '../screens/rounds/return-state';
import { TeamRounds } from '../screens/rounds/TeamRounds';
import { CrumbProvider } from '../shell/crumbs';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

function ui() {
  return (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <TeamRounds data={PREVIEW_TEAM_ROUNDS} teamId="t1" />
            </div>
          </PhoneChromeProvider>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>
  );
}

const firstRow = () => {
  const link = document.querySelector<HTMLAnchorElement>('a.ch-lgr__row[href*="/rounds/"]');
  if (!link) throw new Error('no round row');
  return link;
};
const roundId = (a: HTMLAnchorElement) => a.getAttribute('href')!.split('/rounds/')[1]!.split(/[?#]/)[0]!;

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe('Team rounds · opening a round', () => {
  it('notes a plain click so the review’s Back steps back to the list', () => {
    render(ui());
    const a = firstRow();
    fireEvent.click(a, { button: 0 });
    expect(openedFromLibrary(roundId(a))).toBe(true);
  });

  it('leaves no note for a Ctrl or Cmd click (a new tab)', () => {
    render(ui());
    const a = firstRow();
    fireEvent.click(a, { button: 0, ctrlKey: true });
    fireEvent.click(a, { button: 0, metaKey: true });
    expect(openedFromLibrary(roundId(a))).toBe(false);
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });
});

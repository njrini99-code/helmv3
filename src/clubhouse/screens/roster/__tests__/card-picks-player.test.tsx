import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

/**
 * Coach audit 13 Nov 2026 (§8 #1): a card's whole face went to the player's profile, so the side panel never left the
 * first player. A click on a card's body shows that player in the panel; the face, the name and Command-Enter still open
 * their profile, and Enter on a focused card picks it.
 */
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }) }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-management', () => ({ updatePlayerStatus: vi.fn(), setPlayerAvailability: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: vi.fn(), rejectJoinRequest: vi.fn(), getTeamJoinRequests: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));

import { PREVIEW_ROSTER } from '../../../preview/fixtures-roster';
import { clearPeople } from '../../../shell/command/people';
import { ToastProvider } from '../../../ui/Toast';
import { Roster } from '../Roster';

beforeEach(() => {
  clearPeople();
  push.mockClear();
  window.sessionStorage.clear();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) => ({ matches: query.includes('hover: hover'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => cleanup());

const show = () =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Roster data={PREVIEW_ROSTER} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
const cards = () => [...document.querySelectorAll<HTMLButtonElement>('.ch-rs-face')];
const nameOf = (card: HTMLElement) => card.querySelector('.ch-rs-face__name')!.textContent!;
/** The panel's player: the newest heading (one leaving still animates out beside it). */
const panelName = () => [...document.querySelectorAll('.ch-rs-body h2')].at(-1)?.textContent;

describe('a roster card', () => {
  it('a click on its body shows that player in the panel, and goes nowhere', () => {
    show();
    const second = cards()[1]!;
    expect(panelName()).not.toBe(nameOf(second));
    fireEvent.click(second.querySelector('.ch-rs-figs')!);
    expect(panelName()).toBe(nameOf(second));
    expect(push).not.toHaveBeenCalled();
  });

  it('a second click on the same card keeps it in the panel', () => {
    show();
    const second = cards()[1]!;
    fireEvent.click(second.querySelector('.ch-rs-figs')!);
    fireEvent.click(second.querySelector('.ch-rs-figs')!);
    expect(panelName()).toBe(nameOf(second));
  });

  it('its name and its face open the player’s profile', () => {
    show();
    const second = cards()[1]!;
    fireEvent.click(second.querySelector('.ch-rs-face__name')!);
    expect(push).toHaveBeenCalledTimes(1);
    expect(String(push.mock.calls[0]![0])).toMatch(/\/golf\/dashboard\/stats\?player=/);
    fireEvent.click(second.querySelector('.ch-rs-face__av')!);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('Command-Enter on a focused card opens the profile', () => {
    show();
    const second = cards()[1]!;
    second.focus();
    fireEvent.keyDown(second, { key: 'Enter', metaKey: true });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('says what a click does', () => {
    show();
    expect(cards()[0]!.getAttribute('aria-label')).toMatch(/Show in the panel/);
  });
});

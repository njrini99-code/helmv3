import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Suspense, use, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * N13C-67 and N13P-18 (production audit 2026-11-15, P1-7 and P1-19): CoachHelm's view switch is one header row, mounted once above
 * the view by the route, so it neither moves nor remounts when the view under it changes; a tap draws the next view's skeleton at
 * once instead of holding the old view while the server renders the next; and the other views are prefetched with the route's own
 * prefetch, never fetched whole (CH-R1).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({ go: (_href: string) => {} }));
const router = vi.hoisted(() => ({ push: vi.fn((href: string) => nav.go(href)), prefetch: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => true, CH_PHONE_QUERY: '(max-width: 820px)' }));

import { ClubhouseMarker } from '../../../shell/context';
import { COACHHELM_HREF, type CoachHelmView } from '../chat/SubTabs';
import { CoachHelmSwitchFrame } from '../SwitchFrame';
import { useCoachHelmSwitchOff } from '../SwitchStrip';
import { resetViewSwitchForTests } from '../use-view-switch';

const done = <T,>(value: T) => Object.assign(Promise.resolve(value), { status: 'fulfilled', value }) as Promise<T>;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function BoardView() {
  return <p data-testid="view">Team view</p>;
}

/**
 * The page as Next runs it: the route's answer for an address is a promise read at the root, above the frame, so a push keeps the
 * page as it is (a transition) until the server answers, and the frame stays in the same place across the two answers.
 */
function Page({ pending }: { pending: () => Promise<void> }) {
  const [state, setState] = useState<{ view: CoachHelmView; answer: Promise<void> }>({ view: 'board', answer: done(undefined) });
  nav.go = (href) => setState({ view: href.includes('view=ask') ? 'ask' : 'board', answer: pending() });
  use(state.answer);
  return (
    <CoachHelmSwitchFrame who="coach" active={state.view}>
      {state.view === 'ask' ? <p data-testid="view">Ask view</p> : <BoardView />}
    </CoachHelmSwitchFrame>
  );
}

const renderPage = (pending: () => Promise<void>) =>
  render(
    // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
    <ClubhouseMarker role="coach">
      <Suspense fallback={<p>route loading</p>}>
        <Page pending={pending} />
      </Suspense>
    </ClubhouseMarker>,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  resetViewSwitchForTests();
  router.push.mockClear();
  router.prefetch.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('N13C-67 · N13P-18 the CoachHelm switch is mounted once, above the view', () => {
  it('a view change keeps the same switch: the same element, not drawn again, with the new view chosen', () => {
    const { rerender } = render(
      // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
      <ClubhouseMarker role="coach">
        <CoachHelmSwitchFrame who="coach" active="board">
          <p>Team view</p>
        </CoachHelmSwitchFrame>
      </ClubhouseMarker>,
    );
    const row = document.querySelector('.ch-hsw');
    const group = screen.getByRole('radiogroup', { name: 'CoachHelm view' });
    expect(row).not.toBeNull();
    expect(within(group).getByRole('radio', { name: 'Team' })).toHaveAttribute('aria-checked', 'true');
    rerender(
      // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
      <ClubhouseMarker role="coach">
        <CoachHelmSwitchFrame who="coach" active="ask">
          <p>Ask view</p>
        </CoachHelmSwitchFrame>
      </ClubhouseMarker>,
    );
    expect(document.querySelectorAll('.ch-hsw')).toHaveLength(1);
    expect(document.querySelector('.ch-hsw')).toBe(row);
    expect(screen.getByRole('radiogroup', { name: 'CoachHelm view' })).toBe(group);
    expect(within(group).getByRole('radio', { name: 'Ask' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Ask view')).toBeTruthy();
  });

  it('the player’s four views share one switch row too, with the row before the view', () => {
    render(
      // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
      <ClubhouseMarker role="player" helmViews={{ playerAsk: true }}>
        <CoachHelmSwitchFrame who="player" active="standing">
          <main>Standing view</main>
        </CoachHelmSwitchFrame>
      </ClubhouseMarker>,
    );
    const row = document.querySelector('.ch-hsw[data-ch-switch="player"]') as HTMLElement;
    expect(row.nextElementSibling?.tagName).toBe('MAIN');
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['Board', 'Standing', 'Deep dive', 'Ask']);
  });

  it('prefetches the other views once idle, with the route’s own prefetch and never whole (CH-R1)', () => {
    render(
      // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
      <ClubhouseMarker role="coach">
        <CoachHelmSwitchFrame who="coach" active="board">
          <p>Team view</p>
        </CoachHelmSwitchFrame>
      </ClubhouseMarker>,
    );
    expect(router.prefetch).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(2_500));
    expect(router.prefetch.mock.calls).toEqual([[COACHHELM_HREF.ask]]);
  });

  // These two run on the clock: React retries a navigation that waited on the server from a real task, which fake timers hold back.
  const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

  it('a tap draws the next view’s skeleton in the same commit, never the old view held while the server answers', async () => {
    vi.useRealTimers();
    const answer = deferred();
    renderPage(() => answer.promise);
    expect(screen.getByTestId('view').textContent).toBe('Team view');
    const row = document.querySelector('.ch-hsw');
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Ask' }));
    });
    expect(router.push).toHaveBeenCalledWith(COACHHELM_HREF.ask);
    // The old view is gone in the tap's own commit; Ask's skeleton holds its place under the switch, which has moved and stayed put.
    expect(screen.queryByTestId('view')).toBeNull();
    expect(screen.getByRole('main', { name: 'Loading Ask CoachHelm' })).toBeTruthy();
    expect(document.querySelector('.ch-hsw')).toBe(row);
    expect(screen.getByRole('radio', { name: 'Ask' })).toHaveAttribute('aria-checked', 'true');
    // Seconds later the server answers: the view lands under the same switch.
    await wait(20);
    expect(screen.queryByTestId('view')).toBeNull();
    // The server answers before the busy delay: no skeleton block has shown, so the view takes the place at once.
    await act(async () => answer.resolve());
    await wait(20);
    expect(screen.getByTestId('view').textContent).toBe('Ask view');
    expect(document.querySelector('.ch-hsw')).toBe(row);
  });

  it('a skeleton that has shown holds the busy hold (300 ms) before the view takes its place', async () => {
    vi.useRealTimers();
    const answer = deferred();
    renderPage(() => answer.promise);
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Ask' }));
    });
    // Past the busy delay (150 ms) the skeleton is up; the server answers, and the skeleton stays until the hold has run.
    await wait(200);
    await act(async () => answer.resolve());
    expect(screen.queryByTestId('view')).toBeNull();
    expect(screen.getByRole('main', { name: 'Loading Ask CoachHelm' })).toBeTruthy();
    await wait(450);
    expect(screen.getByTestId('view').textContent).toBe('Ask view');
  });

  it('a view that is off hides the switch, as each view hid its own (CH-13305)', () => {
    function Off() {
      useCoachHelmSwitchOff(true);
      return <p>CoachHelm is off</p>;
    }
    render(
      // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
      <ClubhouseMarker role="coach">
        <CoachHelmSwitchFrame who="coach" active="board">
          <Off />
        </CoachHelmSwitchFrame>
      </ClubhouseMarker>,
    );
    expect(document.querySelector('.ch-hsw')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'CoachHelm view' })).toBeNull();
  });
});

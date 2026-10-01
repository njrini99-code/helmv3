import { LazyMotion, domAnimation } from 'framer-motion';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Coming back to the Rounds library from a round (owner rule 8, 2026-10-01): its search and grouping come back, its place comes back
 * (RouteFrame), and the review's Back is a real step back when the review was opened from the library.
 */

vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/rounds' }));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px)' }));
// The phone top bar draws into the shell's slot; here it is a button that runs its Back.
vi.mock('../shell/phone-chrome', () => ({
  PhoneTop: (p: { back?: { label: string; onBack: () => void } }) => (p.back ? <button onClick={p.back.onBack}>{`phone back to ${p.back.label}`}</button> : null),
  usePhoneTabsHidden: () => {},
}));
vi.mock('@/app/golf/actions/golf', () => ({ deleteInProgressRound: vi.fn() }));
vi.mock('@/lib/utils/emergency-save', () => ({ clearEmergencySave: vi.fn(), markRoundDiscarded: vi.fn() }));

import { markAppRunning, RouteScope } from '../lib/session-state';
import { RouteFrame } from '../shell/RouteFrame';
import { RoundReview } from '../screens/rounds/RoundReview';
import { RoundsLibrary } from '../screens/rounds/RoundsLibrary';
import { noteOpenedFromLibrary, openedFromLibrary } from '../screens/rounds/return-state';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_ROUNDS_IDLE } from '../preview/fixtures-rounds';
import { PREVIEW_REVIEW, PREVIEW_REVIEW_COACH } from '../preview/fixtures-round-review';

const ROUND = 'a0000000-0000-4000-8000-000000000001';
const scoped = (scope: string, node: ReactNode) => <RouteScope value={scope}>{node}</RouteScope>;
const library = () => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <RoundsLibrary data={PREVIEW_ROUNDS_IDLE} playerId="p1" writes={{ discard: vi.fn(() => Promise.resolve({ success: true })) }} />
      </div>
    </ToastProvider>
  </LazyMotion>
);
const review = (r = PREVIEW_REVIEW) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <RoundReview review={r} />
    </ToastProvider>
  </LazyMotion>
);
const rowLabels = () => screen.getAllByRole('link').map((l) => l.getAttribute('aria-label')).filter((l): l is string => !!l && /, \d+( \(|$)/.test(l));

beforeEach(() => {
  markAppRunning();
  sessionStorage.clear();
  phoneState.on = false;
  Object.values(router).forEach((f) => f.mockClear());
});
afterEach(() => sessionStorage.clear());

describe('CH-11912 Rounds library: the search and the grouping come back', () => {
  const HOME = '/golf/dashboard/rounds\u0000t1';

  it('a search and a grouping set before opening a round are there when the library is opened again, and nowhere else', async () => {
    const user = userEvent.setup();
    const first = render(scoped(HOME, library()));
    await user.type(screen.getByRole('searchbox', { name: 'Search rounds by course' }), 'hope');
    await user.click(screen.getByRole('radio', { name: 'By course' }));
    expect(rowLabels()).toHaveLength(2);
    first.unmount();

    render(scoped(HOME, library()));
    expect((screen.getByRole('searchbox', { name: 'Search rounds by course' }) as HTMLInputElement).value).toBe('hope');
    expect((screen.getByRole('radio', { name: 'By course' }) as HTMLInputElement).getAttribute('aria-checked')).toBe('true');
    expect(rowLabels()).toEqual(['Sep 18, Hope Valley CC, 71 (+1)', 'Sep 12, Hope Valley CC, 74 (+4)']);
  });

  it('another team’s Rounds opens on the defaults, never on this one’s search', async () => {
    const user = userEvent.setup();
    const first = render(scoped(HOME, library()));
    await user.type(screen.getByRole('searchbox', { name: 'Search rounds by course' }), 'hope');
    first.unmount();
    render(scoped('/golf/dashboard/rounds\u0000t2', library()));
    expect((screen.getByRole('searchbox', { name: 'Search rounds by course' }) as HTMLInputElement).value).toBe('');
  });

  it('a cleared search is not kept: the next visit opens on the whole list', async () => {
    const user = userEvent.setup();
    const first = render(scoped(HOME, library()));
    const box = screen.getByRole('searchbox', { name: 'Search rounds by course' });
    await user.type(box, 'hope');
    await user.clear(box);
    first.unmount();
    render(scoped(HOME, library()));
    expect((screen.getByRole('searchbox', { name: 'Search rounds by course' }) as HTMLInputElement).value).toBe('');
    expect(rowLabels().length).toBe(PREVIEW_ROUNDS_IDLE.rounds.list.length);
  });
});

describe('CH-11912 Rounds library and review: Back is a real Back when the review was opened from the library', () => {
  it('opening a round from the library notes it, for that round only', async () => {
    const user = userEvent.setup();
    render(library());
    expect(openedFromLibrary(ROUND)).toBe(false);
    await user.click(screen.getByRole('link', { name: 'Sep 26, Finley GC, 72 (E)' }));
    expect(openedFromLibrary(ROUND)).toBe(true);
    expect(openedFromLibrary('a0000000-0000-4000-8000-000000000002')).toBe(false);
  });

  it('the review’s Back steps back in history (the library returns with its search and its place), and pushes nothing', async () => {
    const user = userEvent.setup();
    noteOpenedFromLibrary(PREVIEW_REVIEW.id);
    render(review());
    await user.click(screen.getByRole('link', { name: /Rounds/ }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('with no note (a deep link, a fresh tab, Home’s round) Back goes to the library’s address, as before', async () => {
    const user = userEvent.setup();
    render(review());
    const back = screen.getByRole('link', { name: /Rounds/ });
    expect(back.getAttribute('href')).toBe('/golf/dashboard/rounds');
    // The address is the link's own; nothing steps back.
    await user.click(back);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('a note for another round is not this round’s', async () => {
    const user = userEvent.setup();
    noteOpenedFromLibrary('a0000000-0000-4000-8000-000000000002');
    render(review());
    await user.click(screen.getByRole('link', { name: /Rounds/ }));
    expect(router.back).not.toHaveBeenCalled();
  });

  it('a new-tab click (a modifier) is the address’s: nothing steps back', () => {
    noteOpenedFromLibrary(PREVIEW_REVIEW.id);
    render(review());
    fireEvent.click(screen.getByRole('link', { name: /Rounds/ }), { ctrlKey: true });
    fireEvent.click(screen.getByRole('link', { name: /Rounds/ }), { metaKey: true });
    expect(router.back).not.toHaveBeenCalled();
  });

  it('a coach’s Back goes to the player’s rounds on Stats, whatever was noted', async () => {
    const user = userEvent.setup();
    noteOpenedFromLibrary(PREVIEW_REVIEW_COACH.id);
    render(review(PREVIEW_REVIEW_COACH));
    await user.click(screen.getByRole('link', { name: /Jonah Okafor/ }));
    expect(router.back).not.toHaveBeenCalled();
  });

  it('on the phone the same: a step back when opened from the library, the address otherwise', async () => {
    const user = userEvent.setup();
    phoneState.on = true;
    noteOpenedFromLibrary(PREVIEW_REVIEW.id);
    const first = render(review());
    await user.click(screen.getByRole('button', { name: 'phone back to Rounds' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    first.unmount();

    sessionStorage.clear();
    render(review());
    await user.click(screen.getByRole('button', { name: 'phone back to Rounds' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/rounds');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('a blocked store costs only the step back: Back goes to the address', async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    phoneState.on = true;
    render(review());
    await user.click(screen.getByRole('button', { name: 'phone back to Rounds' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/rounds');
    get.mockRestore();
  });
});

describe('CH-11912 Rounds library inside the shell frame: the search and the place come back together', () => {
  it('Back to the library restores the scroll (RouteFrame) and the search (session state) in one visit; opening it fresh restores the search but starts at the top', async () => {
    const user = userEvent.setup();
    const canvas = document.createElement('div');
    canvas.id = 'ch-canvas';
    canvas.scrollTo = vi.fn((opts?: ScrollToOptions | number) => {
      if (typeof opts === 'object' && opts.top != null) canvas.scrollTop = opts.top;
    }) as typeof canvas.scrollTo;
    document.body.appendChild(canvas);
    window.scrollTo = vi.fn() as typeof window.scrollTo;
    const page = (key: string, node: ReactNode) => <RouteFrame routeKey={key}>{node}</RouteFrame>;
    const LIB = '/golf/dashboard/rounds\u0000t1';
    const REV = `/golf/dashboard/rounds/${ROUND}\u0000t1`;

    const view = render(page('/golf/dashboard\u0000t1', <main>home</main>), { container: canvas });
    view.rerender(page(LIB, library()));
    await user.type(screen.getByRole('searchbox', { name: 'Search rounds by course' }), 'finley');
    canvas.scrollTop = 520;
    canvas.dispatchEvent(new Event('scroll'));
    await user.click(screen.getByRole('link', { name: 'Sep 26, Finley GC, 72 (E)' }));

    view.rerender(page(REV, review()));
    expect(canvas.scrollTo).toHaveBeenLastCalledWith({ top: 0 });

    // The review's Back: a step back in history, then the library again.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    view.rerender(page(LIB, library()));
    expect(canvas.scrollTo).toHaveBeenLastCalledWith({ top: 520 });
    expect((screen.getByRole('searchbox', { name: 'Search rounds by course' }) as HTMLInputElement).value).toBe('finley');
    canvas.remove();
  });
});

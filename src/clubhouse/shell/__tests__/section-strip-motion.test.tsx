import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MOTION-AND-VISUAL 3.3, the section strip: the page swaps at once; the pill slides over the base beat (260 ms) on the
 * iOS curve, translate and width (MAC-17); the strip scrolls a clipped tab into view; a change ticks the selection
 * haptic; a tap on the current tab scrolls the page to the top, smoothly unless Reduce Motion is on (3.11), where the pill
 * fades in at its new place instead of travelling.
 */
const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }));
const haptics = vi.hoisted(() => ({ haptic: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({}) }));
vi.mock('../../lib/haptics', () => haptics);
vi.mock('../use-prefetch-tabs', () => ({ usePrefetchTabs: () => undefined, useIdleRowsAhead: () => undefined }));

import { PREVIEW_SHELL } from '../../preview/fixtures';
import { SectionSwitchProvider, useSectionSwitch } from '../section-switch';
import { revealPill, SectionStrip } from '../SectionStrip';

type Call = { el: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions };
let calls: Call[] = [];
let reduce = false;
const original = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations, scrollTo: Element.prototype.scrollTo };

beforeEach(() => {
  calls = [];
  reduce = false;
  Element.prototype.animate = vi.fn(function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ el: this, keyframes, options });
    return { cancel: vi.fn(), commitStyles: vi.fn(), addEventListener: vi.fn(), onfinish: null, playState: 'running', currentTime: 0, finished: Promise.resolve() } as unknown as Animation;
  }) as never;
  Element.prototype.getAnimations = () => [];
  Element.prototype.scrollTo = vi.fn() as never;
  router.push.mockClear();
  haptics.haptic.mockClear();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({ matches: query === '(prefers-reduced-motion: reduce)' ? reduce : false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
  // Each pill sits 100px along the row from the last, 90px wide: the plate has somewhere to slide from.
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
    const pill = this.closest('.ch-strip__pill');
    return pill ? Array.from(pill.parentElement!.children).indexOf(pill) * 100 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(90);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Element.prototype.animate = original.animate;
  Element.prototype.getAnimations = original.getAnimations;
  Element.prototype.scrollTo = original.scrollTo;
});

/** Opens the strip as the title's tap does, so the plate is live. */
function Open() {
  const sw = useSectionSwitch();
  useEffect(() => sw?.setOpen(true), []); // eslint-disable-line react-hooks/exhaustive-deps -- once, as a tap
  return null;
}

async function show() {
  const view = render(
    <LazyMotion features={domAnimation}>
      {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
      <SectionSwitchProvider pathname="/golf/dashboard" role="coach" shell={PREVIEW_SHELL}>
        <Open />
        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
        <SectionStrip pathname="/golf/dashboard" role="coach" />
      </SectionSwitchProvider>
    </LazyMotion>,
  );
  // The plate reads where it rests a frame after it mounts.
  await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
  calls = [];
  return view;
}
const pills = () => [...document.querySelectorAll<HTMLAnchorElement>('a.ch-strip__pill')];
const plateMoves = () => calls.filter((c) => c.el.classList.contains('ch-strip__plate'));

describe('the section strip (MOTION-AND-VISUAL 3.3)', () => {
  it('slides the pill over 260 ms on the iOS curve, translate and width, and ticks the selection haptic once', async () => {
    await show();
    const [, second] = pills();
    fireEvent.click(second!);
    const moves = plateMoves();
    expect(moves).toHaveLength(1);
    expect(moves[0]!.options).toMatchObject({ duration: 260, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
    expect(moves[0]!.keyframes[0]).toMatchObject({ transform: 'translate(-100px, 0px)' });
    // MAC-17: the width animation stays.
    expect(Object.keys(moves[0]!.keyframes[0]!)).toEqual(expect.arrayContaining(['transform', 'width']));
    expect(haptics.haptic.mock.calls).toEqual([['select']]);
  });

  it('a tap on the current tab scrolls the page to the top, smoothly, with no haptic and no navigation', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await show();
    const current = pills().find((a) => a.getAttribute('aria-current') === 'page')!;
    fireEvent.click(current);
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(haptics.haptic).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('under Reduce Motion the pill fades in at its new place over 180 ms, and a tap on the current tab jumps to the top', async () => {
    reduce = true;
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await show();
    fireEvent.click(pills()[2]!);
    const moves = plateMoves();
    expect(moves).toHaveLength(1);
    expect(moves[0]!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(moves[0]!.options).toMatchObject({ duration: 180 });
    cleanup();
    await show();
    fireEvent.click(pills().find((a) => a.getAttribute('aria-current') === 'page')!);
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
  });
});

describe('the strip scrolls the chosen tab into view (MOTION-AND-VISUAL 3.3)', () => {
  function row(scrollLeft: number) {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientWidth', { value: 300 });
    el.scrollLeft = scrollLeft;
    const pill = document.createElement('a');
    vi.spyOn(pill, 'offsetLeft', 'get').mockReturnValue(400);
    vi.spyOn(pill, 'offsetWidth', 'get').mockReturnValue(90);
    el.appendChild(pill);
    return { el, pill };
  }

  it('clipped at the right end: as far as it takes, smoothly', () => {
    const { el, pill } = row(0);
    revealPill(el, pill, false);
    expect(el.scrollTo).toHaveBeenCalledWith({ left: 190, behavior: 'smooth' });
  });

  it('clipped at the left end: back to its start; at once under Reduce Motion', () => {
    const { el, pill } = row(450);
    revealPill(el, pill, true);
    expect(el.scrollTo).toHaveBeenCalledWith({ left: 400, behavior: 'instant' });
  });

  it('wholly in view: the row holds still', () => {
    const { el, pill } = row(250);
    revealPill(el, pill, false);
    expect(el.scrollTo).not.toHaveBeenCalled();
  });
});

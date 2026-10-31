import { act, cleanup, render } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A22: the switcher's chevron and dot glide from the name's old width to its new one, never from 0. A name that was not
 * drawn (its bar hidden while the page's own bar holds the switcher) has no place to glide from, so the next drawn width
 * lands where it is; a real width change still glides.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({}) }));
vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));

import { PREVIEW_SHELL } from '../../preview/fixtures';
import { SectionSwitchProvider, SectionTrigger } from '../section-switch';

/** The label's ResizeObserver, driven by hand. */
let report: ((w: number) => void) | null = null;
class FakeObserver {
  constructor(private cb: ResizeObserverCallback) {
    report = (w) => this.cb([{ borderBoxSize: [{ inlineSize: w, blockSize: 20 }], contentRect: { width: w } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
const animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }) as unknown as Animation);
const original = { RO: globalThis.ResizeObserver, animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations };

beforeEach(() => {
  globalThis.ResizeObserver = FakeObserver as unknown as typeof ResizeObserver;
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
  Element.prototype.getAnimations = () => [];
  animate.mockClear();
});
afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = original.RO;
  Element.prototype.animate = original.animate;
  Element.prototype.getAnimations = original.getAnimations;
});

/** The tail's glides: each call's keyframes. */
const glides = () =>
  animate.mock.calls
    .filter((_, i) => (animate.mock.contexts[i] as Element).classList.contains('ch-sw__tail'))
    .map((c) => (c as unknown as [Keyframe[]])[0]);

describe('Shell · section switcher tail (A22)', () => {
  it('widths 64, then 0 (hidden), then 64, then 40: no glide until the last, then from +24px to rest', () => {
    const { container } = render(
      <LazyMotion features={domAnimation}>
        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
        <SectionSwitchProvider pathname="/golf/dashboard/team-hub" role="coach" shell={PREVIEW_SHELL}>
          <SectionTrigger>Team Hub</SectionTrigger>
        </SectionSwitchProvider>
      </LazyMotion>,
    );
    // The name is laid out before the chevron and dot, so they sit after it and never over it.
    const label = container.querySelector('.ch-sw__label');
    const tail = container.querySelector('.ch-sw__tail');
    expect(label && tail && label.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    act(() => report!(64));
    act(() => report!(0));
    act(() => report!(64));
    expect(glides()).toEqual([]);
    act(() => report!(40));
    expect(glides()).toEqual([[{ translate: '24px 0' }, { translate: '0 0' }]]);
  });
});

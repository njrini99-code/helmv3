import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-0008 / F-0046 (audit 2026-10-29). A pill's tap started the strip's close and the route change in one task, so a long
 * commit held the close's first frame; and the row re-snapped to the focused pill, jumping sideways. The tap now holds
 * the row still (no snap) and navigates a frame later, after the close is on the compositor. No transition is added to
 * the section switch itself (mot-03).
 */
const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({}) }));
vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../use-prefetch-tabs', () => ({ usePrefetchTabs: () => undefined, useIdleRowsAhead: () => undefined }));

import { PREVIEW_SHELL } from '../../preview/fixtures';
import { SectionSwitchProvider } from '../section-switch';
import { SectionStrip } from '../SectionStrip';

const original = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations };
beforeEach(() => {
  Element.prototype.animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null, finished: Promise.resolve() }) as unknown as Animation) as never;
  Element.prototype.getAnimations = () => [];
  router.push.mockClear();
});
afterEach(() => {
  cleanup();
  Element.prototype.animate = original.animate;
  Element.prototype.getAnimations = original.getAnimations;
});

function show() {
  return render(
    <LazyMotion features={domAnimation}>
      {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
      <SectionSwitchProvider pathname="/golf/dashboard" role="coach" shell={PREVIEW_SHELL}>
        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
        <SectionStrip pathname="/golf/dashboard" role="coach" />
      </SectionSwitchProvider>
    </LazyMotion>,
  );
}
const pill = (name: RegExp) => [...document.querySelectorAll<HTMLAnchorElement>('.ch-strip__pill')].find((a) => name.test(a.textContent ?? ''))!;

describe('choosing a section on the strip (F-0008, F-0046)', () => {
  it('navigates only after a frame, and holds the row still until it opens again', async () => {
    show();
    const target = pill(/Calendar/);
    expect(target, 'a Calendar pill').toBeTruthy();
    fireEvent.click(target);
    expect(router.push).not.toHaveBeenCalled();
    expect(document.querySelector('.ch-strip__row')!.hasAttribute('data-holding')).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(router.push).toHaveBeenCalledWith(target.getAttribute('href'), { scroll: false });
  });

  it('the holding row does not snap', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
    expect(css).toMatch(/\.ch-strip__row\[data-holding\] \{\s*scroll-snap-type: none;/);
  });
});

import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));

import { RouteFrame } from '../shell/RouteFrame';

/** PAGE_PERFORMANCE.md rule 1 and CH-1904: a new page opens at the top; Back returns to where the page was left. */

let canvas: HTMLDivElement;
const frame = (key: string) => (
  <RouteFrame routeKey={key}>
    <main>{key}</main>
  </RouteFrame>
);
function scrollCanvas(top: number) {
  canvas.scrollTop = top;
  canvas.dispatchEvent(new Event('scroll'));
}

beforeEach(() => {
  document.body.innerHTML = '';
  canvas = document.createElement('div');
  canvas.id = 'ch-canvas';
  canvas.scrollTo = vi.fn((opts?: ScrollToOptions | number) => {
    if (typeof opts === 'object' && opts.top != null) canvas.scrollTop = opts.top;
  }) as typeof canvas.scrollTo;
  document.body.appendChild(canvas);
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});

describe('RouteFrame scroll', () => {
  it('a new page opens at the top; Back to a page puts it where it was left', () => {
    const view = render(frame('/roster\u0000t1'), { container: canvas });
    scrollCanvas(640);

    view.rerender(frame('/roster/p1\u0000t1'));
    expect(canvas.scrollTo).toHaveBeenLastCalledWith({ top: 0 });

    // Back: the browser's popstate comes first, then the route change.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    view.rerender(frame('/roster\u0000t1'));
    expect(canvas.scrollTo).toHaveBeenLastCalledWith({ top: 640 });
  });

  it('a tap through to a page seen before (not Back) still opens it at the top', () => {
    const view = render(frame('/stats\u0000t1'), { container: canvas });
    scrollCanvas(300);
    view.rerender(frame('/stats/p1\u0000t1'));
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5000);
    view.rerender(frame('/stats\u0000t1'));
    vi.useRealTimers();
    expect(canvas.scrollTo).toHaveBeenLastCalledWith({ top: 0 });
  });
});

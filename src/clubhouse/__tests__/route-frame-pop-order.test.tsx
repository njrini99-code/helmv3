import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

// The router's popstate listener is on the window before RouteFrame's chunk loads, and React commits a Back inside it.
// Registered here before RouteFrame is imported, it plays the router: it rerenders onto the earlier page synchronously.
const router = vi.hoisted(() => {
  const state: { onPop: (() => void) | null } = { onPop: null };
  window.addEventListener('popstate', () => state.onPop?.());
  return state;
});

vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));

import { RouteFrame } from '../shell/RouteFrame';

it('Back committed inside the router’s popstate listener still returns the page to where it was left (WebKit, 2026-10-16)', () => {
  const canvas = document.createElement('div');
  canvas.id = 'ch-canvas';
  canvas.scrollTo = vi.fn((opts?: ScrollToOptions | number) => {
    if (typeof opts === 'object' && opts.top != null) canvas.scrollTop = opts.top;
  }) as typeof canvas.scrollTo;
  document.body.appendChild(canvas);
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  const at = (player: string) => (
    <RouteFrame routeKey={'/stats\u0000t1'} scrollKey={`/stats\u0000t1\u0000${player}`}>
      <main>{player || 'team'}</main>
    </RouteFrame>
  );
  const view = render(at(''), { container: canvas });
  canvas.scrollTop = 520;
  canvas.dispatchEvent(new Event('scroll'));
  view.rerender(at('p1'));
  expect(canvas.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
  router.onPop = () => view.rerender(at(''));
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(canvas.scrollTo).toHaveBeenLastCalledWith({ top: 520, behavior: 'instant' });
});

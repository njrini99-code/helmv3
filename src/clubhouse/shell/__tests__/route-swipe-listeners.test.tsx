import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRouteSwipe } from '../use-route-swipe';

/**
 * C1: the route swipe listens on the document, but the one listener that may preventDefault a scroll (a non-passive
 * touchmove) is attached only while a touch that landed at the left edge is being read. A pushed page that nobody
 * touches at the edge scrolls without waiting on script.
 */
function Probe() {
  useRouteSwipe(true, 'k');
  return null;
}

afterEach(() => vi.restoreAllMocks());

describe('the route swipe’s listeners', () => {
  it('mounts with a passive touchstart and no touchmove', () => {
    const add = vi.spyOn(document, 'addEventListener');
    render(<Probe />);
    const kinds = add.mock.calls.map(([type, , opts]) => [type, (opts as AddEventListenerOptions | undefined)?.passive]);
    expect(kinds).toContainEqual(['touchstart', true]);
    expect(kinds.some(([type]) => type === 'touchmove')).toBe(false);
  });

  it('a touch away from the edge attaches nothing more', () => {
    const add = vi.spyOn(document, 'addEventListener');
    render(<Probe />);
    add.mockClear();
    const touch = { clientX: 200, clientY: 300 } as Touch;
    document.dispatchEvent(Object.assign(new Event('touchstart', { bubbles: true }), { touches: [touch] }));
    expect(add.mock.calls.some(([type]) => type === 'touchmove')).toBe(false);
  });
});

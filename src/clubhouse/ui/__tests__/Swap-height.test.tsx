import { cleanup, render } from '@testing-library/react';
import { LazyMotion, domMax } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Swap } from '../Swap';

/** The content's height, as the test sets it; the frame reports it unless a height is pinned on it. */
let contentH = 100;
let restore: PropertyDescriptor | undefined;

beforeEach(() => {
  contentH = 100;
  restore = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.classList.contains('ch-swap')) return 0;
      return this.style.height ? parseFloat(this.style.height) : contentH;
    },
  });
});
afterEach(() => {
  cleanup();
  if (restore) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', restore);
  vi.restoreAllMocks();
});

const swap = (k: string) => (
  <LazyMotion features={domMax}>
    <Swap swapKey={k}>
      <p>{k}</p>
    </Swap>
  </LazyMotion>
);

/** B7: a swap eases its frame from the old content's height to the new one's, then lets it be `auto` again. */
describe('Swap height', () => {
  it('on a key change the frame gets an explicit, clipped height that is cleared afterwards', async () => {
    const { rerender, container } = render(swap('a'));
    const frame = container.querySelector<HTMLElement>('.ch-swap')!;
    expect(frame.style.height).toBe('');
    contentH = 240;
    rerender(swap('b'));
    expect(frame.style.height).toBe('240px');
    expect(frame.style.overflow).toBe('clip');
    expect(frame.style.transition).toContain('height');
    await new Promise((r) => setTimeout(r, 320));
    expect(frame.style.height).toBe('');
    expect(frame.style.overflow).toBe('');
  });

  it('the same height, or the same key, pins nothing', () => {
    const { rerender, container } = render(swap('a'));
    const frame = container.querySelector<HTMLElement>('.ch-swap')!;
    rerender(swap('a'));
    expect(frame.style.height).toBe('');
    rerender(swap('b'));
    expect(frame.style.height).toBe('');
  });

  it('with reduced motion the frame takes the new height at once', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ matches: query.includes('reduce'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
    );
    const { rerender, container } = render(swap('a'));
    contentH = 240;
    rerender(swap('b'));
    expect(container.querySelector<HTMLElement>('.ch-swap')!.style.height).toBe('');
  });
});

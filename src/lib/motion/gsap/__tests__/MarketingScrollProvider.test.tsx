// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const lenis = {
    destroy: vi.fn(),
    off: vi.fn(),
    on: vi.fn(),
    raf: vi.fn(),
    scrollTo: vi.fn(),
    stop: vi.fn(),
  };
  return {
    lenis,
    lenisConstructor: vi.fn(function () {
      return lenis;
    }),
    refresh: vi.fn(),
    tickerAdd: vi.fn(),
    tickerLagSmoothing: vi.fn(),
    tickerRemove: vi.fn(),
    triggerUpdate: vi.fn(),
  };
});

vi.mock('lenis', () => ({ default: mocks.lenisConstructor }));
vi.mock('../register', () => ({
  gsap: {
    ticker: {
      add: mocks.tickerAdd,
      lagSmoothing: mocks.tickerLagSmoothing,
      remove: mocks.tickerRemove,
    },
  },
  ScrollTrigger: {
    refresh: mocks.refresh,
    update: mocks.triggerUpdate,
  },
}));

import { MarketingScrollProvider } from '../MarketingScrollProvider';

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;

function flushAnimationFrame() {
  act(() => {
    const queued = [...rafCallbacks.values()];
    rafCallbacks.clear();
    queued.forEach((callback) => callback(0));
  });
}

describe('MarketingScrollProvider route and hash positioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
    window.history.replaceState(null, '', '/products');
    window.history.scrollRestoration = 'auto';
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });

    rafCallbacks = new Map();
    nextRafId = 1;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.set(id, callback);
      return id;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      rafCallbacks.delete(id);
    }));
  });

  it('keeps the main route-reset behavior for a route without a hash', () => {
    render(<MarketingScrollProvider anchors />);

    expect(window.history.scrollRestoration).toBe('manual');
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'auto',
    });

    flushAnimationFrame();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.lenis.scrollTo).not.toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ immediate: true }),
    );
  });

  it('stops Lenis and resets immediately when an ordinary cross-page link is activated', () => {
    render(<MarketingScrollProvider anchors />);
    vi.mocked(window.scrollTo).mockClear();
    mocks.lenis.scrollTo.mockClear();

    const link = document.createElement('a');
    link.href = '/';
    link.addEventListener('click', (event) => event.preventDefault());
    document.body.appendChild(link);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(mocks.lenis.stop).toHaveBeenCalled();
    expect(mocks.lenis.scrollTo).toHaveBeenCalledWith(0, {
      immediate: true,
      force: true,
    });
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'auto',
    });
  });

  it('preserves a load-time hash and repositions through Lenis after refresh', () => {
    window.history.replaceState(null, '', '/products#stats');
    const target = document.createElement('section');
    target.id = 'stats';
    document.body.appendChild(target);

    render(<MarketingScrollProvider anchors />);

    expect(window.scrollTo).not.toHaveBeenCalled();
    flushAnimationFrame();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.lenis.scrollTo).toHaveBeenCalledWith(target, {
      offset: -80,
      immediate: true,
    });
  });

  it('routes later hash changes through Lenis without invoking the route reset', () => {
    const target = document.createElement('section');
    target.id = 'golfhelm';
    document.body.appendChild(target);
    render(<MarketingScrollProvider anchors />);
    vi.mocked(window.scrollTo).mockClear();
    mocks.lenis.scrollTo.mockClear();

    window.history.replaceState(null, '', '/products#golfhelm');
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(mocks.lenis.scrollTo).toHaveBeenCalledWith(target, { offset: -80 });
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('corrects reduced-motion deep links natively after ScrollTrigger refresh', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    window.history.replaceState(null, '', '/products#stats');
    const target = document.createElement('section');
    target.id = 'stats';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    render(<MarketingScrollProvider anchors />);
    flushAnimationFrame();

    expect(mocks.lenisConstructor).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(target.scrollIntoView).toHaveBeenCalled();
  });
});

// =============================================================================
// src/components/fairway/app-shell/LargeTitleContext.test.tsx
//
// M1 (condensing-header, 2026-07-10) — pins the condensing-header mechanism:
// `useLargeTitle()`'s safe outside-a-provider default, `FairwayLargeTitleProvider`
// wiring up/disconnecting its IntersectionObserver on `enabled`, flipping
// `condensed` off the observer callback (never a scroll listener), the
// bar-height + sub-nav-offset `rootMargin` math, and the title registration
// channel `FairwayLargeTitle` writes through.
//
// DEFECT FIX (2026-07-10) — also pins the fix for "condense fires after ~1px
// of scroll instead of once the large title has scrolled away": the observer
// now watches whatever `registerTitleNode` registers (a real DOM node) in
// preference to the static sentinel, and `FairwayContentAnchor` is what
// registers the page's own first rendered element as that node.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  FairwayLargeTitleProvider,
  FairwayHeaderSentinel,
  FairwayContentAnchor,
  useLargeTitle,
} from './LargeTitleContext';

type IOEntry = { isIntersecting: boolean };
type IOCallback = (entries: IOEntry[]) => void;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IOCallback;
  options?: IntersectionObserverInit;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: IOCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockIntersectionObserver;
});

function Consumer() {
  const { condensed, registeredTitle } = useLargeTitle();
  return (
    <div>
      <span data-testid="condensed">{String(condensed)}</span>
      <span data-testid="title">{registeredTitle ?? '(none)'}</span>
    </div>
  );
}

describe('useLargeTitle outside a provider', () => {
  it('degrades to never-condensed, no title, and a no-op setter (never throws)', () => {
    render(<Consumer />);
    expect(screen.getByTestId('condensed')).toHaveTextContent('false');
    expect(screen.getByTestId('title')).toHaveTextContent('(none)');
  });
});

describe('FairwayLargeTitleProvider', () => {
  it('observes the sentinel with a single IntersectionObserver when enabled', () => {
    render(
      <FairwayLargeTitleProvider enabled>
        <FairwayHeaderSentinel />
        <Consumer />
      </FairwayLargeTitleProvider>,
    );
    expect(MockIntersectionObserver.instances).toHaveLength(1);
    expect(MockIntersectionObserver.instances[0]!.observe).toHaveBeenCalledTimes(1);
  });

  it('flips `condensed` from the observer callback, not a scroll listener', () => {
    render(
      <FairwayLargeTitleProvider enabled>
        <FairwayHeaderSentinel />
        <Consumer />
      </FairwayLargeTitleProvider>,
    );
    expect(screen.getByTestId('condensed')).toHaveTextContent('false');

    const observer = MockIntersectionObserver.instances[0]!;
    act(() => {
      observer.callback([{ isIntersecting: false }]);
    });
    expect(screen.getByTestId('condensed')).toHaveTextContent('true');

    act(() => {
      observer.callback([{ isIntersecting: true }]);
    });
    expect(screen.getByTestId('condensed')).toHaveTextContent('false');
  });

  it('never creates an observer when disabled (md:+ never condenses)', () => {
    render(
      <FairwayLargeTitleProvider enabled={false}>
        <FairwayHeaderSentinel />
        <Consumer />
      </FairwayLargeTitleProvider>,
    );
    expect(MockIntersectionObserver.instances).toHaveLength(0);
    expect(screen.getByTestId('condensed')).toHaveTextContent('false');
  });

  it('disconnects the observer and stays un-condensed when `enabled` flips off', () => {
    const { rerender } = render(
      <FairwayLargeTitleProvider enabled>
        <FairwayHeaderSentinel />
        <Consumer />
      </FairwayLargeTitleProvider>,
    );
    const observer = MockIntersectionObserver.instances[0]!;
    act(() => {
      observer.callback([{ isIntersecting: false }]);
    });
    expect(screen.getByTestId('condensed')).toHaveTextContent('true');

    rerender(
      <FairwayLargeTitleProvider enabled={false}>
        <FairwayHeaderSentinel />
        <Consumer />
      </FairwayLargeTitleProvider>,
    );
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('condensed')).toHaveTextContent('false');
  });

  it('shrinks the observer root by the fixed 64px bar height when no sub-nav is present', () => {
    render(
      <FairwayLargeTitleProvider enabled>
        <FairwayHeaderSentinel />
      </FairwayLargeTitleProvider>,
    );
    expect(MockIntersectionObserver.instances[0]!.options?.rootMargin).toBe('-64px 0px 0px 0px');
  });

  it('adds the 44px sub-nav offset to the shrunk root when hasSubNav is set', () => {
    render(
      <FairwayLargeTitleProvider enabled hasSubNav>
        <FairwayHeaderSentinel />
      </FairwayLargeTitleProvider>,
    );
    expect(MockIntersectionObserver.instances[0]!.options?.rootMargin).toBe('-108px 0px 0px 0px');
  });

  it('registers and clears a title via setRegisteredTitle', () => {
    function Registrar() {
      const { setRegisteredTitle } = useLargeTitle();
      return (
        <>
          <Button type="button" onClick={() => setRegisteredTitle('Roster')}>
            register
          </Button>
          <Button type="button" onClick={() => setRegisteredTitle(null)}>
            clear
          </Button>
        </>
      );
    }
    render(
      <FairwayLargeTitleProvider enabled={false}>
        <FairwayHeaderSentinel />
        <Registrar />
        <Consumer />
      </FairwayLargeTitleProvider>,
    );
    expect(screen.getByTestId('title')).toHaveTextContent('(none)');

    act(() => screen.getByRole('button', { name: 'register' }).click());
    expect(screen.getByTestId('title')).toHaveTextContent('Roster');

    act(() => screen.getByRole('button', { name: 'clear' }).click());
    expect(screen.getByTestId('title')).toHaveTextContent('(none)');
  });

  it('DEFECT FIX: observes a registered title node instead of the sentinel, and falls back to the sentinel when cleared', () => {
    const titleNode = document.createElement('div');
    function Registrar() {
      const { registerTitleNode } = useLargeTitle();
      const nodeRef = useRef(titleNode);
      return (
        <>
          <Button type="button" onClick={() => registerTitleNode(nodeRef.current)}>
            register-node
          </Button>
          <Button type="button" onClick={() => registerTitleNode(null)}>
            clear-node
          </Button>
        </>
      );
    }
    const { container } = render(
      <FairwayLargeTitleProvider enabled>
        <FairwayHeaderSentinel />
        <Registrar />
      </FairwayLargeTitleProvider>,
    );
    const sentinel = container.querySelector('[data-slot="fw-large-title-sentinel"]');

    // At rest (no title node registered yet): observes the static sentinel.
    expect(MockIntersectionObserver.instances).toHaveLength(1);
    expect(MockIntersectionObserver.instances[0]!.observe).toHaveBeenCalledWith(sentinel);

    // Registering a real title node tears down the sentinel-watching
    // observer and starts observing the real node instead.
    act(() => screen.getByRole('button', { name: 'register-node' }).click());
    expect(MockIntersectionObserver.instances[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(MockIntersectionObserver.instances).toHaveLength(2);
    expect(MockIntersectionObserver.instances[1]!.observe).toHaveBeenCalledWith(titleNode);

    // Clearing it (route without a registered title anymore) falls back to
    // the sentinel again.
    act(() => screen.getByRole('button', { name: 'clear-node' }).click());
    expect(MockIntersectionObserver.instances).toHaveLength(3);
    expect(MockIntersectionObserver.instances[2]!.observe).toHaveBeenCalledWith(sentinel);
  });
});

describe('FairwayContentAnchor', () => {
  it('renders its children unchanged', () => {
    render(
      <FairwayLargeTitleProvider enabled={false}>
        <FairwayContentAnchor>
          <h1>Roster</h1>
        </FairwayContentAnchor>
      </FairwayLargeTitleProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Roster' })).toBeInTheDocument();
  });

  it('RE-VERIFY FIX: prefers the data-fw-title-anchor node NESTED inside the page single wrapper div (the real repo page shape)', () => {
    // Every real page returns ONE wrapper div containing masthead AND body
    // (never top-level siblings) — the 2026-07-10 re-verify defect was
    // observing that whole wrapper, deferring condense to the page bottom.
    render(
      <FairwayLargeTitleProvider enabled hasSubNav>
        <FairwayHeaderSentinel />
        <FairwayContentAnchor>
          <div data-testid="page-wrapper">
            <header data-fw-title-anchor data-testid="page-masthead">
              Roster
            </header>
            <div data-testid="page-body">28 players and a very tall grid…</div>
          </div>
        </FairwayContentAnchor>
      </FairwayLargeTitleProvider>,
    );
    const masthead = screen.getByTestId('page-masthead');
    const lastObserver = MockIntersectionObserver.instances.at(-1)!;
    expect(lastObserver.observe).toHaveBeenCalledWith(masthead);
    // Never observes the whole page wrapper, the body, or the sentinel.
    expect(lastObserver.observe).not.toHaveBeenCalledWith(screen.getByTestId('page-wrapper'));
    expect(lastObserver.observe).not.toHaveBeenCalledWith(screen.getByTestId('page-body'));
  });

  it('RE-VERIFY FIX: an UNMARKED page-height wrapper falls back to the sentinel (early condense beats never-condense)', () => {
    const tallRect = { height: 2400 } as DOMRect;
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(tallRect);
    try {
      const { container } = render(
        <FairwayLargeTitleProvider enabled>
          <FairwayHeaderSentinel />
          <FairwayContentAnchor>
            <div data-testid="page-wrapper">
              <h1>Errors</h1>
              <div>the entire triage queue…</div>
            </div>
          </FairwayContentAnchor>
        </FairwayLargeTitleProvider>,
      );
      const sentinel = container.querySelector('[data-slot="fw-large-title-sentinel"]');
      const lastObserver = MockIntersectionObserver.instances.at(-1)!;
      expect(lastObserver.observe).toHaveBeenCalledWith(sentinel);
      expect(lastObserver.observe).not.toHaveBeenCalledWith(screen.getByTestId('page-wrapper'));
    } finally {
      spy.mockRestore();
    }
  });

  it('still accepts an unmarked THIN first child as the anchor (hand-rolled masthead compatibility)', () => {
    render(
      <FairwayLargeTitleProvider enabled>
        <FairwayHeaderSentinel />
        <FairwayContentAnchor>
          <div data-testid="page-title">Roster</div>
          <div data-testid="page-body">28 players</div>
        </FairwayContentAnchor>
      </FairwayLargeTitleProvider>,
    );
    // jsdom reports 0 height (unmeasurable → treated as title-sized).
    const titleNode = screen.getByTestId('page-title');
    const lastObserver = MockIntersectionObserver.instances.at(-1)!;
    expect(lastObserver.observe).toHaveBeenCalledWith(titleNode);
    expect(lastObserver.observe).not.toHaveBeenCalledWith(screen.getByTestId('page-body'));
  });

  it('DEFECT FIX: falls back to the static sentinel once the anchor unmounts (route without a registered title)', () => {
    function Wrapper({ show }: { show: boolean }) {
      return (
        <FairwayLargeTitleProvider enabled>
          <FairwayHeaderSentinel />
          {show && (
            <FairwayContentAnchor>
              <div data-testid="page-title">Roster</div>
            </FairwayContentAnchor>
          )}
        </FairwayLargeTitleProvider>
      );
    }
    const { rerender, container } = render(<Wrapper show />);
    const sentinel = container.querySelector('[data-slot="fw-large-title-sentinel"]');
    const titleNode = screen.getByTestId('page-title');
    expect(MockIntersectionObserver.instances.at(-1)!.observe).toHaveBeenCalledWith(titleNode);

    rerender(<Wrapper show={false} />);
    expect(MockIntersectionObserver.instances.at(-1)!.observe).toHaveBeenCalledWith(sentinel);
  });
});

describe('FairwayHeaderSentinel', () => {
  it('renders an aria-hidden, zero-height marker', () => {
    const { container } = render(
      <FairwayLargeTitleProvider enabled={false}>
        <FairwayHeaderSentinel />
      </FairwayLargeTitleProvider>,
    );
    const sentinel = container.querySelector('[data-slot="fw-large-title-sentinel"]');
    expect(sentinel).not.toBeNull();
    expect(sentinel).toHaveAttribute('aria-hidden');
    expect(sentinel?.className).toContain('h-px');
  });
});

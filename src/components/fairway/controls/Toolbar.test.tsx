// @vitest-environment jsdom
/**
 * ============================================================================
 * Toolbar — filters no longer compete with search for growth at desktop
 * widths (bug #949 #8)
 * ----------------------------------------------------------------------------
 * `search` and `filters` both carried `flex-1` (equal growth share), so a
 * search field with room to spare (capped at `sm:max-w-sm`) could still pull
 * flex-grow share away from the filters cluster, which has NO width floor of
 * its own (`min-w-0` + `overflow-x-auto`, so it silently absorbs any deficit
 * via its own scrollbar instead of ever forcing the row to wrap). At >=1280px
 * this squeezed a 3-pill filter set (Severity/Status/Category) down far
 * enough that the trailing pill clipped under the view-toggle segmented
 * control, even though the row had plenty of total room. Pinning `search` to
 * a fixed width from `lg` up (rather than letting it keep growing) hands all
 * the desktop-tier leftover space to `filters` instead.
 * ========================================================================== */
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Toolbar } from './Toolbar';

describe('Toolbar — search stops competing with filters for growth at lg+', () => {
  it('the search wrapper is pinned (flex-none) from `lg` up, not still flex-1', () => {
    const { container } = render(
      <Toolbar
        search={<input aria-label="search" />}
        filters={<button>Severity</button>}
        viewToggle={<button>Feed</button>}
      />,
    );
    const searchWrapper = container.querySelector('input')?.parentElement;
    expect(searchWrapper).not.toBeNull();
    expect(searchWrapper!.className).toContain('lg:flex-none');
    expect(searchWrapper!.className).toContain('lg:w-72');
  });

  it('the filters wrapper stays the only grower on the row from `sm` up (absorbs desktop leftover space)', () => {
    const { container } = render(
      <Toolbar
        search={<input aria-label="search" />}
        filters={<button>Severity</button>}
        viewToggle={<button>Feed</button>}
      />,
    );
    const filtersWrapper = container.querySelector('[class*="overflow-x-auto"]');
    expect(filtersWrapper).not.toBeNull();
    expect(filtersWrapper!.className).toContain('sm:grow');
    expect(filtersWrapper!.className).toContain('sm:basis-0');
    expect(filtersWrapper!.className).toContain('min-w-0');
  });

  it('below `sm` the row stacks as full-width lines in SOURCE order — no `order` utilities (tab order must match visual order)', () => {
    const { container } = render(
      <Toolbar
        search={<input aria-label="search" />}
        filters={<button>Severity</button>}
        viewToggle={<button data-testid="toggle">Feed</button>}
      />,
    );
    // Phone composition (#957 + #959 review): line 1 = search (basis-full),
    // line 2 = the filter scroll strip (basis-full), line 3 = view toggle +
    // actions (ml-auto). An earlier draft reflowed lines with `order-*`,
    // which sent keyboard focus visually backwards on phones — DOM order,
    // tab order, and visual order must stay identical, so `order` utilities
    // are banned from this row.
    const searchWrapper = container.querySelector('input')!.parentElement!;
    const strip = container.querySelector('[class*="overflow-x-auto"]')!;
    expect(searchWrapper.className).toContain('basis-full');
    expect(strip.className).toContain('basis-full');
    for (const el of [searchWrapper, strip]) {
      expect(el.className).not.toMatch(/(?:^|\s)order-/);
    }
    // The view toggle is mounted exactly ONCE, in the trailing cluster —
    // never duplicated into a phone-only slot.
    expect(container.querySelectorAll('[data-testid="toggle"]')).toHaveLength(1);
    const trailing = container.querySelector('[data-testid="toggle"]')!.parentElement!;
    expect(trailing.className).toContain('ml-auto');
    expect(trailing.className).not.toMatch(/(?:^|\s)order-/);
  });
});

/**
 * ============================================================================
 * Toolbar bulk-action bar — docks to the bottom edge (audit W2)
 * ----------------------------------------------------------------------------
 * The bulk-action bar used to swap IN PLACE of the row's own controls when
 * `selectedCount > 0` — on a long scrolled list that swap "stuck" wherever the
 * toolbar's own (short) box happened to sit rather than at a real screen
 * edge, reading as chrome floating mid-page over list content instead of
 * docked to an edge. It also hid search/filters for the whole time a coach
 * had rows selected. Fix: the bulk bar is now a SEPARATE, `fixed
 * inset-x-0 bottom-0` element (the same viewport-relative technique the
 * Sheet primitive uses for its own bottom edge) that renders ALONGSIDE — not
 * instead of — the row's controls.
 * ========================================================================== */
describe('Toolbar bulk-action bar — bottom-docked, not swapped in place', () => {
  it('the row keeps its own controls (search) visible even while rows are selected', () => {
    render(
      <Toolbar
        search={<input aria-label="search" />}
        filters={<button>Severity</button>}
        selectedCount={2}
        bulkActions={<button>Acknowledge</button>}
      />,
    );
    // Previously the "controls" row was replaced entirely by the bulk bar —
    // the search field disappeared for as long as a selection was active.
    expect(screen.getByLabelText('search')).toBeInTheDocument();
  });

  it('the bulk-action bar is a separate element fixed to the bottom edge of the viewport', () => {
    const { container } = render(
      <Toolbar
        search={<input aria-label="search" />}
        selectedCount={3}
        selectionNoun="signal"
        bulkActions={<button>Resolve</button>}
      />,
    );
    const resolveButton = screen.getByText('Resolve');
    const dockedBar = resolveButton.closest('[class*="fixed"]');
    expect(dockedBar).not.toBeNull();
    expect(dockedBar!.className).toContain('inset-x-0');
    expect(dockedBar!.className).toContain('bottom-0');
    // It is NOT inside the same box as the search input — a distinct,
    // separately-docked bar, not an in-place swap of the controls row.
    const searchWrapper = container.querySelector('input')!.closest('[role="toolbar"]')!;
    expect(searchWrapper.contains(dockedBar)).toBe(false);
  });

  it('renders the selection count and a Clear affordance inside the docked bar', () => {
    render(
      <Toolbar
        selectedCount={4}
        selectionNoun="signal"
        bulkActions={<button>Dismiss</button>}
        onClearSelection={() => {}}
      />,
    );
    expect(screen.getByText('4 signals')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('renders no bulk bar at all when nothing is selected', () => {
    render(<Toolbar search={<input aria-label="search" />} selectedCount={0} />);
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });
});

/**
 * ============================================================================
 * Toolbar `material` prop — the brief's "FrostToolbar" is this component
 * ----------------------------------------------------------------------------
 * `material` defaults to `'matte'`, which must be byte-identical to every
 * pre-existing Toolbar (no `fw-frost*` class, no `data-material` regression
 * for callers that never pass the prop). `material="frost"` always renders
 * the shared floating frost material — stuck or not — without touching any
 * slot or behavior.
 * ========================================================================== */
describe('Toolbar `material` prop', () => {
  it('defaults to the bare frame: no box, one hairline, no frost or matte card paint at rest', () => {
    render(<Toolbar search={<input aria-label="search" />} aria-label="Filters and actions" />);
    const row = screen.getByRole('toolbar', { name: 'Filters and actions' });
    expect(row).toHaveAttribute('data-frame', 'bare');
    expect(row.className).toContain('border-b');
    expect(row.className).toContain('border-border-subtle');
    expect(row.className).not.toContain('rounded-card');
    expect(row.className).not.toMatch(/(?:^|\s)bg-surface(?:\s|$)/);
    expect(row.className).not.toMatch(/(?:^|\s)fw-frost/);
    // Bleed hooks: margin and padding cancel through --fw-toolbar-bleed.
    expect(row.style.marginInline).toBe('calc(var(--fw-toolbar-bleed, 0px) * -1)');
    expect(row.style.paddingInline).toBe('var(--fw-toolbar-bleed, 0px)');
  });

  it('frame="card" + matte: no frost classes, at-rest bg-surface hairline (pre-facelift box)', () => {
    render(
      <Toolbar frame="card" search={<input aria-label="search" />} aria-label="Filters and actions" />,
    );
    const row = screen.getByRole('toolbar', { name: 'Filters and actions' });
    expect(row).toHaveAttribute('data-material', 'matte');
    expect(row.className).toContain('rounded-card');
    expect(row.className).not.toMatch(/(?:^|\s)fw-frost/);
    expect(row.className).toContain('bg-surface');
    expect(row.className).toContain('border-border-subtle');
  });

  it('frame="card" material="frost" always renders the shared floating frost material, not stuck-only glass', () => {
    render(
      <Toolbar
        frame="card"
        search={<input aria-label="search" />}
        material="frost"
        aria-label="Filters and actions"
      />,
    );
    const row = screen.getByRole('toolbar', { name: 'Filters and actions' });
    expect(row).toHaveAttribute('data-material', 'frost');
    expect(row.className).toContain('fw-frost');
    expect(row.className).toContain('fw-frost-subtle');
    // No matte-at-rest classes leak through when frosted.
    expect(row.className).not.toMatch(/(?:^|\s)bg-surface(?:\s|$)/);
  });

  it('material="frost" keeps every slot rendering (search + filters + viewToggle + primaryAction)', () => {
    render(
      <Toolbar
        material="frost"
        search={<input aria-label="search" />}
        filters={<button>Severity</button>}
        viewToggle={<button data-testid="toggle">Feed</button>}
        primaryAction={<button>New</button>}
      />,
    );
    expect(screen.getByLabelText('search')).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByTestId('toggle')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('bare frame ignores material at rest: material="frost" renders no frost classes until stuck', () => {
    render(
      <Toolbar
        search={<input aria-label="search" />}
        material="frost"
        aria-label="Filters and actions"
      />,
    );
    const row = screen.getByRole('toolbar', { name: 'Filters and actions' });
    expect(row).toHaveAttribute('data-material', 'frost');
    expect(row.className).not.toMatch(/(?:^|\s)fw-frost/);
    expect(row.className).toContain('border-border-subtle');
  });

  it('frame="card" material="frost" + sticky still applies the sticky offset/z-index style, unlike matte it never swaps to the stuck-glass classes', () => {
    render(
      <Toolbar
        frame="card"
        search={<input aria-label="search" />}
        material="frost"
        sticky
        stickyTop={12}
        aria-label="Filters and actions"
      />,
    );
    const row = screen.getByRole('toolbar', { name: 'Filters and actions' });
    expect(row.style.top).toBe('12px');
    expect(row.className).toContain('fw-frost-subtle');
    expect(row.className).not.toContain('backdrop-blur-glass');
  });

  it('stickyTop accepts a CSS calc() string and uses it verbatim as the `top` value', () => {
    render(
      <Toolbar
        sticky
        stickyTop="calc(var(--golf-mobile-header-offset) + var(--fw-hub-subnav-offset, 0px))"
        aria-label="Filters and actions"
      />,
    );
    const row = screen.getByRole('toolbar', { name: 'Filters and actions' });
    expect(row.style.top).toBe(
      'calc(var(--golf-mobile-header-offset) + var(--fw-hub-subnav-offset, 0px))',
    );
  });

  it('stickyTop still defaults to a plain 0px offset when omitted', () => {
    render(<Toolbar sticky aria-label="Filters and actions" />);
    const row = screen.getByRole('toolbar', { name: 'Filters and actions' });
    expect(row.style.top).toBe('0px');
  });
});

describe('Toolbar — sticky detection never hands a calc() string to IntersectionObserver', () => {
  // rootMargin accepts only px or %; a calc()/var() expression throws inside
  // the effect and takes the whole route to its error boundary (seen on the
  // roster and round review pages). The string offset must be resolved to px.
  const originalIO = globalThis.IntersectionObserver;
  const originalGCS = window.getComputedStyle;
  afterEach(() => {
    globalThis.IntersectionObserver = originalIO;
    window.getComputedStyle = originalGCS;
  });

  function stubObserver() {
    const seen: IntersectionObserverInit[] = [];
    class FakeIO {
      constructor(_cb: IntersectionObserverCallback, init?: IntersectionObserverInit) {
        const margin = init?.rootMargin ?? '';
        // Mirror the browser's validation so a regression fails loudly here too.
        if (!/^(-?\d+(\.\d+)?(px|%)\s*){1,4}$/.test(margin)) {
          throw new SyntaxError("Failed to construct 'IntersectionObserver': rootMargin must be specified in pixels or percent.");
        }
        seen.push(init ?? {});
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    globalThis.IntersectionObserver = FakeIO as unknown as typeof IntersectionObserver;
    return seen;
  }

  it('resolves a calc() stickyTop through the row\'s computed top and observes with a px rootMargin', () => {
    const seen = stubObserver();
    window.getComputedStyle = ((el: Element) => {
      const base = originalGCS(el);
      return el.getAttribute('role') === 'toolbar' ? ({ ...base, top: '88px' } as CSSStyleDeclaration) : base;
    }) as typeof window.getComputedStyle;
    render(
      <Toolbar
        sticky
        stickyTop="calc(var(--golf-mobile-header-offset) + var(--fw-hub-subnav-offset, 0px))"
        aria-label="Filters and actions"
      />,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.rootMargin).toBe('-89px 0px 0px 0px');
  });

  it('keeps the plain px arithmetic for a numeric stickyTop', () => {
    const seen = stubObserver();
    render(<Toolbar sticky stickyTop={12} aria-label="Filters and actions" />);
    expect(seen[0]?.rootMargin).toBe('-13px 0px 0px 0px');
  });

  it('re-resolves the string offset on resize', () => {
    const seen = stubObserver();
    let top = '88px';
    window.getComputedStyle = ((el: Element) => {
      const base = originalGCS(el);
      return el.getAttribute('role') === 'toolbar' ? ({ ...base, top } as CSSStyleDeclaration) : base;
    }) as typeof window.getComputedStyle;
    render(<Toolbar sticky stickyTop="calc(1px + 2px)" aria-label="Filters and actions" />);
    top = '104px';
    window.dispatchEvent(new Event('resize'));
    expect(seen.map((s) => s.rootMargin)).toEqual(['-89px 0px 0px 0px', '-105px 0px 0px 0px']);

  });
});

describe('Toolbar `leading` slot', () => {
  it('renders before search, shrinks to content, and is omitted from layout when absent', () => {
    const { rerender } = render(
      <Toolbar
        leading={<button>‹ September 2026 ›</button>}
        search={<input aria-label="search" />}
      />,
    );
    const row = screen.getByRole('toolbar');
    const leadingButton = screen.getByRole('button', { name: '‹ September 2026 ›' });
    const searchInput = screen.getByRole('textbox', { name: 'search' });
    // leading precedes search in DOM/tab order (no `order` utilities anywhere here).
    expect(
      leadingButton.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const leadingWrapper = leadingButton.parentElement;
    expect(leadingWrapper).not.toBeNull();
    expect(leadingWrapper!.className).toContain('shrink-0');
    expect(row.contains(leadingWrapper)).toBe(true);

    rerender(<Toolbar search={<input aria-label="search" />} />);
    expect(screen.queryByRole('button', { name: '‹ September 2026 ›' })).not.toBeInTheDocument();
  });
});

describe('Toolbar bare frame while stuck', () => {
  const originalIO = globalThis.IntersectionObserver;
  afterEach(() => {
    globalThis.IntersectionObserver = originalIO;
  });

  it('earns the shared frost bar (fw-frost fw-frost-bar) only once the sentinel scrolls out', () => {
    let fire: ((stuck: boolean) => void) | null = null;
    class FakeIO {
      constructor(cb: IntersectionObserverCallback) {
        fire = (stuck) =>
          cb([{ isIntersecting: !stuck } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    globalThis.IntersectionObserver = FakeIO as unknown as typeof IntersectionObserver;

    render(<Toolbar sticky stickyTop={8} search={<input aria-label="search" />} aria-label="Filters and actions" />);
    const row = screen.getByRole('toolbar', { name: 'Filters and actions' });
    expect(row.className).not.toMatch(/(?:^|\s)fw-frost/);
    expect(row).not.toHaveAttribute('data-stuck');

    act(() => fire?.(true));
    expect(row).toHaveAttribute('data-stuck');
    expect(row.className).toContain('fw-frost');
    expect(row.className).toContain('fw-frost-bar');
    expect(row.className).not.toContain('rounded-card');
    expect(row.className).not.toContain('fw-frost-subtle');

    act(() => fire?.(false));
    expect(row.className).not.toMatch(/(?:^|\s)fw-frost/);
    expect(row.className).toContain('border-border-subtle');
  });
});

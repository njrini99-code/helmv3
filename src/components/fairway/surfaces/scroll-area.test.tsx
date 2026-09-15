// @vitest-environment jsdom
/**
 * ============================================================================
 * ScrollArea — the scroll container for queues/rails/panels
 * ----------------------------------------------------------------------------
 * jsdom reports 0 for scrollWidth/scrollHeight/clientWidth on every element,
 * so useScrollFade's own overflow detection (exercised by its own test suite)
 * can never observe a real "hidden content" edge here. This file pins
 * ScrollArea's OWN contract instead: slots, orientation → overflow classes,
 * the always-on touch/overscroll inline style, and ref forwarding to the
 * scrolling viewport (not the outer wrapper).
 * ========================================================================== */
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScrollArea } from './scroll-area';

describe('ScrollArea — slots', () => {
  it('renders children inside the scrolling viewport', () => {
    render(
      <ScrollArea>
        <div data-testid="row">Row 1</div>
      </ScrollArea>,
    );
    expect(screen.getByTestId('row')).toBeInTheDocument();
  });

  it('renders an optional stickyHeader outside (above) the scrolling viewport', () => {
    const { container } = render(
      <ScrollArea stickyHeader={<div data-testid="header">Queue</div>}>
        <div>Row 1</div>
      </ScrollArea>,
    );
    const header = screen.getByTestId('header');
    const viewport = container.querySelector('[data-slot="fw-scroll-area-viewport"]');
    expect(viewport).not.toBeNull();
    expect(viewport!.contains(header)).toBe(false);
  });

  it('omits the header wrapper entirely when no stickyHeader is passed', () => {
    const { container } = render(
      <ScrollArea>
        <div>Row 1</div>
      </ScrollArea>,
    );
    expect(container.querySelector('[data-slot="fw-scroll-area-header"]')).toBeNull();
  });
});

describe('ScrollArea — orientation', () => {
  it('defaults to vertical-only overflow', () => {
    const { container } = render(<ScrollArea>content</ScrollArea>);
    const viewport = container.querySelector('[data-slot="fw-scroll-area-viewport"]')!;
    expect(viewport.className).toContain('overflow-y-auto');
    expect(viewport.className).toContain('overflow-x-hidden');
  });

  it('horizontal flips to x-auto/y-hidden', () => {
    const { container } = render(<ScrollArea orientation="horizontal">content</ScrollArea>);
    const viewport = container.querySelector('[data-slot="fw-scroll-area-viewport"]')!;
    expect(viewport.className).toContain('overflow-x-auto');
    expect(viewport.className).toContain('overflow-y-hidden');
  });

  it('both allows scroll on either axis', () => {
    const { container } = render(<ScrollArea orientation="both">content</ScrollArea>);
    const viewport = container.querySelector('[data-slot="fw-scroll-area-viewport"]')!;
    expect(viewport.className).toContain('overflow-auto');
  });
});

describe('ScrollArea — mobile scroll behavior + ref', () => {
  it('always sets momentum scroll + overscroll containment inline, regardless of edgeFade', () => {
    const { container } = render(<ScrollArea edgeFade={false}>content</ScrollArea>);
    const viewport = container.querySelector('[data-slot="fw-scroll-area-viewport"]') as HTMLElement;
    expect(viewport.style.overscrollBehavior).toBe('contain');
    // `-webkit-overflow-scrolling` isn't declared on the standard
    // CSSStyleDeclaration lib type (vendor-only, momentum-scroll on iOS
    // Safari) — read it via the untyped property bag instead of the typed one.
    expect((viewport.style as unknown as Record<string, string>).WebkitOverflowScrolling).toBe('touch');
  });

  it('forwards its ref to the scrolling viewport, not the outer wrapper', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ScrollArea ref={ref}>content</ScrollArea>);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toHaveAttribute('data-slot', 'fw-scroll-area-viewport');
  });
});

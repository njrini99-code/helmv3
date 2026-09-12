/**
 * ============================================================================
 * Fairway · Sheet — `peek` default regression (audit W2: bottom-sheet dead
 * space + un-scrimmed background)
 * ----------------------------------------------------------------------------
 * Root cause: vaul's numeric `snapPoints` (the `peek` half-detent feature)
 * compute their translateY offset from the VIEWPORT height, assuming the
 * drawer renders at ~that height. This primitive instead sizes bottom sheets
 * to their CONTENT (shrink-wrap, capped by `max-h-[88dvh]`) — a mismatch that
 * both strands dead space and, per vaul's own CSS, forces the scrim to
 * `opacity: 0` at every snap point except the final one. These tests guard
 * the fix: `peek` must default to OFF (no vaul snap points at all) unless a
 * consumer explicitly opts in, and `snapPoints` must still win when passed.
 * ============================================================================
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sheet } from './Sheet';

/** The vaul-attributed content node (`Drawer.Content`) is portaled to `document.body`. */
function drawerContent() {
  return document.body.querySelector('[data-vaul-drawer]');
}

function drawerOverlay() {
  return document.body.querySelector('[data-vaul-overlay]');
}

describe('Sheet — bottom-sheet `peek` default (audit W2)', () => {
  it('does not engage vaul snap points by default (no dead space, scrim always opaque)', () => {
    render(
      <Sheet open side="bottom" title="Default">
        <Sheet.Body>content</Sheet.Body>
      </Sheet>,
    );

    expect(drawerContent()).toHaveAttribute('data-vaul-snap-points', 'false');
    expect(drawerOverlay()).toHaveAttribute('data-vaul-snap-points', 'false');
  });

  it('leaves peek off when a consumer still passes the old explicit opt-out', () => {
    render(
      <Sheet open side="bottom" peek={false} title="Explicit opt-out">
        <Sheet.Body>content</Sheet.Body>
      </Sheet>,
    );

    expect(drawerContent()).toHaveAttribute('data-vaul-snap-points', 'false');
  });

  it('engages vaul snap points only when a consumer explicitly opts in with peek={true}', () => {
    render(
      <Sheet open side="bottom" peek title="Explicit opt-in">
        <Sheet.Body>content</Sheet.Body>
      </Sheet>,
    );

    expect(drawerContent()).toHaveAttribute('data-vaul-snap-points', 'true');
  });

  it('an explicit snapPoints prop always wins over peek', () => {
    render(
      <Sheet open side="bottom" peek={false} snapPoints={[0.4, 1]} title="Explicit snapPoints">
        <Sheet.Body>content</Sheet.Body>
      </Sheet>,
    );

    expect(drawerContent()).toHaveAttribute('data-vaul-snap-points', 'true');
  });

  it('never engages snap points on non-bottom sides, even with peek={true}', () => {
    render(
      <Sheet open side="right" peek title="Side panel">
        <Sheet.Body>content</Sheet.Body>
      </Sheet>,
    );

    expect(drawerContent()).toHaveAttribute('data-vaul-snap-points', 'false');
  });
});

/**
 * Perf split (2026-09-10): vaul applies its inline transform to
 * `Drawer.Content` on every open/close/drag frame. A `backdrop-filter` on
 * that same node gets resampled every one of those frames. The material
 * (frost/matte) must live on a static inner child instead.
 */
describe('Sheet — material split off the vaul-transformed node', () => {
  it('never puts the frost classes or data-material on the node vaul transforms', () => {
    render(
      <Sheet open side="bottom" material="frost" title="Frosted">
        <Sheet.Body>content</Sheet.Body>
      </Sheet>,
    );

    const content = drawerContent();
    expect(content).not.toBeNull();
    expect(content).not.toHaveClass('fw-frost');
    expect(content).not.toHaveClass('fw-frost-modal');
    expect(content).not.toHaveAttribute('data-material');

    const material = content!.querySelector('[data-material]');
    expect(material).not.toBeNull();
    expect(material).toHaveAttribute('data-material', 'frost');
    expect(material).toHaveClass('fw-frost', 'fw-frost-modal');
  });

  it('still renders the matte material on the inner child, not the transformed node', () => {
    render(
      <Sheet open side="bottom" title="Matte">
        <Sheet.Body>content</Sheet.Body>
      </Sheet>,
    );

    const content = drawerContent();
    expect(content).not.toHaveClass('bg-elevated');
    expect(content).not.toHaveAttribute('data-material');

    const material = content!.querySelector('[data-material]');
    expect(material).toHaveAttribute('data-material', 'matte');
    expect(material).toHaveClass('bg-elevated');
  });

  it('keeps the close button reachable and the sheet body content intact after the split', () => {
    render(
      <Sheet open side="bottom" material="frost" title="Frosted">
        <Sheet.Body>content</Sheet.Body>
      </Sheet>,
    );

    expect(document.body.querySelector('[aria-label="Close"]')).not.toBeNull();
    expect(document.body.textContent).toContain('content');
  });
});

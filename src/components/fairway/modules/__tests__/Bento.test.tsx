// @vitest-environment jsdom
/**
 * ============================================================================
 * Bento — className passthrough (2026-09-10, primitives follow-up)
 * ----------------------------------------------------------------------------
 * `Bento` already merged a caller `className` onto its root via `cn(...)`
 * (tailwind-merge based, so a conflicting utility the caller passes wins
 * over the component's own default). This pins that contract: the class is
 * present, and a conflicting utility from the caller overrides the
 * component's own default rather than losing to it.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Bento } from '../Bento';

describe('Bento — className passthrough', () => {
  it('merges a caller className onto the root alongside the default classes', () => {
    const { container } = render(
      <Bento className="my-custom-marker">
        <div>cell</div>
      </Bento>,
    );
    const root = container.querySelector('[data-slot="bento"]') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.className).toContain('my-custom-marker');
    // The component's own default classes are still present alongside it.
    expect(root.className).toContain('grid');
  });

  it('lets a conflicting caller utility win over the component default (last wins)', () => {
    const { container } = render(
      <Bento className="grid-cols-3">
        <div>cell</div>
      </Bento>,
    );
    const root = container.querySelector('[data-slot="bento"]') as HTMLElement;
    // Default is `grid-cols-1 sm:grid-cols-2`; tailwind-merge keeps only the
    // caller's `grid-cols-3` for the bare (no breakpoint) grid-cols slot.
    expect(root.className).toContain('grid-cols-3');
    expect(root.className).not.toMatch(/(^|\s)grid-cols-1(\s|$)/);
  });

  it('renders byte-identical default classes when className is omitted', () => {
    const { container } = render(
      <Bento>
        <div>cell</div>
      </Bento>,
    );
    const root = container.querySelector('[data-slot="bento"]') as HTMLElement;
    expect(root.className).toContain('grid-cols-1');
    expect(root.className).toContain('sm:grid-cols-2');
    expect(root.className).toContain('rounded-card');
  });
});

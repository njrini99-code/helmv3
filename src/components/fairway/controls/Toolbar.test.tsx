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
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

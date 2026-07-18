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
    // The filters strip is the scroll container (the only overflow-x-auto
    // element in the row) — don't reach it via the first <button>, which is
    // now the strip's phone-only view-toggle slot, not a filter pill.
    const filtersWrapper = container.querySelector('[class*="overflow-x-auto"]');
    expect(filtersWrapper).not.toBeNull();
    expect(filtersWrapper!.className).toContain('sm:grow');
    expect(filtersWrapper!.className).toContain('sm:basis-0');
    expect(filtersWrapper!.className).toContain('min-w-0');
  });

  it('below `sm` the strip is the full-width second line and hosts the view toggle', () => {
    const { container } = render(
      <Toolbar
        search={<input aria-label="search" />}
        filters={<button>Severity</button>}
        viewToggle={<button data-testid="toggle">Feed</button>}
      />,
    );
    // Phone composition (#957): line 1 = search + actions, line 2 = one
    // full-width scroll strip (view toggle + filter pills together). The strip
    // must take its own line (basis-full + order-3) and must not grow on it.
    const strip = container.querySelector('[class*="overflow-x-auto"]')!;
    expect(strip.className).toContain('basis-full');
    expect(strip.className).toContain('order-3');
    // The view toggle renders in BOTH homes: phone slot inside the strip
    // (hidden from `sm` up), desktop slot in the trailing cluster (hidden
    // below `sm`) — exactly one is ever displayed.
    const toggles = container.querySelectorAll('[data-testid="toggle"]');
    expect(toggles).toHaveLength(2);
    const phoneSlot = toggles[0]!.parentElement!;
    const desktopSlot = toggles[1]!.parentElement!;
    expect(strip.contains(phoneSlot)).toBe(true);
    expect(phoneSlot.className).toContain('sm:hidden');
    expect(desktopSlot.className).toContain('hidden');
    expect(desktopSlot.className).toContain('sm:block');
  });
});

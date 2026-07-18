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

  it('the filters wrapper stays the only flex-1 grower on the row (absorbs desktop leftover space)', () => {
    const { container } = render(
      <Toolbar
        search={<input aria-label="search" />}
        filters={<button>Severity</button>}
        viewToggle={<button>Feed</button>}
      />,
    );
    const filtersWrapper = container.querySelector('button')?.parentElement;
    expect(filtersWrapper).not.toBeNull();
    expect(filtersWrapper!.className).toContain('flex-1');
    expect(filtersWrapper!.className).toContain('min-w-0');
  });
});

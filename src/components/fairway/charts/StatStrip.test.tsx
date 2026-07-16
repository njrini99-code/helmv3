// @vitest-environment jsdom
/**
 * StatStrip.tsx tests — the ONE phone-shape rule for KPI/stat strips
 * (Mobile Doctrine rules 2, 3, 11). Exercised with plain mock chips instead
 * of the real RuledStatLine/StatTile atoms — StatStrip is a headless layout
 * primitive, so its contract is entirely about container shape (grid vs
 * rail, column targets, chip wrapping), never the atom's own rendering.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatStrip } from './StatStrip';

function Chip({ label }: { label: string }) {
  return <div data-testid={`chip-${label}`}>{label}</div>;
}

function chips(count: number) {
  return Array.from({ length: count }, (_, i) => <Chip key={i} label={`k${i}`} />);
}

describe('StatStrip — phone shape by count', () => {
  it('count 1: single full-width column, no rail', () => {
    const { container } = render(
      <StatStrip count={1}>
        <Chip label="a" />
      </StatStrip>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('grid-cols-1');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('count 2: 2-col grid, one row', () => {
    const { container } = render(<StatStrip count={2}>{chips(2)}</StatStrip>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('grid-cols-2');
    expect(root.className).toContain('sm:grid-cols-2');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('count 3: 2-col grid; trailing cell spans both columns (2 + 1-wide rhythm), span released at `lg`', () => {
    const { container } = render(<StatStrip count={3}>{chips(3)}</StatStrip>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('grid-cols-2');
    expect(root.className).toContain('[&>*:last-child]:col-span-2');
    expect(root.className).toContain('sm:[&>*:last-child]:col-span-2');
    expect(root.className).toContain('lg:[&>*:last-child]:col-span-1');
    expect(root.className).toContain('lg:grid-cols-3');
  });

  it('count 4: 2x2 grid — everything visible, no rail (rule 3: cap the scroll)', () => {
    const { container } = render(
      <StatStrip count={4} columns={4}>
        {chips(4)}
      </StatStrip>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('grid-cols-2');
    expect(root.className).toContain('lg:grid-cols-4');
    expect(root.className).not.toContain('[&>*:last-child]:col-span-2');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('count >= default railThreshold (5): a single horizontal snap-rail, not a 3-row grid', () => {
    render(
      <StatStrip count={6} columns={6} ariaLabel="Six KPIs">
        {chips(6)}
      </StatStrip>,
    );
    const list = screen.getByRole('list', { name: 'Six KPIs' });
    expect(list.className).toContain('flex');
    expect(list.className).toContain('snap-x');
    expect(list.className).toContain('snap-mandatory');
    expect(list.className).toContain('overflow-x-auto');
    expect(list.tabIndex).toBe(0);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
  });

  it('rail chips carry shrink-0/snap-start/basis sizing, reset to sm:basis-auto at `sm`', () => {
    render(<StatStrip count={5}>{chips(5)}</StatStrip>);
    const chip = screen.getAllByRole('listitem')[0]!;
    expect(chip.className).toContain('shrink-0');
    expect(chip.className).toContain('snap-start');
    expect(chip.className).toContain('basis-[9.25rem]');
    expect(chip.className).toContain('sm:basis-auto');
  });

  it('rail dissolves into the desktop grid at `sm`/`lg` with the target column count', () => {
    render(
      <StatStrip count={6} columns={6}>
        {chips(6)}
      </StatStrip>,
    );
    const list = screen.getByRole('list');
    expect(list.className).toContain('sm:grid');
    expect(list.className).toContain('sm:grid-cols-2');
    expect(list.className).toContain('sm:overflow-visible');
    expect(list.className).toContain('lg:grid-cols-6');
  });

  it('railThreshold override forces a low count into rail mode', () => {
    render(
      <StatStrip count={3} railThreshold={3} ariaLabel="Forced rail">
        {chips(3)}
      </StatStrip>,
    );
    expect(screen.getByRole('list', { name: 'Forced rail' })).toBeInTheDocument();
  });

  it('a high railThreshold keeps a large count in grid mode', () => {
    render(
      <StatStrip count={6} railThreshold={10} columns={6}>
        {chips(6)}
      </StatStrip>,
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('edgeBleedClassName bleeds the rail band only when passed (opt-in, never a default gutter)', () => {
    render(
      <StatStrip count={6} edgeBleedClassName="-mx-4 px-4" ariaLabel="Bleeding rail">
        {chips(6)}
      </StatStrip>,
    );
    const list = screen.getByRole('list', { name: 'Bleeding rail' });
    expect(list.className).toContain('-mx-4');
    expect(list.className).toContain('px-4');
  });

  it('preserves each child element key through the rail wrapper', () => {
    render(
      <StatStrip count={5}>
        <Chip key="alpha" label="alpha" />
        <Chip key="beta" label="beta" />
        <Chip key="gamma" label="gamma" />
        <Chip key="delta" label="delta" />
        <Chip key="epsilon" label="epsilon" />
      </StatStrip>,
    );
    expect(screen.getByTestId('chip-alpha')).toBeInTheDocument();
    expect(screen.getByTestId('chip-epsilon')).toBeInTheDocument();
  });

  it('className prop merges onto the root container', () => {
    const { container } = render(
      <StatStrip count={2} className="mt-4">
        {chips(2)}
      </StatStrip>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('mt-4');
  });

  it('forced-colors: band and chip boundaries stay visible in high-contrast mode', () => {
    render(
      <StatStrip count={6} ariaLabel="hc">
        {chips(6)}
      </StatStrip>,
    );
    const list = screen.getByRole('list', { name: 'hc' });
    expect(list.className).toContain('forced-colors:outline');
    const chip = screen.getAllByRole('listitem')[0]!;
    expect(chip.className).toContain('forced-colors:border');
  });

  it('hides the native scrollbar on the rail (bare band, no chrome)', () => {
    render(
      <StatStrip count={6} ariaLabel="scrollbar">
        {chips(6)}
      </StatStrip>,
    );
    const list = screen.getByRole('list', { name: 'scrollbar' });
    expect(list.className).toContain('[scrollbar-width:none]');
    expect(list.className).toContain('[&::-webkit-scrollbar]:hidden');
  });

  it('rail carries a trailing edge-fade so a hidden-scrollbar rail still signals more content past the visible chips', () => {
    // The bug this covers: with the scrollbar hidden above, a chip set that
    // happens to fill the container's content width to the pixel (e.g. an
    // 8-item "2026 Season" strip showing only 2 chips at 390px) leaves ZERO
    // affordance that H/HR/RBI/R/BB/SB exist past the edge. A static
    // mask-image fade is the fix — it must be present in rail mode...
    render(
      <StatStrip count={8} ariaLabel="edge fade">
        {chips(8)}
      </StatStrip>,
    );
    const list = screen.getByRole('list', { name: 'edge fade' });
    expect(list.className).toContain('[mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)]');
    // ...and it must be switched off once the rail dissolves into the
    // desktop grid at `sm` (nothing left to fade there) and in
    // `forced-colors` mode (never fade the one outline high-contrast relies
    // on for the band's edge).
    expect(list.className).toContain('sm:[mask-image:none]');
    expect(list.className).toContain('forced-colors:[mask-image:none]');
  });

  it('grid mode (below the rail threshold) carries no edge-fade mask — there is nothing to hint at swiping past', () => {
    const { container } = render(
      <StatStrip count={4} columns={4}>
        {chips(4)}
      </StatStrip>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('mask-image');
  });

  it('is NOT React.memo — children are always fresh from the caller (memo would lie about stability)', () => {
    expect(typeof StatStrip).toBe('function');
  });

  describe('mdColumns / xlColumns — optional mid/top desktop tier overrides', () => {
    it('grid branch: mdColumns adds an md:grid-cols-N tier alongside the default lg tier', () => {
      // admin/golf/page.tsx's restored recipe: grid-cols-2 → md:grid-cols-4
      // forever after (no distinct lg value), so md and lg both carry 4.
      const { container } = render(
        <StatStrip count={4} columns={4} mdColumns={4}>
          {chips(4)}
        </StatStrip>,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toContain('sm:grid-cols-2');
      expect(root.className).toContain('md:grid-cols-4');
      expect(root.className).toContain('lg:grid-cols-4');
    });

    it('rail branch: xlColumns adds an xl:grid-cols-N tier and suppresses the default lg tier', () => {
      render(
        <StatStrip count={6} columns={6} xlColumns={6} ariaLabel="xl override">
          {chips(6)}
        </StatStrip>,
      );
      const list = screen.getByRole('list', { name: 'xl override' });
      expect(list.className).toContain('sm:grid-cols-2');
      expect(list.className).toContain('xl:grid-cols-6');
      expect(list.className).not.toContain('lg:grid-cols-6');
    });

    it('rail branch: mdColumns + xlColumns together reproduce admin/page.tsx\'s original md:grid-cols-3 xl:grid-cols-6 recipe with no lg tier at all', () => {
      // admin/page.tsx's restored recipe: grid-cols-2 → md:grid-cols-3 →
      // xl:grid-cols-6, with NO lg override — the 1024-1279px range must
      // keep the md value (3), not jump to 6 early.
      render(
        <StatStrip count={6} columns={6} mdColumns={3} xlColumns={6} ariaLabel="admin overview">
          {chips(6)}
        </StatStrip>,
      );
      const list = screen.getByRole('list', { name: 'admin overview' });
      expect(list.className).toContain('sm:grid-cols-2');
      expect(list.className).toContain('md:grid-cols-3');
      expect(list.className).toContain('xl:grid-cols-6');
      expect(list.className).not.toContain('lg:grid-cols-6');
      expect(list.className).not.toContain('lg:grid-cols-3');
    });

    it('mdColumns/xlColumns are omitted entirely when not passed — default callers are byte-for-byte unaffected', () => {
      render(
        <StatStrip count={6} columns={6} ariaLabel="default">
          {chips(6)}
        </StatStrip>,
      );
      const list = screen.getByRole('list', { name: 'default' });
      expect(list.className).toContain('lg:grid-cols-6');
      expect(list.className).not.toContain('md:grid-cols');
      expect(list.className).not.toContain('xl:grid-cols');
    });
  });
});

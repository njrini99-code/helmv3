/**
 * @vitest-environment jsdom
 *
 * CH-1613, the sidebar's gliding plate. On a desktop page load the current row's own plate faded out over the quick
 * beat while the gliding plate faded in over it, so both stood half there and the current row read dim (found on the
 * ivory thread's branch, 15 Nov, and on main). The first placement now swaps the two in one frame with no transition,
 * and the transitions come back a frame later for the row changes that follow.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import postcss from 'postcss';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavPlate } from '../NavPlate';

let frames: FrameRequestCallback[] = [];
const nextFrame = () => {
  const run = frames;
  frames = [];
  for (const cb of run) cb(performance.now());
};

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Nav() {
  return (
    <nav className="ch-nav" data-testid="nav">
      <NavPlate />
      <a className="ch-navitem" href="/golf/dashboard" aria-current="page">
        Home
      </a>
      <a className="ch-navitem" href="/golf/dashboard/rounds">
        Rounds
      </a>
    </nav>
  );
}

describe('the nav plate takes over in one frame', () => {
  it('places the plate with the transitions held off, and lets them back a frame after the swap paints', () => {
    const { getByTestId } = render(<Nav />);
    const nav = getByTestId('nav');
    const plate = nav.querySelector<HTMLElement>('.ch-nav__plate')!;
    expect(nav.classList.contains('ch-nav--plate')).toBe(true);
    expect(plate.style.opacity).toBe('1');
    expect(nav.hasAttribute('data-ch-plate-first')).toBe(true);
    nextFrame();
    expect(nav.hasAttribute('data-ch-plate-first')).toBe(true);
    nextFrame();
    expect(nav.hasAttribute('data-ch-plate-first')).toBe(false);
  });

  it('leaves nothing behind when the sidebar unmounts mid-swap', () => {
    const { getByTestId, unmount } = render(<Nav />);
    const nav = getByTestId('nav');
    unmount();
    expect(nav.hasAttribute('data-ch-plate-first')).toBe(false);
    expect(nav.classList.contains('ch-nav--plate')).toBe(false);
  });

  it('holds every transition the swap could start: the plate, the rows and their icons', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
    const held = new Set<string>();
    postcss.parse(css).walkRules((rule) => {
      if (!rule.selector.includes('[data-ch-plate-first]')) return;
      if (!rule.nodes.some((n) => n.type === 'decl' && n.prop === 'transition' && n.value === 'none')) return;
      for (const sel of rule.selectors) held.add(sel.replace(/\s+/g, ' ').trim());
    });
    expect([...held].sort()).toEqual([
      '.ch-nav[data-ch-plate-first] .ch-nav__plate',
      '.ch-nav[data-ch-plate-first] .ch-navitem',
      '.ch-nav[data-ch-plate-first] .ch-navitem svg',
    ]);
  });
});

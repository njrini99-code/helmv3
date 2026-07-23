// @vitest-environment jsdom
/**
 * hazards.tsx tests — flat clean bunker/water/rough glyphs.
 *
 * geometry.test.ts already pins WHERE a hazard is planted (at the shot's
 * real endpoint); this file covers how it's DRAWN: one <defs> block, crisp
 * flat vector glyphs (ellipses, not organic wobble paths), size-driven detail
 * density, and the optional cross-highlight hook for the motion layer.
 */

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Hazards } from './hazards';
import type { PlottedHazard } from './geometry';

function renderInSvg(children: React.ReactNode) {
  return render(
    <svg viewBox="0 0 100 200">
      <g>{children}</g>
    </svg>,
  );
}

const sand: PlottedHazard = { kind: 'sand', x: 40, y: 90, r: 6.5, origin_shot: 2 };
const water: PlottedHazard = { kind: 'water', x: 60, y: 70, r: 7, origin_shot: 3 };
const rough: PlottedHazard = { kind: 'rough', x: 55, y: 120, r: 8, origin_shot: 1 };
const ob: PlottedHazard = { kind: 'ob', x: 50, y: 40, r: 7, origin_shot: 1 };
const unplayable: PlottedHazard = { kind: 'unplayable', x: 45, y: 100, r: 7, origin_shot: 4 };
const penalty: PlottedHazard = { kind: 'penalty', x: 48, y: 60, r: 7, origin_shot: 5 };

describe('Hazards', () => {
  it('renders nothing for an empty hazard list', () => {
    const { container } = renderInSvg(<Hazards hazards={[]} />);
    expect(container.querySelector('g')?.children.length ?? 0).toBe(0);
  });

  it('renders exactly one <defs> block regardless of hazard count', () => {
    const { container } = renderInSvg(<Hazards hazards={[sand, water, rough, { ...sand, origin_shot: 5 }]} />);
    expect(container.querySelectorAll('defs')).toHaveLength(1);
  });

  it('draws a flat clean glyph for a sand hazard — crisp <ellipse> primitives, no organic wobble <path>', () => {
    const { container } = renderInSvg(<Hazards hazards={[sand]} staticRender />);
    const group = container.querySelector('g[style*="transform-origin"]') ?? container.querySelectorAll('g')[1];
    expect(group?.querySelectorAll('ellipse').length).toBeGreaterThan(0);
    expect(group?.querySelectorAll('path').length).toBe(0);
  });

  it('draws a water hazard as a crisp bank + pool ellipse (plus a surface line at standard/rich sizes)', () => {
    const { container } = renderInSvg(<Hazards hazards={[water]} staticRender size="card" />);
    // bank + pool + one surface line = at least 3 ellipses at standard size.
    expect(container.querySelectorAll('ellipse').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('path').length).toBe(0);
  });

  it('draws a rough hazard as a single understated flat patch (no organic tufts, no grass specks)', () => {
    const { container } = renderInSvg(<Hazards hazards={[rough]} staticRender />);
    expect(container.querySelectorAll('ellipse').length).toBe(1);
    expect(container.querySelectorAll('circle').length).toBe(0);
    expect(container.querySelectorAll('path').length).toBe(0);
  });

  it('sheds decorative detail at size="strip" — no surface line on water, no highlight on sand', () => {
    const stripSand = renderInSvg(<Hazards hazards={[sand]} staticRender size="strip" />);
    const richSand = renderInSvg(<Hazards hazards={[sand]} staticRender size="hero" />);
    expect(stripSand.container.querySelectorAll('ellipse').length).toBeLessThan(
      richSand.container.querySelectorAll('ellipse').length,
    );

    const stripWater = renderInSvg(<Hazards hazards={[water]} staticRender size="strip" />);
    const richWater = renderInSvg(<Hazards hazards={[water]} staticRender size="hero" />);
    expect(stripWater.container.querySelectorAll('ellipse').length).toBeLessThan(
      richWater.container.querySelectorAll('ellipse').length,
    );
  });

  it('adds a highlight ring when activeOriginShot matches a hazard, and omits it otherwise', () => {
    const inactive = renderInSvg(<Hazards hazards={[sand]} staticRender activeOriginShot={999} />);
    const active = renderInSvg(<Hazards hazards={[sand]} staticRender activeOriginShot={sand.origin_shot} />);
    // The active state adds one extra stroked outline ellipse on top of the
    // always-present body/highlight ellipses.
    expect(active.container.querySelectorAll('ellipse').length).toBeGreaterThan(
      inactive.container.querySelectorAll('ellipse').length,
    );
  });

  // Two independently useId()'d mounts get different gradient ids by design
  // (18 simultaneous filmstrip instances must never clash on ids) — strip
  // those before comparing so this test isolates the deterministic geometry
  // (ellipse positions/radii/opacities), not the id allocator.
  function normalizeIds(html: string): string {
    return html.replace(/id="[^"]*"/g, 'id="X"').replace(/url\(#[^)]*\)/g, 'url(#X)');
  }

  it('is deterministic across independent mounts for the same hazard list (no Math.random)', () => {
    const a = renderInSvg(<Hazards hazards={[sand, water, rough]} staticRender />);
    const b = renderInSvg(<Hazards hazards={[sand, water, rough]} staticRender />);
    expect(normalizeIds(a.container.innerHTML)).toBe(normalizeIds(b.container.innerHTML));
  });

  it('never fabricates a hazard the geometry did not plant — one <g> child group per hazard entry', () => {
    const { container } = renderInSvg(<Hazards hazards={[sand, water]} staticRender />);
    // Hazards' own root <g> is the parent of its single <defs> block.
    const root = container.querySelector('defs')?.parentElement;
    const hazardGroups = root ? Array.from(root.children).filter((el) => el.tagName.toLowerCase() !== 'defs') : [];
    expect(hazardGroups.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // WAVE B (2026-07-23): ob / unplayable / penalty penalty-type glyphs.
  // These used to fall through to the rough-patch look — pin down that they
  // now get real, honest, SMALL flat type badges instead, never a
  // fabricated big pond/bunker at the penalty's (stylized) drop point.
  // -----------------------------------------------------------------------

  it('draws a small OB boundary-stake glyph for kind "ob" — a post + cap, never a fabricated pond/bunker footprint', () => {
    const { container } = renderInSvg(<Hazards hazards={[ob]} staticRender />);
    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects.length).toBe(2); // post + flat cap
    for (const r of rects) {
      expect(Number(r.getAttribute('width'))).toBeLessThan(3);
      expect(Number(r.getAttribute('height'))).toBeLessThan(5);
    }
    // Neutral/cream, never red (this is a "which kind" badge, not a
    // severity signal) — and never the sand/water/rough fill colors, i.e.
    // it must not still be falling through to another hazard's look.
    expect(container.innerHTML).not.toContain('#d9be7f'); // sand fill
    expect(container.innerHTML).not.toContain('#1f5d80'); // water bank
    expect(container.innerHTML).not.toContain('#2f5a44'); // rough fill
  });

  it('draws a small red circle-slash glyph for kind "unplayable" — distinct from the OB stake and the pennant', () => {
    const { container } = renderInSvg(<Hazards hazards={[unplayable]} staticRender />);
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('line').length).toBe(1);
    expect(container.querySelectorAll('rect').length).toBe(0);
    expect(container.querySelectorAll('polygon').length).toBe(0);
    const circle = container.querySelector('circle');
    expect(Number(circle?.getAttribute('r'))).toBeLessThan(3);
    expect(container.innerHTML).toContain('#f0715c'); // red accent
    expect(container.innerHTML).not.toContain('#2f5a44'); // never the rough patch
  });

  it('draws a small red pennant-on-a-post glyph for the generic "penalty" kind — never the rough patch', () => {
    const { container } = renderInSvg(<Hazards hazards={[penalty]} staticRender />);
    expect(container.querySelectorAll('polygon').length).toBe(1);
    expect(container.querySelectorAll('line').length).toBe(1);
    expect(container.querySelectorAll('ellipse').length).toBe(0);
    const polygon = container.querySelector('polygon');
    const points = polygon?.getAttribute('points') ?? '';
    // Every vertex stays within a few px of the shot's plotted point — a
    // small badge, not a hazard shape sized off a fabricated location.
    for (const pair of points.trim().split(/\s+/)) {
      const [pxRaw, pyRaw] = pair.split(',');
      const px = Number(pxRaw ?? 0);
      const py = Number(pyRaw ?? 0);
      expect(Math.hypot(px - penalty.x, py - penalty.y)).toBeLessThan(10);
    }
    expect(container.innerHTML).not.toContain('#2f5a44');
  });

  it('offsets the penalty-type badge off the hazard point — co-located with, not stacked on, the shot marker', () => {
    const { container } = renderInSvg(<Hazards hazards={[ob]} staticRender />);
    const rect = container.querySelector('rect');
    const cx = Number(rect?.getAttribute('x')) + Number(rect?.getAttribute('width')) / 2;
    expect(Math.abs(cx - ob.x)).toBeGreaterThan(0.5);
  });

  it('adds a highlight ring for penalty-type hazards too when activeOriginShot matches', () => {
    const inactive = renderInSvg(<Hazards hazards={[unplayable]} staticRender activeOriginShot={999} />);
    const active = renderInSvg(
      <Hazards hazards={[unplayable]} staticRender activeOriginShot={unplayable.origin_shot} />,
    );
    expect(active.container.querySelectorAll('circle').length).toBeGreaterThan(
      inactive.container.querySelectorAll('circle').length,
    );
  });

  it('is deterministic across independent mounts for penalty-type hazards (no Math.random)', () => {
    const a = renderInSvg(<Hazards hazards={[ob, unplayable, penalty]} staticRender />);
    const b = renderInSvg(<Hazards hazards={[ob, unplayable, penalty]} staticRender />);
    expect(normalizeIds(a.container.innerHTML)).toBe(normalizeIds(b.container.innerHTML));
  });

  it('renders one glyph group per hazard across a mixed real-lie + penalty-type list, none dropped or doubled', () => {
    const { container } = renderInSvg(
      <Hazards hazards={[sand, water, rough, ob, unplayable, penalty]} staticRender />,
    );
    const root = container.querySelector('defs')?.parentElement;
    const hazardGroups = root ? Array.from(root.children).filter((el) => el.tagName.toLowerCase() !== 'defs') : [];
    expect(hazardGroups.length).toBe(6);
  });
});

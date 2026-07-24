// @vitest-environment jsdom
/**
 * turf.tsx tests — the flat schematic ground layer + yardage ruler +
 * green-inset lens (2026-07-22 "clean schematic" redesign).
 *
 * These render `Turf`/`GreenInsetScenery` directly (not the full
 * `HoleShotPath`), wrapped in a bare <svg> the same way index.tsx nests
 * them, and assert on the CONTRACT this rewrite is required to hold:
 *   - one <defs> block, ZERO <filter> elements (no depth-faking shadows,
 *     no fake grass texture — the #1 rule of the redesign)
 *   - no leftover texture primitives: no <pattern> (grain), no <clipPath>
 *     (used only by the old mow-stripe clip), no repeated mow-band <rect>s
 *   - the ground silhouette is a pure function of fixed constants — two
 *     independent mounts (and every size) paint byte-identical fairway/
 *     green/tee geometry, since there's no per-size wobble/density left
 *   - the yardage ruler is legible-gated (hidden at `strip`, present
 *     elsewhere) and driven purely by the `ticks` prop
 *   - the ruler is UNAMBIGUOUS: a one-time "YDS FROM TEE" caption at the pin
 *     end, a "y" unit suffix on the 50/100/150 (yards-to-pin) emphasis
 *     ticks, and the guaranteed pin-end tick kept (now labeled with the
 *     hole's real total length) rather than filtered out — the 2026-07-23
 *     fix for the "yardage is backwards" confusion, and the 2026-07-24
 *     flip to yards-FROM-THE-TEE labels on top of that same geometry
 *   - `GreenInsetScenery` is a frame around arbitrary `children`, absent
 *     entirely at `strip`, and its nested viewport always uses the
 *     canonical GREEN_INSET_VB (0–100) coordinate space so a caller's
 *     inset dots need no extra transform math
 */

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Turf, GreenInsetScenery } from './turf';
import { plotHole, GREEN_INSET_VB } from './geometry';
import type { ShotInput } from './types';

function renderInSvg(children: React.ReactNode) {
  return render(
    <svg viewBox="0 0 100 200">
      <g>{children}</g>
    </svg>,
  );
}

describe('Turf', () => {
  it('renders exactly one <defs> block (never a gradient/filter per repeated element)', () => {
    const { container } = renderInSvg(<Turf size="hero" />);
    expect(container.querySelectorAll('defs')).toHaveLength(1);
  });

  it('renders ZERO <filter> elements — no depth-faking drop-shadows anywhere in the flat redesign', () => {
    const { container } = renderInSvg(<Turf size="hero" showPinFlag />);
    expect(container.querySelectorAll('filter')).toHaveLength(0);
  });

  it('renders no <pattern> (grain) and no <clipPath> (the old mow-stripe clip) — no leftover texture machinery', () => {
    const { container } = renderInSvg(<Turf size="hero" />);
    expect(container.querySelectorAll('pattern')).toHaveLength(0);
    expect(container.querySelectorAll('clipPath')).toHaveLength(0);
  });

  it('renders exactly three gradients (field, fairway, green) and no more', () => {
    const { container } = renderInSvg(<Turf size="hero" />);
    const gradients = container.querySelectorAll('defs linearGradient, defs radialGradient');
    expect(gradients).toHaveLength(3);
  });

  it('renders no mow-stripe bands — a single flat fairway fill, not a repeated-rect pattern', () => {
    const { container } = renderInSvg(<Turf size="hero" />);
    // The fairway corridor is exactly one filled <path> (plus its top-edge
    // highlight stroke path) — never a clipped stack of alternating rects.
    const fairwayFill = Array.from(container.querySelectorAll('path')).filter(
      (p) => p.getAttribute('fill')?.startsWith('url('),
    );
    expect(fairwayFill).toHaveLength(1);
    expect(container.querySelectorAll('rect[opacity]')).toHaveLength(0);
  });

  it('shows the pin flag by default and hides it when showPinFlag=false', () => {
    const shown = renderInSvg(<Turf size="card" showPinFlag />);
    const hidden = renderInSvg(<Turf size="card" showPinFlag={false} />);
    // The flag triangle is the only fill="#e3543b" element in the scene.
    expect(shown.container.querySelectorAll('[fill="#e3543b"]').length).toBeGreaterThan(0);
    expect(hidden.container.querySelectorAll('[fill="#e3543b"]')).toHaveLength(0);
  });

  it('is deterministic — two independent mounts with identical props paint identical fairway geometry (no Math.random, no wobble)', () => {
    const a = renderInSvg(<Turf size="hero" />);
    const b = renderInSvg(<Turf size="hero" />);
    const dA = a.container.querySelector('path[stroke="rgba(255,255,255,0.06)"]')?.getAttribute('d');
    const dB = b.container.querySelector('path[stroke="rgba(255,255,255,0.06)"]')?.getAttribute('d');
    expect(dA).toBeTruthy();
    expect(dA).toBe(dB);
  });

  it('the corridor geometry no longer varies by size — "review" and "hero" paint the exact same fairway/green shapes (no per-tier density left to diverge)', () => {
    const review = renderInSvg(<Turf size="review" />);
    const hero = renderInSvg(<Turf size="hero" />);
    const fairwayD = (c: HTMLElement) => c.querySelector('path[fill^="url("]')?.getAttribute('d');
    const greenRx = (c: HTMLElement) => c.querySelectorAll('ellipse')[1]?.getAttribute('rx');
    expect(fairwayD(review.container)).toBe(fairwayD(hero.container));
    expect(greenRx(review.container)).toBe(greenRx(hero.container));
  });

  it('draws the green as a crisp ellipse (not an organic blob path) ringed by a concentric fringe ellipse', () => {
    const { container } = renderInSvg(<Turf size="hero" />);
    const ellipses = container.querySelectorAll('ellipse');
    // Fringe ring (stroke-only, no fill) + the filled green ellipse.
    expect(ellipses.length).toBe(2);
    const fringe = ellipses[0]!;
    const green = ellipses[1]!;
    expect(fringe.getAttribute('fill')).toBe('none');
    expect(fringe.getAttribute('stroke')).toBe('#2f6b4f');
    expect(green.getAttribute('fill')).toMatch(/^url\(#/);
    // The fringe ring sits strictly outside the green ellipse.
    expect(Number(fringe.getAttribute('rx'))).toBeGreaterThan(Number(green.getAttribute('rx')));
  });

  it('draws the tee as a single understated rounded rect, no dots/highlight texture', () => {
    const { container } = renderInSvg(<Turf size="hero" />);
    const teeRect = container.querySelector('rect[fill="#6f5a3f"]');
    expect(teeRect).not.toBeNull();
    expect(teeRect?.getAttribute('rx')).toBe('1.4');
  });

  describe('yardage ruler', () => {
    const plot = plotHole({ shots: [], par: 4, yardage: 400 });

    it('renders no tick labels at size="strip" even when ticks are provided (no room for legible marks)', () => {
      const { container } = renderInSvg(<Turf size="strip" ticks={plot.ticks} totalYardage={400} />);
      expect(container.querySelectorAll('text')).toHaveLength(0);
    });

    it('renders the emphasis ticks (350/300/250, "y" suffixed — still keyed to the real distance-to-green markers) plus the total-length anchor (400y) at size="inline"', () => {
      const { container, getByText, queryByText } = renderInSvg(
        <Turf size="inline" ticks={plot.ticks} totalYardage={400} />,
      );
      // geometry.ts's emphasis ticks are still the 50/100/150-yards-TO-PIN
      // markers (unchanged) — under the flip their printed value is
      // `400 - yards`, i.e. 350/300/250.
      expect(getByText('350y')).toBeInTheDocument();
      expect(getByText('300y')).toBeInTheDocument();
      expect(getByText('250y')).toBeInTheDocument();
      // The pin-end tick is the rail's guaranteed anchor (geometry.ts's
      // loop always starts at yards=0) — always kept, even under the
      // emphasis-only filter, and now shows the hole's real total length
      // instead of the old "PIN" text.
      expect(getByText('400y')).toBeInTheDocument();
      expect(queryByText('PIN')).not.toBeInTheDocument();
      expect(queryByText('0')).not.toBeInTheDocument();
      // A non-emphasis tick (e.g. old yards=200, now "200" from tee)
      // should still be suppressed at this size, suffixed or not.
      expect(queryByText('200')).not.toBeInTheDocument();
      expect(queryByText('200y')).not.toBeInTheDocument();
      expect(container.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders every tick at size="review" (quiet, legible, same layout as hero), INCLUDING the total-length anchor and the tee anchor', () => {
      const { container, getByText, queryByText } = renderInSvg(
        <Turf size="review" ticks={plot.ticks} totalYardage={400} />,
      );
      expect(getByText('400y')).toBeInTheDocument(); // pin end = hole's real total length
      expect(getByText('350y')).toBeInTheDocument();
      expect(getByText('300y')).toBeInTheDocument();
      expect(getByText('250y')).toBeInTheDocument();
      // Non-emphasis ticks stay unit-suffix-free (no clutter).
      expect(getByText('200')).toBeInTheDocument();
      expect(getByText('150')).toBeInTheDocument();
      expect(getByText('100')).toBeInTheDocument();
      expect(getByText('50')).toBeInTheDocument();
      // 400 is an exact multiple of the 50y tick step, so the tee itself
      // lands on a real tick (`fromTee === 0`) — labeled "TEE", the same
      // "never a bare 0" idiom the old PIN case used.
      expect(getByText('TEE')).toBeInTheDocument();
      expect(queryByText('0')).not.toBeInTheDocument();
      expect(queryByText('PIN')).not.toBeInTheDocument();
      // RULER_LAYOUT.review mirrors hero's fontSize (3.6) exactly — the
      // total-length anchor is the rail's first (topmost, pin-end) label.
      const anchorLabel = getByText('400y');
      expect(anchorLabel.getAttribute('font-size')).toBe('3.6');
      expect(container.querySelectorAll('text').length).toBeGreaterThan(0);
    });

    it('renders every tick at size="hero", INCLUDING the total-length anchor and the tee anchor, never a bare "0"', () => {
      const { getByText, queryByText } = renderInSvg(<Turf size="hero" ticks={plot.ticks} totalYardage={400} />);
      expect(getByText('400y')).toBeInTheDocument();
      expect(getByText('350y')).toBeInTheDocument();
      expect(getByText('300y')).toBeInTheDocument();
      expect(getByText('250y')).toBeInTheDocument();
      expect(getByText('200')).toBeInTheDocument();
      expect(getByText('TEE')).toBeInTheDocument();
      expect(queryByText('0')).not.toBeInTheDocument();
      expect(queryByText('PIN')).not.toBeInTheDocument();
    });

    it('with a non-round hole yardage (387), the pin-end anchor shows the real total (387y) and no tick is fabricated at the tee — geometry.ts never emits one there', () => {
      const oddPlot = plotHole({ shots: [], par: 4, yardage: 387 });
      const { getByText, queryByText } = renderInSvg(
        <Turf size="hero" ticks={oddPlot.ticks} totalYardage={387} />,
      );
      expect(getByText('387y')).toBeInTheDocument();
      expect(queryByText('TEE')).not.toBeInTheDocument();
      expect(queryByText('0')).not.toBeInTheDocument();
    });

    it('renders a one-time "YDS FROM TEE" caption near the pin end of the guide line, never repeated per tick', () => {
      const { getAllByText, getByText } = renderInSvg(<Turf size="hero" ticks={plot.ticks} totalYardage={400} />);
      const captions = getAllByText('YDS FROM TEE');
      expect(captions).toHaveLength(1);
      // Sits above (smaller y than) the guide line's pin-end start, i.e.
      // closer to the green, not buried among the tick rows.
      const captionY = Number(captions[0]!.getAttribute('y'));
      expect(captionY).toBeLessThan(Number(getByText('400y').getAttribute('y')));
    });

    it('renders no caption and no ruler at all when `ticks` is omitted', () => {
      const { container, queryByText } = renderInSvg(<Turf size="hero" />);
      expect(container.querySelectorAll('text')).toHaveLength(0);
      expect(queryByText('YDS FROM TEE')).not.toBeInTheDocument();
    });

    it('draws a single vertical guide line spanning the full tick range (tick geometry is untouched by the label flip)', () => {
      const { container } = renderInSvg(<Turf size="hero" ticks={plot.ticks} totalYardage={400} />);
      const guideLine = container.querySelector('line[stroke="rgba(244,236,216,0.16)"]');
      expect(guideLine).not.toBeNull();
      expect(guideLine?.getAttribute('y1')).toBe(String(plot.ticks[0]!.y));
      expect(guideLine?.getAttribute('y2')).toBe(String(plot.ticks[plot.ticks.length - 1]!.y));
    });
  });
});

describe('GreenInsetScenery', () => {
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'green', distance_to_hole_after: 22, miss_direction: 'left' },
    { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0 },
  ];
  const plot = plotHole({ shots, par: 4, yardage: 400 });

  it('renders nothing at size="strip" (no room for a legible lens)', () => {
    const { container } = renderInSvg(
      <GreenInsetScenery size="strip" greenInset={plot.greenInset}>
        <circle data-testid="inset-dot" cx="50" cy="50" r="2" />
      </GreenInsetScenery>,
    );
    expect(container.querySelector('[data-testid="inset-dot"]')).not.toBeInTheDocument();
  });

  it('renders a nested <svg> viewport at GREEN_INSET_VB scale for every non-strip size', () => {
    for (const size of ['inline', 'card', 'reviewCard', 'hero'] as const) {
      const { container } = renderInSvg(<GreenInsetScenery size={size} greenInset={plot.greenInset} />);
      const nested = container.querySelector('svg svg');
      expect(nested).not.toBeNull();
      expect(nested?.getAttribute('viewBox')).toBe(`0 0 ${GREEN_INSET_VB.width} ${GREEN_INSET_VB.height}`);
    }
  });

  it('renders the caller-supplied children inside the nested viewport, unmodified', () => {
    const { getByTestId } = renderInSvg(
      <GreenInsetScenery size="hero" greenInset={plot.greenInset}>
        <circle data-testid="inset-dot" cx="50" cy="50" r="2" />
      </GreenInsetScenery>,
    );
    expect(getByTestId('inset-dot')).toBeInTheDocument();
  });

  it('draws a leader line + lens ring anchored at the default pin position (50,14)', () => {
    const { container } = renderInSvg(<GreenInsetScenery size="hero" greenInset={plot.greenInset} />);
    const lensRing = container.querySelector('circle[cx="50"][cy="14"]');
    expect(lensRing).not.toBeNull();
  });

  it('draws one guide ring per green-inset tick, all centered on the inset pin', () => {
    const { container } = renderInSvg(<GreenInsetScenery size="hero" greenInset={plot.greenInset} />);
    const nested = container.querySelector('svg svg')!;
    const rings = Array.from(nested.querySelectorAll('circle[stroke-dasharray]'));
    expect(rings).toHaveLength(plot.greenInset.ticks.length);
    for (const ring of rings) {
      expect(ring.getAttribute('cx')).toBe(String(plot.greenInset.pin.x));
      expect(ring.getAttribute('cy')).toBe(String(plot.greenInset.pin.y));
    }
  });

  it('is deterministic across independent mounts (no Math.random)', () => {
    // Two independently useId()'d mounts get different gradient/filter ids
    // by design — strip those before comparing so this isolates the actual
    // geometry (path `d` data, ring radii), not the id allocator.
    const normalizeIds = (html: string) =>
      html.replace(/id="[^"]*"/g, 'id="X"').replace(/url\(#[^)]*\)/g, 'url(#X)');
    const a = renderInSvg(<GreenInsetScenery size="hero" greenInset={plot.greenInset} />);
    const b = renderInSvg(<GreenInsetScenery size="hero" greenInset={plot.greenInset} />);
    const nestedA = a.container.querySelector('svg svg');
    const nestedB = b.container.querySelector('svg svg');
    expect(normalizeIds(nestedA?.innerHTML ?? '')).toBe(normalizeIds(nestedB?.innerHTML ?? ''));
  });
});

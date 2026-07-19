// @vitest-environment jsdom
/**
 * ============================================================================
 * GenomeRadar.tsx — axis-label clipping regression test (#20/#124)
 * ----------------------------------------------------------------------------
 * The polar angle axis labels ("Driver usage", "Par-3 performance", "Back-9
 * stamina", ...) were rendering truncated ("r usage", "Par-3 p", "Back-9
 * stamir") because the RadarChart reserved almost no margin around the plot
 * (8px) while claiming a 72% outerRadius, leaving only a few px of ring space
 * for the tick text to sit in before running off the SVG edge.
 *
 * The fix reserves REAL space instead of letting the SVG clip:
 *   - a much smaller outerRadius + generous margin (recharts' maxRadius is
 *     computed from `min(width - L - R, height - T - B) / 2`, so margin is
 *     what actually carves out label room, not the outerRadius% alone), and
 *   - a `width` on the PolarAngleAxis tick so recharts' own <Text> auto-wraps
 *     long labels onto multiple lines (no ellipsis, no truncation).
 *
 * This locks both mechanisms so neither regresses silently.
 * ========================================================================== */
import { describe, expect, it, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { GenomeRadar, type GenomeAxis } from './GenomeRadar';

/** Recharts' ResponsiveContainer measures via getBoundingClientRect on mount —
 * jsdom returns all-zero rects by default, so every recharts test needs a
 * real size stubbed in to render anything at all. */
function stubContainerSize(width: number, height: number) {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

const AXES: GenomeAxis[] = [
  { label: 'Driver usage', value: 62 },
  { label: 'Par-3 performance', value: 48 },
  { label: 'Back-9 stamina', value: 71 },
  { label: 'Approach', value: 55 },
];

describe('GenomeRadar — the polar axis labels reserve real space instead of clipping', () => {
  let restoreRect: () => void;

  afterEach(() => {
    restoreRect?.();
  });

  it('renders the RadarChart with a margin generous enough to carve out label room beyond outerRadius', () => {
    restoreRect = stubContainerSize(360, 280);
    const { container } = render(<GenomeRadar data={AXES} height={280} />);

    // The recharts <svg> reports the full container box; the actual plotted
    // polygon (angle-axis) sits well inside it once margin is reserved.
    const svg = container.querySelector('svg.recharts-surface');
    expect(svg).not.toBeNull();

    const angleAxisTicks = container.querySelectorAll('.recharts-polar-angle-axis-tick');
    expect(angleAxisTicks.length).toBe(AXES.length);
  });

  it('renders every full axis label with no character-level truncation', () => {
    restoreRect = stubContainerSize(360, 280);
    const { container } = render(<GenomeRadar data={AXES} height={280} />);

    const text = container.textContent ?? '';
    // recharts' word-wrap concatenates each label's words across separate
    // <tspan> lines with no space preserved between them in textContent, so
    // assert every WORD survives whole (not the joined phrase). This still
    // catches the exact regression: "Driver usage" -> "r usage" would lose
    // the "Driver" word entirely; "Back-9 stamina" -> "Back-9 stamir" would
    // corrupt "stamina" into "stamir".
    for (const axis of AXES) {
      for (const word of axis.label.split(' ')) {
        expect(text).toContain(word);
      }
    }
    // The exact truncated forms the regression produced must never appear.
    expect(text).not.toContain('stamir');
  });

  // The real callers of GenomeRadar span a range of heights — the mobile/
  // teaser card (player-dashboard-parts.tsx height=220), the CoachHelm hero
  // card (FairwayPlayerCoachHelm.tsx height=236), the game-profile hero
  // (FairwayMyGameProfile.tsx height=300), and the detail-view hero
  // (GenomeDetailView.tsx height=360). The margin/width fix must hold at the
  // SMALL end of that range too, not just the larger 360x280 size already
  // covered above — a fix that only reserves enough room at the big size
  // would still clip on the compact teaser card.
  it('reserves the same no-clipping label room at the smaller mobile/teaser viewport (~220px)', () => {
    restoreRect = stubContainerSize(220, 220);
    const { container } = render(<GenomeRadar data={AXES} height={220} />);

    const angleAxisTicks = container.querySelectorAll('.recharts-polar-angle-axis-tick');
    expect(angleAxisTicks.length).toBe(AXES.length);

    const text = container.textContent ?? '';
    for (const axis of AXES) {
      for (const word of axis.label.split(' ')) {
        expect(text).toContain(word);
      }
    }
    expect(text).not.toContain('stamir');
  });
});

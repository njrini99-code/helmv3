// @vitest-environment jsdom
/**
 * PuttingZoom tests — the round-review "putting green" side panel.
 *
 * Covers:
 *   - honest empty state (no green-inset-eligible shot → renders nothing,
 *     never an empty floating panel)
 *   - numbered putt dots render, hover/focus tooltip shows the honest
 *     "distance from pin" (never the entry shot's own multi-hundred-foot
 *     shot length mislabeled as a putt distance — the "477 ft" trap)
 *   - reduced motion still renders the same data, just without the
 *     one-shot landing-pulse ring
 *   - WAVE C (2026-07-23) rebuild: min-separation leader ticks, the
 *     break/slope READ annotation (distinct from the outcome line),
 *     explicit make/miss/unresolved via `putt_made` (never positional),
 *     per-putt SG + miss_tags in the tooltip
 *   - WAVE C BUGFIX (2026-07-23): the made putt sits exactly on the pin/
 *     flag glyph (entryShift removed — BUG 2), leader ticks end at each
 *     dot's honest `true_radius_units` point (BUG 3), the tooltip SG line
 *     uses cream-readable colors distinct from the dark-canvas neutral
 *     (BUG 4)
 */

import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PuttingZoom } from './PuttingZoom';
import { plotHole, greenEntryLateralRatio } from './geometry';
import type { ShotInput } from './types';

describe('PuttingZoom — empty state', () => {
  it('renders nothing when no shot on this hole qualifies for the green inset', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
      { shot_number: 2, lie_after: 'rough', distance_to_hole_after: 40 },
    ];
    const plot = plotHole({ shots, par: 4 });
    const { container } = render(<PuttingZoom plot={plot} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('PuttingZoom — putt dots + tooltip', () => {
  // A 477-yard approach (1431ft) that reaches the green 24ft from the pin,
  // then two putts (a miss, then the holed putt) — the exact "entry shot
  // with a huge real shot length" shape the founder flagged, now also
  // carrying explicit `putt_made` per putt (the real production shape).
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'green', distance_to_hole_after: 24, shot_distance: 477 },
    { shot_number: 2, lie_after: 'green', distance_to_hole_after: 6, putt_break: 'right_to_left', putt_made: false },
    { shot_number: 3, lie_after: 'green', distance_to_hole_after: 0, putt_made: true },
  ];

  it('renders one focusable dot per inset shot', () => {
    const plot = plotHole({ shots, par: 4 });
    const { container } = render(<PuttingZoom plot={plot} />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    expect(dots).toHaveLength(3);
  });

  it('fills every putt dot with the same golf-ball cream, never lie-green — the lie lives on the ring instead (2026-07-22 "cream markers" redesign)', () => {
    const plot = plotHole({ shots, par: 4 });
    const { container } = render(<PuttingZoom plot={plot} />);
    const dotGroups = container.querySelectorAll('[tabindex="0"]');
    expect(dotGroups).toHaveLength(3);

    for (const group of Array.from(dotGroups)) {
      // Each dot group: [landing-pulse circle, outer-ring circle, filled-
      // dot circle, <text>] — filled dot is the 3rd <circle>.
      const circles = group.querySelectorAll('circle');
      const filledDot = circles[2]!;
      expect(filledDot.getAttribute('fill')).toBe('#fbf3e0');
    }
  });

  it('rings the MADE putt (the holed one, `putt_made: true`) in helm green — never white, never positional (Wave C)', () => {
    const plot = plotHole({ shots, par: 4 });
    const { container } = render(<PuttingZoom plot={plot} />);
    const dotGroups = container.querySelectorAll('[tabindex="0"]');
    const [entry, missedPutt, madePutt] = Array.from(dotGroups);

    // Entry (shot 1, not a putt) keeps its ordinary lie halo.
    expect(entry!.getAttribute('data-putt-outcome')).toBe('entry');
    expect(entry!.querySelectorAll('circle')[1]!.getAttribute('stroke')).toBe('#9fe0b6');

    // The missed putt (shot 2, `putt_made: false`, NOT the last inset shot)
    // is an ordinary miss — same lie-halo ring, no green.
    expect(missedPutt!.getAttribute('data-putt-outcome')).toBe('miss');
    expect(missedPutt!.querySelectorAll('circle')[1]!.getAttribute('stroke')).toBe('#9fe0b6');

    // The made putt (shot 3, `putt_made: true`) rings helm green.
    expect(madePutt!.getAttribute('data-putt-outcome')).toBe('made');
    expect(madePutt!.querySelectorAll('circle')[1]!.getAttribute('stroke')).toBe('#16A34A');
  });

  it('shows the honest "from pin" distance for the entry shot — never its own 477-yard shot length', async () => {
    const plot = plotHole({ shots, par: 4 });
    const { container, findByText, queryByText } = render(<PuttingZoom plot={plot} />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[0]!);
    expect(await findByText(/24 ft from pin/)).toBeInTheDocument();
    expect(queryByText(/477/)).not.toBeInTheDocument();
    expect(queryByText(/1431/)).not.toBeInTheDocument();
  });

  it('shows the putt length (not the "from pin" framing) for an actual putt', async () => {
    const plot = plotHole({ shots, par: 4 });
    const { container, findByText } = render(<PuttingZoom plot={plot} />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[1]!);
    expect(await findByText(/Putt 2/)).toBeInTheDocument();
    expect(await findByText(/R-to-L/)).toBeInTheDocument();
  });

  it('shows "holed" for the final putt, colored helm green (the made styling)', async () => {
    const plot = plotHole({ shots, par: 4 });
    const { container, findByText } = render(<PuttingZoom plot={plot} />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[2]!);
    const holedLine = await findByText(/holed/);
    expect(holedLine).toBeInTheDocument();
    expect((holedLine as HTMLElement).style.color).toBe('var(--fw-color-accent-500)');
  });
});

describe('PuttingZoom — explicit make/miss/unresolved via putt_made (never positional)', () => {
  it('gives the hole\'s LAST logged putt a hollow, dashed "unresolved" ring when putt_made is explicitly false (picked up / conceded — never rendered as an ordinary miss)', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 6, putt_made: false },
      // Never holes out — the hole ends here with putt_made explicitly
      // false on the LAST logged shot (a picked-up/conceded ball).
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 3, putt_made: false },
    ];
    const plot = plotHole({ shots, par: 4 });
    const { container } = render(<PuttingZoom plot={plot} />);
    const dotGroups = container.querySelectorAll('[tabindex="0"]');
    expect(dotGroups).toHaveLength(3);
    const [entry, ordinaryMiss, unresolved] = Array.from(dotGroups);

    expect(entry!.getAttribute('data-putt-outcome')).toBe('entry');
    // An intermediate miss (not the last shot) stays an ORDINARY miss —
    // filled cream dot, solid ring.
    expect(ordinaryMiss!.getAttribute('data-putt-outcome')).toBe('miss');
    const ordinaryFill = ordinaryMiss!.querySelectorAll('circle')[2]!;
    expect(ordinaryFill.getAttribute('fill')).toBe('#fbf3e0');

    // The LAST shot, also `putt_made: false`, is UNRESOLVED — hollow fill,
    // dashed ring — visually distinct from the ordinary miss above.
    expect(unresolved!.getAttribute('data-putt-outcome')).toBe('unresolved');
    const unresolvedFill = unresolved!.querySelectorAll('circle')[2]!;
    expect(unresolvedFill.getAttribute('fill')).toBe('none');
    expect(unresolvedFill.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(unresolved!.getAttribute('aria-label')).toMatch(/not holed out/);
  });

  it('shows "Not holed out" in the tooltip for the unresolved putt', async () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 3, putt_made: false },
    ];
    const plot = plotHole({ shots, par: 4 });
    const { container, findByText } = render(<PuttingZoom plot={plot} />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[1]!);
    expect(await findByText(/Not holed out/)).toBeInTheDocument();
  });

  it('does not mark an ordinary intermediate 3-putt miss as unresolved just because putt_made is false', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 25 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 4, putt_made: false },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 0, putt_made: true },
    ];
    const plot = plotHole({ shots, par: 4 });
    const { container } = render(<PuttingZoom plot={plot} />);
    const dotGroups = container.querySelectorAll('[tabindex="0"]');
    expect(dotGroups[1]!.getAttribute('data-putt-outcome')).toBe('miss');
  });
});

describe('PuttingZoom — BUG 2: made putt co-located with the pin/flag (entryShift removed)', () => {
  it('renders a holed putt dot at exactly the pin/flag glyph coordinates, even when the entry shot landed off the corridor centerline', () => {
    // Entry shot logged with a known lateral miss — the exact fixture shape
    // that used to give `deriveEntryShift` a nonzero offset and visibly
    // float the made dot off the cup.
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20, miss_direction: 'right' },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0, putt_made: true },
    ];
    const plot = plotHole({ shots, par: 4 });
    // Sanity: this fixture really does carry a nonzero entry-lateral ratio
    // — confirms the test isn't accidentally exercising the ratio===0
    // no-op path the old code also handled correctly.
    expect(greenEntryLateralRatio(plot.shots, plot.greenInset)).not.toBe(0);

    // The underlying plotted data itself: the made shot's honest position
    // is exactly the pin (true_radius_units 0 → x/y === pin.x/pin.y).
    const madeShot = plot.greenInset.shots[1]!;
    expect(madeShot.x).toBe(plot.greenInset.pin.x);
    expect(madeShot.y).toBe(plot.greenInset.pin.y);

    const { container } = render(<PuttingZoom plot={plot} />);
    const dotGroups = container.querySelectorAll('[tabindex="0"]');
    const madeGroup = dotGroups[1]!;
    expect(madeGroup.getAttribute('data-putt-outcome')).toBe('made');
    // Filled dot circle is the 3rd <circle> in the group (see the
    // "cream markers" test above for this same indexing convention).
    const madeFillCircle = madeGroup.querySelectorAll('circle')[2]!;
    expect(Number(madeFillCircle.getAttribute('cx'))).toBe(plot.greenInset.pin.x);
    expect(Number(madeFillCircle.getAttribute('cy'))).toBe(plot.greenInset.pin.y);

    // And the rendered flag/pin base circle itself sits at that exact same
    // point — one coordinate frame, not two stylizations lined up.
    const pinCircle = container.querySelector('circle[fill="#0a1a13"]')!;
    expect(pinCircle.getAttribute('cx')).toBe(madeFillCircle.getAttribute('cx'));
    expect(pinCircle.getAttribute('cy')).toBe(madeFillCircle.getAttribute('cy'));
  });
});

describe('PuttingZoom — min-separation leader ticks', () => {
  it('draws a leader tick for a dot geometry.ts flagged `leader: true` (crowded near the pin), and none for a comfortably-separated ledger', () => {
    // A classic 3-putt crammed inside a few feet of the pin: 25ft lag, a
    // 2ft comebacker, then a tap-in — exactly the "tap-in bug" scenario
    // geometry.ts's min-separation pass exists for.
    const crowded: ShotInput[] = [
      { shot_number: 1, lie_before: 'fairway', lie_after: 'green', distance_to_hole_before: 40, distance_to_hole_after: 25 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 2, putt_made: false },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 1, putt_made: false },
      { shot_number: 4, lie_after: 'green', distance_to_hole_after: 0, putt_made: true },
    ];
    const crowdedPlot = plotHole({ shots: crowded, par: 4, yardage: 400 });
    const { container: crowdedContainer } = render(<PuttingZoom plot={crowdedPlot} />);
    const ticks = crowdedContainer.querySelectorAll('[data-leader-tick="true"]');
    expect(ticks.length).toBeGreaterThan(0);

    const spread: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 30 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 10, putt_made: false },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 0, putt_made: true },
    ];
    const spreadPlot = plotHole({ shots: spread, par: 4, yardage: 400 });
    const { container: spreadContainer } = render(<PuttingZoom plot={spreadPlot} />);
    expect(spreadContainer.querySelectorAll('[data-leader-tick="true"]')).toHaveLength(0);
  });

  it('BUG 3: ends each leader tick exactly at the leadered dot\'s honest true_radius_units point along the pin→dot line, computed from the actual (unshifted) rendered coordinates', () => {
    const crowded: ShotInput[] = [
      { shot_number: 1, lie_before: 'fairway', lie_after: 'green', distance_to_hole_before: 40, distance_to_hole_after: 25 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 2, putt_made: false },
      { shot_number: 3, lie_after: 'green', distance_to_hole_after: 1, putt_made: false },
      { shot_number: 4, lie_after: 'green', distance_to_hole_after: 0, putt_made: true },
    ];
    const plot = plotHole({ shots: crowded, par: 4, yardage: 400 });
    const leadered = plot.greenInset.shots.filter((s) => s.leader);
    expect(leadered.length).toBeGreaterThan(0);
    // The whole point of the floor: at least one leadered shot's DRAWN
    // radius is pushed measurably past its own honest radius — otherwise
    // this fixture isn't actually exercising the floor this test targets.
    expect(
      leadered.some((s) => Math.hypot(s.x - plot.greenInset.pin.x, s.y - plot.greenInset.pin.y) - s.true_radius_units > 0.5),
    ).toBe(true);

    const { container } = render(<PuttingZoom plot={plot} />);
    const ticks = container.querySelectorAll('[data-leader-tick="true"]');
    expect(ticks).toHaveLength(leadered.length);

    const pin = plot.greenInset.pin;
    for (const shot of leadered) {
      const dx = shot.x - pin.x;
      const dy = shot.y - pin.y;
      const dist = Math.hypot(dx, dy);
      const expectedEnd = { x: pin.x + (dx / dist) * shot.true_radius_units, y: pin.y + (dy / dist) * shot.true_radius_units };

      const match = Array.from(ticks).find(
        (t) =>
          Math.abs(Number(t.getAttribute('x1')) - shot.x) < 0.01 &&
          Math.abs(Number(t.getAttribute('y1')) - shot.y) < 0.01,
      );
      expect(match).toBeDefined();
      expect(Number(match!.getAttribute('x2'))).toBeCloseTo(expectedEnd.x, 5);
      expect(Number(match!.getAttribute('y2'))).toBeCloseTo(expectedEnd.y, 5);
    }
  });
});

describe('PuttingZoom — break/slope READ annotation (distinct from the outcome line)', () => {
  function twoPutts(putt_break?: ShotInput['putt_break'], putt_slope?: ShotInput['putt_slope']): ShotInput[] {
    return [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0, putt_break, putt_slope, putt_made: true },
    ];
  }

  it('suppresses the annotation entirely for a straight, level putt (nothing to draw)', () => {
    const plot = plotHole({ shots: twoPutts('straight', 'level'), par: 4 });
    const { container } = render(<PuttingZoom plot={plot} />);
    expect(container.querySelectorAll('[data-putt-read]')).toHaveLength(0);
  });

  it('draws a break glyph for left_to_right / right_to_left, oriented per direction', () => {
    const ltr = plotHole({ shots: twoPutts('left_to_right', 'level'), par: 4 });
    const { container: ltrContainer } = render(<PuttingZoom plot={ltr} />);
    const ltrGlyph = ltrContainer.querySelector('[data-putt-read="break"]');
    expect(ltrGlyph).not.toBeNull();
    expect(ltrGlyph!.getAttribute('data-putt-read-direction')).toBe('left_to_right');

    const rtl = plotHole({ shots: twoPutts('right_to_left', 'level'), par: 4 });
    const { container: rtlContainer } = render(<PuttingZoom plot={rtl} />);
    const rtlGlyph = rtlContainer.querySelector('[data-putt-read="break"]');
    expect(rtlGlyph).not.toBeNull();
    expect(rtlGlyph!.getAttribute('data-putt-read-direction')).toBe('right_to_left');

    // Never bends the solid outcome line itself — the read is an ADDITIVE
    // sibling mark, not a modification of the segment path.
    expect(ltrGlyph!.tagName.toLowerCase()).toBe('path');
  });

  it('renders a direction-agnostic S-curve for a "multiple" break — never fakes a single direction', () => {
    const plot = plotHole({ shots: twoPutts('multiple', 'level'), par: 4 });
    const { container } = render(<PuttingZoom plot={plot} />);
    expect(container.querySelectorAll('[data-putt-read="multiple"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-putt-read="break"]')).toHaveLength(0);
  });

  it('renders an up-tick for uphill and a down-tick for downhill, independent of break', () => {
    const up = plotHole({ shots: twoPutts('straight', 'uphill'), par: 4 });
    const { container: upContainer } = render(<PuttingZoom plot={up} />);
    expect(upContainer.querySelectorAll('[data-putt-read="uphill"]')).toHaveLength(1);

    const down = plotHole({ shots: twoPutts('straight', 'downhill'), par: 4 });
    const { container: downContainer } = render(<PuttingZoom plot={down} />);
    expect(downContainer.querySelectorAll('[data-putt-read="downhill"]')).toHaveLength(1);
  });

  it('renders a bolder/larger glyph for a severe slope paired with a break, and a standalone severe glyph when break is straight', () => {
    const withBreak = plotHole({ shots: twoPutts('right_to_left', 'severe'), par: 4 });
    const { container: withBreakContainer } = render(<PuttingZoom plot={withBreak} />);
    const severeArc = withBreakContainer.querySelector('[data-putt-read="break"]');
    expect(severeArc).not.toBeNull();
    expect(Number(severeArc!.getAttribute('stroke-width'))).toBeGreaterThan(0.6);
    // No standalone severe glyph — the break arc itself carries the emphasis.
    expect(withBreakContainer.querySelectorAll('[data-putt-read="severe"]')).toHaveLength(0);

    const straightSevere = plotHole({ shots: twoPutts('straight', 'severe'), par: 4 });
    const { container: straightContainer } = render(<PuttingZoom plot={straightSevere} />);
    expect(straightContainer.querySelectorAll('[data-putt-read="severe"]')).toHaveLength(1);
  });

  it('defensive-normalizes an unrecognized putt_slope value to "no annotation" rather than guessing', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20 },
      {
        shot_number: 2,
        lie_after: 'green',
        distance_to_hole_after: 0,
        putt_break: 'straight',
        // Deliberately malformed input — `ShotInput.putt_slope` accepts any
        // string precisely because the DB column has no CHECK constraint
        // (unlike `putt_break`); this is the exact shape the module doc's
        // defensive-normalize rule guards against.
        putt_slope: 'sidehill',
        putt_made: true,
      },
    ];
    const plot = plotHole({ shots, par: 4 });
    const { container } = render(<PuttingZoom plot={plot} />);
    expect(container.querySelectorAll('[data-putt-read]')).toHaveLength(0);
  });

  it('never renders a read annotation for the green-entry shot (an approach, not a putt)', () => {
    const shots: ShotInput[] = [
      // Entry shot with (unrealistic, but defensively-guarded) putt_break
      // data — should never render a read glyph regardless.
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20, putt_break: 'left_to_right', putt_slope: 'uphill' },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0, putt_made: true },
    ];
    const plot = plotHole({ shots, par: 4 });
    const { container } = render(<PuttingZoom plot={plot} />);
    expect(container.querySelectorAll('[data-putt-read]')).toHaveLength(0);
  });
});

describe('PuttingZoom — SG-per-putt and miss_tags in the tooltip', () => {
  it('shows a signed, colored, tabular-nums SG line for a putt with sg logged', async () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0, sg: 0.42, putt_made: true },
    ];
    const plot = plotHole({ shots, par: 4 });
    const { container, findByText } = render(<PuttingZoom plot={plot} />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[1]!);
    const sgLine = await findByText(/SG \+0\.42/);
    expect(sgLine).toBeInTheDocument();
    expect(sgLine.className).toContain('tabular-nums');
  });

  // BUG 4 — the tooltip is a LIGHT `surface-lift` HTML card on cream; before
  // this fix its SG line reused a dark-canvas-tuned neutral (near-white
  // cream at 60% opacity) and a light-mint gain color verbatim, both
  // low-contrast/near-invisible there.
  it('BUG 4: colors the tooltip SG line with cream-readable tokens — helm green for gain, the design system dark-muted token for near-zero, never the dark-canvas neutral', async () => {
    const gainShots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0, sg: 0.42, putt_made: true },
    ];
    const gainPlot = plotHole({ shots: gainShots, par: 4 });
    const { container: gainContainer, findByText: findByTextGain } = render(<PuttingZoom plot={gainPlot} />);
    fireEvent.focus(gainContainer.querySelectorAll('[tabindex="0"]')[1]!);
    const gainLine = await findByTextGain(/SG \+0\.42/);
    expect((gainLine as HTMLElement).style.color).toBe('var(--fw-color-accent-500)');

    const nearZeroShots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0, sg: 0.01, putt_made: true },
    ];
    const nearZeroPlot = plotHole({ shots: nearZeroShots, par: 4 });
    const { container: nzContainer, findByText: findByTextNz } = render(<PuttingZoom plot={nearZeroPlot} />);
    fireEvent.focus(nzContainer.querySelectorAll('[tabindex="0"]')[1]!);
    const neutralLine = await findByTextNz(/SG E/);
    expect((neutralLine as HTMLElement).style.color).toBe('var(--fw-color-text-secondary)');
    expect((neutralLine as HTMLElement).style.color).not.toContain('251,243,224');

    const lossShots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 4, sg: -0.55, putt_made: false },
    ];
    const lossPlot = plotHole({ shots: lossShots, par: 4 });
    const { container: lossContainer, findByText: findByTextLoss } = render(<PuttingZoom plot={lossPlot} />);
    fireEvent.focus(lossContainer.querySelectorAll('[tabindex="0"]')[1]!);
    const lossLine = await findByTextLoss(/SG -0\.55/);
    // WAVE D (2026-07-23): loss now uses a DARKER tooltip-only red
    // ('#9B2226') — the old '#f0715c' measured only ~2.1:1 against this
    // tooltip's real background, well under WCAG AA's 4.5:1 floor. The
    // on-canvas SVG penalty red is unchanged by this fix (this assertion is
    // the tooltip text color only).
    expect((lossLine as HTMLElement).style.color).toBe('rgb(155, 34, 38)');
  });

  it('shows "missed short & low" from miss_tags on a missed putt', async () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 4, putt_made: false, miss_tags: ['short', 'low'] },
    ];
    const plot = plotHole({ shots, par: 4 });
    const { container, findByText } = render(<PuttingZoom plot={plot} />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[1]!);
    expect(await findByText(/missed short & low/)).toBeInTheDocument();
  });

  it('never surfaces estimated_break_inches — verified dead data in prod, not rendered regardless of presence', async () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20 },
      {
        shot_number: 2,
        lie_after: 'green',
        distance_to_hole_after: 0,
        putt_made: true,
        estimated_break_inches: 6,
      },
    ];
    const plot = plotHole({ shots, par: 4 });
    const { container, queryByText } = render(<PuttingZoom plot={plot} />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[1]!);
    expect(queryByText(/6"/)).not.toBeInTheDocument();
    expect(queryByText(/inches/)).not.toBeInTheDocument();
  });
});

describe('PuttingZoom — WAVE D: season make% context ("your season") in the putt tooltip', () => {
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20, shot_distance: 300 },
    { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0, putt_made: true },
  ];

  it('shows nothing when no puttMakePct prop is supplied (never fetched / still loading)', async () => {
    const plot = plotHole({ shots, par: 4 });
    const { container, queryByText } = render(<PuttingZoom plot={plot} />);
    fireEvent.focus(container.querySelectorAll('[tabindex="0"]')[1]!);
    expect(queryByText(/Your season/)).not.toBeInTheDocument();
  });

  it('buckets the putt\'s own real feet into the matching band and shows the season make% for it', async () => {
    const twentyFooter: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 20 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0, putt_made: true },
    ];
    const plot = plotHole({ shots: twentyFooter, par: 4, yardage: 400 });
    // Sanity: this fixture's putt really does carry a real logged length
    // (the delta between its own remaining_feet and the entry's, per
    // geometry.ts's `shot_feet` contract) — otherwise this test wouldn't
    // actually exercise the banding at all.
    const puttIndex = plot.greenInset.shots.length - 1;
    expect(plot.greenInset.shots[puttIndex]!.shot_feet).not.toBeNull();

    const puttMakePct = {
      '0_3': 90,
      '3_5': 62,
      '5_10': 45,
      '10_15': 30,
      '15_20': 20,
      '20_plus': 8,
    } as const;
    const { container, findByText } = render(<PuttingZoom plot={plot} puttMakePct={puttMakePct} />);
    fireEvent.focus(container.querySelectorAll('[tabindex="0"]')[1]!);
    expect(await findByText(/Your season: ~\d+% from/)).toBeInTheDocument();
  });

  it('shows an honest "no X ft putts logged yet" line when the matching band has no attempts (null), never a fabricated percentage', async () => {
    const plot = plotHole({ shots, par: 4 });
    const puttMakePct = {
      '0_3': 90,
      '3_5': null,
      '5_10': null,
      '10_15': null,
      '15_20': null,
      '20_plus': null,
    };
    const { container, findByText } = render(<PuttingZoom plot={plot} puttMakePct={puttMakePct} />);
    fireEvent.focus(container.querySelectorAll('[tabindex="0"]')[1]!);
    expect(await findByText(/Your season: no .+ putts logged yet/)).toBeInTheDocument();
  });

  it('never shows the season context line for the green-entry shot (an approach, not a putt)', async () => {
    const plot = plotHole({ shots, par: 4 });
    const puttMakePct = { '0_3': 90, '3_5': 62, '5_10': 45, '10_15': 30, '15_20': 20, '20_plus': 8 };
    const { container, queryByText } = render(<PuttingZoom plot={plot} puttMakePct={puttMakePct} />);
    fireEvent.focus(container.querySelectorAll('[tabindex="0"]')[0]!);
    expect(queryByText(/Your season/)).not.toBeInTheDocument();
  });
});

describe('PuttingZoom — reduced motion', () => {
  it('renders the same dots/tooltip data with the landing-pulse ring skipped', async () => {
    vi.doMock('framer-motion', async (importOriginal) => {
      const actual = await importOriginal<typeof import('framer-motion')>();
      return { ...actual, useReducedMotion: () => true };
    });
    vi.resetModules();
    const { PuttingZoom: ReducedMotionPuttingZoom } = await import('./PuttingZoom');
    const { plotHole: plotHoleReduced } = await import('./geometry');

    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'green', distance_to_hole_after: 10 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0, putt_made: true },
    ];
    const plot = plotHoleReduced({ shots, par: 4 });
    const { container, findByText } = render(<ReducedMotionPuttingZoom plot={plot} />);

    const dots = container.querySelectorAll('[tabindex="0"]');
    expect(dots).toHaveLength(2);
    fireEvent.focus(dots[0]!);
    expect(await findByText(/from pin/)).toBeInTheDocument();

    vi.doUnmock('framer-motion');
    vi.resetModules();
  });
});

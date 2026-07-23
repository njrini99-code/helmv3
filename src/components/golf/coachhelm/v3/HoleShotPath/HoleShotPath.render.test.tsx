// @vitest-environment jsdom
/**
 * HoleShotPath component-render tests — tooltip data depth, hover/touch
 * interaction, and reduced-motion behavior.
 *
 * geometry.test.ts (HoleShotPath.test.ts) pins the pure plotting math; this
 * file covers the RENDERED component: the rich per-shot hover/focus tooltip
 * (shot n of N, club, shot distance, result, lie transition, miss direction,
 * penalty verbatim, putt line, notes), the touch tap-cycle fallback, the
 * strip size's controlled-`active` draw-in, and the reduced-motion guard
 * (zero animation, ball-travel markers skipped entirely).
 */

import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HoleShotPath } from './index';
import type { ShotInput } from './types';

describe('HoleShotPath — tooltip data depth', () => {
  const shots: ShotInput[] = [
    {
      shot_number: 1,
      lie_after: 'fairway',
      distance_to_hole_after: 150,
      distance_to_hole_before: 400,
      club_type: 'driver',
    },
    {
      shot_number: 2,
      lie_after: 'water',
      distance_to_hole_after: 100,
      distance_to_hole_before: 150,
      is_penalty: true,
      penalty_type: 'water',
      notes: 'Pulled left of the tree line.',
      miss_direction: 'left',
    },
    {
      shot_number: 3,
      lie_after: 'green',
      distance_to_hole_after: 10, // feet, on a green lie
      distance_to_hole_before: 100,
      putt_break: 'right_to_left',
      putt_slope: 'uphill',
    },
  ];

  it('shows "Shot n of N", club_type, shot distance, and lie transition on the first shot', async () => {
    const { container, findByText } = render(
      <HoleShotPath hole_number={5} par={4} score={5} shots={shots} size="card" />,
    );
    const dots = container.querySelectorAll('[tabindex="0"]');
    expect(dots).toHaveLength(3);

    fireEvent.focus(dots[0]!);
    expect(await findByText(/Shot 1 of 3/)).toBeInTheDocument();
    expect(await findByText(/Driver/)).toBeInTheDocument();
    // shot_distance isn't logged for shot 1 (only before/after), so the real
    // logged before→after delta (400 − 150 = 250 yd) is what must render —
    // never a fabricated number. Matched with the "yd" unit suffix so this
    // doesn't collide with the corridor yardage ruler's own bare "250" tick
    // label (400y hole, ticks every 50y — the turf scene layer's own text).
    expect(await findByText(/250 yd/)).toBeInTheDocument();
    // Lie transition: shot 1 has no logged lie_before, so it defaults to the
    // tee (the documented "shot 1 comes from the tee" convention).
    expect(await findByText(/Tee.*Fairway/)).toBeInTheDocument();
  });

  it('shows penalty_type (not the generic "penalty"), miss direction, notes, and the fairway → water lie transition on shot 2', async () => {
    const { container, findByText } = render(
      <HoleShotPath hole_number={5} par={4} score={5} shots={shots} size="card" />,
    );
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[1]!);
    expect(await findByText(/penalty: water/)).toBeInTheDocument();
    expect(await findByText(/Pulled left of the tree line/)).toBeInTheDocument();
    expect(await findByText(/missed left/)).toBeInTheDocument();
    expect(await findByText(/Fairway.*Water/)).toBeInTheDocument();
  });

  it('shows the compact putt line ("N ft, R-to-L, uphill") only for the green-lie shot', async () => {
    const { container, findByRole } = render(
      <HoleShotPath hole_number={5} par={4} score={5} shots={shots} size="card" />,
    );
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[2]!);
    // Scoped to the tooltip box specifically — the Wave B near-dot SVG
    // readout (a separate element right beside the marker) ALSO renders a
    // bare "10 ft" for this hovered green-lie shot, so an unscoped
    // `findByText(/10 ft/)` now correctly reports "found multiple
    // elements" (both are real, both are correct — see the near-dot
    // readout describe block below for that element's own coverage).
    const tooltip = await findByRole('tooltip');
    // 10 raw units on a green lie normalize to 10 real feet (feet round-trip
    // exactly through the yards conversion) — the logged value, not a guess.
    expect(tooltip.textContent).toMatch(/10 ft/);
    expect(tooltip.textContent).toMatch(/R-to-L/);
    expect(tooltip.textContent).toMatch(/uphill/);
  });

  it('shows "holed" instead of a to-pin distance when distance_to_hole_after is 0', async () => {
    const holedShots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0 },
    ];
    const { container, findByText } = render(
      <HoleShotPath hole_number={9} par={4} shots={holedShots} size="card" />,
    );
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[1]!);
    expect(await findByText(/holed/)).toBeInTheDocument();
  });

  it('shows "→ Ny to pin" (not "holed") when the shot did not finish the hole', async () => {
    const { container, findByText } = render(
      <HoleShotPath hole_number={5} par={4} shots={shots} size="card" />,
    );
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[0]!);
    expect(await findByText(/150 yd.*to pin/)).toBeInTheDocument();
  });

  it('omits putt_break/slope for a non-green shot even when logged (stale data guard)', async () => {
    const staleShots: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'fairway',
        distance_to_hole_after: 150,
        // Should never happen from real data, but the component must not
        // surface a green-read line for a fairway shot if it does.
        putt_break: 'straight',
      },
    ];
    const { container, findByText, queryByText } = render(
      <HoleShotPath hole_number={2} par={4} shots={staleShots} size="card" />,
    );
    const dot = container.querySelector('[tabindex="0"]')!;
    fireEvent.focus(dot);
    await findByText(/Shot 1/);
    expect(queryByText(/R-to-L/)).not.toBeInTheDocument();
    expect(queryByText(/Straight/)).not.toBeInTheDocument();
  });

  it('suppresses the "No shots logged" empty-state caption at strip size (too narrow to hold it)', () => {
    const { container, queryByText } = render(
      <HoleShotPath hole_number={1} par={4} shots={[]} size="strip" />,
    );
    expect(queryByText(/No shots logged/)).not.toBeInTheDocument();
    // The turf/pin visual still renders as the honest empty state.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('still shows "No shots logged" at card size (room for the caption)', () => {
    const { queryByText } = render(
      <HoleShotPath hole_number={1} par={4} shots={[]} size="card" />,
    );
    expect(queryByText(/No shots logged/)).toBeInTheDocument();
  });
});

describe('HoleShotPath — "review" size (2026-07-22 round-review redesign)', () => {
  // `review` isn't part of `types.ts`'s narrower `HoleShotPathProps['size']`
  // union (a read-only file this redesign deliberately doesn't touch) —
  // index.tsx widens it locally via `SizeKey`. These tests pin that it's
  // fully wired: interactive, header, tooltip, and the bigger/higher-
  // contrast markers all behave exactly like the other rich sizes.
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150, club_type: 'driver' },
    { shot_number: 2, lie_after: 'green', distance_to_hole_after: 10 },
  ];

  it('renders interactive with header, shot numbers, and a working hover tooltip', async () => {
    const { container, findByText } = render(
      <HoleShotPath hole_number={6} par={5} score={7} shots={shots} size="review" />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
    expect(await findByText(/Hole 6/)).toBeInTheDocument();
    const dots = container.querySelectorAll('[tabindex="0"]');
    expect(dots).toHaveLength(2);
    fireEvent.focus(dots[0]!);
    expect(await findByText(/Shot 1 of 2/)).toBeInTheDocument();
  });

  it('does not crowd in the green-inset lens — showGreenZoom is false, same as reviewCard/hero', () => {
    const { container } = render(
      <HoleShotPath hole_number={6} par={5} shots={shots} size="review" />,
    );
    // The lens renders as a nested <svg> inside the main one — none present.
    expect(container.querySelectorAll('svg svg')).toHaveLength(0);
  });

  it('renders a cream fill on every dot (never lie-green) — the non-green dot keeps its full r=3.2 halo-ring treatment (2026-07-22 "cream markers" redesign)', () => {
    const { container } = render(
      <HoleShotPath hole_number={6} par={5} shots={shots} size="review" />,
    );
    const dotGroups = container.querySelectorAll('[tabindex="0"]');
    // shot 2 is on the green (the only inset shot on this hole → the
    // green-ENTRY marker, per Wave C's corridor declutter) — it still
    // renders here, just SIMPLIFIED (see the next test for its own r/ring
    // assertions), so the dot count is unchanged.
    expect(dotGroups).toHaveLength(2);

    const [firstGroup] = Array.from(dotGroups);
    // Each dot group: [landing-pulse circle, outer-ring circle, filled-dot
    // circle, <text>] — outer ring is the 2nd <circle>, filled dot the 3rd.
    const firstCircles = firstGroup!.querySelectorAll('circle');
    const firstRing = firstCircles[1]!;
    const firstFill = firstCircles[2]!;

    // Non-green dot (lie "fairway"): full r 3.2, halo ring = LIE_LINE_COLOR.fairway.
    expect(firstFill.getAttribute('r')).toBe('3.2');
    expect(firstRing.getAttribute('stroke')).toBe('#8fe3ae');
    expect(firstFill.getAttribute('fill')).toBe('#fbf3e0');
    expect(firstFill.getAttribute('stroke')).toBe('#10241c');
    expect(firstFill.getAttribute('stroke-width')).toBe('0.5');
  });

  it('renders the green-ENTRY marker SIMPLIFIED — smaller (r 2.4), its own lie halo (never white/"final"), still cream-filled, and never a number label (Wave C corridor declutter — the full putt detail lives in PuttingZoom instead)', () => {
    const { container } = render(
      <HoleShotPath hole_number={6} par={5} shots={shots} size="review" />,
    );
    const dotGroups = container.querySelectorAll('[tabindex="0"]');
    expect(dotGroups).toHaveLength(2);
    const lastGroup = dotGroups[1]!;
    const lastCircles = lastGroup.querySelectorAll('circle');
    const lastRing = lastCircles[1]!;
    const lastFill = lastCircles[2]!;

    // The entry marker is deliberately SMALL and SUBTLE — never the old
    // "final shot" bigger-size/pure-white-ring treatment (that concept no
    // longer applies to an on-green shot at all; make/miss on the green is
    // now explicit via `putt_made` in PuttingZoom, not a corridor ring
    // color).
    expect(lastFill.getAttribute('r')).toBe('2.4');
    expect(lastRing.getAttribute('stroke')).toBe('#9fe0b6'); // LIE_LINE_COLOR.green — never white
    expect(lastFill.getAttribute('fill')).toBe('#fbf3e0');
    expect(lastFill.getAttribute('stroke')).toBe('#10241c');

    // No number label on the entry marker — that's the "single small
    // marker" the corridor declutter promises, not a full numbered dot.
    const numberLabels = Array.from(lastGroup.querySelectorAll('text')).filter(
      (t) => t.getAttribute('font-size') === '3.4',
    );
    expect(numberLabels).toHaveLength(0);
  });

  it('renders a bold, bigger shot-number label (fontSize 3.4, weight 700, dark fill) on the non-green shot — the green-entry marker never gets one (Wave C corridor declutter)', () => {
    const { container } = render(
      <HoleShotPath hole_number={6} par={5} shots={shots} size="review" />,
    );
    const labels = container.querySelectorAll('text');
    // Filter to the shot-number labels specifically (font-size 3.4) — the
    // scene may also render other <text> (none here, no ticks passed).
    const numberLabels = Array.from(labels).filter((t) => t.getAttribute('font-size') === '3.4');
    expect(numberLabels.length).toBe(1);
    for (const label of numberLabels) {
      expect(label.getAttribute('font-weight')).toBe('700');
      expect(label.getAttribute('fill')).toBe('#10241c');
    }
  });

  it('renders base segment lines cased in one consistent warm cream at strokeWidth 2.4 (up from 1.9) — the lie no longer colors the line', () => {
    const { container } = render(
      <HoleShotPath hole_number={6} par={5} shots={shots} size="review" />,
    );
    const segmentPaths = Array.from(container.querySelectorAll('svg > g > path')).filter(
      (p) => p.getAttribute('fill') === 'none' && p.hasAttribute('stroke-linecap'),
    );
    expect(segmentPaths.length).toBeGreaterThan(0);
    for (const p of segmentPaths) {
      expect(p.getAttribute('stroke-width')).toBe('2.4');
      expect(p.getAttribute('stroke')).toBe('#fbf3e0');
    }
  });

  it('cases every segment line with a permanent dark drop-shadow (transit-map style) so it separates from the fairway', () => {
    const { container } = render(
      <HoleShotPath hole_number={6} par={5} shots={shots} size="review" />,
    );
    const segmentPaths = Array.from(container.querySelectorAll('svg > g > path')).filter(
      (p) => p.getAttribute('fill') === 'none' && p.hasAttribute('stroke-linecap'),
    );
    expect(segmentPaths.length).toBeGreaterThan(0);
    for (const p of segmentPaths) {
      expect((p as HTMLElement).style.filter).toContain('drop-shadow');
    }
  });
});

// UPDATED 2026-07-23 (geometry honesty fix, Wave A): a penalty shot's Y
// position + shot_distance/shot_yards were previously fabricated (real
// production shape is distance_to_hole_after === distance_to_hole_before,
// shot_distance = 0), so plotHole drew a ~zero-length "flight" segment for
// it. That's now representationally fixed at the geometry layer: penalty
// shots emit NO segment at all (`plot.segments` is shorter than
// `plot.shots`) — a symbolic marker, not a fabricated dashed-red flight
// line. `plot.segments.length` (which `index.tsx` renders 1:1) shrinks
// accordingly; this describe block was rewritten because that's a type/
// contract change forcing an update here, not a redesign of index.tsx
// itself (untouched — see HoleShotPath/ ownership split).
describe('HoleShotPath — penalty shots emit NO flight segment (2026-07-23 geometry honesty fix)', () => {
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
    {
      shot_number: 2,
      lie_after: 'water',
      distance_to_hole_before: 150,
      distance_to_hole_after: 150, // real production shape: after === before
      shot_distance: 0,
      is_penalty: true,
      penalty_type: 'water',
    },
  ];

  it('renders exactly ONE segment (shot 1s) — no fabricated flight line for the penalty (interactive "review" size)', () => {
    const { container } = render(
      <HoleShotPath hole_number={7} par={4} shots={shots} size="review" />,
    );
    const segmentPaths = Array.from(container.querySelectorAll('svg > g > path')).filter(
      (p) => p.getAttribute('fill') === 'none' && p.hasAttribute('stroke-linecap'),
    );
    expect(segmentPaths).toHaveLength(1);
    expect(segmentPaths[0]!.getAttribute('stroke')).toBe('#fbf3e0');
    // Never the old danger-red penalty-segment accent — there's no segment
    // to color, since none is drawn.
    expect(segmentPaths.some((p) => p.getAttribute('stroke') === '#f0715c')).toBe(false);
  });

  it('renders exactly ONE plain, solid, non-dashed segment on size="strip" — the penaltys ~zero-length stub is gone, not just recolored', () => {
    const { container } = render(
      <HoleShotPath hole_number={7} par={4} shots={shots} size="strip" />,
    );
    const segmentPaths = Array.from(container.querySelectorAll('svg > g > path'));
    expect(segmentPaths).toHaveLength(1);
    expect(segmentPaths[0]!.getAttribute('stroke')).toBe('#fbf3e0');
    expect(segmentPaths[0]!.hasAttribute('stroke-dasharray')).toBe(false);
  });
});

describe('HoleShotPath — touch tap-cycle', () => {
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
    { shot_number: 2, lie_after: 'green', distance_to_hole_after: 10 },
  ];

  it('a touch tap on the SVG cycles the tooltip to the next shot, ignoring mouse clicks', async () => {
    const { container, findByText, queryByText } = render(
      <HoleShotPath hole_number={3} par={4} shots={shots} size="card" />,
    );
    const svg = container.querySelector('svg')!;

    // A mouse click must NOT trigger the cycle — only touch does.
    fireEvent.pointerUp(svg, { pointerType: 'mouse' });
    expect(queryByText(/Shot 1 of 2/)).not.toBeInTheDocument();

    fireEvent.pointerUp(svg, { pointerType: 'touch' });
    expect(await findByText(/Shot 1 of 2/)).toBeInTheDocument();

    fireEvent.pointerUp(svg, { pointerType: 'touch' });
    expect(await findByText(/Shot 2 of 2/)).toBeInTheDocument();

    // Wraps back around.
    fireEvent.pointerUp(svg, { pointerType: 'touch' });
    expect(await findByText(/Shot 1 of 2/)).toBeInTheDocument();
  });
});

describe('HoleShotPath — strip controlled `active` draw-in', () => {
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
    { shot_number: 2, lie_after: 'green', distance_to_hole_after: 10 },
  ];

  it('renders a plain static path at rest and switches to an animated one once `active` flips true', () => {
    const { container, rerender } = render(
      <HoleShotPath hole_number={4} par={4} shots={shots} size="strip" active={false} />,
    );
    const pathsAtRest = container.querySelectorAll('svg path');
    expect(pathsAtRest.length).toBeGreaterThan(0);
    // At rest: a plain, unanimated <path> for every shot segment — no
    // Framer-managed `pathLength` attribute at all (the cheap default
    // across all 18 filmstrip cells; only the ONE active cell ever pays
    // for an animated node).
    for (const p of Array.from(pathsAtRest)) {
      expect(p.hasAttribute('pathLength')).toBe(false);
    }

    rerender(<HoleShotPath hole_number={4} par={4} shots={shots} size="strip" active />);
    const pathsActive = container.querySelectorAll('svg path');
    // At least one segment is now Framer-managed — `pathLength` is a motion
    // value Framer writes as a real SVG attribute (alongside the
    // stroke-dasharray/dashoffset it derives from it), never present on a
    // plain <path> — confirming the controlled `active` prop actually
    // swapped this cell into its animated draw-in.
    const anyAnimated = Array.from(pathsActive).some((p) => p.hasAttribute('pathLength'));
    expect(anyAnimated).toBe(true);
  });

  it('does not throw when strip is used without wiring `active` at all (bare/uncontrolled usage)', () => {
    const { container } = render(<HoleShotPath hole_number={4} par={4} shots={shots} size="strip" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('HoleShotPath — reduced motion', () => {
  it('renders the tooltip normally but skips the traveling ball-marker motion entirely', async () => {
    vi.doMock('framer-motion', async (importOriginal) => {
      const actual = await importOriginal<typeof import('framer-motion')>();
      return { ...actual, useReducedMotion: () => true };
    });
    vi.resetModules();
    const { HoleShotPath: ReducedMotionHoleShotPath } = await import('./index');

    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150, club_type: 'driver' },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 10 },
    ];
    const { container, findByText } = render(
      <ReducedMotionHoleShotPath hole_number={6} par={4} shots={shots} size="card" />,
    );

    // No traveling-ball markers under reduced motion — real motion, zero.
    expect(container.querySelectorAll('[data-shot-ball]')).toHaveLength(0);

    // The tooltip itself is unaffected — reduced motion changes ANIMATION,
    // never the data shown.
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[0]!);
    expect(await findByText(/Shot 1 of 2/)).toBeInTheDocument();
    expect(await findByText(/Driver/)).toBeInTheDocument();

    vi.doUnmock('framer-motion');
    vi.resetModules();
  });

  it('renders a fully-drawn static strip path with reduced motion even when `active` is true', () => {
    vi.doMock('framer-motion', async (importOriginal) => {
      const actual = await importOriginal<typeof import('framer-motion')>();
      return { ...actual, useReducedMotion: () => true };
    });
    vi.resetModules();
    return import('./index').then(({ HoleShotPath: ReducedMotionHoleShotPath }) => {
      const shots: ShotInput[] = [
        { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150 },
      ];
      const { container } = render(
        <ReducedMotionHoleShotPath hole_number={4} par={4} shots={shots} size="strip" active />,
      );
      const paths = container.querySelectorAll('svg path');
      expect(paths.length).toBeGreaterThan(0);
      // Even with `active`, reduced motion means the segment is the plain,
      // unanimated static path — no Framer-managed `pathLength` attribute.
      for (const p of Array.from(paths)) {
        expect(p.hasAttribute('pathLength')).toBe(false);
      }
      vi.doUnmock('framer-motion');
      vi.resetModules();
    });
  });
});

// -----------------------------------------------------------------------------
// WAVE B — hit/miss shape signal, symbolic penalty marker, per-shot SG
// badge, near-dot distance readout, and the seg.to_index robustness fix.
// -----------------------------------------------------------------------------

describe('HoleShotPath — Wave B hit/miss shape signal', () => {
  it('renders no miss glyph for a GOOD outcome (fairway, no logged miss)', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 250 },
    ];
    const { container } = render(<HoleShotPath hole_number={1} par={4} shots={shots} size="card" />);
    const dot = container.querySelector('[data-shot-outcome]')!;
    expect(dot.getAttribute('data-shot-outcome')).toBe('good');
    expect(container.querySelectorAll('[data-miss-wedge="true"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-miss-burst="true"]')).toHaveLength(0);
  });

  it('renders a directional wedge for a miss with a logged miss_direction', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'rough', distance_to_hole_after: 200, miss_direction: 'right' },
    ];
    const { container } = render(<HoleShotPath hole_number={1} par={4} shots={shots} size="card" />);
    const dot = container.querySelector('[data-shot-outcome]')!;
    expect(dot.getAttribute('data-shot-outcome')).toBe('miss');
    expect(dot.getAttribute('data-miss-direction')).toBe('right');
    expect(container.querySelectorAll('[data-miss-wedge="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-miss-burst="true"]')).toHaveLength(0);
  });

  it('renders a neutral radiating burst (not a wedge) for a miss with NO logged direction', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'sand', distance_to_hole_after: 80 },
    ];
    const { container } = render(<HoleShotPath hole_number={1} par={4} shots={shots} size="card" />);
    const dot = container.querySelector('[data-shot-outcome]')!;
    expect(dot.getAttribute('data-shot-outcome')).toBe('miss');
    expect(container.querySelectorAll('[data-miss-burst="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-miss-wedge="true"]')).toHaveLength(0);
  });

  it('a logged miss_direction wins over a fairway lie — still classified (and drawn) as a miss', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 200, miss_direction: 'left' },
    ];
    const { container } = render(<HoleShotPath hole_number={1} par={4} shots={shots} size="card" />);
    const dot = container.querySelector('[data-shot-outcome]')!;
    expect(dot.getAttribute('data-shot-outcome')).toBe('miss');
    expect(container.querySelectorAll('[data-miss-wedge="true"]')).toHaveLength(1);
  });

  it('a holed shot is always GOOD, even from a rough lie — holed overrides the lie default', () => {
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 250 },
      { shot_number: 2, lie_after: 'rough', distance_to_hole_after: 0 },
    ];
    const { container } = render(<HoleShotPath hole_number={1} par={4} shots={shots} size="card" />);
    const dots = container.querySelectorAll('[data-shot-outcome]');
    expect(dots[1]!.getAttribute('data-shot-outcome')).toBe('good');
    expect(container.querySelectorAll('[data-miss-wedge="true"], [data-miss-burst="true"]')).toHaveLength(0);
  });
});

describe('HoleShotPath — Wave B symbolic penalty marker', () => {
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 300, distance_to_hole_before: 480 },
    {
      shot_number: 2,
      lie_after: 'water',
      distance_to_hole_before: 300,
      distance_to_hole_after: 300, // real production shape: after === before
      shot_distance: 0,
      is_penalty: true,
      penalty_type: 'ob',
      sg: -0.95,
    },
    { shot_number: 3, lie_after: 'fairway', distance_to_hole_after: 120 },
  ];

  it('renders a hexagon "+1" badge for the penalty shot instead of a numbered flight dot', () => {
    const { container } = render(<HoleShotPath hole_number={7} par={4} shots={shots} size="review" />);
    const markers = container.querySelectorAll('[data-penalty-marker="true"]');
    expect(markers).toHaveLength(1);
    expect(markers[0]!.tagName.toLowerCase()).toBe('polygon');
    // Only shots 1 and 3 get a numbered flight-dot label — the penalty's
    // own index never does (no ball ever "landed" for it to number).
    const numberLabels = Array.from(container.querySelectorAll('text')).filter(
      (t) => t.getAttribute('font-size') === '3.4',
    );
    expect(numberLabels).toHaveLength(2);
  });

  it('tooltip reads "penalty: OB" plus "no distance recorded" for the symbolic shot', async () => {
    const { container, findByText } = render(
      <HoleShotPath hole_number={7} par={4} shots={shots} size="review" />,
    );
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[1]!);
    // PENALTY_LABEL['ob'] is 'OB' (uppercase) — see index.tsx's PENALTY_LABEL map.
    expect(await findByText(/penalty: OB/)).toBeInTheDocument();
    expect(await findByText(/no distance recorded/)).toBeInTheDocument();
  });

  it("shows the penalty stroke's own SG chip under the marker at review size", () => {
    const { container } = render(<HoleShotPath hole_number={7} par={4} shots={shots} size="review" />);
    const marker = container.querySelector('[data-penalty-marker="true"]')!;
    const chip = marker.parentElement!.querySelector('[data-sg-badge="true"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe('-0.95');
  });
});

describe('HoleShotPath — Wave B per-shot Strokes Gained badge', () => {
  // Both shots stay OFF the green here (Wave C corridor declutter
  // suppresses the always-on SG badge for every on-green shot except the
  // green-entry marker, which itself never gets one either — see the
  // dedicated test below) so this fixture isolates the badge feature
  // itself from that suppression.
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 300, sg: 0.31 },
    { shot_number: 2, lie_after: 'rough', distance_to_hole_after: 100, sg: -0.42 },
  ];

  it('renders an always-on signed SG badge at "review" size without hovering', () => {
    const { container } = render(<HoleShotPath hole_number={8} par={4} shots={shots} size="review" />);
    const badges = container.querySelectorAll('[data-sg-badge="true"]');
    expect(badges).toHaveLength(2);
    const texts = Array.from(badges).map((b) => b.textContent);
    expect(texts).toContain('+0.31');
    expect(texts).toContain('-0.42');
  });

  it('suppresses the always-on SG badge for an on-green shot in the corridor — its SG is shown in PuttingZoom instead (Wave C corridor declutter)', () => {
    const greenShots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 300, sg: 0.31 },
      { shot_number: 2, lie_after: 'green', distance_to_hole_after: 10, sg: -0.42 },
    ];
    const { container } = render(<HoleShotPath hole_number={8} par={4} shots={greenShots} size="review" />);
    const badges = container.querySelectorAll('[data-sg-badge="true"]');
    // Only shot 1's (non-green) badge survives — shot 2 is the sole
    // green-inset shot on this hole (the entry marker), which never gets a
    // corridor SG badge regardless of size.
    expect(badges).toHaveLength(1);
    expect(badges[0]!.textContent).toBe('+0.31');
  });

  it('does NOT render the always-on badge at "card" size — SG is hover/tooltip-only there', () => {
    const { container } = render(<HoleShotPath hole_number={8} par={4} shots={shots} size="card" />);
    expect(container.querySelectorAll('[data-sg-badge="true"]')).toHaveLength(0);
  });

  it('shows the signed SG line in the hover tooltip at "card" size', async () => {
    const { container, findByText } = render(
      <HoleShotPath hole_number={8} par={4} shots={shots} size="card" />,
    );
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[0]!);
    expect(await findByText(/SG \+0\.31/)).toBeInTheDocument();
  });

  it('shows a muted "E" for a near-zero SG value (never a falsely-precise "+0.00")', () => {
    const nearZeroShots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 300, sg: 0.02 },
    ];
    const { container } = render(
      <HoleShotPath hole_number={8} par={4} shots={nearZeroShots} size="review" />,
    );
    const badge = container.querySelector('[data-sg-badge="true"]');
    expect(badge!.textContent).toBe('E');
  });

  // Wave C BUG 4 — the HTML tooltip is a LIGHT `surface-lift` card on cream,
  // NOT the dark SVG canvas the on-canvas badge above renders on. Before
  // this fix the tooltip reused the canvas's own near-white-cream neutral
  // and light-mint gain colors verbatim, which read as near-invisible /
  // low-contrast on a light card — see PuttingZoom.tsx's matching fix.
  it('colors the tooltip SG gain/loss/neutral lines with cream-readable tokens, distinct from the on-canvas badge colors', async () => {
    const { container, findByText } = render(
      <HoleShotPath hole_number={8} par={4} shots={shots} size="card" />,
    );
    const dots = container.querySelectorAll('[tabindex="0"]');

    fireEvent.focus(dots[0]!);
    const gainLine = await findByText(/SG \+0\.31/);
    expect((gainLine as HTMLElement).style.color).toBe('var(--fw-color-accent-500)');

    fireEvent.focus(dots[1]!);
    const lossLine = await findByText(/SG -0\.42/);
    // WAVE D (2026-07-23): loss now uses a DARKER tooltip-only red
    // ('#9B2226') — the old '#f0715c' measured only ~2.1:1 against this
    // tooltip's real background, well under WCAG AA's 4.5:1 floor. The
    // on-canvas SVG badge/segment red is unchanged by this fix (see
    // `SG_LOST_COLOR`/`sgColor()`, still '#f0715c') — this assertion is the
    // tooltip text color only, matching PuttingZoom.tsx's identical fix.
    expect((lossLine as HTMLElement).style.color).toBe('rgb(155, 34, 38)');

    const nearZeroShots: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 300, sg: 0.02 },
    ];
    const { container: nearZeroContainer, findByText: findByTextNearZero } = render(
      <HoleShotPath hole_number={8} par={4} shots={nearZeroShots} size="card" />,
    );
    fireEvent.focus(nearZeroContainer.querySelectorAll('[tabindex="0"]')[0]!);
    const neutralLine = await findByTextNearZero(/SG E/);
    // Neutral resolves to the design system's dark-muted text-secondary
    // token — never the dark-canvas-tuned cream the on-canvas badge uses.
    expect((neutralLine as HTMLElement).style.color).toBe('var(--fw-color-text-secondary)');
    expect((neutralLine as HTMLElement).style.color).not.toContain('251,243,224');
  });
});

describe('HoleShotPath — Wave B near-dot distance readout + footer disclosure', () => {
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150, distance_to_hole_before: 400 },
    { shot_number: 2, lie_after: 'green', distance_to_hole_after: 0 },
  ];

  it('shows a yardage readout beside the hovered dot only once it is hovered', async () => {
    const { container } = render(<HoleShotPath hole_number={9} par={4} shots={shots} size="review" />);
    expect(container.querySelectorAll('[data-distance-readout="true"]')).toHaveLength(0);
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[0]!);
    const readouts = container.querySelectorAll('[data-distance-readout="true"]');
    expect(readouts).toHaveLength(1);
    expect(readouts[0]!.textContent).toBe('150 yds');
  });

  it('never renders a readout for a holed shot (the tooltip already says "holed")', () => {
    const { container } = render(<HoleShotPath hole_number={9} par={4} shots={shots} size="review" />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[1]!);
    expect(container.querySelectorAll('[data-distance-readout="true"]')).toHaveLength(0);
  });

  it('shows the "distances are player-logged" footer disclosure at rich sizes, omits it at strip', () => {
    const rich = render(<HoleShotPath hole_number={9} par={4} shots={shots} size="review" />);
    expect(rich.queryByText(/player-logged/)).toBeInTheDocument();
    // Unmount before the second render — RTL's bound queries default to
    // `document.body`, so two simultaneously-mounted renders would both see
    // each other's DOM and make this assertion meaningless.
    rich.unmount();
    const strip = render(<HoleShotPath hole_number={9} par={4} shots={shots} size="strip" />);
    expect(strip.queryByText(/player-logged/)).not.toBeInTheDocument();
  });
});

describe('HoleShotPath — Wave B segment robustness (keyed by seg.to_index, never a shot/array index)', () => {
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 300, distance_to_hole_before: 480 },
    {
      shot_number: 2,
      lie_after: 'water',
      distance_to_hole_before: 300,
      distance_to_hole_after: 300,
      shot_distance: 0,
      is_penalty: true,
      penalty_type: 'water',
    },
    { shot_number: 3, lie_after: 'green', distance_to_hole_after: 100, distance_to_hole_before: 300 },
  ];

  function segmentPaths(container: HTMLElement) {
    return Array.from(container.querySelectorAll('svg > g > path')).filter(
      (p) => p.getAttribute('fill') === 'none' && p.hasAttribute('stroke-linecap'),
    );
  }

  it('hovering the shot AFTER a penalty highlights its own segment, not a mismatched one (the old `drawTimings[i]`/`hoveredIndex === i` bug, keyed by segment-array index instead of seg.to_index)', () => {
    const { container } = render(<HoleShotPath hole_number={10} par={4} shots={shots} size="review" />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    expect(dots).toHaveLength(3); // shot1, the penalty marker, shot3

    fireEvent.focus(dots[2]!); // shot 3 — the one AFTER the penalty
    const segs = segmentPaths(container);
    expect(segs).toHaveLength(2); // only shot1's and shot3's segments — the penalty emits none

    expect(segs.filter((p) => p.getAttribute('stroke-width') === '3.4')).toHaveLength(1);
    expect(segs.filter((p) => p.getAttribute('opacity') === '0.45')).toHaveLength(1);
  });

  it('hovering the penalty marker itself dims every segment — it owns none', () => {
    const { container } = render(<HoleShotPath hole_number={10} par={4} shots={shots} size="review" />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    fireEvent.focus(dots[1]!); // the penalty marker
    const segs = segmentPaths(container);
    expect(segs).toHaveLength(2);
    for (const seg of segs) {
      expect(seg.getAttribute('stroke-width')).toBe('2.4');
      expect(seg.getAttribute('opacity')).toBe('0.45');
    }
  });
});

// -----------------------------------------------------------------------------
// WAVE C — corridor declutter: on-green shots (putts) are fully suppressed
// in the corridor except a single simplified green-ENTRY marker. This is
// the fix for the "smear under the flag" — colliding numbered dots and
// garbled SG badges where multiple putts used to render on top of each
// other near the pin. Full putt detail now lives in `PuttingZoom` only.
// -----------------------------------------------------------------------------
describe('HoleShotPath — Wave C corridor declutter (on-green shots move to PuttingZoom)', () => {
  // A realistic multi-putt hole: tee → approach reaches the green (the
  // entry) → three putts, the last one holed.
  const shots: ShotInput[] = [
    { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150, distance_to_hole_before: 400, sg: 0.05 },
    { shot_number: 2, lie_after: 'green', distance_to_hole_after: 24, distance_to_hole_before: 150, sg: 0.12 },
    { shot_number: 3, lie_after: 'green', distance_to_hole_after: 8, sg: -0.31, putt_made: false },
    { shot_number: 4, lie_after: 'green', distance_to_hole_after: 2, sg: -0.28, putt_made: false },
    { shot_number: 5, lie_after: 'green', distance_to_hole_after: 0, sg: 0.42, putt_made: true },
  ];

  it('renders a marker for only the non-green shot and the single green-entry shot — the three putts get NOTHING in the corridor', () => {
    const { container } = render(<HoleShotPath hole_number={11} par={4} shots={shots} size="review" />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    // Shot 1 (fairway) + shot 2 (the green-entry marker) = 2. Shots 3, 4, 5
    // (the actual putts) render no marker/group at all in the corridor.
    expect(dots).toHaveLength(2);
  });

  it('never renders a numbered label, an SG badge, or a hit/miss glyph for any suppressed putt', () => {
    const { container } = render(<HoleShotPath hole_number={11} par={4} shots={shots} size="review" />);
    const numberLabels = Array.from(container.querySelectorAll('text')).filter(
      (t) => t.getAttribute('font-size') === '3.4',
    );
    // Only shot 1 (the sole non-green, non-entry shot) gets a number label.
    expect(numberLabels).toHaveLength(1);
    expect(container.querySelectorAll('[data-sg-badge="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-miss-wedge="true"], [data-miss-burst="true"]')).toHaveLength(0);
  });

  it('the green-entry marker is reachable/hoverable and carries an aria-label saying it reached the green', () => {
    const { container } = render(<HoleShotPath hole_number={11} par={4} shots={shots} size="review" />);
    const dots = container.querySelectorAll('[tabindex="0"]');
    const entryDot = dots[1]!;
    expect(entryDot.getAttribute('aria-label')).toMatch(/Reached the green/);
    fireEvent.focus(entryDot);
    expect(container.querySelector('[role="tooltip"]')).not.toBeNull();
  });

  it('does not suppress a symbolic penalty marker even when it lands inside the green inset — it keeps its hexagon "+1" glyph, never the ball-dot treatment', () => {
    const penaltyOnGreen: ShotInput[] = [
      { shot_number: 1, lie_after: 'fairway', distance_to_hole_after: 150, distance_to_hole_before: 400 },
      {
        shot_number: 2,
        lie_after: 'other',
        distance_to_hole_before: 10,
        distance_to_hole_after: 10, // real production shape: after === before
        shot_distance: 0,
        is_penalty: true,
        penalty_type: 'unplayable',
      },
    ];
    const { container } = render(
      <HoleShotPath hole_number={11} par={4} shots={penaltyOnGreen} size="review" />,
    );
    expect(container.querySelectorAll('[data-penalty-marker="true"]')).toHaveLength(1);
  });
});

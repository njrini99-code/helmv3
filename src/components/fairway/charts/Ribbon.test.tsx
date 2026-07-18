// @vitest-environment jsdom
/**
 * ============================================================================
 * Ribbon.tsx — trend-delta sign-duplication regression test
 * ----------------------------------------------------------------------------
 * The Ribbon's top-right trend delta wraps whatever `valueFormatter` the
 * caller passes (`fmt`) with its own +/- sign. When the caller's formatter is
 * ITSELF signed (e.g. FairwayBrief's `fmtSG` — a Strokes-Gained formatter
 * that always prefixes +/-), the naive `${sign}${fmt(Math.abs(v))}` double-
 * signs: a declining trend rendered "▼ −+0.56" instead of "▼ −0.56" — the
 * screenshotted CoachHelm Brief defect (strokes-vs-par card, 2026-07-10).
 * This locks the fix: strip any leading sign glyph from the formatter's own
 * output before prepending the delta's sign.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Ribbon, type RibbonPoint } from './Ribbon';

/** Mirrors FairwayBrief's fmtSG — a formatter that ALREADY prefixes a sign. */
function signedFormatter(v: number): string {
  return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

const DECLINING: RibbonPoint[] = [
  { x: 'R1', y: 1.2 },
  { x: 'R2', y: 0.64 },
];

const IMPROVING: RibbonPoint[] = [
  { x: 'R1', y: 0.1 },
  { x: 'R2', y: 0.66 },
];

function getDeltaText(): string {
  const delta = document.querySelector('[data-slot="readout-delta"]');
  expect(delta).not.toBeNull();
  return delta!.textContent ?? '';
}

describe('Ribbon — trend delta never double-signs a signed valueFormatter', () => {
  it('declining trend + a signed formatter renders ONE minus, not "−+"', () => {
    render(
      <Ribbon
        title="Yardage map"
        data={DECLINING}
        valueFormatter={signedFormatter}
        seriesName="Strokes vs par"
      />,
    );
    const text = getDeltaText();
    expect(text).toContain('−0.56');
    expect(text).not.toMatch(/[+\-−]{2}/);
  });

  it('improving trend + a signed formatter renders ONE plus, not "+ +"', () => {
    render(
      <Ribbon
        title="Yardage map"
        data={IMPROVING}
        valueFormatter={signedFormatter}
        seriesName="Strokes vs par"
      />,
    );
    const text = getDeltaText();
    expect(text).toContain('+0.56');
    expect(text).not.toMatch(/[+\-−]{2}/);
  });

  it('an UNSIGNED formatter (e.g. v.toFixed(1)) still gets exactly one sign prepended (no regression)', () => {
    render(
      <Ribbon
        title="Score by round"
        data={DECLINING}
        valueFormatter={(v) => v.toFixed(1)}
        seriesName="Score"
      />,
    );
    const text = getDeltaText();
    expect(text).toContain('−0.6');
    expect(text).not.toMatch(/[+\-−]{2}/);
  });
});

/**
 * Bug #915 — the "Score by round" trend delta rendered a falling (improving)
 * score as an amber "▼" decline, because Ribbon never told Readout which
 * raw direction was GOOD for the plotted metric. `goodDirection` fixes this
 * by classifying via the shared `classifyTrend` and passing the resulting
 * verdict through as Readout's `direction` override.
 */
describe('Ribbon — goodDirection (score/lower-is-better trend coloring)', () => {
  function getDeltaDirection(): string | null {
    const delta = document.querySelector('[data-slot="readout-delta"]');
    expect(delta).not.toBeNull();
    return delta!.getAttribute('data-direction');
  }

  it('DEFAULT (goodDirection="up", unchanged): a falling series reads "down" — the old, still-correct behavior for higher-is-better metrics', () => {
    render(<Ribbon title="SG total" data={DECLINING} seriesName="SG" />);
    expect(getDeltaDirection()).toBe('down');
  });

  it('goodDirection="down": the SAME falling series now reads "up" (green) — a lower score is an improvement', () => {
    render(
      <Ribbon
        title="Score by round"
        data={DECLINING}
        valueFormatter={(v) => v.toFixed(1)}
        seriesName="Score"
        goodDirection="down"
      />,
    );
    expect(getDeltaDirection()).toBe('up');
  });

  it('goodDirection="down": a RISING series (a worsening score) reads "down" (amber)', () => {
    render(
      <Ribbon
        title="Score by round"
        data={IMPROVING /* raw values rise 0.1 -> 0.66 */}
        valueFormatter={(v) => v.toFixed(1)}
        seriesName="Score"
        goodDirection="down"
      />,
    );
    expect(getDeltaDirection()).toBe('down');
  });

  it('goodDirection="down": a flat series (within the deadzone) reads "flat" regardless', () => {
    render(
      <Ribbon
        title="Score by round"
        data={[{ x: 'R1', y: 72 }, { x: 'R2', y: 72 }]}
        valueFormatter={(v) => v.toFixed(1)}
        seriesName="Score"
        goodDirection="down"
      />,
    );
    expect(getDeltaDirection()).toBe('flat');
  });
});

/**
 * Regression test for #946 (Team Brief hero, fix 1/5): the panel's shared
 * eyebrow + header + readout bezel row squeezes the eyebrow/header into an
 * overlapping mess when it renders inside a narrow grid column (viewport-
 * width Tailwind breakpoints don't know the panel's actual rendered width).
 * `readoutPlacement="below"` stacks the readout under the eyebrow/header as
 * its own block instead of sharing a row with them — a structural guarantee
 * against the collision, independent of container width.
 */
describe('Ribbon — readoutPlacement (#946 bezel collision fix)', () => {
  const YARDAGE: RibbonPoint[] = [
    { x: '0-25y', y: -0.03 },
    { x: '275-300y', y: -0.52 },
  ];

  it('default ("corner"): the readout renders INSIDE the shared bezel row (unchanged for existing callers)', () => {
    render(<Ribbon title="Yardage map" overline="Last 90 days · team" data={YARDAGE} seriesName="Strokes vs par" />);
    const bezel = document.querySelector('[data-slot="instrument-bezel"]');
    const readout = document.querySelector('[data-slot="readout"]');
    expect(bezel).not.toBeNull();
    expect(readout).not.toBeNull();
    expect(bezel!.contains(readout)).toBe(true);
  });

  it('"below": the readout renders OUTSIDE the bezel row — it can never share a flex row with the eyebrow/header', () => {
    render(
      <Ribbon
        title="Yardage map"
        overline="Last 90 days · team"
        data={YARDAGE}
        seriesName="Strokes vs par"
        readoutPlacement="below"
      />,
    );
    const bezel = document.querySelector('[data-slot="instrument-bezel"]');
    const readout = document.querySelector('[data-slot="readout"]');
    expect(bezel).not.toBeNull();
    expect(readout).not.toBeNull();
    expect(bezel!.contains(readout)).toBe(false);
  });
});

/**
 * Regression test for #946 (Team Brief hero, fix 2/5): the big value and the
 * delta beneath it rendered with no distinguishing label ("−0.52" over an
 * unlabeled "▼−0.55"), reading as two ambiguous near-duplicate numbers.
 * `readoutLabels` resolves from the REAL (finite-filtered) first/last points
 * so the caller can name both truthfully.
 */
describe('Ribbon — readoutLabels (#946 unlabeled delta fix)', () => {
  const YARDAGE: RibbonPoint[] = [
    { x: '0-25y', y: -0.03 },
    { x: '275-300y', y: -0.52 },
  ];

  it('labels the value with the resolved LAST point and the delta with the resolved FIRST point', () => {
    render(
      <Ribbon
        title="Yardage map"
        data={YARDAGE}
        seriesName="Strokes vs par"
        readoutLabels={(first, last) => ({
          value: `Strokes vs par · ${last.x}`,
          delta: `vs ${first.x}`,
        })}
      />,
    );
    const readout = document.querySelector('[data-slot="readout"]');
    expect(readout!.textContent).toContain('Strokes vs par · 275-300y');
    const delta = document.querySelector('[data-slot="readout-delta"]');
    expect(delta!.textContent).toContain('vs 0-25y');
  });

  it('without readoutLabels, the delta has no caption (unchanged default — no regression)', () => {
    render(<Ribbon title="Yardage map" data={YARDAGE} seriesName="Strokes vs par" />);
    const readout = document.querySelector('[data-slot="readout"]');
    expect(readout!.textContent).toContain('Strokes vs par');
    expect(readout!.textContent).not.toContain(' · 275-300y');
  });
});

/**
 * Bug #949 #1 — "Score by round" reportedly drew in ~15% of its canvas with
 * an 11-round series (a large empty plot to the right). The x-scale is
 * INDEX-based (evenly spaced across `points.length`, never dependent on the
 * `x` label values), so this locks BOTH halves of the contract: the traced
 * path's own coordinates span (near) the full plot width regardless of round
 * count, AND the rendered `<svg>` itself is pinned to fill its container via
 * a CSS class (not just the `width="100%"` attribute, which a class always
 * wins over) so nothing upstream can silently constrain it to a sliver.
 */
describe('Ribbon — the trace + its <svg> both fill the full plot width (bug #949 #1)', () => {
  function elevenRounds(): RibbonPoint[] {
    return Array.from({ length: 11 }, (_, i) => ({ x: `R${i + 1}`, y: 70 + i }));
  }

  it('the <svg> is pinned block+full-width via a class, not just the width attribute', () => {
    const { container } = render(
      <Ribbon title="Score by round" data={elevenRounds()} seriesName="Score" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('class')).toContain('w-full');
    expect(svg!.getAttribute('class')).toContain('block');
  });

  it('an 11-point series traces from the left pad to the right pad of the 600-unit viewBox (no squeeze)', () => {
    const { container } = render(
      <Ribbon title="Score by round" data={elevenRounds()} seriesName="Score" />,
    );
    const line = container.querySelector('path[stroke]');
    expect(line).not.toBeNull();
    const d = line!.getAttribute('d') ?? '';
    // First and last x-coordinates in the path — parse the two numbers
    // following the leading "M" and the final "L" command.
    const commands = d.trim().split(/\s+(?=[ML])/);
    const firstX = Number(commands[0]?.replace(/^M\s*/, '').split(' ')[0]);
    const lastX = Number(commands[commands.length - 1]?.replace(/^L\s*/, '').split(' ')[0]);
    // VIEW_W is 600 with an 8px pad each side — the trace must span the vast
    // majority of that (never collapse into ~15% ≈ 90px from the left pad).
    expect(firstX).toBeCloseTo(8, 0);
    expect(lastX).toBeGreaterThan(500);
  });
});

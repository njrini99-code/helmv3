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

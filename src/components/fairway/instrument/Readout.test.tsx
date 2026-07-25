// @vitest-environment jsdom
/**
 * ============================================================================
 * Readout.tsx — the "awaiting" calibration dash must never inherit black
 * ----------------------------------------------------------------------------
 * Bug: the calibrating em-dash ("—", up to 72px bold mono at `size="hero"`)
 * and its label were classed `text-text-tertiary/70` / `text-text-tertiary/80`
 * — a Tailwind slash-opacity modifier applied to a custom color whose value is
 * a bare `var(--fw-color-*)` reference. Tailwind cannot resolve opacity for
 * that shape and silently emits NO CSS for the class at all, so the dash fell
 * through to InstrumentPanel's inherited `text-text-primary` (near-black) —
 * a huge bold dash rendering as a jarring solid black rectangle instead of a
 * dim, honest "calibrating" gauge (audit W2).
 *
 * This locks the fix: both the dash and its label always carry the WORKING
 * `text-text-tertiary` color class (never the broken slash-opacity variant),
 * with a plain `opacity-*` utility (which always compiles, since it isn't
 * tied to a specific color) layered on top for the extra dim.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Readout } from './Readout';

const BROKEN_CLASS_PATTERN = /text-text-tertiary\/\d+/;

describe('Readout — awaiting state never uses a broken slash-opacity class', () => {
  it('the calibrating dash carries the working muted color class, never the broken one', () => {
    const { container } = render(
      <Readout state="awaiting" size="hero" samples={{ have: 0, need: 5 }} awaitingLabel="Calibrating" />,
    );
    const dash = container.querySelector('span[aria-hidden]');
    expect(dash).not.toBeNull();
    const dashWrapper = dash!.parentElement!;
    expect(dashWrapper.className).not.toMatch(BROKEN_CLASS_PATTERN);
    expect(dashWrapper.className).toContain('text-text-tertiary');
    // NOT `opacity-70` any more. The slash-opacity guard above is still the
    // point of this test, but the plain-opacity WORKAROUND was itself dimming
    // an already-calibrated token below 4.5:1 (audit P-26), so the awaiting
    // state now relies on text-text-tertiary alone.
    expect(dashWrapper.className).not.toContain('opacity-');
  });

  it('the awaiting label carries the working muted color class, never the broken one', () => {
    const { getByText } = render(
      <Readout label="Does a 70% call land 70%?" state="awaiting" samples={{ have: 0, need: 5 }} />,
    );
    const label = getByText('Does a 70% call land 70%?');
    expect(label.className).not.toMatch(BROKEN_CLASS_PATTERN);
    expect(label.className).toContain('text-text-tertiary');
    expect(label.className).not.toContain('opacity-');
  });
});

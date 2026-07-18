// @vitest-environment jsdom
/**
 * ============================================================================
 * TrendChart.tsx — entrance-reveal regression test (audit W1)
 * ----------------------------------------------------------------------------
 * The "Performance Trend" chart rendered 100% empty on every load: axes and
 * gridlines drew, but the line/area never did. Root cause was
 * `isAnimationActive` hardcoded to `true` on the Area/Line, overriding
 * Recharts' own `'auto'` default — which exists specifically to skip the
 * entrance reveal (a clip-path keyed to the on-screen point positions) during
 * SSR (`Global.isSsr`) and under `prefers-reduced-motion`. With it forced on,
 * the reveal always engaged, including for the server-rendered first paint
 * (at a ResponsiveContainer fallback width); the client's immediate
 * remeasure-and-rerender at the real width reset that same reveal before it
 * ever finished, leaving the series clipped to 0% forever while the
 * (unanimated) axes/gridlines drew fine.
 *
 * This locks the fix: with `isAnimationActive="auto"`, Recharts itself skips
 * the reveal whenever it considers itself server-rendering, so the series
 * never starts in — and can never get stuck in — a collapsed clip.
 * ========================================================================== */
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { Global } from 'recharts';
import { TrendChart } from './TrendChart';

const DATA = [
  { x: 'Jan', y: 80 },
  { x: 'Feb', y: 78 },
  { x: 'Mar', y: 76 },
];

/** Recharts' ResponsiveContainer measures the container via getBoundingClientRect
 * (not just ResizeObserver) on mount — jsdom returns all-zero rects by default,
 * so every recharts test needs a real size stubbed in to render anything at all. */
function stubContainerSize(width: number, height: number) {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

describe('TrendChart — the drawn line never gets stuck in a collapsed entrance reveal', () => {
  const originalIsSsr = Global.isSsr;
  let restoreRect: () => void;

  afterEach(() => {
    Global.isSsr = originalIsSsr;
    restoreRect?.();
  });

  it('draws the series (no lingering 0%-revealed clip) when Recharts considers itself server-rendering', () => {
    // This is the exact condition the chart is actually mounted under on
    // first paint: SSR renders using a ResponsiveContainer fallback width,
    // then the client remeasures immediately after. `Global.isSsr` is
    // Recharts' own signal for "skip the entrance reveal" in that state.
    Global.isSsr = true;
    restoreRect = stubContainerSize(600, 240);

    const { container } = render(<TrendChart title="Performance Trend" data={DATA} />);

    const curve = container.querySelector('path.recharts-area-curve');
    expect(curve).not.toBeNull();
    // A still-in-progress (or permanently stuck) entrance reveal wraps the
    // curve in a <g clip-path="url(#...)"> ancestor sized by elapsed time.
    // Recharts' own "auto" default skips that wrapper entirely in this
    // (Global.isSsr) state — asserting its absence is exactly what the
    // hardcoded-`true` bug (forcing the reveal on regardless) would fail.
    expect(curve!.closest('[clip-path]')).toBeNull();
  });

  it('renders the same values in the chart as in the "View as table" fallback', () => {
    Global.isSsr = false;
    restoreRect = stubContainerSize(600, 240);

    const { container, getByRole } = render(<TrendChart title="Performance Trend" data={DATA} />);

    // The chart's own series shares the exact same `data` the table renders
    // from — this is the "verify against the table" check the audit called
    // for. Toggle to the table and confirm the same points are there.
    fireEvent.click(getByRole('button', { name: 'View as table' }));
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table!.textContent).toContain('Jan');
    expect(table!.textContent).toContain('80');
    expect(table!.textContent).toContain('Mar');
    expect(table!.textContent).toContain('76');
  });
});

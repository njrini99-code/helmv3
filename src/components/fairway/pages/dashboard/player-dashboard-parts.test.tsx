/**
 * ============================================================================
 * player-dashboard-parts — GenomeFingerprintTeaser radar overflow (audit #170)
 * ----------------------------------------------------------------------------
 * The strokes-gained radar's `PolarAngleAxis` labels (e.g. "Approach") can sit
 * past the recharts `<svg>`'s own box on a narrow card. Every non-root `<svg>`
 * gets `overflow: hidden` from the browser's UA stylesheet by default, so that
 * label clips hard at the SVG edge ("Approach" → "Approac") with nothing in
 * this component's own styling asking for it. jsdom has no layout engine, so
 * this can't assert a literal pixel measurement — it asserts the class-level
 * contract that makes that clip impossible in a real browser: the radar's
 * wrapper overrides every descendant `<svg>` to `overflow: visible`.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { GenomeFingerprintTeaser } from './player-dashboard-parts';
import type { StrokesGainedSnapshot } from '@/app/golf/actions/dashboard-data';

const FULL_SG: StrokesGainedSnapshot = {
  sg_total: 1.2,
  sg_off_tee: 0.4,
  sg_approach: 0.9,
  sg_around_green: -0.2,
  sg_putting: 0.1,
};

describe('GenomeFingerprintTeaser — radar axis labels are never clipped by the SVG box', () => {
  it('wraps the radar in a container that overrides descendant <svg> overflow to visible', () => {
    const { container } = render(<GenomeFingerprintTeaser strokesGained={FULL_SG} />);

    const wrapper = Array.from(container.querySelectorAll<HTMLElement>('div')).find((el) =>
      el.className.includes('[&_svg]:overflow-visible'),
    );
    expect(wrapper).toBeDefined();
  });
});

// @vitest-environment jsdom
/**
 * ============================================================================
 * InsightCard.tsx — `iconTone` valence override (bug #915)
 * ----------------------------------------------------------------------------
 * A mined pattern's icon/accent was previously always derived from
 * `priority` — a severity tier bucketed by |stroke_impact| MAGNITUDE, blind
 * to sign. That let a high-magnitude plays-BETTER pattern land in the 'high'
 * tier (a warning-orange flame, as if it were bad news) while a
 * low-magnitude plays-WORSE pattern landed in 'medium' (a green sparkle, as
 * if it were good news).
 *
 * These tests lock the fix: `iconTone` overrides BOTH the glyph and its
 * wrap color independent of `priority`, so a caller with a genuinely signed
 * metric can make icon+accent agree with "good or bad for the player"
 * instead of "how large is this number".
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { InsightCard } from './InsightCard';

/** The rendered lead icon's wrap <span> — carries the color classes. */
function iconWrapClassName(container: HTMLElement): string {
  const svg = container.querySelector('svg');
  expect(svg).not.toBeNull();
  const wrap = svg!.parentElement;
  expect(wrap).not.toBeNull();
  return wrap!.className;
}

describe('InsightCard — iconTone valence override', () => {
  it('with no iconTone, the icon wrap follows priority (unchanged default behavior)', () => {
    const { container } = render(
      <InsightCard priority="critical" title="Critical signal" />,
    );
    const cls = iconWrapClassName(container);
    expect(cls).toContain('text-fw-danger');
    expect(cls).toContain('bg-fw-danger-bg');
  });

  it('iconTone="positive" renders the success wrap even on a "critical" priority card', () => {
    // Regression lock: a HIGH-magnitude plays-better pattern (severity
    // 'critical') must still read as good news, not an alarm.
    const { container } = render(
      <InsightCard priority="critical" iconTone="positive" title="Plays better under fatigue" />,
    );
    const cls = iconWrapClassName(container);
    expect(cls).toContain('text-fw-success');
    expect(cls).toContain('bg-fw-success-bg');
    expect(cls).not.toContain('bg-fw-danger-bg');
  });

  it('iconTone="negative" renders the warning wrap even on a "medium"/"low" priority card', () => {
    // Regression lock: a LOW-magnitude plays-worse pattern (severity
    // 'medium'/'low') must still read as a leak, not a strength.
    const { container: medium } = render(
      <InsightCard priority="medium" iconTone="negative" title="Small leak" />,
    );
    expect(iconWrapClassName(medium)).toContain('bg-fw-warning-bg');
    expect(iconWrapClassName(medium)).not.toContain('bg-fw-success-bg');

    const { container: low } = render(
      <InsightCard priority="low" iconTone="negative" title="Small leak" />,
    );
    expect(iconWrapClassName(low)).toContain('bg-fw-warning-bg');
  });

  it('iconTone="neutral" renders the neutral wrap regardless of priority', () => {
    const { container } = render(
      <InsightCard priority="high" iconTone="neutral" title="No clear direction" />,
    );
    const cls = iconWrapClassName(container);
    expect(cls).toContain('bg-surface-sunken');
    expect(cls).not.toContain('bg-fw-warning-bg');
  });

  it('two cards with the SAME priority tier but OPPOSITE iconTone render visibly different wraps', () => {
    // The exact reported shape: same magnitude tier, opposite sign.
    const { container: better } = render(
      <InsightCard priority="medium" iconTone="positive" title="Better" />,
    );
    const { container: worse } = render(
      <InsightCard priority="medium" iconTone="negative" title="Worse" />,
    );
    expect(iconWrapClassName(better)).not.toBe(iconWrapClassName(worse));
  });

  it('undefined iconTone is a true no-op — identical to omitting the prop entirely', () => {
    const { container: omitted } = render(<InsightCard priority="low" title="A" />);
    const { container: explicitUndefined } = render(
      <InsightCard priority="low" iconTone={undefined} title="A" />,
    );
    expect(iconWrapClassName(omitted)).toBe(iconWrapClassName(explicitUndefined));
  });
});

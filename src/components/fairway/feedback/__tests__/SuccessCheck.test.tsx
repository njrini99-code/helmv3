import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { successCheckmark } from '@/lib/coachhelm/v3/motion';
import { SuccessCheck } from '../SuccessCheck';

describe('SuccessCheck (MOT-18)', () => {
  it('lands the ring and the check within 260ms', () => {
    const { ring, path } = successCheckmark(false);
    const end = (t: { delay?: number; duration?: number }) => (t.delay ?? 0) + (t.duration ?? 0);
    expect(Math.max(end(ring.transition as never), end(path.transition as never))).toBeLessThanOrEqual(0.26);
  });

  it('is static under reduced motion', () => {
    const { ring, path } = successCheckmark(true);
    expect(ring.initial).toBe(false);
    expect(path.initial).toBe(false);
  });

  it('renders a decorative mark', () => {
    const { container } = render(<SuccessCheck />);
    const svg = container.querySelector('[data-slot="success-check"]')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('path')).not.toBeNull();
  });
});

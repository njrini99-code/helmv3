// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayDashboardSkeleton — the shared pre-role loading shell
 * ----------------------------------------------------------------------------
 * This component is the parent loading boundary for SEVEN routes (golf/
 * loading.tsx and six others, plus both dashboards' own loading.tsx), so a
 * silent regression here is wide-blast-radius. Locks the two contracts that
 * matter most: the loading a11y triad (`role="status"` + `aria-busy` +
 * exactly one `sr-only` announcement) and "shapes only" — no visible text
 * anywhere in the tree besides that one announcement, per the file's own
 * design-system rule (Skeleton primitives ban real copy).
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FairwayDashboardSkeleton } from './FairwayDashboardSkeleton';

describe('FairwayDashboardSkeleton', () => {
  it('carries the loading a11y contract: role=status, aria-busy, one sr-only announcement', () => {
    render(<FairwayDashboardSkeleton />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading dashboard…')).toBeInTheDocument();
  });

  it('renders shapes only: no visible text besides the sr-only announcement', () => {
    const { container } = render(<FairwayDashboardSkeleton />);
    const srOnly = screen.getByText('Loading dashboard…');
    const clone = container.cloneNode(true) as HTMLElement;
    // Remove the sr-only announcement's counterpart in the clone by text match,
    // then assert nothing else contributes visible text.
    const srOnlyInClone = Array.from(clone.querySelectorAll('span')).find(
      (el) => el.textContent === srOnly.textContent,
    );
    srOnlyInClone?.remove();
    expect(clone.textContent?.trim()).toBe('');
  });

  it('renders a substantial number of shimmer blocks (a real composition, not an empty shell)', () => {
    const { container } = render(<FairwayDashboardSkeleton />);
    // Every `Skeleton` block is `aria-hidden="true"`; count them as a coarse
    // guard that the full six-section composition actually mounted.
    const blocks = container.querySelectorAll('[aria-hidden="true"]');
    expect(blocks.length).toBeGreaterThan(30);
  });
});

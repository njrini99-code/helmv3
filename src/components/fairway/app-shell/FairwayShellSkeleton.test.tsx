// =============================================================================
// src/components/fairway/app-shell/FairwayShellSkeleton.test.tsx
//
// fairway-facelift BRIEF.md §2/§3: this silhouette has exactly one caller
// (the golf loading boundary, src/app/golf/loading.tsx) so — unlike
// FairwaySidebar, which is shared with baseball/admin and must default to
// the warm-black recipe — it defaults to `'cream'` directly; `tone="dark"`
// is kept explicit only so the pre-existing warm-black recipe stays pinned
// if a future caller ever needs it.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FairwayShellSkeleton } from './FairwayShellSkeleton';

function getRail(container: HTMLElement): HTMLElement {
  // The desktop rail is the only `aria-hidden` node sized to the 260px rail width.
  const rail = container.querySelector('[aria-hidden].w-\\[260px\\]');
  if (!rail) throw new Error('skeleton rail not found');
  return rail as HTMLElement;
}

describe('FairwayShellSkeleton — tone', () => {
  it('defaults to the cream rail (no prop passed) — its only caller is the golf loading boundary', () => {
    const { container } = render(<FairwayShellSkeleton />);
    const rail = getRail(container);
    expect(rail.className).not.toContain('bg-nav-bg');
    expect(rail.className).not.toContain('on-dark');
    expect(rail.className).toContain('bg-surface-sunken');
  });

  it('tone="cream" (explicit) renders the same surface-sunken rail as the default', () => {
    const { container } = render(<FairwayShellSkeleton tone="cream" />);
    const rail = getRail(container);
    expect(rail.className).not.toContain('bg-nav-bg');
    expect(rail.className).not.toContain('on-dark');
    expect(rail.className).toContain('bg-surface-sunken');
  });

  it('tone="dark" still renders the pre-existing warm-black rail when explicitly requested', () => {
    const { container } = render(<FairwayShellSkeleton tone="dark" />);
    const rail = getRail(container);
    expect(rail.className).toContain('bg-nav-bg');
    expect(rail.className).toContain('on-dark');
    expect(rail.className).not.toContain('bg-surface-sunken');
  });

  it('cream rail keeps the brand wordmark legible (text-text-primary, not nav-text)', () => {
    const { getByText } = render(<FairwayShellSkeleton />);
    const helm = getByText('Helm');
    expect(helm.className).toContain('text-accent-700');
    const wordmark = helm.parentElement;
    expect(wordmark?.className).toContain('text-text-primary');
    expect(wordmark?.className).not.toContain('text-nav-text');
  });
});

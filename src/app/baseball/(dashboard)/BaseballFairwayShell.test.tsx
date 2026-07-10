// =============================================================================
// BaseballFairwayShell.test.tsx
//
// Wave W3 (docs/audits/PRODUCTION_READINESS_MISSION_2026-07-09.md): Settings
// moved OUT of the player rail's secondary "More" nav section and INTO the
// shell's pinned rail FOOTER (ShellFooter), matching the coach shell. This
// locks the new shape: ShellFooter now renders Settings + Sign out
// UNCONDITIONALLY — there is no more per-role gate on the Settings row. The
// player-rail SECTION shape (7 primary + exposureNoun, no Settings) is pinned
// separately by src/lib/baseball/__tests__/nav-player-rail.test.ts, which
// doesn't need to import this 'use client' module.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { ShellFooter } from './BaseballFairwayShell';

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

// next/link's real implementation observes viewport intersection to decide
// whether to prefetch, which needs a constructible IntersectionObserver — the
// repo's global jsdom mock (src/test/setup.tsx) isn't one. Same workaround
// used by other component tests that render <Link> (e.g.
// settings-coaching-intelligence.test.tsx): swap it for a plain <a>.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('ShellFooter', () => {
  it('renders a Settings link pointing at the settings route', () => {
    render(<ShellFooter />);
    const settingsLink = screen.getByRole('link', { name: /settings/i });
    expect(settingsLink).toHaveAttribute('href', '/baseball/dashboard/settings');
  });

  it('renders a Sign out control', () => {
    render(<ShellFooter />);
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  // ShellFooter takes no `role` prop anymore (the Settings row used to be
  // gated `role === 'coach'`) — both roles get the identical footer now, so
  // there is nothing left to vary per-role. This is the regression guard: if
  // a future edit reintroduces a role gate, the render above stops finding
  // the Settings link and this whole suite goes red.
  it('accepts no props', () => {
    expect(ShellFooter.length).toBe(0);
  });
});

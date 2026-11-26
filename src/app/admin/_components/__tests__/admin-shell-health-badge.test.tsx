import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { NavItem } from '@/components/fairway/app-shell/types';

/* eslint-disable helm/no-raw-button -- same Fairway-control test-double
 * pattern as admin-shell-signout.test.tsx: replace the real controls with
 * native elements so this contract can be exercised without mounting the
 * full app shell. */

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/app/golf/actions/team-switcher', () => ({ clearActiveTeam: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } }),
}));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/components/providers/SessionActivityProvider', () => ({
  SessionActivityProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// Unlike admin-shell-signout.test.tsx, this mock actually RENDERS the items
// it's given — that's the only way to assert on the `badge` value
// AdminShell computes for the Health tab.
vi.mock('@/components/fairway/app-shell/FairwayBottomNav', () => ({
  FairwayBottomNav: ({ items }: { items: NavItem[] }) => (
    <nav aria-label="bottom nav test double">
      {items.map((item) => (
        <span key={item.href}>
          {item.label}:{item.badge ?? 'none'}
        </span>
      ))}
    </nav>
  ),
}));
vi.mock('@/components/fairway/app-shell/more-nav', () => ({
  selectOverflow: () => [],
  summarizeMoreTab: () => ({ active: false, badge: undefined }),
}));
vi.mock('@/app/admin/_components/RelativeTime', () => ({
  RelativeTime: () => <span>just now</span>,
}));
vi.mock('@/components/fairway', () => ({
  AppShell: ({ children, sidebarFooter, moreSheetFooter, bottomNav, topBarActions }: {
    children: ReactNode;
    sidebarFooter?: ReactNode;
    moreSheetFooter?: ReactNode;
    bottomNav?: ReactNode;
    topBarActions?: ReactNode;
  }) => (
    <>
      <header>{topBarActions}</header>
      <aside>{sidebarFooter}</aside>
      <section>{moreSheetFooter}</section>
      {bottomNav}
      {children}
    </>
  ),
  Button: ({ children, leftIcon, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { leftIcon?: ReactNode }) => (
    <button {...props}>{leftIcon}{children}</button>
  ),
  IconButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  CommandMenu: () => null,
}));

import { AdminShell } from '@/app/admin/_components/AdminShell';

describe('AdminShell bottom-nav red-feature badge (Product tab)', () => {
  it('renders no badge on Product when there are zero red features (honest-only)', () => {
    render(
      <AdminShell email="admin@helm.test" errorCount={0} healthCount={0}>
        <div>Bridge content</div>
      </AdminShell>,
    );
    expect(screen.getByText('Product:none')).toBeInTheDocument();
  });

  it('renders the red-feature count on Product when > 0', () => {
    render(
      <AdminShell email="admin@helm.test" errorCount={0} healthCount={3}>
        <div>Bridge content</div>
      </AdminShell>,
    );
    expect(screen.getByText('Product:3')).toBeInTheDocument();
  });

  it('renders no badge — never a fake 0 — when the health count is unknown (degraded pipeline)', () => {
    render(
      <AdminShell email="admin@helm.test" errorCount={0} healthCount={null}>
        <div>Bridge content</div>
      </AdminShell>,
    );
    expect(screen.getByText('Product:none')).toBeInTheDocument();
  });

  // The incident badge's third state. `fetchBridgeErrorBadge` returns null
  // when the feed read failed; that used to arrive here as 0 — no badge,
  // exactly what "no incidents" renders — and sit in the layout cache for 60s.
  describe('Incidents badge unknown state', () => {
    it('renders NO numeric badge and a distinct "unreadable" chip when the count is null', () => {
      render(
        <AdminShell email="admin@helm.test" errorCount={null} healthCount={0}>
          <div>Bridge content</div>
        </AdminShell>,
      );
      expect(screen.getByText('Reliability:none')).toBeInTheDocument();
      const chip = screen.getByTestId('bridge-incidents-unreadable');
      expect(chip).toHaveTextContent(/incidents unreadable/i);
      expect(chip).toHaveAttribute('role', 'status');
    });

    it('renders no chip when the count is a real zero — unknown and zero must look different', () => {
      render(
        <AdminShell email="admin@helm.test" errorCount={0} healthCount={0}>
          <div>Bridge content</div>
        </AdminShell>,
      );
      expect(screen.getByText('Reliability:none')).toBeInTheDocument();
      expect(screen.queryByTestId('bridge-incidents-unreadable')).toBeNull();
    });

    it('renders no chip when the count is positive', () => {
      render(
        <AdminShell email="admin@helm.test" errorCount={4} healthCount={0}>
          <div>Bridge content</div>
        </AdminShell>,
      );
      expect(screen.getByText('Reliability:4')).toBeInTheDocument();
      expect(screen.queryByTestId('bridge-incidents-unreadable')).toBeNull();
    });
  });

  it('keeps the Reliability (incidents) and Product (red features) badges independent of each other', () => {
    render(
      <AdminShell email="admin@helm.test" errorCount={5} healthCount={2}>
        <div>Bridge content</div>
      </AdminShell>,
    );
    // The phone's tabs are the spaces (owner, 2026-11-26): open incidents ride on
    // Reliability, red features on Product.
    expect(screen.getByText('Reliability:5')).toBeInTheDocument();
    expect(screen.getByText('Product:2')).toBeInTheDocument();
  });
});

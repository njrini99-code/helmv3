import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/* eslint-disable helm/no-raw-button -- The Fairway controls are intentionally
 * replaced by native-button test doubles so this contract can exercise their
 * click and disabled semantics without mounting the full app shell. */

const mocks = vi.hoisted(() => ({
  clearActiveTeam: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock('@/app/golf/actions/team-switcher', () => ({ clearActiveTeam: mocks.clearActiveTeam }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock('@/components/ui/sonner', () => ({
  toast: { error: mocks.toastError },
}));
vi.mock('@/components/providers/SessionActivityProvider', () => ({
  SessionActivityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/fairway/app-shell/FairwayBottomNav', () => ({ FairwayBottomNav: () => null }));
vi.mock('@/components/fairway/app-shell/more-nav', () => ({
  selectOverflow: () => [],
  summarizeMoreTab: () => ({ active: false, badge: undefined }),
}));
vi.mock('@/app/admin/_components/RelativeTime', () => ({
  RelativeTime: () => <span>just now</span>,
}));
vi.mock('@/components/fairway', () => ({
  AppShell: ({ children, sidebarFooter, moreSheetFooter }: {
    children: React.ReactNode;
    sidebarFooter?: React.ReactNode;
    moreSheetFooter?: React.ReactNode;
  }) => (
    <>
      <aside>{sidebarFooter}</aside>
      <section>{moreSheetFooter}</section>
      {children}
    </>
  ),
  Button: ({ children, leftIcon, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { leftIcon?: React.ReactNode }) => (
    <button {...props}>{leftIcon}{children}</button>
  ),
  IconButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  CommandMenu: () => null,
}));

import { AdminShell } from '@/app/admin/_components/AdminShell';

describe('AdminShell sign out', () => {
  beforeEach(() => {
    mocks.clearActiveTeam.mockReset().mockResolvedValue(undefined);
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.toastError.mockReset();
  });

  it('offers sign out in both shell surfaces and clears shared-session state before redirecting', async () => {
    render(<AdminShell email="admin@helm.test" errorCount={0} healthCount={0}><div>Bridge content</div></AdminShell>);

    const signOutButtons = screen.getAllByRole('button', { name: 'Sign out' });
    expect(signOutButtons).toHaveLength(2);
    fireEvent.click(signOutButtons[0]!);

    await waitFor(() => expect(mocks.clearActiveTeam).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith('/golf/login');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('keeps the sign-out controls retryable and explains a session-revocation failure', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: new Error('network unavailable') });
    render(<AdminShell email="admin@helm.test" errorCount={0} healthCount={0}><div>Bridge content</div></AdminShell>);

    fireEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0]!);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'Could not sign out',
      { description: 'Please try again.' },
    ));
    expect(screen.getAllByRole('button', { name: 'Sign out' })[0]).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

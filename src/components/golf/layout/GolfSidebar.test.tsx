import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GolfSidebar } from './GolfSidebar';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/contexts/sidebar-context', () => ({
  useSidebar: () => ({
    collapsed: false,
    setCollapsed: vi.fn(),
    setMobileOpen: vi.fn(),
  }),
}));

vi.mock('@/contexts/notification-badge-context', () => ({
  useNotificationBadges: () => ({
    messages: 0,
    coachhelm: 0,
  }),
}));

vi.mock('@/lib/redesign/flag', () => ({
  useRedesign: () => false,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn(),
    },
  }),
}));

vi.mock('@/lib/utils/capacitor', () => ({
  triggerHaptic: vi.fn(),
}));

describe('GolfSidebar coach operations navigation', () => {
  it('keeps core coach operations directly reachable from the sidebar', () => {
    render(<GolfSidebar userRole="coach" userName="Coach" teamName="Golf Team" />);

    const expectedLinks = [
      ['Roster', '/golf/dashboard/roster'],
      ['Announcements', '/golf/dashboard/announcements'],
      ['Travel', '/golf/dashboard/travel'],
      ['Documents', '/golf/dashboard/documents'],
      ['Tasks', '/golf/dashboard/tasks'],
    ] as const;

    for (const [name, href] of expectedLinks) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });
});

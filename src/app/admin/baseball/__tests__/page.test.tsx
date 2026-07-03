import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/admin/require-super-admin', () => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1' })),
}));

import BaseballTabPage from '@/app/admin/baseball/page';

/**
 * AppShell (src/components/fairway/app-shell/AppShell.tsx) already renders
 * the page's <main> landmark and supplies its own padding. This page must
 * not nest a second <main> inside it — that duplicates the ARIA landmark
 * and double-pads the content (fixed across every other admin tab in
 * 190364b00; baseball/page.tsx was the one straggler).
 */
describe('AdminBaseballPage', () => {
  it('does not render a nested <main> landmark', async () => {
    const element = await BaseballTabPage();
    render(element);
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.getByText(/baseball tab is held/i)).toBeInTheDocument();
  });
});

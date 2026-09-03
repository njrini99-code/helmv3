import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/admin/require-super-admin', () => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1' })),
}));

vi.mock('@/lib/admin/engineering/work-log', () => ({
  fetchWorkLogProof: vi.fn(async () => ({
    status: 'ok',
    data: {
      rows: [
        {
          number: 42,
          htmlUrl: 'https://github.com/x/y/pull/42',
          title: 'Fix round autosave permission',
          state: 'merged',
          area: 'golf',
          authorLogin: 'nick',
          mergedAt: '2026-09-01T00:00:00Z',
          repairIncidentIds: ['fp-abc'],
          repairVerdict: 'confirmed',
          shippedInRelease: {
            commitSha: 'deadbeef123',
            deployedAt: Date.parse('2026-09-01T01:00:00Z'),
            gatheringSignal: false,
            errorsAfter2h: 0,
            delta: -5,
            verdict: { tone: 'success', label: 'Improved' },
          },
          notYetDeployed: false,
        },
      ],
      repoLabel: 'ricknini/helmv3',
      truncated: false,
      releaseDataAvailable: true,
    },
    fetchedAt: '2026-09-03T00:00:00Z',
  })),
}));

import WorkLogPage from '@/app/admin/work-log/page';

/**
 * `WorkLogProofBody` is an async Server Component nested inside
 * `PanelBoundary`'s `<Suspense>` — under `@testing-library/react`'s client
 * reconciler it stays suspended on first render (the skeleton renders
 * instead of the resolved rows), matching the same shell-only render-test
 * shape `src/app/admin/baseball/__tests__/page.test.tsx` already
 * establishes for a page built the same way. This pins the page shell and
 * that the read model is actually invoked, not the resolved row content.
 */
describe('WorkLogPage', () => {
  it('renders the change-to-proof heading and does not nest a second <main> landmark', async () => {
    const { fetchWorkLogProof } = await import('@/lib/admin/engineering/work-log');
    const element = await WorkLogPage();
    render(element);

    expect(screen.getByRole('heading', { level: 1, name: /change-to-proof work log/i })).toBeInTheDocument();
    expect(screen.getByText(/\/admin\/work/)).toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(fetchWorkLogProof).toHaveBeenCalled();
  });
});

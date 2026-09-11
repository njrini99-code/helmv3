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

import { WorkProofView } from '@/app/admin/work/_components/WorkProofView';

/**
 * `WorkProofView` was `/admin/work-log`'s page body. After the 30→22 fold it is
 * the `?view=proof` framing of `/admin/work`, mounted inside that page's
 * `PanelBoundary` — so this suite now awaits the view directly rather than a
 * route component. Awaiting it also resolves what used to stay suspended under
 * `@testing-library/react`'s client reconciler, so the rows are assertable.
 */
describe('WorkProofView', () => {
  it('reads the proof model and renders its PR rows', async () => {
    const { fetchWorkLogProof } = await import('@/lib/admin/engineering/work-log');
    const element = await WorkProofView();
    render(element);

    expect(fetchWorkLogProof).toHaveBeenCalled();
    // No <h1> of its own any more — the host page owns the masthead, and a
    // second level-1 heading inside a view is exactly the duplication the
    // consolidation removed.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.getByText(/PRs tracked/i)).toBeInTheDocument();
  });
});

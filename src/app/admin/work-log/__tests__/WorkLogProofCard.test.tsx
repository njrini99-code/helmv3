import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkLogProofCard } from '@/app/admin/work-log/WorkLogProofCard';
import type { WorkLogProofRow } from '@/lib/admin/engineering/work-log';

const BASE_ROW: WorkLogProofRow = {
  number: 42,
  htmlUrl: 'https://github.com/x/y/pull/42',
  title: 'Fix round autosave permission',
  state: 'merged',
  area: 'golf',
  authorLogin: 'nick',
  mergedAt: '2026-09-01T00:00:00Z',
  repairIncidentIds: [],
  repairVerdict: 'not-reviewed',
  shippedInRelease: null,
  notYetDeployed: false,
};

describe('WorkLogProofCard — the page-level dominant visual', () => {
  it('renders the PR title, number, and area/state pills', () => {
    render(<WorkLogProofCard row={BASE_ROW} />);
    expect(screen.getByText(/#42 fix round autosave permission/i)).toBeInTheDocument();
    expect(screen.getByText('GolfHelm')).toBeInTheDocument();
    expect(screen.getByText('merged')).toBeInTheDocument();
  });

  it('shows a repair pill only when the PR claims to repair an incident', () => {
    const { rerender } = render(<WorkLogProofCard row={BASE_ROW} />);
    expect(screen.queryByText(/repair ·/i)).not.toBeInTheDocument();

    rerender(<WorkLogProofCard row={{ ...BASE_ROW, repairIncidentIds: ['fp-1'], repairVerdict: 'confirmed' }} />);
    expect(screen.getByText(/repair · confirmed/i)).toBeInTheDocument();
  });

  it('renders "not yet deployed" honestly instead of fabricating a shipped release', () => {
    render(<WorkLogProofCard row={{ ...BASE_ROW, notYetDeployed: true }} />);
    expect(screen.getByText(/not yet deployed/i)).toBeInTheDocument();
  });

  it('renders the release verdict and error delta when a shipping release is known', () => {
    render(
      <WorkLogProofCard
        row={{
          ...BASE_ROW,
          shippedInRelease: {
            commitSha: 'deadbeef123',
            deployedAt: Date.parse('2026-09-01T01:00:00Z'),
            gatheringSignal: false,
            errorsAfter2h: 2,
            delta: -3,
            verdict: { tone: 'success', label: 'Improved' },
          },
        }}
      />,
    );
    expect(screen.getByText(/deadbeef1/)).toBeInTheDocument();
    expect(screen.getByText(/improved/i)).toBeInTheDocument();
    expect(screen.getByText(/2 errors, Δ-3/)).toBeInTheDocument();
  });

  it('shows "still gathering signal" instead of a premature verdict for a fresh deploy', () => {
    render(
      <WorkLogProofCard
        row={{
          ...BASE_ROW,
          shippedInRelease: {
            commitSha: 'freshsha',
            deployedAt: Date.now(),
            gatheringSignal: true,
            errorsAfter2h: null,
            delta: null,
            verdict: { tone: 'neutral', label: 'No change' },
          },
        }}
      />,
    );
    expect(screen.getByText(/still gathering signal/i)).toBeInTheDocument();
  });

  it('renders nothing in the release-proof line for an open (unmerged) PR', () => {
    render(<WorkLogProofCard row={{ ...BASE_ROW, state: 'open', mergedAt: null }} />);
    expect(screen.queryByText(/deployed/i)).not.toBeInTheDocument();
  });
});

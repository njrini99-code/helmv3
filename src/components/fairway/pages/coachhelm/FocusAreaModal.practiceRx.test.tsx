// @vitest-environment jsdom
/**
 * ============================================================================
 * FocusAreaModal — honest CTA copy + read-only "Practice Rx" preview
 * ----------------------------------------------------------------------------
 * Part of converging the 3 divergent "prescribe" entry points onto this one
 * modal. Locks two things:
 *   1. The coach-mode CTA reads "Prescribe focus area" everywhere (not the
 *      old "Prescribe to player" / "Prescribe drill" copy this system used to
 *      carry in different spots).
 *   2. When the prescription originates from an insight that carries
 *      attached drills (`sourceInsightId`), the modal shows a compact
 *      read-only "Practice Rx" preview (drill names, rank order) so the
 *      coach/player can see what practice this prescription already carries
 *      before confirming — reusing `PracticeRxForInsight`'s existing
 *      self-fetch + honest-empty contract verbatim (no new write path).
 * ========================================================================== */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { InsightDrill } from '@/app/golf/actions/drills';

// The drills action module is server-only ('use server'); stub it so the
// modal's PracticeRxForInsight child can import the batched loader symbol
// without pulling server code, matching the pattern in practice-rx-batch.test.tsx.
vi.mock('@/app/golf/actions/drills', () => ({
  getDrillsForInsights: vi.fn(async () => ({})),
  getDrillsForInsight: vi.fn(async () => []),
  recordDrillView: vi.fn(),
}));

import { getDrillsForInsights } from '@/app/golf/actions/drills';
import { FocusAreaModal } from './FocusAreaModal';
import { __resetPracticeRxBatcher } from './PracticeRxForInsight';

function drill(overrides: Partial<InsightDrill> = {}): InsightDrill {
  return {
    id: 'drill-1',
    slug: 'drill-1',
    title: 'Gate drill',
    category: 'putting',
    tags: [],
    description: '',
    duration_min: 10,
    difficulty: 'beginner',
    video_url: null,
    rank: 0,
    ...overrides,
  };
}

describe('FocusAreaModal — CTA copy + Practice Rx preview', () => {
  beforeEach(() => {
    __resetPracticeRxBatcher();
    vi.clearAllMocks();
    vi.mocked(getDrillsForInsights).mockResolvedValue({});
  });

  it('uses the honest "Prescribe focus area" CTA in coach mode', () => {
    render(
      <FocusAreaModal
        open
        onOpenChange={() => {}}
        mode="coach"
        players={[{ id: 'p1', name: 'Alice' }]}
        playerId="p1"
        playerStats={{}}
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Prescribe focus area' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prescribe to player' })).not.toBeInTheDocument();
  });

  it('shows a read-only Practice Rx preview (names, rank order) when the source insight has attached drills', async () => {
    vi.mocked(getDrillsForInsights).mockResolvedValue({
      'insight-1': [
        drill({ id: 'd1', title: 'Gate drill', rank: 0 }),
        drill({ id: 'd2', title: 'Ladder drill', rank: 1 }),
      ],
    });

    render(
      <FocusAreaModal
        open
        onOpenChange={() => {}}
        mode="coach"
        players={[{ id: 'p1', name: 'Alice' }]}
        playerId="p1"
        playerStats={{}}
        sourceInsightId="insight-1"
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Gate drill')).toBeInTheDocument();
    });
    expect(screen.getByText('Ladder drill')).toBeInTheDocument();
    expect(screen.getByText('Practice Rx')).toBeInTheDocument();

    // Read-only: PracticeRxPanel never renders a "add/assign" write control.
    expect(screen.queryByRole('button', { name: /add to (my )?plan/i })).not.toBeInTheDocument();
  });

  it('fetches no drills and renders no Practice Rx block when there is no source insight', () => {
    render(
      <FocusAreaModal
        open
        onOpenChange={() => {}}
        mode="coach"
        players={[{ id: 'p1', name: 'Alice' }]}
        playerId="p1"
        playerStats={{}}
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
      />,
    );
    expect(getDrillsForInsights).not.toHaveBeenCalled();
    expect(screen.queryByText('Practice Rx')).not.toBeInTheDocument();
  });

  it('never fetches drills while the modal is closed, even with a sourceInsightId set', () => {
    render(
      <FocusAreaModal
        open={false}
        onOpenChange={() => {}}
        mode="coach"
        players={[{ id: 'p1', name: 'Alice' }]}
        playerId="p1"
        playerStats={{}}
        sourceInsightId="insight-1"
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
      />,
    );
    expect(getDrillsForInsights).not.toHaveBeenCalled();
  });
});

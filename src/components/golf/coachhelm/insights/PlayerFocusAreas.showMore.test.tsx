// @vitest-environment jsdom
/**
 * ============================================================================
 * PlayerFocusAreas — capped list + "Show more" (#75)
 * ----------------------------------------------------------------------------
 * `getPlayerFocusAreas` has no server-side cap (see
 * src/app/golf/actions/insights.ts#getPlayerFocusAreasImpl — a plain
 * `.eq('status','active').order('priority')` with no `.limit()`), so a player
 * who accumulated many "active" focus areas over a season rendered every one
 * of them, unbounded, producing a page-breaking wall of near-identical cards.
 * This suite locks the client-side cap + expand affordance that bounds it.
 * ========================================================================== */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PlayerFocusAreas } from './PlayerFocusAreas';
import { getPlayerFocusAreas } from '@/app/golf/actions/insights';
import type { PlayerFocusArea } from '@/lib/coachhelm/insight-types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/app/golf/actions/insights', () => ({
  getPlayerFocusAreas: vi.fn(),
}));

const mockGetPlayerFocusAreas = vi.mocked(getPlayerFocusAreas);

function makeAreas(count: number): PlayerFocusArea[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `fa-${i}`,
    player_id: 'p-1',
    coach_id: 'c-1',
    category: 'putting',
    priority: i + 1,
    title: `Focus area ${i + 1}`,
    description: 'Some description.',
    specific_drills: [],
    current_performance: {},
    target_improvement: null,
    status: 'active',
    progress_notes: null,
    is_auto_generated: false,
    last_reviewed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }));
}

describe('PlayerFocusAreas — capped list + "Show more" (#75)', () => {
  beforeEach(() => {
    mockGetPlayerFocusAreas.mockReset();
  });

  it('renders every card unhidden when there are 3 or fewer (no "Show more")', async () => {
    mockGetPlayerFocusAreas.mockResolvedValue({
      success: true,
      focus_areas: makeAreas(3),
    });

    render(<PlayerFocusAreas playerId="p-1" />);

    await waitFor(() => {
      expect(screen.getByText('Focus area 3')).toBeInTheDocument();
    });
    expect(screen.getByText('Focus area 1')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Show \d+ more/i }),
    ).not.toBeInTheDocument();
  });

  it('caps the initial render and reveals the rest via "Show N more" (#75 — no runaway scroll)', async () => {
    const user = userEvent.setup();
    mockGetPlayerFocusAreas.mockResolvedValue({
      success: true,
      focus_areas: makeAreas(9),
    });

    render(<PlayerFocusAreas playerId="p-1" />);

    await waitFor(() => {
      expect(screen.getByText('Focus area 1')).toBeInTheDocument();
    });

    // Only the capped set renders up front.
    expect(screen.getByText('Focus area 3')).toBeInTheDocument();
    expect(screen.queryByText('Focus area 4')).not.toBeInTheDocument();
    expect(screen.queryByText('Focus area 9')).not.toBeInTheDocument();

    const showMore = screen.getByRole('button', { name: 'Show 6 more focus areas' });
    await user.click(showMore);

    // Expanding reveals every remaining card and removes the toggle.
    expect(screen.getByText('Focus area 9')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Show \d+ more/i }),
    ).not.toBeInTheDocument();
  });

  it('resets the expanded state when playerId changes', async () => {
    mockGetPlayerFocusAreas.mockResolvedValue({
      success: true,
      focus_areas: makeAreas(9),
    });

    const { rerender } = render(<PlayerFocusAreas playerId="p-1" />);
    await waitFor(() => {
      expect(screen.getByText('Focus area 1')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show 6 more focus areas' }));
    expect(screen.getByText('Focus area 9')).toBeInTheDocument();

    mockGetPlayerFocusAreas.mockResolvedValue({
      success: true,
      focus_areas: makeAreas(9).map((a) => ({ ...a, id: `p2-${a.id}` })),
    });
    rerender(<PlayerFocusAreas playerId="p-2" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Show 6 more focus areas' }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Focus area 9')).not.toBeInTheDocument();
  });
});

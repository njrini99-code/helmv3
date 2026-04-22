/**
 * DrillAttachment tests — UI-2 of the Insight Quality phase.
 *
 * Covers:
 *  - renders nothing when 0 drills match
 *  - renders 1..3 drill cards with title, duration, difficulty, description
 *  - clicking a drill triggers `recordDrillView(drillId)`
 *  - self-fetching mode calls `getDrillsForInsight` when drills aren't
 *    pre-fetched
 *
 * The server actions are injected via props rather than mocked at module
 * level — keeps the test hermetic and lets us assert call arguments
 * directly.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DrillAttachment } from '@/components/golf/coachhelm/insights/DrillAttachment';
import type { InsightDrill } from '@/app/golf/actions/drills';

function drill(overrides: Partial<InsightDrill> = {}): InsightDrill {
  return {
    id: 'd1',
    slug: 'gate-drill-3ft',
    title: 'Gate drill (3-foot putts)',
    category: 'putting',
    tags: ['6_10ft', 'face_alignment'],
    description: 'Set up two tees forming a gate; roll putts through.',
    duration_min: 10,
    difficulty: 'beginner',
    video_url: null,
    rank: 0,
    ...overrides,
  };
}

describe('DrillAttachment', () => {
  it('renders nothing when zero drills are attached (pre-fetched path)', () => {
    const { container } = render(
      <DrillAttachment insightId="i1" drills={[]} getDrills={vi.fn()} onView={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders up to three drill cards when drills are pre-fetched', () => {
    const drills = [
      drill({ id: 'd1', title: 'Gate drill' }),
      drill({ id: 'd2', title: 'Ladder drill' }),
      drill({ id: 'd3', title: 'Clock drill' }),
      drill({ id: 'd4', title: 'Extra drill (should not render)' }),
    ];
    render(
      <DrillAttachment insightId="i1" drills={drills} getDrills={vi.fn()} onView={vi.fn()} />,
    );

    const cards = screen.getAllByTestId('drill-card');
    expect(cards).toHaveLength(3);
    expect(screen.getByText('Gate drill')).toBeInTheDocument();
    expect(screen.getByText('Ladder drill')).toBeInTheDocument();
    expect(screen.getByText('Clock drill')).toBeInTheDocument();
    expect(screen.queryByText('Extra drill (should not render)')).not.toBeInTheDocument();

    // Heading shows only when there are drills.
    expect(screen.getByText('Suggested drills')).toBeInTheDocument();

    // Meta line includes difficulty + category.
    expect(screen.getAllByText(/Beginner/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Putting/).length).toBeGreaterThan(0);
  });

  it('calls onView(drill.id) when a drill card is clicked', async () => {
    const onView = vi.fn().mockResolvedValue(undefined);
    render(
      <DrillAttachment
        insightId="i1"
        drills={[drill({ id: 'd-xyz', title: 'Clickable drill' })]}
        getDrills={vi.fn()}
        onView={onView}
      />,
    );

    fireEvent.click(screen.getByTestId('drill-card'));

    await waitFor(() => expect(onView).toHaveBeenCalledWith('d-xyz'));
  });

  it('self-fetches drills when no drills prop is provided', async () => {
    const getDrills = vi.fn().mockResolvedValue([
      drill({ id: 'd1', title: 'Fetched drill' }),
    ]);
    render(
      <DrillAttachment insightId="insight-123" getDrills={getDrills} onView={vi.fn()} />,
    );

    await waitFor(() => expect(getDrills).toHaveBeenCalledWith('insight-123'));
    await waitFor(() =>
      expect(screen.getByText('Fetched drill')).toBeInTheDocument(),
    );
  });

  it('self-fetches and renders nothing when the server returns zero drills', async () => {
    const getDrills = vi.fn().mockResolvedValue([]);
    const { container } = render(
      <DrillAttachment insightId="i-empty" getDrills={getDrills} onView={vi.fn()} />,
    );

    await waitFor(() => expect(getDrills).toHaveBeenCalledWith('i-empty'));
    // After the fetch resolves we should still render nothing.
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});

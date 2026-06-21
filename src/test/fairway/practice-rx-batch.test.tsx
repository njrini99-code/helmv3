/**
 * P176 — PracticeRxForInsight N+1 elimination.
 *
 * Multiple insight-sourced cards that mount together must coalesce their drill
 * fetches into ONE batched `getDrillsForInsights` round-trip (the microtask
 * batcher), instead of one `getDrillsForInsight` call per card. Cards must also
 * show a loading placeholder before drills resolve, then render the resolved
 * drills for their own insight.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { InsightDrill } from '@/app/golf/actions/drills';

// The server-action module is server-only ('use server'); stub it so the client
// component can import the batched loader symbol without pulling server code.
vi.mock('@/app/golf/actions/drills', () => ({
  getDrillsForInsights: vi.fn(),
  recordDrillView: vi.fn(),
}));

// Stub the inner panel so we can assert per-card drill content cheaply.
vi.mock('@/components/fairway/pages/coachhelm/PracticeRxPanel', () => ({
  PracticeRxPanel: ({ drills }: { drills: InsightDrill[] }) => (
    <div data-testid="rx-panel">{drills.map((d) => d.title).join(',')}</div>
  ),
}));

// Stub the Skeleton so the loading state is queryable.
vi.mock('@/components/fairway/feedback/Skeleton', () => ({
  Skeleton: () => <div data-testid="rx-skeleton" />,
}));

import {
  PracticeRxForInsight,
  __resetPracticeRxBatcher,
} from '@/components/fairway/pages/coachhelm/PracticeRxForInsight';

function drill(title: string): InsightDrill {
  return {
    id: title,
    slug: title,
    title,
    category: 'putting',
    tags: [],
    description: '',
    duration_min: 10,
    difficulty: 'beginner',
    video_url: null,
    rank: 0,
  };
}

describe('PracticeRxForInsight — batched drill loading (P176)', () => {
  beforeEach(() => {
    __resetPracticeRxBatcher();
    vi.clearAllMocks();
  });

  it('coalesces N cards into ONE batched server call carrying all insight ids', async () => {
    const batch = vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, [drill(`drill-${id}`)]])),
    );

    render(
      <>
        <PracticeRxForInsight insightId="i1" getDrillsBatch={batch} />
        <PracticeRxForInsight insightId="i2" getDrillsBatch={batch} />
        <PracticeRxForInsight insightId="i3" getDrillsBatch={batch} />
      </>,
    );

    // Before resolution every card shows a loading placeholder (not null).
    expect(screen.getAllByTestId('rx-skeleton')).toHaveLength(3);

    await waitFor(() => {
      expect(screen.getAllByTestId('rx-panel')).toHaveLength(3);
    });

    // The waterfall is gone: exactly ONE batched call for all three insights.
    expect(batch).toHaveBeenCalledTimes(1);
    const firstCallIds = batch.mock.calls[0]![0];
    expect(new Set(firstCallIds)).toEqual(new Set(['i1', 'i2', 'i3']));

    // Each card renders the drills for its OWN insight.
    const panels = screen.getAllByTestId('rx-panel').map((n) => n.textContent);
    expect(panels).toEqual(
      expect.arrayContaining(['drill-i1', 'drill-i2', 'drill-i3']),
    );
  });

  it('dedupes repeat insight ids into a single batch entry', async () => {
    const batch = vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, [drill(`d-${id}`)]])),
    );

    render(
      <>
        <PracticeRxForInsight insightId="dup" getDrillsBatch={batch} />
        <PracticeRxForInsight insightId="dup" getDrillsBatch={batch} />
      </>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('rx-panel')).toHaveLength(2);
    });

    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0]![0]).toEqual(['dup']); // one entry, not two
  });

  it('renders nothing when there is no insight id', () => {
    const batch = vi.fn(async () => ({}));
    const { container } = render(
      <PracticeRxForInsight insightId={null} getDrillsBatch={batch} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(batch).not.toHaveBeenCalled();
  });
});

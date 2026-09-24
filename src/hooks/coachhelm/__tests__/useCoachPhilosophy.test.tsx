import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * DATA-11 — useCoachPhilosophy.save() overlap guard. Two quick edits can
 * resolve out of order; the older response must never overwrite the newer
 * edit in hook state.
 */

type Row = Record<string, unknown>;

const baseRow: Row = {
  id: 'philosophy-1',
  coach_id: 'coach-1',
  priority_ball_striking: 1,
  priority_short_game: 2,
  priority_putting: 3,
  priority_course_management: 4,
  priority_mental_game: 5,
  alert_sensitivity: 'balanced',
  decline_threshold: '1.5',
  pressure_gap_threshold: '2',
  bubble_zone_range: '3',
  weight_historical: 20,
  weight_recent_form: 30,
  weight_tournament: 25,
  weight_qualifying: 15,
  weight_subjective: 10,
  alert_scoring_decline: true,
  alert_stat_regression: true,
  alert_tournament_pressure: true,
  alert_plateau: true,
  alert_bubble_player: true,
  alert_surge_player: true,
  alert_streaks: true,
  alert_recurring_weakness: true,
  alert_closing_holes: true,
  alert_par_3_issues: true,
  show_strokes_gained: true,
  show_advanced_stats: false,
  insight_verbosity: 'brief',
  created_at: '2026-05-31T00:00:00.000Z',
  updated_at: '2026-05-31T00:00:00.000Z',
};

interface Deferred {
  resolve: (value: { data: Row | null; error: { message: string } | null }) => void;
}

const { pendingUpdates, revalidateMock } = vi.hoisted(() => ({
  pendingUpdates: [] as Deferred[],
  revalidateMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: baseRow, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: () => ({
    update: () => ({
      eq: () => ({
        select: () => ({
          single: () =>
            new Promise((resolve) => {
              pendingUpdates.push({ resolve });
            }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/app/golf/actions/coaching-philosophy', () => ({
  revalidateCoachingPhilosophyPaths: revalidateMock,
}));

import { useCoachPhilosophy } from '../useCoachPhilosophy';

async function renderLoaded() {
  const view = renderHook(({ coachId }) => useCoachPhilosophy(coachId), {
    initialProps: { coachId: 'coach-1' as string | null },
  });
  await waitFor(() => expect(view.result.current.philosophy).not.toBeNull());
  return view;
}

describe('useCoachPhilosophy.save overlap guard (DATA-11)', () => {
  beforeEach(() => {
    pendingUpdates.length = 0;
    revalidateMock.mockClear();
  });

  it('ignores an older save that resolves after a newer one', async () => {
    const { result } = await renderLoaded();

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.save({ declineThreshold: 2 });
    });
    act(() => {
      second = result.current.save({ declineThreshold: 3 });
    });
    await waitFor(() => expect(pendingUpdates).toHaveLength(2));

    // Newer save lands first…
    await act(async () => {
      pendingUpdates[1]!.resolve({ data: { ...baseRow, decline_threshold: '3' }, error: null });
      await second;
    });
    expect(result.current.philosophy?.declineThreshold).toBe(3);
    expect(result.current.saving).toBe(false);

    // …then the stale one. It must not revert the newer edit.
    await act(async () => {
      pendingUpdates[0]!.resolve({ data: { ...baseRow, decline_threshold: '2' }, error: null });
      await first;
    });
    expect(result.current.philosophy?.declineThreshold).toBe(3);
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('keeps saving=true until the latest save resolves', async () => {
    const { result } = await renderLoaded();

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.save({ declineThreshold: 2 });
    });
    act(() => {
      second = result.current.save({ declineThreshold: 3 });
    });
    await waitFor(() => expect(pendingUpdates).toHaveLength(2));

    await act(async () => {
      pendingUpdates[0]!.resolve({ data: { ...baseRow, decline_threshold: '2' }, error: null });
      await first;
    });
    // The stale response neither applied its row nor cleared the spinner.
    expect(result.current.saving).toBe(true);
    expect(result.current.philosophy?.declineThreshold).toBe(1.5);

    await act(async () => {
      pendingUpdates[1]!.resolve({ data: { ...baseRow, decline_threshold: '3' }, error: null });
      await second;
    });
    expect(result.current.saving).toBe(false);
    expect(result.current.philosophy?.declineThreshold).toBe(3);
  });

  it('still surfaces a failure from a superseded save', async () => {
    const { result } = await renderLoaded();

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.save({ alertPlateau: false });
    });
    act(() => {
      second = result.current.save({ declineThreshold: 3 });
    });
    await waitFor(() => expect(pendingUpdates).toHaveLength(2));

    await act(async () => {
      pendingUpdates[1]!.resolve({ data: { ...baseRow, decline_threshold: '3' }, error: null });
      await second;
    });
    let firstOk: boolean | undefined;
    await act(async () => {
      pendingUpdates[0]!.resolve({ data: null, error: { message: 'permission denied' } });
      firstOk = await first;
    });

    expect(firstOk).toBe(false);
    expect(result.current.error).toBe('permission denied');
    expect(result.current.philosophy?.declineThreshold).toBe(3);
  });

  it('keeps the guard across re-renders', async () => {
    const { result, rerender } = await renderLoaded();

    let first!: Promise<boolean>;
    act(() => {
      first = result.current.save({ declineThreshold: 2 });
    });
    rerender({ coachId: 'coach-1' });
    let second!: Promise<boolean>;
    act(() => {
      second = result.current.save({ declineThreshold: 3 });
    });
    rerender({ coachId: 'coach-1' });
    await waitFor(() => expect(pendingUpdates).toHaveLength(2));

    await act(async () => {
      pendingUpdates[1]!.resolve({ data: { ...baseRow, decline_threshold: '3' }, error: null });
      await second;
    });
    await act(async () => {
      pendingUpdates[0]!.resolve({ data: { ...baseRow, decline_threshold: '2' }, error: null });
      await first;
    });
    expect(result.current.philosophy?.declineThreshold).toBe(3);
  });

  // Disjoint fields: each save must keep its OWN field, whatever order the
  // responses (or the underlying commits) arrive in. A returned row carries a
  // stale copy of the other save's field when the commits invert.
  it('keeps both edits when disjoint-field saves resolve newest-first with inverted commits', async () => {
    const { result } = await renderLoaded();

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.save({ alertPlateau: false });
    });
    act(() => {
      second = result.current.save({ declineThreshold: 3 });
    });
    await waitFor(() => expect(pendingUpdates).toHaveLength(2));

    // save2 committed before save1, so its row still has alert_plateau: true.
    await act(async () => {
      pendingUpdates[1]!.resolve({
        data: { ...baseRow, decline_threshold: '3', alert_plateau: true },
        error: null,
      });
      await second;
    });
    await act(async () => {
      pendingUpdates[0]!.resolve({
        data: { ...baseRow, decline_threshold: '3', alert_plateau: false },
        error: null,
      });
      await first;
    });

    expect(result.current.philosophy?.alertPlateau).toBe(false);
    expect(result.current.philosophy?.declineThreshold).toBe(3);
    expect(result.current.saving).toBe(false);
  });

  it('applies an older disjoint-field save as soon as it lands', async () => {
    const { result } = await renderLoaded();

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.save({ alertPlateau: false });
    });
    act(() => {
      second = result.current.save({ declineThreshold: 3 });
    });
    await waitFor(() => expect(pendingUpdates).toHaveLength(2));

    await act(async () => {
      pendingUpdates[0]!.resolve({ data: { ...baseRow, alert_plateau: false }, error: null });
      await first;
    });
    // The Plateau switch reflects its saved value without waiting for save2.
    expect(result.current.philosophy?.alertPlateau).toBe(false);
    expect(result.current.saving).toBe(true);

    // save2 committed after save1, so its row carries both values.
    await act(async () => {
      pendingUpdates[1]!.resolve({
        data: { ...baseRow, decline_threshold: '3', alert_plateau: false },
        error: null,
      });
      await second;
    });
    expect(result.current.philosophy?.alertPlateau).toBe(false);
    expect(result.current.philosophy?.declineThreshold).toBe(3);
    expect(result.current.saving).toBe(false);
  });
});

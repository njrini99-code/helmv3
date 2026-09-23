/**
 * `loadSequenceAttribution` — the loader-level "null on a read error, never
 * []" contract (A4 slice 3b task spec), independent of the server action
 * that calls it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadPlayerContext: vi.fn(),
  computeSequenceAttribution: vi.fn(),
  logServerError: vi.fn(async () => {}),
}));

vi.mock('../context/load-player-context', () => ({ loadPlayerContext: mocks.loadPlayerContext }));
vi.mock('./sequence-attribution', () => ({ computeSequenceAttribution: mocks.computeSequenceAttribution }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));

import { loadSequenceAttribution } from './load-sequence-attribution';
import type { AnalysisScope } from '../context/types';

const SCOPE: AnalysisScope = {
  player_id: 'player-1',
  window_start: '2025-09-23',
  window_end: '2026-09-23',
  analysis_cutoff: '2026-09-23T00:00:00.000Z',
};

describe('loadSequenceAttribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a thrown read error resolves to null, not a rejection and not []', async () => {
    mocks.loadPlayerContext.mockRejectedValue(new TypeError('fetch failed'));

    const result = await loadSequenceAttribution(SCOPE, { supabase: {} as never });

    expect(result).toBeNull();
    expect(mocks.computeSequenceAttribution).not.toHaveBeenCalled();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
  });

  it('a successful read passes shots/holes straight to computeSequenceAttribution and returns its rows', async () => {
    const shots = [{ id: 'shot-1' }];
    const holes = [{ id: 'hole-1' }];
    mocks.loadPlayerContext.mockResolvedValue({ shots, holes });
    const rows = [{ metricId: 'sequence_event_strokes_gained' }];
    mocks.computeSequenceAttribution.mockReturnValue(rows);

    const result = await loadSequenceAttribution(SCOPE, { supabase: {} as never });

    expect(result).toBe(rows);
    expect(mocks.computeSequenceAttribution).toHaveBeenCalledWith(shots, holes, SCOPE);
  });
});

/**
 * W27 — alert posture multiplier unit tests.
 *
 * Verifies that ALERT_POSTURE_MULTIPLIER maps correctly and that
 * loadAlertPostureForPlayer returns the right multiplier / narrative
 * for each posture value.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ALERT_POSTURE_MULTIPLIER } from '@/lib/coachhelm/v3/intent/types';
import type { AlertPosture } from '@/lib/coachhelm/v3/intent/types';

// ---------------------------------------------------------------------------
// 1. Pure multiplier mapping (no DB)
// ---------------------------------------------------------------------------

describe('ALERT_POSTURE_MULTIPLIER', () => {
  it('maps aggressive → 0.85', () => {
    expect(ALERT_POSTURE_MULTIPLIER.aggressive).toBe(0.85);
  });

  it('maps balanced → 1.0', () => {
    expect(ALERT_POSTURE_MULTIPLIER.balanced).toBe(1.0);
  });

  it('maps conservative → 1.15', () => {
    expect(ALERT_POSTURE_MULTIPLIER.conservative).toBe(1.15);
  });

  it('maps silent → Infinity', () => {
    expect(ALERT_POSTURE_MULTIPLIER.silent).toBe(Number.POSITIVE_INFINITY);
  });

  it('covers all four posture values', () => {
    const keys = Object.keys(ALERT_POSTURE_MULTIPLIER) as AlertPosture[];
    expect(keys.sort()).toEqual(['aggressive', 'balanced', 'conservative', 'silent']);
  });
});

// ---------------------------------------------------------------------------
// 2. loadAlertPostureForPlayer with mocked DB
// ---------------------------------------------------------------------------

// Mock the admin client before importing the loader so the module-level
// `createAdminClient` call inside the function returns our fake.
const mockMaybeSingle = vi.fn();
const mockLimit = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockEqChain = vi.fn(() => ({ eq: mockEqChain, limit: mockLimit, maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEqChain }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: () => {
    return { select: mockSelect };
  },
}));

// Import AFTER mocks are set up.
const { loadAlertPostureForPlayer } = await import(
  '@/lib/coachhelm/v3/intent/loader'
);

describe('loadAlertPostureForPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain behavior
    mockEqChain.mockImplementation(() => ({ eq: mockEqChain, limit: mockLimit, maybeSingle: mockMaybeSingle }));
    mockSelect.mockImplementation(() => ({ eq: mockEqChain }));
    mockLimit.mockImplementation(() => ({ maybeSingle: mockMaybeSingle }));
  });

  it('returns null when no team membership exists', async () => {
    // First query (golf_team_members) returns null
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await loadAlertPostureForPlayer('player-1');
    expect(result).toBeNull();
  });

  it('returns null when no primary coach staff exists', async () => {
    // team_members returns a membership
    mockMaybeSingle.mockResolvedValueOnce({ data: { team_id: 'team-1' }, error: null });
    // coach_staff returns null
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await loadAlertPostureForPlayer('player-1');
    expect(result).toBeNull();
  });

  it('returns null when no intent row exists', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { team_id: 'team-1' }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({ data: { coach_id: 'coach-1' }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await loadAlertPostureForPlayer('player-1');
    expect(result).toBeNull();
  });

  it('returns correct multiplier for aggressive posture', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { team_id: 'team-1' }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({ data: { coach_id: 'coach-1' }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({
      data: { narrative_goal: 'breakout', alert_posture: 'aggressive' },
      error: null,
    });

    const result = await loadAlertPostureForPlayer('player-1');
    expect(result).toEqual({ multiplier: 0.85, narrative_goal: 'breakout' });
  });

  it('returns correct multiplier for conservative posture', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { team_id: 'team-1' }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({ data: { coach_id: 'coach-1' }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({
      data: { narrative_goal: 'maintain', alert_posture: 'conservative' },
      error: null,
    });

    const result = await loadAlertPostureForPlayer('player-1');
    expect(result).toEqual({ multiplier: 1.15, narrative_goal: 'maintain' });
  });

  it('returns Infinity multiplier for silent posture', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { team_id: 'team-1' }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({ data: { coach_id: 'coach-1' }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({
      data: { narrative_goal: 'rehabilitate', alert_posture: 'silent' },
      error: null,
    });

    const result = await loadAlertPostureForPlayer('player-1');
    expect(result).toEqual({
      multiplier: Number.POSITIVE_INFINITY,
      narrative_goal: 'rehabilitate',
    });
  });
});

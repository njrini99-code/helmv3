/**
 * Flag-split safety net (2026-09-23): `coachhelm_learned_personalization`
 * used to gate two independent consumers — this v2 alert-threshold
 * personalization (orchestrator.ts's `generateAlerts`) and the unrelated
 * v3 coach-weight read (`score.ts`'s `loadCoachWeightsForPlayer`, see
 * `./ranking/coach-weights-gate.test.ts` for its half of this pair).
 * Flipping the shared id for one silently turned on the other. Each now
 * reads its own id; this file proves `generateAlerts` reads
 * `coachhelm_v2_alert_personalization` specifically, never the id
 * `score.ts` uses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { isFlagEnabled } = vi.hoisted(() => ({ isFlagEnabled: vi.fn() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled }));

const { getLearnedPreferencesMock, buildGlobalPatternLibraryMock } = vi.hoisted(() => ({
  getLearnedPreferencesMock: vi.fn(),
  buildGlobalPatternLibraryMock: vi.fn(),
}));
vi.mock('./learning', () => ({
  BehaviorLearner: vi.fn().mockImplementation(function BehaviorLearner() {
    return {
      getLearnedPreferences: getLearnedPreferencesMock,
      getPersonalizedThreshold: vi.fn(async (_metric: string, defaultThreshold: number) => defaultThreshold),
    };
  }),
  CrossLearner: vi.fn().mockImplementation(function CrossLearner() {
    return { buildGlobalPatternLibrary: buildGlobalPatternLibraryMock };
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeAdminClient(): any {
  const philosophyBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const teamMembersBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => Promise.resolve(resolve({ data: [], error: null })),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === 'golf_coach_philosophy') return philosophyBuilder;
      if (table === 'golf_team_members') return teamMembersBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => makeAdminClient()) }));

import { coachHelmIntelligence } from './orchestrator';

describe('generateAlerts reads its own flag id (coachhelm_v2_alert_personalization)', () => {
  beforeEach(() => {
    isFlagEnabled.mockReset();
    isFlagEnabled.mockReturnValue(false);
    getLearnedPreferencesMock.mockReset().mockResolvedValue({
      alertFrequency: 'normal',
      preferredContentTypes: [],
      dismissRate: 0,
    });
    buildGlobalPatternLibraryMock.mockReset().mockResolvedValue([]);
  });

  it('checks coachhelm_v2_alert_personalization, not the v3 coach-weight id', async () => {
    await coachHelmIntelligence.generateAlerts('coach-1', 'team-1');

    expect(isFlagEnabled).toHaveBeenCalledWith('coachhelm_v2_alert_personalization');
    expect(isFlagEnabled).not.toHaveBeenCalledWith('coachhelm_learned_personalization');
  });
});

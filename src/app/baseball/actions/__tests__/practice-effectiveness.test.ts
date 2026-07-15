// =============================================================================
// src/app/baseball/actions/__tests__/practice-effectiveness.test.ts
//
// Action-level coverage for src/app/baseball/actions/practice-effectiveness.ts.
// Before this file, saveObjective / savePracticeRecap /
// runPracticeEffectiveness / setReviewDisposition had ZERO action-level tests
// — only the pure engine math was covered (engine.test.ts). See
// docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md:65-66,142.
//
// Mocking approach: createFakeSupabase (same idiom as
// dev-plans-coach-gating.test.ts) for @/lib/supabase/server, a direct mock of
// getActiveBaseballContext, plus the demo/sentry/next-cache/server-error-logger
// stack every withBaseballAction call needs.
//
// DEVIATION FROM THE SPEC'S SUGGESTED APPROACH: the spec described these tests
// as exercising "measureForTeam/runPracticeEffectiveness". measureForTeam is
// NOT exported (an internal, unexported driver shared by
// runPracticeEffectiveness and savePracticeRecap's auto-measure step) — these
// tests drive it exclusively through the exported runPracticeEffectiveness
// action, which is the only way to reach it. Additionally, the pure engine
// module (@/lib/coachhelm/baseball/effectiveness/engine) is MOCKED here rather
// than fed real box-score data: the engine's measurement math (before/after
// windows, confidence tiers, direction sign) is already covered by
// engine.test.ts, and what this file needs to lock down is the ACTION-LAYER
// wiring around it — the disposition-preserving upsert, the fail-closed
// read-error guard, and the hardcoded staff_only visibility on every write —
// none of which depend on the engine's internal math. This keeps the test
// data minimal and deterministic (a controlled dedupeKey) instead of having to
// satisfy the engine's real sample-size/window calibration constants.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import type { EffectivenessMeasurementInput, EffectivenessReview } from '@/lib/coachhelm/baseball/effectiveness/engine';

let fake: FakeSupabase;

let mockContext = {
  userId: 'user-1',
  activeTeamId: 'team-1',
  activeRole: 'coach' as const,
  activeCoachId: 'coach-1',
  activePlayerId: null as string | null,
  fellBackFromStale: false,
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => mockContext),
}));

vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
  isBaseballDemoCoachEmail: vi.fn(() => false),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
  logServerError: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// The pure engine's own math is covered by engine.test.ts. Here we control
// its output directly so the action-layer wiring (disposition-preserving
// upsert, fail-closed read guard, hardcoded staff_only visibility) can be
// tested with a small, deterministic dedupeKey instead of real box-score data.
const measureManyObjectivesMock = vi.fn(
  (inputs: EffectivenessMeasurementInput[]): EffectivenessReview[] =>
    inputs.map((i) => ({
      teamId: i.teamId,
      practiceId: i.practiceId,
      objectiveId: i.objectiveId,
      focusArea: i.focusArea,
      metricId: null,
      playerIds: i.playerIds,
      linkedSignalIds: i.linkedSignalIds ?? [],
      metricBefore: null,
      metricAfter: null,
      sampleBefore: 0,
      sampleAfter: 0,
      windowBeforeDays: 30,
      windowAfterDays: 21,
      direction: 'improved',
      afterScope: 'practice',
      confidence: 0.4,
      confidenceTier: 'correlated_not_proven',
      confounders: [],
      conclusion: 'test conclusion',
      recommendedNextAction: {
        label: 'Keep monitoring',
        type: 'none',
        follow_up: 'keep_monitoring',
        owner_role: 'head_coach',
      },
      sourceRefs: [],
      dedupeKey: `${i.teamId}::${i.practiceId}::${i.focusArea}`,
      generatedBy: 'engine',
    })),
);
vi.mock('@/lib/coachhelm/baseball/effectiveness/engine', () => ({
  measureManyObjectives: (inputs: EffectivenessMeasurementInput[]) => measureManyObjectivesMock(inputs),
  PRACTICE_EFFECTIVENESS_ENGINE_ID: 'practice_effectiveness_v1',
}));

import {
  saveObjective,
  savePracticeRecap,
  runPracticeEffectiveness,
  setReviewDisposition,
} from '@/app/baseball/actions/practice-effectiveness';

function seedCoachAuthority(teamId = 'team-1', coachId = 'coach-1', userId = 'user-1') {
  return {
    baseball_coaches: [{ id: coachId, user_id: userId, full_name: 'Coach Rini' }],
    baseball_team_coach_staff: [
      { id: 'staff-1', team_id: teamId, coach_id: coachId, is_primary: true, is_head_coach: false, status: 'active' },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockContext = {
    userId: 'user-1',
    activeTeamId: 'team-1',
    activeRole: 'coach',
    activeCoachId: 'coach-1',
    activePlayerId: null,
    fellBackFromStale: false,
  };
});

// -----------------------------------------------------------------------------
// (1) saveObjective — nulls out any target_metric not in the registry.
// -----------------------------------------------------------------------------

describe('saveObjective — target_metric registry validation', () => {
  it('persists a target_metric that IS a known registry id', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority() },
    });

    const result = await saveObjective({
      practiceId: 'practice-1',
      focusArea: 'Plate discipline',
      targetMetric: 'k_rate',
      playerIds: ['player-1'],
    });

    expect(result.success).toBe(true);
    const { data } = await fake
      .from('baseball_practice_block_objectives')
      .select('*')
      .eq('id', result.data!.objectiveId)
      .single();
    expect((data as { target_metric: string | null }).target_metric).toBe('k_rate');
  });

  it('nulls out a target_metric that is NOT a known registry id, rather than persisting garbage', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority() },
    });

    const result = await saveObjective({
      practiceId: 'practice-1',
      focusArea: 'Plate discipline',
      targetMetric: 'not_a_real_metric',
      playerIds: ['player-1'],
    });

    expect(result.success).toBe(true);
    const { data } = await fake
      .from('baseball_practice_block_objectives')
      .select('*')
      .eq('id', result.data!.objectiveId)
      .single();
    expect((data as { target_metric: string | null }).target_metric).toBeNull();
  });

  it('nulls out target_metric on UPDATE too, not just on create', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedCoachAuthority(),
        baseball_practice_block_objectives: [
          {
            id: 'obj-1',
            team_id: 'team-1',
            practice_id: 'practice-1',
            block_id: null,
            focus_area: 'Plate discipline',
            target_metric: 'k_rate',
            player_ids: ['player-1'],
            completion_status: 'planned',
          },
        ],
      },
    });

    const result = await saveObjective({
      objectiveId: 'obj-1',
      practiceId: 'practice-1',
      focusArea: 'Plate discipline',
      targetMetric: 'still_not_real',
      playerIds: ['player-1'],
    });

    expect(result.success).toBe(true);
    const { data } = await fake
      .from('baseball_practice_block_objectives')
      .select('*')
      .eq('id', 'obj-1')
      .single();
    expect((data as { target_metric: string | null }).target_metric).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// (2) savePracticeRecap — reps clamp + autoMeasure:false honored.
// -----------------------------------------------------------------------------

describe('savePracticeRecap — reps clamp + autoMeasure toggle', () => {
  function seedObjective() {
    return {
      baseball_practice_block_objectives: [
        {
          id: 'obj-1',
          team_id: 'team-1',
          practice_id: 'practice-1',
          block_id: null,
          focus_area: 'Bunting',
          target_metric: null,
          player_ids: ['player-1'],
          completion_status: 'planned',
          reps_completed: null,
          reps_graded_correct: null,
        },
      ],
    };
  }

  it('clamps reps_graded_correct down to reps_completed when the coach over-reports it', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority(), ...seedObjective() },
    });

    const result = await savePracticeRecap({
      practiceId: 'practice-1',
      autoMeasure: false,
      entries: [
        { objectiveId: 'obj-1', completionStatus: 'completed', repsCompleted: 10, repsGradedCorrect: 15 },
      ],
    });

    expect(result.success).toBe(true);
    const { data } = await fake
      .from('baseball_practice_block_objectives')
      .select('*')
      .eq('id', 'obj-1')
      .single();
    const row = data as { reps_completed: number; reps_graded_correct: number };
    expect(row.reps_completed).toBe(10);
    expect(row.reps_graded_correct).toBe(10); // clamped, never > reps_completed
  });

  it('never runs the effectiveness engine when autoMeasure is explicitly false', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority(), ...seedObjective() },
    });

    const result = await savePracticeRecap({
      practiceId: 'practice-1',
      autoMeasure: false,
      entries: [{ objectiveId: 'obj-1', completionStatus: 'completed', repsCompleted: 5, repsGradedCorrect: 5 }],
    });

    expect(result.success).toBe(true);
    expect(result.effectiveness).toBeNull();
    expect(measureManyObjectivesMock).not.toHaveBeenCalled();
  });

  it('runs the effectiveness engine by default (autoMeasure omitted)', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedCoachAuthority(),
        ...seedObjective(),
        baseball_practices: [{ id: 'practice-1', team_id: 'team-1', created_at: '2026-01-01T00:00:00.000Z', published_at: null }],
      },
    });

    const result = await savePracticeRecap({
      practiceId: 'practice-1',
      entries: [{ objectiveId: 'obj-1', completionStatus: 'completed', repsCompleted: 5, repsGradedCorrect: 5 }],
    });

    expect(result.success).toBe(true);
    expect(measureManyObjectivesMock).toHaveBeenCalledTimes(1);
    expect(result.effectiveness).not.toBeNull();
  });

  it('treats negative/non-finite reps as null rather than persisting nonsense', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority(), ...seedObjective() },
    });

    const result = await savePracticeRecap({
      practiceId: 'practice-1',
      autoMeasure: false,
      entries: [
        { objectiveId: 'obj-1', completionStatus: 'skipped', repsCompleted: Number.NaN, repsGradedCorrect: -3 },
      ],
    });

    expect(result.success).toBe(true);
    const { data } = await fake
      .from('baseball_practice_block_objectives')
      .select('*')
      .eq('id', 'obj-1')
      .single();
    const row = data as { reps_completed: number | null; reps_graded_correct: number | null };
    expect(row.reps_completed).toBeNull();
    expect(row.reps_graded_correct).toBe(0); // -3 clamped to 0 (Math.max(0, ...)), not null
  });
});

// -----------------------------------------------------------------------------
// (3) runPracticeEffectiveness — disposition-preserving upsert + fail-closed
//     on a pre-read error. (5) the engine's write always sets staff_only.
// -----------------------------------------------------------------------------

describe('runPracticeEffectiveness — disposition-preserving upsert', () => {
  function seedMeasurableTeam() {
    return {
      baseball_practice_block_objectives: [
        {
          id: 'obj-1',
          team_id: 'team-1',
          practice_id: 'practice-1',
          focus_area: 'Hitting',
          target_metric: null,
          player_ids: ['player-1'],
          completion_status: 'completed',
        },
      ],
      baseball_practices: [
        { id: 'practice-1', team_id: 'team-1', created_at: '2026-01-01T00:00:00.000Z', published_at: null },
      ],
      baseball_player_stats: [],
      baseball_practice_attendance: [],
    };
  }

  it('preserves an existing review row disposition + verdict across a re-run', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedCoachAuthority(),
        ...seedMeasurableTeam(),
        baseball_practice_effectiveness_reviews: [
          {
            id: 'review-1',
            team_id: 'team-1',
            dedupe_key: 'team-1::practice-1::Hitting',
            disposition: 'resolved',
            verdict: 'worked',
          },
        ],
      },
    });

    const result = await runPracticeEffectiveness();
    expect(result.success).toBe(true);

    const { data } = await fake
      .from('baseball_practice_effectiveness_reviews')
      .select('*')
      .eq('dedupe_key', 'team-1::practice-1::Hitting')
      .single();
    const row = data as { disposition: string; verdict: string | null; visibility: string };
    expect(row.disposition).toBe('resolved');
    expect(row.verdict).toBe('worked');
  });

  it('lands a genuinely NEW dedupe_key as disposition "new" with a null verdict', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority(), ...seedMeasurableTeam() },
    });

    const result = await runPracticeEffectiveness();
    expect(result.success).toBe(true);

    const { data } = await fake
      .from('baseball_practice_effectiveness_reviews')
      .select('*')
      .eq('dedupe_key', 'team-1::practice-1::Hitting')
      .single();
    const row = data as { disposition: string; verdict: string | null };
    expect(row.disposition).toBe('new');
    expect(row.verdict).toBeNull();
  });

  it('(5) always writes visibility: staff_only on the upserted review, regardless of engine output', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority(), ...seedMeasurableTeam() },
    });

    await runPracticeEffectiveness();

    const { data } = await fake
      .from('baseball_practice_effectiveness_reviews')
      .select('*')
      .eq('dedupe_key', 'team-1::practice-1::Hitting')
      .single();
    expect((data as { visibility: string }).visibility).toBe('staff_only');
  });

  it('fails closed (success:false) rather than defaulting to "new" when the pre-read of existing dispositions errors', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedCoachAuthority(),
        ...seedMeasurableTeam(),
        baseball_practice_effectiveness_reviews: [
          {
            id: 'review-1',
            team_id: 'team-1',
            dedupe_key: 'team-1::practice-1::Hitting',
            disposition: 'resolved',
            verdict: 'worked',
          },
        ],
      },
    });

    // Force the dispositions pre-read to error. Only .select() on this table
    // is overridden — the fixture's other tables/paths are untouched.
    const originalFrom = fake.from.bind(fake);
    fake.from = ((table: string) => {
      if (table === 'baseball_practice_effectiveness_reviews') {
        const errorChain: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
          errorChain[method] = () => errorChain;
        }
        errorChain.then = (resolve: (v: unknown) => void) =>
          Promise.resolve(resolve({ data: null, error: { message: 'read failed' } }));
        return errorChain;
      }
      return originalFrom(table);
    }) as typeof fake.from;

    const result = await runPracticeEffectiveness();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Could not load existing review dispositions.');

    // Prove the pre-existing row was never clobbered/upserted over — the
    // action must bail out BEFORE reaching the upsert, not silently reset
    // disposition to 'new'.
    const { data } = await originalFrom('baseball_practice_effectiveness_reviews')
      .select('*')
      .eq('dedupe_key', 'team-1::practice-1::Hitting')
      .single();
    const row = data as { disposition: string; verdict: string | null };
    expect(row.disposition).toBe('resolved');
    expect(row.verdict).toBe('worked');
  });

  it('is a no-op success when there are no completed/partial objectives to measure', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority() },
    });

    const result = await runPracticeEffectiveness();
    expect(result.success).toBe(true);
    expect(result.measured).toBe(0);
    expect(measureManyObjectivesMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// (4) setReviewDisposition — verdict forced null unless disposition==='resolved'.
// -----------------------------------------------------------------------------

describe('setReviewDisposition — verdict is only meaningful on "resolved"', () => {
  function seedReview() {
    return {
      baseball_practice_effectiveness_reviews: [
        { id: 'review-1', team_id: 'team-1', dedupe_key: 'k1', disposition: 'new', verdict: null },
      ],
    };
  }

  it('forces verdict to null when disposition is "dismissed", even if a verdict is supplied', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority(), ...seedReview() },
    });

    const result = await setReviewDisposition({
      reviewId: 'review-1',
      disposition: 'dismissed',
      verdict: 'worked',
    });

    expect(result.success).toBe(true);
    const { data } = await fake.from('baseball_practice_effectiveness_reviews').select('*').eq('id', 'review-1').single();
    const row = data as { disposition: string; verdict: string | null };
    expect(row.disposition).toBe('dismissed');
    expect(row.verdict).toBeNull();
  });

  it('preserves a supplied verdict when disposition is "resolved"', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority(), ...seedReview() },
    });

    const result = await setReviewDisposition({
      reviewId: 'review-1',
      disposition: 'resolved',
      verdict: 'needs_more_time',
    });

    expect(result.success).toBe(true);
    const { data } = await fake.from('baseball_practice_effectiveness_reviews').select('*').eq('id', 'review-1').single();
    const row = data as { disposition: string; verdict: string | null };
    expect(row.disposition).toBe('resolved');
    expect(row.verdict).toBe('needs_more_time');
  });

  it('a stale verdict does not survive re-opening a resolved review back to "new"', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedCoachAuthority(),
        baseball_practice_effectiveness_reviews: [
          { id: 'review-1', team_id: 'team-1', dedupe_key: 'k1', disposition: 'resolved', verdict: 'worked' },
        ],
      },
    });

    const result = await setReviewDisposition({ reviewId: 'review-1', disposition: 'new' });

    expect(result.success).toBe(true);
    const { data } = await fake.from('baseball_practice_effectiveness_reviews').select('*').eq('id', 'review-1').single();
    expect((data as { verdict: string | null }).verdict).toBeNull();
  });
});

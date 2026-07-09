// =============================================================================
// Regression test: convertSignalToAction's 'lift_modification' materialization
// used to bridge into the legacy baseball_lift_sessions / _session_exercises
// tables — which nothing reads (createLiftAssignment / publishLiftDay /
// logLiftResult / the player surfaces all moved to helm_lifting_* under the
// W2-G rewire), so a coach-converted lift modification was SILENT DATA LOSS:
// it reached the coach's Lifting-Lite board but never the player. This test
// proves the bridge now materializes into helm_lifting_sessions /
// helm_lifting_session_exercises instead.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/baseball/timeline-writer', () => ({
  appendTimelineEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/baseball/capabilities', () => ({
  hasBaseballCapability: vi.fn(async () => true),
}));
vi.mock('@/lib/baseball/coachhelm/action-baseline', () => ({
  resolveSignalTargetMetric: vi.fn(async () => null),
  buildActionOutcomeSeed: vi.fn(async () => ({
    outcome_metric: null,
    outcome_baseline_value: null,
    outcome_verdict: 'insufficient_sample',
  })),
}));
vi.mock('@/app/baseball/actions/practice', () => ({
  materializePracticeBlockFromSignal: vi.fn(async () => ({ ok: true, blockId: 'unused' })),
}));

const { logServerError } = vi.hoisted(() => ({
  logServerError: vi.fn(async (_message: string, _context?: unknown) => undefined),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError }));

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
  BaseballActionError: class BaseballActionError extends Error {},
}));

import { convertSignalToAction } from '@/app/baseball/actions/signals';

const TEAM_ID = 'team-1';
const ORG_ID = 'org-1';
const PLAYER_ID = 'player-1';
const ATHLETE_ID = 'athlete-1';
const SIGNAL_ID = 'signal-1';
const COACH_ID = 'coach-1';

interface Ctx {
  user: { id: string };
  targetTeamId: string;
  activeCoachId: string | null;
}

const ctx: Ctx = { user: { id: 'user-1' }, targetTeamId: TEAM_ID, activeCoachId: COACH_ID };

// The wrapper (withBaseballAction) resolves `ctx` internally in production;
// our mock hands back the raw (ctx, input) => ... body, so the test supplies
// ctx explicitly — same pattern as publish-lift-day-helm-bridge.integration.test.ts.
const convert = convertSignalToAction as unknown as (
  ctx: Ctx,
  input: {
    signalId: string;
    actions: Array<{ actionType: string; title: string; assigneePlayerId?: string | null; visibility?: string }>;
  },
) => Promise<{ success: boolean; ids?: string[]; error?: string }>;

function baseTables() {
  return {
    baseball_teams: [{ id: TEAM_ID, organization_id: ORG_ID }],
    helm_lifting_athletes: [
      { id: ATHLETE_ID, organization_id: ORG_ID, sport: 'baseball', sport_player_id: PLAYER_ID, team_id: TEAM_ID },
    ],
    baseball_signals: [
      {
        id: SIGNAL_ID,
        team_id: TEAM_ID,
        player_id: PLAYER_ID,
        disposition: 'acknowledged',
        signal_type: 'manual_note',
        source_refs: null,
        confidence: 0.6,
        why_it_matters: 'Shoulder soreness flagged in check-in.',
        visibility: 'staff_only',
        title: 'Reduce upper-body load',
        event_id: null,
      },
    ],
    baseball_actions: [] as Array<Record<string, unknown>>,
    baseball_lift_assignments: [] as Array<Record<string, unknown>>,
    helm_lifting_sessions: [] as Array<Record<string, unknown>>,
    helm_lifting_session_exercises: [] as Array<Record<string, unknown>>,
  };
}

function convertInput(overrides: Partial<{ title: string }> = {}) {
  return {
    signalId: SIGNAL_ID,
    actions: [
      {
        actionType: 'lift_modification',
        title: overrides.title ?? 'Deload upper body this week',
        assigneePlayerId: PLAYER_ID,
        visibility: 'staff_only',
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("convertSignalToAction 'lift_modification' — Helm Lifting Lab bridge", () => {
  it('AC: converting a signal materializes a helm_lifting_sessions row for the player (not just the legacy coach-board row)', async () => {
    const tables = baseTables();
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const result = await convert(ctx, convertInput());
    expect(result.success).toBe(true);

    // The graveyarded legacy baseball_lift_assignments table is no longer
    // written (it was moved out of `public`, so any write 500s) — the
    // conversion now lands ONLY in helm_lifting_sessions.
    expect(tables.baseball_lift_assignments).toHaveLength(0);

    // The player-visible bridge now lands in helm_lifting_sessions.
    expect(tables.helm_lifting_sessions).toHaveLength(1);
    const helmSession = tables.helm_lifting_sessions[0]!;
    expect(helmSession.athlete_id).toBe(ATHLETE_ID);
    expect(helmSession.organization_id).toBe(ORG_ID);
    expect(helmSession.status).toBe('modified');
    expect(helmSession.coach_note).toBe('Shoulder soreness flagged in check-in.');

    expect(tables.helm_lifting_session_exercises).toHaveLength(1);
    const helmSessionExercise = tables.helm_lifting_session_exercises[0]!;
    expect(helmSessionExercise.session_id).toBe(helmSession.id);
    expect(helmSessionExercise.exercise_name_snapshot).toBe('Deload upper body this week');

    // No write ever lands in the legacy, unread baseball_lift_sessions table.
    expect(tables).not.toHaveProperty('baseball_lift_sessions');
  });

  it('re-converting the SAME signal does not duplicate the helm session (idempotent, never delete-then-reinsert)', async () => {
    const tables = baseTables();
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const first = await convert(ctx, convertInput());
    expect(first.success).toBe(true);
    expect(tables.helm_lifting_sessions).toHaveLength(1);
    const firstId = tables.helm_lifting_sessions[0]!.id;

    // Reset disposition so the idempotency guard on 'converted' doesn't just
    // short-circuit the whole action before reaching the bridge again.
    tables.baseball_signals[0]!.disposition = 'acknowledged';

    const second = await convert(ctx, convertInput());
    expect(second.success).toBe(true);

    expect(tables.helm_lifting_sessions).toHaveLength(1);
    expect(tables.helm_lifting_sessions[0]!.id).toBe(firstId);
    expect(tables.helm_lifting_session_exercises).toHaveLength(1);
  });

  it('degrades silently (no log) when the team has no Helm Lifting organization configured', async () => {
    const tables = baseTables();
    tables.baseball_teams = [{ id: TEAM_ID, organization_id: null as unknown as string }];
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const result = await convert(ctx, convertInput());

    expect(result.success).toBe(true);
    expect(tables.helm_lifting_sessions).toHaveLength(0);
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('degrades silently (no log) when the player has not been seeded into helm_lifting_athletes', async () => {
    const tables = baseTables();
    tables.helm_lifting_athletes = [];
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const result = await convert(ctx, convertInput());

    expect(result.success).toBe(true);
    expect(tables.helm_lifting_sessions).toHaveLength(0);
    expect(logServerError).not.toHaveBeenCalled();
  });
});

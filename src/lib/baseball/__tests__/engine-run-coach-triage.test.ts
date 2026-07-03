// =============================================================================
// Regression tests for #473: the engine must never resurrect a COACH-TRIAGED
// row on a re-fire — neither on the insight side (baseball_coach_insights)
// nor on the paired signal side (baseball_signals).
//
//   1. A prior insight row whose status is dismissed/addressed/resolved must
//      NOT be upserted back to 'active' when its dedupe_key re-fires.
//   2. A companion dedupe_key whose prior insight is still 'active' MUST
//      still be upserted/refreshed (the skip is per-key, not global).
//   3. A prior SIGNAL row (baseball_signals) that a coach set to a terminal
//      disposition (dismissed/resolved/converted), with no open row left for
//      that dedupe_key, must NOT be re-emitted as a fresh 'new' row — the
//      cross-surface companion fix to (1).
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import { DEFAULT_AI_POLICY } from '@/lib/baseball/ai-policy';
import type { BaseballInsightCandidate } from '@/lib/coachhelm/baseball/generators';
import type { InsightPriority } from '@/lib/coachhelm/shared/evidence-types';

const NOW = '2026-06-30T12:00:00.000Z';
const TEAM_ID = 'team-1';
const PLAYER_ID = 'player-1';

function candidate(
  generator: string,
  overrides: Partial<BaseballInsightCandidate> = {},
): BaseballInsightCandidate {
  const priority: InsightPriority = overrides.priority ?? 'high';
  const sampleN = overrides.evidence?.sample_n ?? 12;
  return {
    generator,
    playerId: overrides.playerId ?? PLAYER_ID,
    insightType: overrides.insightType ?? `coachhelm_${generator}`,
    title: overrides.title ?? 'Two-strike chase climbing',
    body: overrides.body ?? 'Chase rate is up with two strikes.',
    priority,
    confidence: overrides.confidence ?? 0.72,
    playerVisible: overrides.playerVisible ?? false,
    evidence: overrides.evidence ?? {
      sample_n: sampleN,
      target_n: 30,
      confidence_factors: {} as never,
      causality_level: 'inferred_hypothesis',
      diagnosis: {
        symptom: 'K-rate up with two strikes',
        root_cause: 'Expanding the zone late in counts',
        causality_level: 'inferred_hypothesis',
        drivers: [
          {
            metric: 'two_strike_chase_pct',
            value: 41,
            unit: 'percent',
            sample_n: sampleN,
            source: 'baseball_player_stats.strikeouts',
          },
        ],
        recommended_action: 'Two-strike approach reps',
        confidence_reason: 'Moderate sample, single-metric.',
      },
      source_refs: [
        {
          table: 'baseball_player_stats',
          column: 'strikeouts',
          sample_n: sampleN,
          confidence: 0.72,
          label: 'Last 12 games (box score)',
          visibility: 'staff_only',
        },
      ],
    },
  };
}

let candidatesToEmit: BaseballInsightCandidate[] = [];

vi.mock('@/lib/coachhelm/baseball/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/baseball/engine')>();
  return {
    ...actual,
    generateAllBaseballCandidates: vi.fn(() => candidatesToEmit),
  };
});

import { runBaseballEngineCore, type EngineRunClient } from '@/lib/baseball/coachhelm/engine-run';

const ORG_ID = 'org-1';

function baseTables() {
  return {
    baseball_team_members: [{ team_id: TEAM_ID, player_id: PLAYER_ID }],
    baseball_player_stats: [],
    baseball_events: [],
    // W2-G rewire: engine-run.ts resolves org -> athlete -> readiness inline
    // against baseball_teams / helm_lifting_athletes / helm_lifting_readiness_
    // checkins (the legacy baseball_readiness_checkins table is write-dead).
    // Seeding the team + athlete scaffolding here exercises the REAL
    // resolve-then-read path rather than short-circuiting on a missing org.
    baseball_teams: [{ id: TEAM_ID, organization_id: ORG_ID }],
    helm_lifting_athletes: [
      { id: 'athlete-1', organization_id: ORG_ID, sport: 'baseball', sport_player_id: PLAYER_ID },
    ],
    helm_lifting_readiness_checkins: [] as Array<Record<string, unknown>>,
    baseball_lift_sessions: [],
    baseball_lift_set_results: [],
    baseball_import_runs: [],
    baseball_pitch_events: [],
    baseball_batted_ball_events: [],
    baseball_catching_events: [],
    baseball_fielding_events: [],
    baseball_baserunning_events: [],
    baseball_video_events: [],
    baseball_coach_insights: [] as Array<Record<string, unknown>>,
    baseball_signals: [] as Array<Record<string, unknown>>,
    baseball_ai_audit: [] as Array<Record<string, unknown>>,
  };
}

async function runEngine(fake: FakeSupabase) {
  return runBaseballEngineCore(fake as unknown as EngineRunClient, {
    teamId: TEAM_ID,
    coachId: 'coach-1',
    createdByUserId: 'user-1',
    policy: DEFAULT_AI_POLICY,
    nowIso: NOW,
  });
}

describe('runBaseballEngineCore — #473 coach-triage skip (insight side)', () => {
  it('does NOT upsert a re-firing candidate whose prior insight status is dismissed', async () => {
    candidatesToEmit = [candidate('two_strike_chase')];
    const tables = baseTables();
    tables.baseball_coach_insights = [
      {
        id: 'insight-1',
        team_id: TEAM_ID,
        dedupe_key: 'two_strike_chase:player-1',
        insight_type: 'coachhelm_two_strike_chase',
        status: 'dismissed',
        lifecycle_state: 'archived',
        observation_count: 2,
        first_detected_at: '2026-06-01T00:00:00.000Z',
        coach_id: 'coach-1',
      },
    ];
    const fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const result = await runEngine(fake);
    expect(result.success).toBe(true);

    const row = tables.baseball_coach_insights.find((r) => r.id === 'insight-1');
    expect(row?.status).toBe('dismissed'); // NEVER flipped back to 'active'
    // No second row was cloned in for the same dedupe_key either.
    expect(
      tables.baseball_coach_insights.filter((r) => r.dedupe_key === 'two_strike_chase:player-1'),
    ).toHaveLength(1);
  });

  it('does NOT upsert when the prior status is addressed or resolved', async () => {
    for (const status of ['addressed', 'resolved']) {
      candidatesToEmit = [candidate('two_strike_chase')];
      const tables = baseTables();
      tables.baseball_coach_insights = [
        {
          id: 'insight-1',
          team_id: TEAM_ID,
          dedupe_key: 'two_strike_chase:player-1',
          insight_type: 'coachhelm_two_strike_chase',
          status,
          lifecycle_state: 'archived',
          observation_count: 2,
          first_detected_at: '2026-06-01T00:00:00.000Z',
          coach_id: 'coach-1',
        },
      ];
      const fake = createFakeSupabase({ user: { id: 'user-1' }, tables });
      await runEngine(fake);
      const row = tables.baseball_coach_insights.find((r) => r.id === 'insight-1');
      expect(row?.status).toBe(status);
    }
  });

  it('STILL upserts/refreshes a companion active prior key alongside a skipped triaged one', async () => {
    candidatesToEmit = [
      candidate('two_strike_chase', { playerId: PLAYER_ID }),
      candidate('command_decay', {
        playerId: 'player-2',
        insightType: 'coachhelm_command_decay',
      }),
    ];
    const tables = baseTables();
    tables.baseball_team_members = [
      { team_id: TEAM_ID, player_id: PLAYER_ID },
      { team_id: TEAM_ID, player_id: 'player-2' },
    ];
    tables.baseball_coach_insights = [
      {
        id: 'insight-dismissed',
        team_id: TEAM_ID,
        dedupe_key: 'two_strike_chase:player-1',
        insight_type: 'coachhelm_two_strike_chase',
        status: 'dismissed',
        lifecycle_state: 'archived',
        observation_count: 2,
        first_detected_at: '2026-06-01T00:00:00.000Z',
        coach_id: 'coach-1',
      },
      {
        id: 'insight-active',
        team_id: TEAM_ID,
        dedupe_key: 'command_decay:player-2',
        insight_type: 'coachhelm_command_decay',
        status: 'active',
        lifecycle_state: 'detected',
        observation_count: 1,
        first_detected_at: '2026-06-20T00:00:00.000Z',
        coach_id: 'coach-1',
      },
    ];
    const fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const result = await runEngine(fake);
    expect(result.success).toBe(true);

    const dismissedRow = tables.baseball_coach_insights.find((r) => r.id === 'insight-dismissed');
    expect(dismissedRow?.status).toBe('dismissed'); // untouched

    const activeRow = tables.baseball_coach_insights.find(
      (r) => r.dedupe_key === 'command_decay:player-2',
    );
    expect(activeRow?.status).toBe('active');
    // The re-fire incremented the maturity counter — proof the row WAS refreshed.
    expect(activeRow?.observation_count).toBe(2);
  });
});

describe('runBaseballEngineCore — #473 cross-surface: paired baseball_signals row', () => {
  it('does NOT resurrect a coach-dismissed signal as a fresh "new" row', async () => {
    candidatesToEmit = [candidate('two_strike_chase')];
    const tables = baseTables();
    tables.baseball_signals = [
      {
        id: 'signal-1',
        team_id: TEAM_ID,
        dedupe_key: 'two_strike_chase:player-1',
        source_kind: 'ai',
        disposition: 'dismissed',
      },
    ];
    const fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const result = await runEngine(fake);
    expect(result.success).toBe(true);

    const signalsForKey = tables.baseball_signals.filter(
      (r) => r.dedupe_key === 'two_strike_chase:player-1',
    );
    // Exactly the one original (still-dismissed) row — no duplicate 'new' row.
    expect(signalsForKey).toHaveLength(1);
    expect(signalsForKey[0]?.disposition).toBe('dismissed');
  });

  it('STILL refreshes the signal when an open row exists for the same dedupe_key', async () => {
    candidatesToEmit = [candidate('two_strike_chase')];
    const tables = baseTables();
    tables.baseball_signals = [
      {
        id: 'signal-open',
        team_id: TEAM_ID,
        dedupe_key: 'two_strike_chase:player-1',
        source_kind: 'ai',
        disposition: 'new',
      },
    ];
    const fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const result = await runEngine(fake);
    expect(result.success).toBe(true);
    expect(result.signalsEmitted).toBeGreaterThan(0);

    const signalsForKey = tables.baseball_signals.filter(
      (r) => r.dedupe_key === 'two_strike_chase:player-1',
    );
    expect(signalsForKey).toHaveLength(1);
    expect(signalsForKey[0]?.disposition).toBe('new');
  });
});

// =============================================================================
// Unit tests for the insight -> signal mapper (signal-from-insight.ts).
//
// Locks the binding honesty invariants that close the V9 Core Product Loop:
//   - only medium+ priority candidates are promoted (inbox stays actionable);
//   - severity is derived from the gated priority and NEVER inflated;
//   - a sub-threshold sample is the FIRST-CLASS 'sample_too_small' disposition;
//   - source_refs are carried verbatim + cite the insight (signal->insight);
//   - dedupe_key is reused so a re-run UPSERTs the open signal, never clones.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  signalFromInsight,
  signalsFromInsights,
  SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD,
} from '@/lib/baseball/signal-from-insight';
import { DEFAULT_AI_POLICY } from '@/lib/baseball/ai-policy';
import type { BaseballInsightCandidate } from '@/lib/coachhelm/baseball/generators';
import type { InsightPriority } from '@/lib/coachhelm/shared/evidence-types';
import { parseSignalSourceRefs } from '@/lib/types/baseball-signals';

const NOW = '2026-06-24T12:00:00.000Z';

function candidate(
  overrides: Partial<BaseballInsightCandidate> = {},
): BaseballInsightCandidate {
  const priority: InsightPriority = overrides.priority ?? 'high';
  const sampleN = overrides.evidence?.sample_n ?? 12;
  return {
    generator: overrides.generator ?? 'two_strike_chase',
    playerId: overrides.playerId ?? 'player-1',
    insightType: overrides.insightType ?? 'coachhelm_two_strike_chase',
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

const baseOpts = {
  teamId: 'team-1',
  createdByUserId: 'user-1',
  dedupeKey: 'two_strike_chase:player-1',
  nowIso: NOW,
};

describe('signalFromInsight — promotion threshold', () => {
  it('drops low-priority candidates (they live in the insight store only)', () => {
    expect(signalFromInsight(candidate({ priority: 'low' }), baseOpts)).toBeNull();
  });

  it('promotes medium / high / urgent candidates', () => {
    for (const p of ['medium', 'high', 'urgent'] as InsightPriority[]) {
      expect(signalFromInsight(candidate({ priority: p }), baseOpts)).not.toBeNull();
    }
  });
});

describe('signalFromInsight — severity never inflates', () => {
  it('maps urgent->critical, high->warning, medium->info', () => {
    expect(signalFromInsight(candidate({ priority: 'urgent' }), baseOpts)!.severity).toBe(
      'critical',
    );
    expect(signalFromInsight(candidate({ priority: 'high' }), baseOpts)!.severity).toBe(
      'warning',
    );
    expect(signalFromInsight(candidate({ priority: 'medium' }), baseOpts)!.severity).toBe(
      'info',
    );
  });
});

describe('signalFromInsight — sample-too-small honesty', () => {
  it('flags a sub-threshold sample as the first-class disposition', () => {
    const thin = candidate({
      evidence: {
        ...candidate().evidence,
        sample_n: SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD - 1,
      },
    });
    const sig = signalFromInsight(thin, baseOpts)!;
    expect(sig.disposition).toBe('sample_too_small');
    expect(sig.sample_n).toBe(SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD - 1);
  });

  it('an adequate sample enters as new', () => {
    const sig = signalFromInsight(
      candidate({
        evidence: {
          ...candidate().evidence,
          sample_n: SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD + 5,
        },
      }),
      baseOpts,
    )!;
    expect(sig.disposition).toBe('new');
  });
});

describe('signalFromInsight — provenance + traceability', () => {
  it('carries the insight source refs forward and cites the insight row', () => {
    const sig = signalFromInsight(candidate(), {
      ...baseOpts,
      insightId: 'insight-123',
    })!;
    const refs = parseSignalSourceRefs(sig.source_refs ?? null);
    // citation to the insight is first, then the underlying table ref.
    expect(refs[0]?.source_table).toBe('baseball_coach_insights');
    expect(refs[0]?.source_id).toBe('insight-123');
    expect(refs.some((r) => r.source_table === 'baseball_player_stats')).toBe(true);
    // never empty — every real signal is source-backed.
    expect(refs.length).toBeGreaterThan(0);
  });

  it('omits the insight citation when no insight id is available', () => {
    const sig = signalFromInsight(candidate(), baseOpts)!;
    const refs = parseSignalSourceRefs(sig.source_refs ?? null);
    expect(refs.some((r) => r.source_table === 'baseball_coach_insights')).toBe(false);
  });

  it('marks the signal as AI-sourced with the generator id + dedupe key', () => {
    const sig = signalFromInsight(candidate(), baseOpts)!;
    expect(sig.source_kind).toBe('ai');
    expect(sig.generated_by).toBe('two_strike_chase');
    expect(sig.dedupe_key).toBe('two_strike_chase:player-1');
    expect(sig.confidence).toBe(0.72);
  });
});

describe('signalFromInsight — visibility ladder', () => {
  it('a staff-only insight produces a staff_only signal', () => {
    expect(signalFromInsight(candidate({ playerVisible: false }), baseOpts)!.visibility).toBe(
      'staff_only',
    );
  });

  it('a player-visible insight is DOWNGRADED to staff_only under the default (safe) policy', () => {
    // The default AI policy is fail-closed: player-visible AI is OFF + staff
    // approval is required, so a player-visible candidate is held staff_only
    // until a coach approves it (the v4 machine-enforced backstop). A caller that
    // passes no policy gets this guarded default — never an accidental leak.
    expect(signalFromInsight(candidate({ playerVisible: true }), baseOpts)!.visibility).toBe(
      'staff_only',
    );
  });

  it('a player-visible insight produces a player_only signal when the policy ALLOWS it', () => {
    // Player-visible AI enabled + approval NOT required => the candidate emits at
    // its desired player_only visibility. This proves the toggle is load-bearing:
    // the SAME candidate emits staff_only by default but player_only here.
    const sig = signalFromInsight(candidate({ playerVisible: true }), {
      ...baseOpts,
      policy: { ...DEFAULT_AI_POLICY, playerVisibleEnabled: true, requireStaffApproval: false },
    })!;
    expect(sig.visibility).toBe('player_only');
  });
});

describe('signalFromInsight — category + recommendation mapping', () => {
  it('maps pitching generators to the pitching category + a video request', () => {
    const sig = signalFromInsight(
      candidate({ generator: 'velo_command_decay', playerId: 'p2' }),
      { ...baseOpts, dedupeKey: 'velo_command_decay:p2' },
    )!;
    expect(sig.category).toBe('pitching');
    expect(sig.recommended_action_type).toBe('video_request');
  });

  it('maps schedule_conflict to operations + a meeting item', () => {
    const sig = signalFromInsight(
      candidate({ generator: 'schedule_conflict', playerId: null }),
      { ...baseOpts, dedupeKey: 'schedule_conflict:team' },
    )!;
    expect(sig.category).toBe('operations');
    expect(sig.recommended_action_type).toBe('meeting_item');
  });
});

describe('signalsFromInsights — batch', () => {
  it('drops below-threshold rows and keys each by dedupeKeyFor', () => {
    const rows = signalsFromInsights(
      [
        candidate({ generator: 'two_strike_chase', playerId: 'a', priority: 'high' }),
        candidate({ generator: 'workload', playerId: 'b', priority: 'low' }),
        candidate({ generator: 'readiness', playerId: 'c', priority: 'medium' }),
      ],
      { teamId: 'team-1', createdByUserId: 'u', nowIso: NOW },
      (c) => `${c.generator}:${c.playerId ?? 'team'}`,
      () => null,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.dedupe_key).sort()).toEqual([
      'readiness:c',
      'two_strike_chase:a',
    ]);
  });
});

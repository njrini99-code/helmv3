// =============================================================================
// Flow — the third axis of the self-healing loop.
//
// `selfheal-registry.ts` answers "is each stage running" and
// `selfheal-capability.ts` answers "has each stage ever produced its output".
// Neither can say whether the loop is moving the incidents in front of it
// RIGHT NOW: a loop can heartbeat green, have a proven history, and still be
// skipping the same fault every night. This module places each incident at
// the stage whose turn it is and calls it STALLED once that stage has had
// `STALL_CYCLES` of its own cadence to act and has not.
//
// Three behaviours are load-bearing and pinned here:
//
//   1. A FAILED READ NEVER STALLS ANYTHING. `repair.status === 'unknown'`, an
//      unreadable deploy, a blind source — each places the incident at
//      `unknown`, never at a stage it could then be blamed for missing.
//   2. THE THRESHOLD IS THE STAGE'S OWN CADENCE, from the registry. A stall is
//      "the stage had N chances", not a hard-coded number of hours.
//   3. AN ACTIVE STAGE IS NEVER STALLED. Repair running on an incident is the
//      loop working, however long it takes.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { SELFHEAL_STAGES } from '@/lib/admin/selfheal-registry';
import { PRODUCTION_PROOF_WINDOW_MS } from '@/lib/admin/incidents/proof';
import {
  STALL_CYCLES,
  stallThresholdMs,
  deriveIncidentFlow,
  summarizeFlow,
  selectStalled,
  describeFlow,
  FLOW_STAGE_TITLE,
} from '@/lib/admin/selfheal-flow';
import type {
  IncidentAnalysis,
  IncidentLifecycleState,
  IncidentRepair,
  UnifiedIncident,
} from '@/lib/admin/incidents/types';

const NOW = Date.parse('2026-09-01T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

function incident(
  over: Partial<UnifiedIncident> & { id: string; state?: IncidentLifecycleState },
): UnifiedIncident {
  const { state = 'new', ...rest } = over;
  return {
    linkTarget: `/admin/errors/${over.id}`,
    title: over.id,
    description: over.id,
    severity: 'error',
    lifecycle: { state, headline: `headline for ${state}`, because: [] },
    firstSeen: iso(HOUR),
    lastSeen: iso(HOUR),
    occurrences: 1,
    affectedUsers: 1,
    affectedUsersKnown: true,
    sources: [],
    corroboration: 1,
    appFingerprints: [over.id],
    sentryIssueIds: [],
    reliabilitySignatures: [],
    route: null,
    featureId: null,
    actionName: null,
    errorCode: null,
    sport: null,
    klass: 'defect',
    actionable: true,
    klassReason: 'r',
    analysis: null,
    repair: null,
    deployProof: null,
    resolution: null,
    proof: [],
    proofGaps: [],
    evidenceCoverage: { dimensions: [], present: 0, total: 7 },
    report: '',
    computedAt: new Date(NOW).toISOString(),
    ...rest,
  } as UnifiedIncident;
}

function analysis(over: Partial<IncidentAnalysis> = {}): IncidentAnalysis {
  return {
    category: 'fix-here',
    probableCause: 'cause',
    suggestedFix: 'FIX HERE: do the thing',
    confidence: 'high',
    suspectFiles: [],
    relatedFingerprints: [],
    model: 'test',
    generatedAt: iso(HOUR),
    repairVerdict: 'not-reviewed',
    ...over,
  };
}

function repair(over: Partial<IncidentRepair> = {}): IncidentRepair {
  return {
    status: 'none',
    prNumber: null,
    prUrl: null,
    branch: null,
    checks: null,
    mergedAt: null,
    mergeSha: null,
    note: null,
    ...over,
  };
}

const triageCadenceMs = SELFHEAL_STAGES.find((s) => s.id === 'triage')!.cadenceMinutes * 60_000;
const repairCadenceMs = SELFHEAL_STAGES.find((s) => s.id === 'repair')!.cadenceMinutes * 60_000;
const closeCadenceMs = SELFHEAL_STAGES.find((s) => s.id === 'close')!.cadenceMinutes * 60_000;

describe('stallThresholdMs', () => {
  it('is STALL_CYCLES of the stage cadence from the registry, never a literal', () => {
    expect(stallThresholdMs('triage')).toBe(triageCadenceMs * STALL_CYCLES);
    expect(stallThresholdMs('repair')).toBe(repairCadenceMs * STALL_CYCLES);
    expect(stallThresholdMs('close')).toBe(closeCadenceMs * STALL_CYCLES);
  });

  it('gives every registry stage a title', () => {
    for (const stage of SELFHEAL_STAGES) {
      expect(FLOW_STAGE_TITLE[stage.id as keyof typeof FLOW_STAGE_TITLE]).toBe(stage.title);
    }
  });
});

describe('deriveIncidentFlow — Diagnose', () => {
  it('places a fresh incident at Diagnose, waiting since first seen, not stalled', () => {
    const flow = deriveIncidentFlow(incident({ id: 'a', state: 'diagnosing', firstSeen: iso(2 * HOUR) }), NOW);
    expect(flow.position).toBe('diagnose');
    expect(flow.stageId).toBe('triage');
    expect(flow.waitingMs).toBe(2 * HOUR);
    expect(flow.stalled).toBe(false);
    expect(flow.why).toMatch(/Diagnose/);
  });

  it('calls a NEW incident stalled once Diagnose has had STALL_CYCLES cadences', () => {
    const justUnder = deriveIncidentFlow(
      incident({ id: 'a', state: 'new', firstSeen: iso(stallThresholdMs('triage') - 1) }),
      NOW,
    );
    expect(justUnder.stalled).toBe(false);

    const justOver = deriveIncidentFlow(
      incident({ id: 'b', state: 'new', firstSeen: iso(stallThresholdMs('triage') + 1) }),
      NOW,
    );
    expect(justOver.position).toBe('diagnose');
    expect(justOver.stalled).toBe(true);
    // The reason names the stage and how many of its cycles have elapsed —
    // a number an operator can check against the Jobs board.
    expect(justOver.why).toMatch(/Diagnose/);
    expect(justOver.why).toMatch(new RegExp(`${STALL_CYCLES} `));
  });

  it('reads "analysis exists but the repair lookup failed" as unknown, never as a Diagnose stall', () => {
    // `lifecycle.ts` renders this combination as `diagnosing` — the honest
    // state for a failed read — and it must not be placed at any stage.
    const flow = deriveIncidentFlow(
      incident({
        id: 'a',
        state: 'diagnosing',
        firstSeen: iso(10 * DAY),
        analysis: analysis(),
        repair: repair({ status: 'unknown' }),
      }),
      NOW,
    );
    expect(flow.position).toBe('unknown');
    expect(flow.stageId).toBeNull();
    expect(flow.stalled).toBe(false);
  });
});

describe('deriveIncidentFlow — Repair', () => {
  it('places a repairable incident at Repair, waiting since the analysis was written', () => {
    const flow = deriveIncidentFlow(
      incident({ id: 'a', state: 'repairable', firstSeen: iso(5 * DAY), analysis: analysis({ generatedAt: iso(3 * HOUR) }) }),
      NOW,
    );
    expect(flow.position).toBe('repair');
    expect(flow.stageId).toBe('repair');
    expect(flow.waitingSince).toBe(iso(3 * HOUR));
    expect(flow.waitingMs).toBe(3 * HOUR);
    expect(flow.stalled).toBe(false);
  });

  it('stalls a repairable incident once Repair has had its cycles, and says so', () => {
    const flow = deriveIncidentFlow(
      incident({
        id: 'a',
        state: 'repairable',
        analysis: analysis({ generatedAt: iso(stallThresholdMs('repair') + HOUR) }),
        repair: repair({ status: 'none' }),
      }),
      NOW,
    );
    expect(flow.stalled).toBe(true);
    expect(flow.why).toMatch(/Repair/);
    expect(flow.why).toMatch(/pull request/i);
  });

  it('never stalls an incident Repair is actively working, however long it takes', () => {
    const flow = deriveIncidentFlow(
      incident({
        id: 'a',
        state: 'repairing',
        analysis: analysis({ generatedAt: iso(10 * DAY) }),
        repair: repair({ status: 'running' }),
      }),
      NOW,
    );
    expect(flow.position).toBe('repair');
    expect(flow.stageId).toBe('repair');
    expect(flow.stalled).toBe(false);
    expect(flow.why).toMatch(/running|working/i);
  });
});

describe('deriveIncidentFlow — Close', () => {
  it('places a production-proven incident with no recorded resolution at Close', () => {
    const deployedAt = iso(3 * DAY);
    const flow = deriveIncidentFlow(
      incident({
        id: 'a',
        state: 'resolved',
        resolution: null,
        repair: repair({ status: 'merged', mergedAt: iso(4 * DAY) }),
        deployProof: {
          fixedInSha: 'abc',
          productionSha: 'abc',
          deployedAt,
          servesFix: true,
          lastOccurrenceAt: iso(5 * DAY),
          sinceDeployMs: 3 * DAY,
          sufficientProof: true,
          gap: null,
        },
      }),
      NOW,
    );
    expect(flow.position).toBe('close');
    expect(flow.stageId).toBe('close');
    // The wait starts when silence became proof, not when the deploy landed.
    expect(flow.waitingSince).toBe(new Date(Date.parse(deployedAt) + PRODUCTION_PROOF_WINDOW_MS).toISOString());
    expect(flow.waitingMs).toBe(3 * DAY - PRODUCTION_PROOF_WINDOW_MS);
    expect(flow.stalled).toBe(3 * DAY - PRODUCTION_PROOF_WINDOW_MS > stallThresholdMs('close'));
  });

  it('cannot measure the wait when the deploy time is unknown, and never stalls it', () => {
    const flow = deriveIncidentFlow(
      incident({
        id: 'a',
        state: 'resolved',
        resolution: null,
        deployProof: {
          fixedInSha: null,
          productionSha: null,
          deployedAt: null,
          servesFix: true,
          lastOccurrenceAt: null,
          sinceDeployMs: null,
          sufficientProof: true,
          gap: null,
        },
      }),
      NOW,
    );
    expect(flow.position).toBe('close');
    expect(flow.waitingMs).toBeNull();
    expect(flow.stalled).toBe(false);
    expect(flow.why).toMatch(/could not|unknown/i);
  });

  it('reads a recorded resolution as done', () => {
    const flow = deriveIncidentFlow(
      incident({
        id: 'a',
        state: 'resolved',
        resolution: { resolvedAt: iso(DAY), resolvedBy: 'auto', fixedInSha: 'abc', note: null, reopenedCount: 0 },
      }),
      NOW,
    );
    expect(flow.position).toBe('done');
    expect(flow.stageId).toBeNull();
    expect(flow.stalled).toBe(false);
  });
});

describe('deriveIncidentFlow — positions the loop does not own', () => {
  const cases: Array<[IncidentLifecycleState, string]> = [
    ['pr-open', 'review'],
    ['awaiting-deploy', 'deploy'],
    ['awaiting-proof', 'traffic'],
    ['needs-evidence', 'owner'],
    ['pr-failed', 'owner'],
    ['regressed', 'owner'],
    ['not-a-defect', 'done'],
    ['merged', 'unknown'],
    ['unknown', 'unknown'],
  ];

  it.each(cases)('%s → %s, with no stage and never stalled', (state, position) => {
    const flow = deriveIncidentFlow(incident({ id: 'a', state, firstSeen: iso(30 * DAY) }), NOW);
    expect(flow.position).toBe(position);
    expect(flow.stageId).toBeNull();
    expect(flow.stalled).toBe(false);
  });

  it('never places a non-actionable incident at a stage', () => {
    const flow = deriveIncidentFlow(
      incident({ id: 'a', state: 'not-a-defect', actionable: false, firstSeen: iso(30 * DAY) }),
      NOW,
    );
    expect(flow.position).toBe('done');
  });
});

describe('summarizeFlow', () => {
  const board = [
    incident({ id: 'fresh', state: 'diagnosing', firstSeen: iso(HOUR) }),
    incident({ id: 'stale-new', state: 'new', firstSeen: iso(5 * DAY) }),
    incident({ id: 'repairable', state: 'repairable', analysis: analysis({ generatedAt: iso(HOUR) }) }),
    incident({ id: 'stalled-repair', state: 'repairable', analysis: analysis({ generatedAt: iso(6 * DAY) }) }),
    incident({ id: 'unknown', state: 'unknown' }),
    incident({ id: 'open-pr', state: 'pr-open' }),
    incident({ id: 'done', state: 'not-a-defect', actionable: false }),
  ];

  it('counts waiting and stalled per stage, in registry order', () => {
    const summary = summarizeFlow(board, NOW);
    expect(summary.stages.map((s) => s.stageId)).toEqual(['triage', 'repair', 'close']);

    const [triage, repairStage, close] = summary.stages;
    expect(triage!.waiting).toBe(2);
    expect(triage!.stalled).toBe(1);
    expect(triage!.state).toBe('stalled');
    expect(triage!.oldestWaitingMs).toBe(5 * DAY);

    expect(repairStage!.waiting).toBe(2);
    expect(repairStage!.stalled).toBe(1);

    expect(close!.waiting).toBe(0);
    expect(close!.stalled).toBe(0);
    expect(close!.state).toBe('idle');
    expect(close!.oldestWaitingMs).toBeNull();
  });

  it('reports the whole loop: waiting, stalled, and the incidents it could not place', () => {
    const summary = summarizeFlow(board, NOW);
    expect(summary.waiting).toBe(4);
    expect(summary.stalled).toBe(2);
    expect(summary.unknown).toBe(1);
    expect(summary.byPosition.review).toBe(1);
    expect(summary.byPosition.done).toBe(1);
  });

  it('is idle, not all-clear, on an empty board', () => {
    const summary = summarizeFlow([], NOW);
    expect(summary.waiting).toBe(0);
    expect(summary.stalled).toBe(0);
    expect(summary.stages.every((s) => s.state === 'idle')).toBe(true);
  });
});

describe('selectStalled', () => {
  it('returns only stalled incidents, longest wait first, with their flow attached', () => {
    const rows = selectStalled(
      [
        incident({ id: 'newer', state: 'new', firstSeen: iso(3 * DAY) }),
        incident({ id: 'older', state: 'repairable', analysis: analysis({ generatedAt: iso(9 * DAY) }) }),
        incident({ id: 'fine', state: 'diagnosing', firstSeen: iso(HOUR) }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.incident.id)).toEqual(['older', 'newer']);
    expect(rows[0]!.flow.stageId).toBe('repair');
    expect(rows[1]!.flow.stageId).toBe('triage');
  });
});

describe('describeFlow', () => {
  it('names the stalled count and where the stalls are', () => {
    const summary = summarizeFlow(
      [
        incident({ id: 'a', state: 'new', firstSeen: iso(5 * DAY) }),
        incident({ id: 'b', state: 'new', firstSeen: iso(4 * DAY) }),
        incident({ id: 'c', state: 'repairable', analysis: analysis({ generatedAt: iso(6 * DAY) }) }),
      ],
      NOW,
    );
    const words = describeFlow(summary);
    expect(words.label).toBe('3 stalled');
    expect(words.detail).toMatch(/2 on Diagnose/);
    expect(words.detail).toMatch(/1 on Repair/);
  });

  it('says unplaced incidents exist rather than folding them into a clean count', () => {
    const summary = summarizeFlow([incident({ id: 'a', state: 'unknown' })], NOW);
    const words = describeFlow(summary);
    expect(words.label).toBe('1 unplaced');
    expect(words.detail).toMatch(/1 .*could not be placed/);
  });

  it('is idle on an empty board — a word, never an all-clear', () => {
    const words = describeFlow(summarizeFlow([], NOW));
    expect(words.label).toBe('idle');
    expect(words.detail).not.toMatch(/clear/i);
  });

  it('reads as flowing, not as a stall, when work is waiting inside a cycle', () => {
    const summary = summarizeFlow([incident({ id: 'a', state: 'diagnosing', firstSeen: iso(HOUR) })], NOW);
    const words = describeFlow(summary);
    expect(words.label).toBe('1 waiting');
    expect(words.detail).toMatch(/inside/);
  });
});

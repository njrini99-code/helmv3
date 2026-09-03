import { describe, it, expect } from 'vitest';
import { buildSelfHealCircuit, UNTRACKED_BUDGET } from '../self-heal-circuit';
import type { SelfHealBoard, SelfHealStageDetail } from '@/lib/admin/data/selfheal';
import type { FlowSummary } from '@/lib/admin/selfheal-flow';

function stage(overrides: Partial<SelfHealStageDetail> = {}): SelfHealStageDetail {
  return {
    id: 'triage',
    jobType: 'selfheal-triage',
    step: 1,
    title: 'Diagnose',
    runner: 'vercel-cron',
    cadenceMinutes: 360,
    what: 'reads unresolved fingerprints',
    contract: 'docs/ai-system/selfheal/triage-contract.md',
    status: 'ok',
    lastRunAt: '2026-09-03T00:00:00.000Z',
    lastRunStatus: 'completed',
    lastError: null,
    lastNote: null,
    unreadable: false,
    capability: { stageId: 'triage', state: 'proven', evidence: '12 analyses in 7d', provenAt: null },
    history: [
      { startedAt: '2026-09-03T00:00:00.000Z', completedAt: '2026-09-03T00:01:00.000Z', status: 'completed', durationMs: 60_000, errorMessage: null },
    ],
    nextExpectedAt: '2026-09-03T06:00:00.000Z',
    overdueAt: '2026-09-03T09:00:00.000Z',
    lastOutcome: null,
    ...overrides,
  } as SelfHealStageDetail;
}

function board(overrides: Partial<SelfHealBoard> = {}): SelfHealBoard {
  return {
    stages: [
      stage(),
      stage({ id: 'repair', jobType: 'selfheal-repair', step: 2, title: 'Repair', runner: 'local-agent', cadenceMinutes: 1440 }),
      stage({ id: 'close', jobType: 'selfheal-close', step: 3, title: 'Close', runner: 'vercel-cron', cadenceMinutes: 1440 }),
    ],
    runtime: 'ok',
    capability: 'proven',
    verdict: { tone: 'ok', label: 'Healthy', detail: 'All stages proven and on schedule.' },
    evidence: {
      signalsCollected: 4,
      analysesWritten: 12,
      repairPrsOpened: 3,
      autoResolutionsRecorded: 2,
      lastProvenAt: { triage: '2026-09-02T00:00:00.000Z', repair: '2026-09-02T00:00:00.000Z', close: '2026-09-01T00:00:00.000Z' },
    },
    unreadable: [],
    repairLink: { url: 'https://github.com/x/y/pull/42', number: 42, createdAt: '2026-09-02T12:00:00.000Z' },
    computedAt: '2026-09-03T00:10:00.000Z',
    ...overrides,
  } as SelfHealBoard;
}

function flow(overrides: Partial<FlowSummary> = {}): FlowSummary {
  return {
    stages: [
      { stageId: 'triage', title: 'Diagnose', waiting: 2, stalled: 0, oldestWaitingMs: 5_000, unmeasured: 0, state: 'flowing' },
      { stageId: 'repair', title: 'Repair', waiting: 1, stalled: 1, oldestWaitingMs: 999_999, unmeasured: 0, state: 'stalled' },
      { stageId: 'close', title: 'Close', waiting: 0, stalled: 0, oldestWaitingMs: null, unmeasured: 0, state: 'idle' },
    ],
    waiting: 3,
    stalled: 1,
    unknown: 0,
    byPosition: {} as FlowSummary['byPosition'],
    ...overrides,
  };
}

describe('buildSelfHealCircuit', () => {
  it('merges runtime, capability and flow onto one row per stage, in stage order', () => {
    const view = buildSelfHealCircuit(board(), flow());
    expect(view.stages.map((s) => s.stageId)).toEqual(['triage', 'repair', 'close']);
    expect(view.stages[0]!.runtimeStatus).toBe('ok');
    expect(view.stages[0]!.capabilityState).toBe('proven');
    expect(view.stages[0]!.waiting).toBe(2);
    expect(view.stages[0]!.oldestWaitingMs).toBe(5_000);
  });

  it('carries the stalled state onto the owning stage only', () => {
    const view = buildSelfHealCircuit(board(), flow());
    const repair = view.stages.find((s) => s.stageId === 'repair')!;
    expect(repair.stalled).toBe(1);
    expect(repair.flowState).toBe('stalled');
    const close = view.stages.find((s) => s.stageId === 'close')!;
    expect(close.stalled).toBe(0);
  });

  it('never fabricates a budget number — every stage reports untracked', () => {
    const view = buildSelfHealCircuit(board(), flow());
    for (const s of view.stages) {
      expect(s.budget).toEqual(UNTRACKED_BUDGET);
      expect(s.budget.tracked).toBe(false);
    }
  });

  it('attaches the repair-quality link only to the repair stage', () => {
    const view = buildSelfHealCircuit(board(), flow());
    expect(view.stages.find((s) => s.stageId === 'triage')!.repairLink).toBeNull();
    expect(view.stages.find((s) => s.stageId === 'close')!.repairLink).toBeNull();
    const repair = view.stages.find((s) => s.stageId === 'repair')!;
    expect(repair.repairLink).toEqual({ url: 'https://github.com/x/y/pull/42', number: 42, createdAt: '2026-09-02T12:00:00.000Z' });
  });

  it('renders no repair link when the board has none, distinct from fabricating one', () => {
    const view = buildSelfHealCircuit(board({ repairLink: null }), flow());
    expect(view.stages.find((s) => s.stageId === 'repair')!.repairLink).toBeNull();
  });

  it('a stage with an in-progress latest run reports currentRunInProgress true', () => {
    const inProgressStage = stage({
      history: [{ startedAt: '2026-09-03T00:00:00.000Z', completedAt: null, status: 'started', durationMs: null, errorMessage: null }],
    });
    const b = board({ stages: [inProgressStage, board().stages[1]!, board().stages[2]!] });
    const view = buildSelfHealCircuit(b, flow());
    expect(view.stages[0]!.currentRunInProgress).toBe(true);
  });

  it('a stage with no run history reports currentRunInProgress false, not unknown-as-busy', () => {
    const idleStage = stage({ history: [] });
    const b = board({ stages: [idleStage, board().stages[1]!, board().stages[2]!] });
    const view = buildSelfHealCircuit(b, flow());
    expect(view.stages[0]!.currentRunInProgress).toBe(false);
  });

  it('a stage missing from the flow summary (blind source) reads zero counts, not undefined', () => {
    const view = buildSelfHealCircuit(board(), flow({ stages: [] }));
    expect(view.stages[0]!.waiting).toBe(0);
    expect(view.stages[0]!.stalled).toBe(0);
    expect(view.stages[0]!.oldestWaitingMs).toBeNull();
    expect(view.stages[0]!.flowState).toBe('idle');
  });

  it('carries the board verdict and unreadable list through unchanged', () => {
    const view = buildSelfHealCircuit(board({ unreadable: ['selfheal-close'] }), flow());
    expect(view.verdictTone).toBe('ok');
    expect(view.verdictLabel).toBe('Healthy');
    expect(view.unreadable).toEqual(['selfheal-close']);
  });
});

// =============================================================================
// The Truth Strip must never overstate what the Bridge knows.
//
// It is the first thing on every Triage page, so it is the cell an operator
// trusts before reading anything else — which makes it the single most
// dangerous place for an optimistic default. Two failures this suite pins:
//
//   1. "ALL CLEAR" under a blind source. A zero incident count computed from
//      readable sources only is not an all-clear; it is a partial count. The
//      Reliability tab already refuses this for its own panel and the whole
//      point of the strip is to make that refusal global.
//
//   2. "0 ready" from a FAILED repair lookup. GitHub being unreachable is not
//      an empty queue, and rendering it as one re-queues work that is already
//      sitting in a branch.
//
// Every cell also carries a freshness string unconditionally. A missing age
// reads as "current", so the honest answer for an unknown one is the words
// "age unknown", never a blank.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { buildTruthStrip, ageWords, type TruthStripInput } from '@/lib/admin/incidents/truth-strip';
import type { FlowSummary } from '@/lib/admin/selfheal-flow';
import type { CoverageSummary } from '@/lib/admin/incidents/sources';
import type { DeployFreshness } from '@/lib/admin/deploy-freshness';
import type { IncidentLifecycleState, UnifiedIncident } from '@/lib/admin/incidents/types';

const NOW = Date.parse('2026-08-28T12:00:00.000Z');

function incident(over: Partial<UnifiedIncident> & { state?: IncidentLifecycleState }): UnifiedIncident {
  const { state = 'new', ...rest } = over;
  return {
    id: 'fp-1',
    linkTarget: '/admin/errors/fp-1',
    title: 'save failed',
    description: 'save failed',
    severity: 'error',
    lifecycle: { state, headline: 'headline', because: [] },
    firstSeen: '2026-08-28T10:00:00.000Z',
    lastSeen: '2026-08-28T11:00:00.000Z',
    occurrences: 3,
    affectedUsers: 1,
    affectedUsersKnown: true,
    sources: [],
    corroboration: 1,
    appFingerprints: ['fp-1'],
    sentryIssueIds: [],
    reliabilitySignatures: [],
    route: '/golf/dashboard',
    featureId: null,
    actionName: null,
    errorCode: null,
    sport: 'golf',
    klass: 'defect',
    actionable: true,
    klassReason: 'unmatched title defaults to a visible defect',
    isFixture: false,
    analysis: null,
    repair: null,
    deployProof: null,
    resolution: null,
    proof: [],
    proofGaps: [],
    evidenceCoverage: { dimensions: [], present: 0, total: 7 },
    report: '',
    computedAt: '2026-08-28T12:00:00.000Z',
    ...rest,
  } as UnifiedIncident;
}

const READING: CoverageSummary = {
  reading: 4,
  partial: 0,
  blind: 0,
  unknown: 0,
  total: 4,
  anyBlind: false,
  blindSources: [],
  oldestAgeMs: 60_000,
  worst: 'reading',
};

const BLIND: CoverageSummary = {
  reading: 3,
  partial: 0,
  blind: 1,
  unknown: 0,
  total: 4,
  anyBlind: true,
  blindSources: ['sentry'],
  oldestAgeMs: 60_000,
  worst: 'blind',
};

const DEPLOY_CURRENT: DeployFreshness = {
  state: 'current',
  summary: 'Production is running 255e63e, level with main.',
  red: null,
  ageHours: 2,
};

const DEPLOY_UNKNOWN: DeployFreshness = {
  state: 'unknown',
  summary: 'Production release could not be determined, so drift from main is unknown.',
  red: null,
  ageHours: null,
};

function input(over: Partial<TruthStripInput> = {}): TruthStripInput {
  return {
    incidents: [],
    coverage: READING,
    deploy: DEPLOY_CURRENT,
    deploymentId: 'dpl_Ck5ZZKa5YdZnyXz9LbDiJxFXemHx',
    loop: { tone: 'ok', label: 'Proven', detail: 'Every stage ran and produced output.' },
    loopAgeMs: 18 * 60_000,
    computedAt: '2026-08-28T11:58:00.000Z',
    now: NOW,
    ...over,
  };
}

const cellsById = (cells: ReturnType<typeof buildTruthStrip>) =>
  Object.fromEntries(cells.map((c) => [c.id, c]));

describe('Truth Strip — the shape contract', () => {
  it('always renders five cells, in a stable order', () => {
    const cells = buildTruthStrip(input());
    expect(cells.map((c) => c.id)).toEqual([
      'production',
      'incidents',
      'self-heal',
      'observation',
      'repair',
    ]);
  });

  it('every cell states a freshness — never a blank, which would read as current', () => {
    const cells = buildTruthStrip(
      input({ deploy: DEPLOY_UNKNOWN, loop: null, loopAgeMs: null }),
    );
    for (const cell of cells) {
      expect(cell.freshness.trim().length, `${cell.id} has no freshness`).toBeGreaterThan(0);
    }
  });

  it('every cell states its state as a WORD, so colour is never the only signal', () => {
    for (const cell of buildTruthStrip(input())) {
      expect(cell.state.trim().length, `${cell.id} has no state word`).toBeGreaterThan(0);
    }
  });
});

describe('Truth Strip — no all-clear while a source is blind', () => {
  it('zero incidents with every source reading IS an all clear', () => {
    const cells = cellsById(buildTruthStrip(input({ incidents: [], coverage: READING })));
    expect(cells.incidents!.state).toBe('ALL CLEAR');
    expect(cells.incidents!.tone).toBe('success');
  });

  it('zero incidents with a BLIND source is not', () => {
    // THE test. If someone lets a blind source fall through to the same
    // branch as a readable one, this goes red — and the Bridge starts
    // converting a broken read into a green screen, which is the single most
    // damaging empty state a monitoring surface can show.
    const cells = cellsById(buildTruthStrip(input({ incidents: [], coverage: BLIND })));
    expect(cells.incidents!.state).not.toBe('ALL CLEAR');
    expect(cells.incidents!.tone).not.toBe('success');
    expect(cells.incidents!.detail).toContain('sentry');
  });

  it('the observation cell names the blind source and never reads success', () => {
    const cells = cellsById(buildTruthStrip(input({ coverage: BLIND })));
    expect(cells.observation!.state).toBe('BLIND SOURCE');
    expect(cells.observation!.tone).toBe('danger');
    expect(cells.observation!.detail).toContain('sentry');
  });
});

describe('Truth Strip — counts match what the Incidents tab lists', () => {
  it('counts actionable, unclosed incidents only', () => {
    const cells = cellsById(
      buildTruthStrip(
        input({
          incidents: [
            incident({ id: 'a', state: 'new' }),
            incident({ id: 'b', state: 'repairable' }),
            // Closed and non-defect are excluded — they are not what the tab
            // lists by default, and chrome that disagrees with the screen it
            // links to is worse than no number at all.
            incident({ id: 'c', state: 'resolved' }),
            incident({ id: 'd', state: 'not-a-defect', actionable: false }),
            // A QA fixture round stays `actionable: true` (so it still
            // renders, badged, in the default feed) but must not inflate
            // this count either — catalogued defect (h).
            incident({ id: 'e', state: 'new', actionable: true, isFixture: true }),
          ],
        }),
      ),
    );
    expect(cells.incidents!.value).toBe('2');
  });

  it('a regression outranks a plain actionable count', () => {
    const cells = cellsById(
      buildTruthStrip(input({ incidents: [incident({ id: 'r', state: 'regressed' })] })),
    );
    expect(cells.incidents!.state).toBe('REGRESSION');
    expect(cells.incidents!.tone).toBe('danger');
  });

  it('a critical incident outranks a regression', () => {
    const cells = cellsById(
      buildTruthStrip(
        input({
          incidents: [
            incident({ id: 'r', state: 'regressed' }),
            incident({ id: 'c', state: 'new', severity: 'critical' }),
          ],
        }),
      ),
    );
    expect(cells.incidents!.state).toBe('CRITICAL OPEN');
  });
});

describe('Truth Strip — a failed repair lookup is not an empty queue', () => {
  it('reports LOOKUP FAILED rather than an idle queue when GitHub was unreadable', () => {
    const unknownRepair = incident({
      id: 'u',
      state: 'diagnosing',
      repair: {
        status: 'unknown',
        prNumber: null,
        prUrl: null,
        branch: null,
        checks: null,
        mergedAt: null,
        mergeSha: null,
        note: 'lookup failed',
      },
    });
    const cells = cellsById(buildTruthStrip(input({ incidents: [unknownRepair] })));
    expect(cells.repair!.state).toBe('LOOKUP FAILED');
    expect(cells.repair!.detail).toContain('lookup failed');
  });

  it('an genuinely empty queue reads IDLE, not a failure', () => {
    const cells = cellsById(buildTruthStrip(input({ incidents: [incident({ id: 'x' })] })));
    expect(cells.repair!.state).toBe('IDLE');
  });

  it('counts repairable, open PRs and awaiting-proof separately', () => {
    const cells = cellsById(
      buildTruthStrip(
        input({
          incidents: [
            incident({ id: 'p1', state: 'repairable' }),
            incident({
              id: 'p2',
              state: 'pr-open',
              repair: {
                status: 'pr-open',
                prNumber: 1660,
                prUrl: 'https://github.com/x/y/pull/1660',
                branch: null,
                checks: { total: 6, passed: 5, failed: 0, pending: 1 },
                mergedAt: null,
                mergeSha: null,
                note: null,
              },
            }),
            incident({ id: 'p3', state: 'awaiting-proof' }),
          ],
        }),
      ),
    );
    expect(cells.repair!.value).toBe('1');
    expect(cells.repair!.detail).toContain('1 PR open');
    expect(cells.repair!.detail).toContain('1 awaiting proof');
  });
});

describe('Truth Strip — unknown never renders as healthy', () => {
  it('an unreadable deploy is neutral, never success', () => {
    const cells = cellsById(buildTruthStrip(input({ deploy: DEPLOY_UNKNOWN })));
    expect(cells.production!.state).toBe('UNKNOWN');
    expect(cells.production!.tone).not.toBe('success');
    expect(cells.production!.freshness).toBe('age unknown');
  });

  it('an unreadable self-heal loop says so rather than going quiet', () => {
    const cells = cellsById(buildTruthStrip(input({ loop: null, loopAgeMs: null })));
    expect(cells['self-heal']!.state).toBe('UNREADABLE');
    expect(cells['self-heal']!.tone).not.toBe('success');
  });

  it('a loop that runs but has never produced output is not success', () => {
    // "The process ran" is not "the system works" — the exact gap the Repair
    // stage sat in for a day while every heartbeat was green.
    const cells = cellsById(
      buildTruthStrip(
        input({
          loop: {
            tone: 'warning',
            label: 'Running, unproven',
            detail: 'Repair has never opened a pull request.',
          },
        }),
      ),
    );
    expect(cells['self-heal']!.tone).toBe('warning');
    expect(cells['self-heal']!.state).not.toBe('PROVEN');
  });
});

describe('ageWords', () => {
  it('never returns a blank for an unknown age', () => {
    expect(ageWords(null)).toBe('age unknown');
    expect(ageWords(Number.NaN)).toBe('age unknown');
    // Clock skew. A future timestamp is not "just now"; it is a reading we
    // cannot place.
    expect(ageWords(-5_000)).toBe('age unknown');
  });

  it('scales through minutes, hours and days', () => {
    expect(ageWords(30_000)).toBe('just now');
    expect(ageWords(18 * 60_000)).toBe('18m ago');
    expect(ageWords(5 * 3_600_000)).toBe('5h ago');
    expect(ageWords(4 * 24 * 3_600_000)).toBe('4d ago');
  });
});

// ---------------------------------------------------------------------------
// The self-heal cell carries THROUGHPUT, and throughput can only make it worse.
// ---------------------------------------------------------------------------

describe('Truth Strip — the self-heal cell and the loop’s flow', () => {
  function flow(stalled: number, waiting = stalled, unknown = 0): FlowSummary {
    const state = stalled > 0 ? 'stalled' : waiting > 0 ? 'flowing' : 'idle';
    return {
      stages: [
        { stageId: 'triage', title: 'Diagnose', waiting, stalled, oldestWaitingMs: 3 * 86_400_000, unmeasured: 0, state },
        { stageId: 'repair', title: 'Repair', waiting: 0, stalled: 0, oldestWaitingMs: null, unmeasured: 0, state: 'idle' },
        { stageId: 'close', title: 'Close', waiting: 0, stalled: 0, oldestWaitingMs: null, unmeasured: 0, state: 'idle' },
      ],
      waiting,
      stalled,
      unknown,
      byPosition: {
        diagnose: waiting,
        repair: 0,
        close: 0,
        review: 0,
        deploy: 0,
        traffic: 0,
        owner: 0,
        done: 0,
        unknown,
      },
    };
  }

  it('escalates a healthy loop to STALLED when incidents have waited past a stage’s cycles', () => {
    const cell = cellsById(buildTruthStrip(input({ flow: flow(2) })))['self-heal']!;
    expect(cell.state).toBe('2 STALLED');
    expect(cell.tone).toBe('warning');
    expect(cell.href).toBe('/admin/errors?lens=stalled');
    expect(cell.detail).toMatch(/2 incidents have waited/);
    expect(cell.detail).toMatch(/2 on Diagnose/);
    // The runtime/capability sentence is kept, not replaced — this is a third
    // fact beside the other two, not a substitute for them.
    expect(cell.detail).toContain('Every stage ran and produced output.');
  });

  it('never softens a failing loop — danger keeps its own word and tone', () => {
    const cell = cellsById(
      buildTruthStrip(
        input({
          loop: { tone: 'danger', label: 'Overdue', detail: 'A stage missed its schedule.' },
          flow: flow(2),
        }),
      ),
    )['self-heal']!;
    expect(cell.state).toBe('DANGER');
    expect(cell.tone).toBe('danger');
    expect(cell.href).toBe('/admin/self-heal');
    expect(cell.detail).toMatch(/2 incidents have waited/);
  });

  it('keeps PROVEN when work is waiting inside its cycles', () => {
    const cell = cellsById(buildTruthStrip(input({ flow: flow(0, 3) })))['self-heal']!;
    expect(cell.state).toBe('PROVEN');
    expect(cell.tone).toBe('success');
    expect(cell.detail).toMatch(/3 incidents are waiting/);
  });

  it('carries the backlog even when the heartbeats could not be read', () => {
    const cell = cellsById(buildTruthStrip(input({ loop: null, flow: flow(1) })))['self-heal']!;
    expect(cell.state).toBe('UNREADABLE');
    expect(cell.tone).toBe('neutral');
    expect(cell.detail).toMatch(/1 incident has waited/);
  });

  it('is unchanged when no flow is supplied', () => {
    const withFlow = cellsById(buildTruthStrip(input({ flow: null })))['self-heal']!;
    const without = cellsById(buildTruthStrip(input()))['self-heal']!;
    expect(withFlow).toEqual(without);
    expect(without.state).toBe('PROVEN');
  });
});

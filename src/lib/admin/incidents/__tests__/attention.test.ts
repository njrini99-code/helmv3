// =============================================================================
// "Needs your eyes" — the queue that ranks by what the EVIDENCE says needs a
// human, not by severity alone. Reuses `lifecycle.ts`'s own state vocabulary
// and `sources.ts`'s coverage summary rather than re-deriving either.
//
// Three behaviours are load-bearing and pinned here: ONE row per incident at
// its worst reason (never a duplicate for a fault that is both regressed and
// critical), a failed READ never treated as a fact to act on
// (`repair.status === 'unknown'` must not manufacture "no repair attempted"),
// and exactly one `source-blind` row no matter how many incidents a blind
// source touches.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  ATTENTION_PRIORITY,
  PROOF_OVERDUE_MS,
  selectAttention,
  type AttentionReason,
  type AttentionRow,
} from '@/lib/admin/incidents/attention';
import type { CoverageSummary } from '@/lib/admin/incidents/sources';
import type { SelfHealStageDetail } from '@/lib/admin/data/selfheal';
import type { ProofGap, UnifiedIncident } from '@/lib/admin/incidents/types';

const NOW = Date.parse('2026-08-28T12:00:00.000Z');

function baseIncident(id: string): UnifiedIncident {
  return {
    id,
    linkTarget: `/admin/errors/${id}`,
    title: `incident ${id}`,
    description: `incident ${id}`,
    severity: 'error',
    lifecycle: { state: 'new', headline: 'New — not yet analysed.', because: [] },
    firstSeen: '2026-08-28T00:00:00.000Z',
    lastSeen: '2026-08-28T00:00:00.000Z',
    occurrences: 1,
    affectedUsers: 0,
    affectedUsersKnown: false,
    sources: [],
    corroboration: 1,
    appFingerprints: [id],
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
    computedAt: '2026-08-28T00:00:00.000Z',
  };
}

function incident(id: string, overrides: Partial<UnifiedIncident> = {}): UnifiedIncident {
  return { ...baseIncident(id), ...overrides };
}

function baseStage(id: string): SelfHealStageDetail {
  return {
    id,
    jobType: `job-${id}`,
    step: 1,
    title: `Stage ${id}`,
    runner: 'vercel-cron',
    cadenceMinutes: 1440,
    what: 'does the thing',
    contract: 'docs/x.md',
    status: 'ok',
    lastRunAt: '2026-08-28T00:00:00.000Z',
    lastRunStatus: 'completed',
    lastError: null,
    unreadable: false,
    capability: { stageId: id, state: 'proven', evidence: 'proven evidence', provenAt: '2026-08-28T00:00:00.000Z' },
    history: [],
    nextExpectedAt: null,
  };
}

function stage(id: string, overrides: Partial<SelfHealStageDetail> = {}): SelfHealStageDetail {
  return { ...baseStage(id), ...overrides };
}

function coverage(overrides: Partial<CoverageSummary> = {}): CoverageSummary {
  return {
    reading: 4,
    partial: 0,
    blind: 0,
    unknown: 0,
    total: 4,
    anyBlind: false,
    blindSources: [],
    oldestAgeMs: 1000,
    worst: 'reading',
    ...overrides,
  };
}

const gap = (kind: ProofGap['kind'], detail: string, ageMs: number | null): ProofGap => ({ kind, detail, ageMs });

describe('selectAttention — one row per incident, at its worst reason', () => {
  it('an incident that is both regressed and critical yields ONE row, as regression', () => {
    const inc = incident('a', {
      severity: 'critical',
      lifecycle: {
        state: 'regressed',
        headline: 'Fixed 6 days ago, returned 14 minutes ago.',
        because: [],
      },
      lastSeen: new Date(NOW - 14 * 60_000).toISOString(),
    });
    const rows = selectAttention({ incidents: [inc], stages: [], coverage: coverage(), now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBe('regression');
    expect(rows[0]!.why).toBe('Fixed 6 days ago, returned 14 minutes ago.');
  });
});

describe('selectAttention — a failed read is never treated as a fact to act on', () => {
  it('does not produce repairable-untouched when repair.status is unknown', () => {
    // A failed GitHub lookup is not evidence that no repair was attempted.
    // Demanding action on a fact we could not read teaches an operator to
    // distrust the whole list.
    const inc = incident('a', {
      lifecycle: { state: 'repairable', headline: 'h', because: [] },
      repair: {
        status: 'unknown',
        prNumber: null,
        prUrl: null,
        branch: null,
        checks: null,
        mergedAt: null,
        mergeSha: null,
        note: null,
      },
    });
    const rows = selectAttention({ incidents: [inc], stages: [], coverage: coverage(), now: NOW });
    expect(rows.find((r) => r.reason === 'repairable-untouched')).toBeUndefined();
    expect(rows).toHaveLength(0);
  });

  it('DOES produce repairable-untouched when repair is null or status is none', () => {
    const rowsNull = selectAttention({
      incidents: [incident('a', { lifecycle: { state: 'repairable', headline: 'h', because: [] }, repair: null })],
      stages: [],
      coverage: coverage(),
      now: NOW,
    });
    expect(rowsNull[0]!.reason).toBe('repairable-untouched');

    const rowsNone = selectAttention({
      incidents: [
        incident('b', {
          lifecycle: { state: 'repairable', headline: 'h', because: [] },
          repair: {
            status: 'none',
            prNumber: null,
            prUrl: null,
            branch: null,
            checks: null,
            mergedAt: null,
            mergeSha: null,
            note: null,
          },
        }),
      ],
      stages: [],
      coverage: coverage(),
      now: NOW,
    });
    expect(rowsNone[0]!.reason).toBe('repairable-untouched');
  });
});

describe('selectAttention — stage-dead', () => {
  it('produces a distinct why for each dead-stage cause, and the unreadable one mentions reading, not breakage', () => {
    const failed = stage('failed', { status: 'failed', lastError: 'boom' });
    const overdue = stage('overdue', { status: 'overdue' });
    const neverRan = stage('never-ran', { status: 'never-ran', lastRunAt: null });
    const unreadable = stage('unreadable', { unreadable: true, status: 'never-ran', lastRunAt: null });
    const unproven = stage('unproven', {
      status: 'ok',
      capability: {
        stageId: 'unproven',
        state: 'unproven',
        evidence: 'Repair has never opened a pull request.',
        provenAt: null,
      },
    });

    const rows = selectAttention({
      incidents: [],
      stages: [failed, overdue, neverRan, unreadable, unproven],
      coverage: coverage(),
      now: NOW,
    });

    expect(rows.every((r) => r.reason === 'stage-dead')).toBe(true);

    const byKey = new Map(rows.map((r) => [r.key, r]));
    const whys = rows.map((r) => r.why);
    // All five reasons carry a distinct sentence — none may be flattened
    // into a shared "the stage is broken" string.
    expect(new Set(whys).size).toBe(whys.length);

    const unreadableWhy = byKey.get('stage:unreadable')!.why;
    expect(unreadableWhy.toLowerCase()).toMatch(/read/);
    expect(unreadableWhy.toLowerCase()).not.toMatch(/broken/);
  });

  it('does not double-count a stage that is both failing and unproven — one row, from status', () => {
    const dead = stage('dead', {
      status: 'failed',
      capability: { stageId: 'dead', state: 'unproven', evidence: 'never produced output', provenAt: null },
    });
    const rows = selectAttention({ incidents: [], stages: [dead], coverage: coverage(), now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe('FAILED');
  });

  it('a healthy, proven stage produces no row', () => {
    const rows = selectAttention({ incidents: [], stages: [stage('ok')], coverage: coverage(), now: NOW });
    expect(rows).toHaveLength(0);
  });
});

describe('selectAttention — source-blind is named once', () => {
  it('emits exactly one row regardless of incident count, naming the blind sources', () => {
    const incidents = [incident('a'), incident('b'), incident('c')];
    const rows = selectAttention({
      incidents,
      stages: [],
      coverage: coverage({ anyBlind: true, blindSources: ['sentry', 'vercel'] }),
      now: NOW,
    });
    const blindRows = rows.filter((r) => r.reason === 'source-blind');
    expect(blindRows).toHaveLength(1);
    expect(blindRows[0]!.why).toMatch(/SENTRY/);
    expect(blindRows[0]!.why).toMatch(/VERCEL/);
  });

  it('emits no source-blind row when nothing is blind', () => {
    const rows = selectAttention({ incidents: [], stages: [], coverage: coverage(), now: NOW });
    expect(rows.find((r) => r.reason === 'source-blind')).toBeUndefined();
  });
});

describe('selectAttention — proof-overdue boundary', () => {
  it('fires strictly above PROOF_OVERDUE_MS and not at or below it', () => {
    const below = incident('below', {
      lifecycle: { state: 'awaiting-proof', headline: 'h', because: [] },
      proofGaps: [gap('awaiting-traffic', 'live 10h', PROOF_OVERDUE_MS - 1)],
    });
    const atBoundary = incident('at', {
      lifecycle: { state: 'awaiting-proof', headline: 'h', because: [] },
      proofGaps: [gap('awaiting-traffic', 'live exactly', PROOF_OVERDUE_MS)],
    });
    const above = incident('above', {
      lifecycle: { state: 'awaiting-proof', headline: 'h', because: [] },
      proofGaps: [gap('awaiting-traffic', 'live 50h', PROOF_OVERDUE_MS + 1)],
    });

    const rowsBelow = selectAttention({ incidents: [below], stages: [], coverage: coverage(), now: NOW });
    const rowsAt = selectAttention({ incidents: [atBoundary], stages: [], coverage: coverage(), now: NOW });
    const rowsAbove = selectAttention({ incidents: [above], stages: [], coverage: coverage(), now: NOW });

    expect(rowsBelow).toHaveLength(0);
    expect(rowsAt).toHaveLength(0);
    expect(rowsAbove).toHaveLength(1);
    expect(rowsAbove[0]!.reason).toBe('proof-overdue');
    expect(rowsAbove[0]!.ageMs).toBe(PROOF_OVERDUE_MS + 1);
  });

  it('ignores an awaiting-traffic gap with an unknown age, even if old evidence suggests it is stale', () => {
    const inc = incident('a', {
      lifecycle: { state: 'awaiting-proof', headline: 'h', because: [] },
      proofGaps: [gap('awaiting-traffic', 'age unknown', null)],
    });
    const rows = selectAttention({ incidents: [inc], stages: [], coverage: coverage(), now: NOW });
    expect(rows).toHaveLength(0);
  });

  it('does not fire for gap kinds other than awaiting-traffic / awaiting-deploy', () => {
    const inc = incident('a', {
      lifecycle: { state: 'awaiting-proof', headline: 'h', because: [] },
      proofGaps: [gap('awaiting-ci', 'checks pending', PROOF_OVERDUE_MS + 1000)],
    });
    const rows = selectAttention({ incidents: [inc], stages: [], coverage: coverage(), now: NOW });
    expect(rows).toHaveLength(0);
  });
});

describe('ATTENTION_PRIORITY', () => {
  it('contains every reason exactly once', () => {
    const expected: AttentionReason[] = [
      'regression',
      'critical',
      'stage-dead',
      'repair-ci-failed',
      'repairable-untouched',
      'needs-evidence',
      'platform-attention',
      'proof-overdue',
      'platform-watch',
      'source-blind',
    ];
    expect(ATTENTION_PRIORITY).toHaveLength(expected.length);
    expect(new Set(ATTENTION_PRIORITY).size).toBe(expected.length);
    expect(new Set(ATTENTION_PRIORITY)).toEqual(new Set(expected));
  });

  it('drives the sort — one row of each reason lands in ATTENTION_PRIORITY order', () => {
    const incidents: UnifiedIncident[] = [
      incident('critical', { severity: 'critical', lifecycle: { state: 'new', headline: 'h', because: [] } }),
      incident('regression', {
        lifecycle: { state: 'regressed', headline: 'h', because: [] },
      }),
      incident('repair-ci-failed', {
        lifecycle: { state: 'pr-failed', headline: 'h', because: [] },
        repair: {
          status: 'pr-failed',
          prNumber: 1,
          prUrl: null,
          branch: null,
          checks: null,
          mergedAt: null,
          mergeSha: null,
          note: null,
        },
      }),
      incident('repairable-untouched', {
        lifecycle: { state: 'repairable', headline: 'h', because: [] },
        repair: null,
      }),
      incident('needs-evidence', { lifecycle: { state: 'needs-evidence', headline: 'h', because: [] } }),
      incident('proof-overdue', {
        lifecycle: { state: 'awaiting-proof', headline: 'h', because: [] },
        proofGaps: [gap('awaiting-traffic', 'd', PROOF_OVERDUE_MS + 1000)],
      }),
    ];
    const stages = [stage('dead', { status: 'failed' })];
    // The briefing's two severities are rows in this same queue, so they take
    // part in this ordering rather than living in a second list.
    const briefing = [
      { severity: 'attention' as const, headline: 'a cron is overdue', href: null },
      { severity: 'watch' as const, headline: 'signups drifting', href: null },
    ];

    const rows = selectAttention(
      {
        incidents,
        stages,
        coverage: coverage({ anyBlind: true, blindSources: ['app'] }),
        now: NOW,
        briefing,
      },
      20,
    );

    expect(rows.map((r) => r.reason)).toEqual(ATTENTION_PRIORITY);
  });
});

describe('selectAttention — non-vacuity', () => {
  it('produces at least five distinct reasons for a realistic mixed fixture', () => {
    const rows = selectAttention(
      {
        incidents: [
          incident('regression', { lifecycle: { state: 'regressed', headline: 'h', because: [] } }),
          incident('needs-evidence', { lifecycle: { state: 'needs-evidence', headline: 'h', because: [] } }),
          incident('repairable', {
            lifecycle: { state: 'repairable', headline: 'h', because: [] },
            repair: null,
          }),
          incident('proof', {
            lifecycle: { state: 'awaiting-proof', headline: 'h', because: [] },
            proofGaps: [gap('awaiting-deploy', 'd', PROOF_OVERDUE_MS + 1)],
          }),
        ],
        stages: [stage('dead', { status: 'overdue' })],
        coverage: coverage({ anyBlind: true, blindSources: ['app'] }),
        now: NOW,
      },
      20,
    );
    const distinctReasons = new Set(rows.map((r) => r.reason));
    expect(distinctReasons.size).toBeGreaterThanOrEqual(5);
  });
});

describe('selectAttention — limit', () => {
  it('defaults to a small number of rows and honours an explicit limit', () => {
    const incidents = Array.from({ length: 12 }, (_, i) =>
      incident(`n${i}`, { severity: 'critical', lifecycle: { state: 'new', headline: 'h', because: [] } }),
    );
    const defaultRows = selectAttention({ incidents, stages: [], coverage: coverage(), now: NOW });
    expect(defaultRows.length).toBeLessThanOrEqual(8);

    const limited = selectAttention({ incidents, stages: [], coverage: coverage(), now: NOW }, 3);
    expect(limited).toHaveLength(3);
  });
});

// Sanity: nothing in this module reaches for the wall clock — `now` is
// always the injected value, never `Date.now()`. This is a smoke check, not
// a substitute for reading the source, but it catches the easy regression:
// two calls with the same frozen `now` must be byte-for-byte identical.
describe('selectAttention — purity', () => {
  it('is deterministic for the same input and now', () => {
    const input = {
      incidents: [incident('a', { lifecycle: { state: 'regressed', headline: 'h', because: [] } })],
      stages: [stage('s', { status: 'failed' })],
      coverage: coverage({ anyBlind: true, blindSources: ['sentry'] }),
      now: NOW,
    };
    const first: AttentionRow[] = selectAttention(input, 20);
    const second: AttentionRow[] = selectAttention(input, 20);
    expect(second).toEqual(first);
  });
});

describe('platform checks share the one attention queue', () => {
  const base = {
    incidents: [] as UnifiedIncident[],
    stages: [],
    coverage: coverage({ anyBlind: false, blindSources: [] }),
    now: NOW,
  };

  it('turns briefing items into rows', () => {
    const rows = selectAttention({
      ...base,
      briefing: [
        { severity: 'attention', headline: 'a cron is overdue', href: '/admin/crons' },
        { severity: 'watch', headline: 'signups drifting', href: null },
      ],
    });
    expect(rows.map((r) => r.reason)).toEqual(['platform-attention', 'platform-watch']);
    expect(rows[0]!.headline).toBe('a cron is overdue');
    expect(rows[0]!.href).toBe('/admin/crons');
    // No timestamp exists on a briefing item, and inventing one would float
    // every check to the top of its band.
    expect(rows[0]!.ageMs).toBeNull();
  });

  it('ranks a failing platform check below the loop being dead, above a watch', () => {
    const rows = selectAttention({
      ...base,
      stages: [stage('dead', { status: 'failed' })],
      briefing: [
        { severity: 'watch', headline: 'w', href: null },
        { severity: 'attention', headline: 'a', href: null },
      ],
    });
    expect(rows.map((r) => r.reason)).toEqual([
      'stage-dead',
      'platform-attention',
      'platform-watch',
    ]);
  });

  it('is absent, not empty, when no briefing is supplied', () => {
    expect(selectAttention(base)).toEqual([]);
  });
});

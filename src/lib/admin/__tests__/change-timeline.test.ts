// =============================================================================
// The Change Timeline builder — one pure function of four already-fetched
// sources (`buildChangeTimeline`), tested in isolation from the network,
// Supabase, and GitHub reads `fetchChangeTimeline` wraps it in.
//
// Every fixture below is a COMPLETE object built from a `make*` factory with
// only the fields a scenario cares about overridden — so a test cannot pass
// by accident because some unrelated field defaulted to something
// convenient. This mirrors the fixture style already used in
// `incidents/__tests__/lens.test.ts` and `incidents/__tests__/proof.test.ts`.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  buildChangeTimeline,
  DEFAULT_WINDOW_MS,
  INCIDENT_EVENT_CAP,
  type ChangeTimelineInput,
} from '@/lib/admin/data/change-timeline';
import { DEFAULT_INCIDENT_WINDOW_HOURS } from '@/lib/admin/data/incident-feed';
import type { UnifiedIncident, IncidentAnalysis } from '@/lib/admin/incidents/types';
import type { VercelDeployment } from '@/lib/admin/vercel-api';
import type { WorkLogEntry } from '@/lib/admin/github-pr-timeline';
import type { ArchivedResolution } from '@/lib/admin/data/resolutions';

const NOW = Date.parse('2026-08-28T12:00:00.000Z');
const NOW_ISO = new Date(NOW).toISOString();

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 3600_000).toISOString();
}

function baseInput(overrides: Partial<ChangeTimelineInput> = {}): ChangeTimelineInput {
  return {
    deployments: [],
    pullRequests: [],
    incidents: [],
    resolutions: [],
    windowMs: DEFAULT_WINDOW_MS,
    now: NOW,
    ...overrides,
  };
}

function makeIncident(overrides: Partial<UnifiedIncident> & { id: string }): UnifiedIncident {
  return {
    // `id` arrives through the spread at the end; naming it here as well is
    // dead weight the compiler flags (TS2783).
    linkTarget: `/admin/errors/${overrides.id}`,
    title: `Incident ${overrides.id}`,
    description: `Description for ${overrides.id}`,
    severity: 'error',
    lifecycle: { state: 'new', headline: 'h', because: [] },
    firstSeen: NOW_ISO,
    lastSeen: NOW_ISO,
    occurrences: 1,
    affectedUsers: 0,
    affectedUsersKnown: false,
    sources: [],
    corroboration: 1,
    appFingerprints: [overrides.id],
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
    computedAt: NOW_ISO,
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<IncidentAnalysis> = {}): IncidentAnalysis {
  return {
    category: 'fix-here',
    probableCause: 'A null check is missing.',
    suggestedFix: 'FIX HERE — add a null guard.',
    confidence: 'high',
    suspectFiles: [],
    relatedFingerprints: [],
    model: 'test-model',
    generatedAt: NOW_ISO,
    repairVerdict: 'not-reviewed',
    ...overrides,
  };
}

function makeDeployment(
  overrides: Partial<VercelDeployment> & { createdAt: number },
): VercelDeployment {
  return {
    uid: 'dpl_test',
    state: 'READY',
    ready: overrides.createdAt,
    target: 'production',
    url: 'helmv3.vercel.app',
    commitSha: null,
    commitMessage: null,
    commitRef: null,
    commitAuthor: null,
    ...overrides,
  };
}

function makeEntry(
  overrides: Partial<WorkLogEntry> & { number: number; created_at: string },
): WorkLogEntry {
  return {
    html_url: `https://github.com/org/repo/pull/${overrides.number}`,
    title: `PR ${overrides.number}`,
    state: 'merged',
    authorLogin: 'agent',
    updated_at: overrides.created_at,
    merged_at: null,
    closed_at: null,
    parsed: {
      summary: null,
      partnerSummary: null,
      problem: null,
      fix: null,
      area: 'bridge',
      timelineNote: null,
      changeTypes: [],
    },
    repairIncidentIds: [],
    repairVerdict: 'not-reviewed',
    ...overrides,
  };
}

function makeResolution(
  overrides: Partial<ArchivedResolution> & { fingerprint: string; resolvedAt: string },
): ArchivedResolution {
  return {
    resolvedBy: 'agent',
    resolutionSource: 'auto',
    prNumber: null,
    prUrl: null,
    fixedInSha: null,
    note: null,
    lastSeenAtResolution: null,
    reopenedAt: null,
    reopenedCount: 0,
    createdAt: overrides.resolvedAt,
    updatedAt: overrides.resolvedAt,
    shipStatus: 'unknown',
    regressed: false,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------

describe('buildChangeTimeline — window', () => {
  it('drops events older than now - windowMs and keeps events inside it', () => {
    const windowMs = 24 * 3600_000;
    const input = baseInput({
      windowMs,
      deployments: [
        makeDeployment({ createdAt: NOW - 1 * 3600_000, commitSha: 'insidewind01' }), // 1h ago — inside
        makeDeployment({ createdAt: NOW - 100 * 3600_000, commitSha: 'outsidewin02' }), // 100h ago — outside
      ],
    });

    const events = buildChangeTimeline(input);

    expect(events).toHaveLength(1);
    expect(events[0]?.ref).toBe('insidew');
  });
});

describe('buildChangeTimeline — unreadable sources are absent, not zero', () => {
  it('null deployments and empty-array deployments produce the SAME events', () => {
    // The pure builder cannot tell "Vercel was unreachable" from "Vercel had
    // nothing to report" apart — both must yield zero deploy events, because
    // this function returns only a flat `ChangeEvent[]` with no per-source
    // health travelling alongside it. The DIFFERENCE between the two is
    // carried one level up, in `ChangeTimelineSnapshot.unreadable`, which
    // only `fetchChangeTimeline` (the I/O wrapper, not tested here) can
    // populate. A reader of `buildChangeTimeline`'s output alone should not
    // have to guess which case produced it — that is the design, not a gap.
    const withNull = baseInput({ deployments: null });
    const withEmpty = baseInput({ deployments: [] });

    expect(buildChangeTimeline(withEmpty)).toEqual(buildChangeTimeline(withNull));
  });
});

describe('buildChangeTimeline — ordering', () => {
  it('sorts newest first and breaks ties deterministically by kind priority', () => {
    const tieAt = hoursAgo(2);
    const input = baseInput({
      deployments: [
        makeDeployment({ createdAt: NOW - 2 * 3600_000, commitSha: 'deadbeef01', state: 'READY' }),
      ],
      pullRequests: [
        makeEntry({
          number: 42,
          title: 'fix(bridge): tie test',
          created_at: hoursAgo(3),
          merged_at: tieAt,
        }),
      ],
    });

    const first = buildChangeTimeline(input);
    const second = buildChangeTimeline(input);

    // Determinism: the same input produces byte-identical output every time.
    expect(second).toEqual(first);

    expect(first.map((e) => e.kind)).toEqual(['deploy', 'pr-merged', 'pr-opened']);
    const tied = first.filter((e) => e.at === tieAt);
    expect(tied.map((e) => e.kind)).toEqual(['deploy', 'pr-merged']);
  });
});

describe('buildChangeTimeline — regressions outrank resolutions', () => {
  it('a regression is tone:danger and sorts above a resolution at the same instant', () => {
    const tieAt = hoursAgo(5);
    const input = baseInput({
      resolutions: [
        makeResolution({ fingerprint: 'fp-resolved', resolvedAt: tieAt, resolutionSource: 'manual' }),
        makeResolution({
          fingerprint: 'fp-regressed',
          resolvedAt: hoursAgo(40),
          resolutionSource: 'auto',
          reopenedAt: tieAt,
          reopenedCount: 2,
        }),
      ],
    });

    const events = buildChangeTimeline(input);
    const tied = events.filter((e) => e.at === tieAt);

    expect(tied.map((e) => e.kind)).toEqual(['regressed', 'resolved']);
    expect(tied[0]?.tone).toBe('danger');
  });
});

describe('buildChangeTimeline — the incident-first-seen cap', () => {
  it('produces exactly INCIDENT_EVENT_CAP incident events when more than that many fired', () => {
    const many: UnifiedIncident[] = Array.from({ length: INCIDENT_EVENT_CAP + 5 }, (_, i) =>
      makeIncident({ id: `inc-${i}`, firstSeen: hoursAgo(i + 1), severity: 'error' }),
    );

    const events = buildChangeTimeline(baseInput({ incidents: many }));
    const firstSeenEvents = events.filter((e) => e.kind === 'incident-first-seen');

    expect(firstSeenEvents).toHaveLength(INCIDENT_EVENT_CAP);
  });
});

describe('buildChangeTimeline — never infers causality', () => {
  // A deploy sitting next to an incident on this rail is a TEMPORAL
  // NEIGHBOUR, not a cause — the whole reason this module exists is to let
  // an operator see the sequence without the strip itself drawing the
  // causal line for them. This test is what keeps a convenient future
  // wording ("this deploy caused the incident below it") from slipping in.
  it('no title or detail claims one event caused another', () => {
    const events = buildChangeTimeline(mixedFixture());
    expect(events.length).toBeGreaterThan(0);

    for (const event of events) {
      expect(event.title).not.toMatch(/caused by|because of/i);
      if (event.detail) expect(event.detail).not.toMatch(/caused by|because of/i);
    }
  });
});

describe('buildChangeTimeline — non-vacuity', () => {
  it('a mixed fixture produces at least 4 distinct event kinds', () => {
    const events = buildChangeTimeline(mixedFixture());
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it('excludes a merged PR that is neither repair-linked nor titled fix(...)', () => {
    // Locks down the PR-selection rule documented in change-timeline.ts:
    // `isRepairWork` admits `repairIncidentIds.length > 0` OR a `fix(...)`
    // title, and nothing else — an ordinary feature PR must never appear.
    const events = buildChangeTimeline(mixedFixture());
    expect(events.some((e) => e.ref === '#101')).toBe(false);
    expect(events.some((e) => e.ref === '#100')).toBe(true);
  });
});

/** One fixture exercising every source at once: two deploys (one failed),
 *  a repair PR opened and merged, an unrelated feature PR (must be
 *  excluded), an incident with an analysis, and its resolution. */
function mixedFixture(): ChangeTimelineInput {
  return baseInput({
    deployments: [
      makeDeployment({
        createdAt: NOW - 1 * 3600_000,
        commitSha: 'cafebabe01',
        commitMessage: 'Ship the qualifier fix',
        state: 'READY',
      }),
      makeDeployment({
        createdAt: NOW - 50 * 3600_000,
        commitSha: 'deadbeef02',
        commitMessage: 'Broken build',
        state: 'ERROR',
      }),
    ],
    pullRequests: [
      makeEntry({
        number: 100,
        title: 'fix(selfheal): repair qualifier crash',
        created_at: hoursAgo(6),
        merged_at: hoursAgo(2),
      }),
      makeEntry({
        number: 101,
        title: 'feat(golf): add new dashboard widget',
        created_at: hoursAgo(6),
        merged_at: hoursAgo(3),
      }),
    ],
    incidents: [
      makeIncident({
        id: 'fp-crash',
        title: 'Qualifier crash on save',
        firstSeen: hoursAgo(10),
        severity: 'critical',
        analysis: makeAnalysis({ generatedAt: hoursAgo(8) }),
      }),
    ],
    resolutions: [makeResolution({ fingerprint: 'fp-crash', resolvedAt: hoursAgo(1), resolutionSource: 'auto' })],
  });
}

describe('the timeline window and the incident board window must agree', () => {
  /**
   * `fetchChangeTimeline` renders incident-first-seen and analysis events from
   * whatever board its caller passes, but labels the strip with its OWN window.
   * If the board's window is the narrower of the two, those events stop early
   * while the copy still claims the full window — a strip that looks complete
   * and is not.
   *
   * The Overview passes `cachedIncidentBoard(DEFAULT_INCIDENT_WINDOW_HOURS)`,
   * so today the two agree exactly. Nothing structural enforces that: they are
   * two constants in two modules, and this test is what stops them drifting
   * apart silently. If you change one, change the other or pass an explicit
   * window at the call site.
   */
  it('DEFAULT_WINDOW_MS is exactly DEFAULT_INCIDENT_WINDOW_HOURS', () => {
    expect(DEFAULT_WINDOW_MS).toBe(DEFAULT_INCIDENT_WINDOW_HOURS * 60 * 60 * 1000);
  });
});

import { describe, it, expect } from 'vitest';
import type { TriageItem } from '@/lib/admin/data/triage';
import type { CorrelatedSignal } from '@/lib/reliability/types';
import type { IncidentSourceName, SourceHealth } from '../types';
import {
  correlateIncidents,
  correlationKey,
  type CorrelateInput,
  type CorrelationSourceHealth,
} from '../correlate';

// ---------------------------------------------------------------------------
// Fixture builders — every field a real TriageItem/CorrelatedSignal carries,
// with defaults that already correlate with each other (same route, same
// null errorCode, same title) so a test only needs to override what it is
// actually exercising.
// ---------------------------------------------------------------------------

function reportWithStack(hasStack: boolean, title = 'Fixture incident'): string {
  return [
    `# ${title}`,
    '',
    '## Stack trace',
    '',
    hasStack ? '```\nat foo (bar.ts:12)\n```' : '_no stack trace captured_',
    '',
  ].join('\n');
}

function appItem(overrides: Partial<TriageItem> = {}): TriageItem {
  return {
    key: 'app:fp-default',
    origin: 'app',
    title: 'Client error: Load failed',
    severity: 'error',
    sport: 'golf',
    occurrences: 3,
    affectedUsers: 2,
    firstSeen: '2026-08-20T10:00:00.000Z',
    lastSeen: '2026-08-20T12:00:00.000Z',
    permalink: null,
    eventIds: ['e1', 'e2', 'e3'],
    substatus: null,
    source: 'client',
    feature: 'golf-rounds',
    actionName: 'loadRound',
    route: '/api/golf/rounds/load',
    klass: 'defect',
    actionable: true,
    klassReason: 'Unexpected failure (severity-derived)',
    hasDegradedMessage: false,
    errorCode: null,
    description: 'Load failed — while load round',
    hasRca: false,
    isFixture: false,
    fingerprint: 'fp-default',
    report: reportWithStack(true, 'Client error: Load failed'),
    ...overrides,
  };
}

function sentryItem(overrides: Partial<TriageItem> = {}): TriageItem {
  return {
    key: 'sentry:9001',
    origin: 'sentry',
    title: 'Client error: Load failed',
    severity: 'error',
    sport: 'golf',
    occurrences: 5,
    affectedUsers: 4,
    firstSeen: '2026-08-20T09:00:00.000Z',
    lastSeen: '2026-08-20T13:00:00.000Z',
    permalink: 'https://sentry.io/issues/9001',
    eventIds: [],
    substatus: null,
    source: 'sentry',
    feature: 'golf-rounds',
    actionName: null,
    route: '/api/golf/rounds/load',
    klass: 'defect',
    actionable: true,
    klassReason: 'Unexpected failure',
    hasDegradedMessage: false,
    // Real Sentry-origin TriageItems always carry errorCode: null — mergeTriage
    // never attaches admin_events metadata to a Sentry issue.
    errorCode: null,
    description: 'Client error: Load failed',
    hasRca: false,
    isFixture: false,
    fingerprint: null,
    report: reportWithStack(false, 'Client error: Load failed'),
    ...overrides,
  };
}

function signal(overrides: Partial<CorrelatedSignal> = {}): CorrelatedSignal {
  return {
    signature: 'sig-default',
    severity: 'error',
    title: 'Client error: Load failed',
    summary: 'Client error: Load failed',
    route: '/api/golf/rounds/load',
    errorCode: null,
    count: 10,
    firstSeen: '2026-08-20T08:00:00.000Z',
    lastSeen: '2026-08-20T14:00:00.000Z',
    sources: ['supabase'],
    featureId: 'golf-rounds',
    proposedRisk: 'R1',
    evidence: [{ source: 'supabase', ref: 'supabase-ref-default' }],
    ...overrides,
  };
}

function health(
  source: IncidentSourceName,
  h: SourceHealth,
  reason: string | null = null,
): CorrelationSourceHealth {
  return { source, health: h, reason, observedAt: '2026-08-20T14:05:00.000Z' };
}

function input(overrides: Partial<CorrelateInput> = {}): CorrelateInput {
  return { triage: [], reliabilitySignals: [], sourceHealth: [], ...overrides };
}

// ---------------------------------------------------------------------------

describe('correlationKey', () => {
  it('is deterministic for identical inputs', () => {
    const a = correlationKey({ errorCode: 'E1', route: '/x', message: 'boom' });
    const b = correlationKey({ errorCode: 'E1', route: '/x', message: 'boom' });
    expect(a).toBe(b);
  });

  it('changes when errorCode changes, holding route/message fixed', () => {
    const a = correlationKey({ errorCode: 'E1', route: '/x', message: 'boom' });
    const b = correlationKey({ errorCode: 'E2', route: '/x', message: 'boom' });
    expect(a).not.toBe(b);
  });
});

describe('correlateIncidents — cross-source join', () => {
  it('folds an app item and a Sentry item for the same fault into one incident with corroboration 2', () => {
    const app = appItem({ key: 'app:fp-A', fingerprint: 'fp-A' });
    const sentry = sentryItem({ key: 'sentry:9001' });

    const drafts = correlateIncidents(
      input({
        triage: [app, sentry],
        sourceHealth: [health('app', 'reading'), health('sentry', 'reading')],
      }),
    );

    expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;
    expect(draft.id).toBe('fp-A');
    expect(draft.linkTarget).toBe('/admin/errors/fp-A');
    expect(draft.corroboration).toBe(2);
    expect(draft.sources.find((s) => s.source === 'app')?.ref).toBe('fp-A');
    expect(draft.sources.find((s) => s.source === 'sentry')?.ref).toBe('9001');
  });

  // THE DISCRIMINATING TEST. If correlationKey (or correlateIncidents) is
  // ever "simplified" to dedupe on title alone, this test MUST go red: both
  // rows below share the exact same title, and the only thing that tells
  // them apart is errorCode. Two different Postgres error codes on the same
  // route are two different bugs, not one.
  it('does NOT dedupe on title alone — same title, different errorCode, is TWO incidents', () => {
    const a = appItem({
      key: 'app:fp-1',
      fingerprint: 'fp-1',
      errorCode: '42501',
      route: '/api/golf/rounds/save',
      title: 'Client error: Load failed',
    });
    const b = appItem({
      key: 'app:fp-2',
      fingerprint: 'fp-2',
      errorCode: '57014',
      route: '/api/golf/rounds/save',
      title: 'Client error: Load failed',
    });

    const drafts = correlateIncidents(input({ triage: [a, b] }));

    expect(drafts).toHaveLength(2);
  });

  it('does NOT dedupe on title alone — same title, same errorCode, different normalized route, is TWO incidents', () => {
    const a = appItem({
      key: 'app:fp-3',
      fingerprint: 'fp-3',
      errorCode: 'E1',
      route: '/api/golf/rounds/save',
      title: 'Client error: Load failed',
    });
    const b = appItem({
      key: 'app:fp-4',
      fingerprint: 'fp-4',
      errorCode: 'E1',
      route: '/api/golf/messages/send',
      title: 'Client error: Load failed',
    });

    const drafts = correlateIncidents(input({ triage: [a, b] }));

    expect(drafts).toHaveLength(2);
  });

  it('joins an app item and a reliability signal via normalized route, collapsing two UUIDs to one incident', () => {
    const a = appItem({
      key: 'app:fp-r1',
      fingerprint: 'fp-r1',
      errorCode: '42P10',
      route: '/api/golf/rounds/11111111-1111-1111-1111-111111111111',
      title: 'ON CONFLICT specification did not match any constraint',
      occurrences: 4,
    });
    const b = appItem({
      key: 'app:fp-r2',
      fingerprint: 'fp-r2',
      errorCode: '42P10',
      route: '/api/golf/rounds/22222222-2222-2222-2222-222222222222',
      title: 'ON CONFLICT specification did not match any constraint',
      occurrences: 6,
    });

    const drafts = correlateIncidents(input({ triage: [a, b] }));

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.occurrences).toBe(10);
  });
});

describe('correlateIncidents — reliability-only signals', () => {
  it('a Supabase-only signal becomes one incident with a rel: id and the exact expected link encoding', () => {
    const sig = signal({
      signature: 'abc123def',
      route: '/api/golf/leaderboards',
      errorCode: 'PGRST301',
      sources: ['supabase'],
      evidence: [{ source: 'supabase', ref: 'supabase-ref-1' }],
    });

    const drafts = correlateIncidents(
      input({ reliabilitySignals: [sig], sourceHealth: [health('supabase', 'reading')] }),
    );

    expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;
    expect(draft.id).toBe('rel:abc123def');
    // Verified encoding: encodeURIComponent('rel:abc123def') === 'rel%3Aabc123def'
    // (only the colon is escaped — everything else in a signature is
    // lowercase hex). Asserting the literal string, not just "it decodes
    // back", per the module's identity-string contract.
    expect(draft.linkTarget).toBe('/admin/errors/rel%3Aabc123def');
    expect(draft.sources).toHaveLength(1);
    expect(draft.sources[0]!.source).toBe('supabase');
    expect(draft.sources[0]!.ref).toBe('supabase-ref-1');
  });

  it('a Vercel-only signal becomes one incident', () => {
    const sig = signal({
      signature: 'vercel-sig-1',
      route: '/golf/dashboard',
      errorCode: null,
      sources: ['vercel'],
      evidence: [{ source: 'vercel', ref: 'vercel-req-1' }],
    });

    const drafts = correlateIncidents(
      input({ reliabilitySignals: [sig], sourceHealth: [health('vercel', 'reading')] }),
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.id).toBe('rel:vercel-sig-1');
    expect(drafts[0]!.sources.map((s) => s.source)).toEqual(['vercel']);
  });
});

describe('correlateIncidents — blind sources', () => {
  it('keeps incidents from readable sources, and marks hasBlindSource only where Sentry evidence actually attached', () => {
    // Fully unrelated to Sentry — read cleanly, never touches the blind arm.
    const unrelated = appItem({
      key: 'app:fp-unrelated',
      fingerprint: 'fp-unrelated',
      errorCode: 'E9',
      route: '/unrelated',
      title: 'Unrelated fault',
    });

    // Joined with a reliability signal whose OWN evidence includes a Sentry
    // ref — proof this fault WOULD have a Sentry contributor, even though
    // this refresh's live Sentry read is blind.
    const joinedKey = correlationKey({ errorCode: 'E5', route: '/joined', message: 'Joined fault' });
    const joined = appItem({
      key: 'app:fp-joined',
      fingerprint: 'fp-joined',
      errorCode: 'E5',
      route: '/joined',
      title: 'Joined fault',
    });
    const joinedSignal = signal({
      signature: joinedKey,
      route: '/joined',
      errorCode: 'E5',
      title: 'Joined fault',
      summary: 'Joined fault',
      sources: ['supabase', 'sentry'],
      evidence: [
        { source: 'supabase', ref: 'supabase-ref-joined' },
        { source: 'sentry', ref: 'issue-999' },
      ],
    });

    const drafts = correlateIncidents(
      input({
        triage: [unrelated, joined],
        reliabilitySignals: [joinedSignal],
        sourceHealth: [
          health('app', 'reading'),
          health('supabase', 'reading'),
          health('sentry', 'blind', 'Sentry read token missing'),
        ],
      }),
    );

    expect(drafts).toHaveLength(2);

    const unrelatedDraft = drafts.find((d) => d.id === 'fp-unrelated')!;
    expect(unrelatedDraft.hasBlindSource).toBe(false);
    expect(unrelatedDraft.sources.some((s) => s.source === 'sentry')).toBe(false);

    const joinedDraft = drafts.find((d) => d.id === 'fp-joined')!;
    expect(joinedDraft.hasBlindSource).toBe(true);
    const sentryEvidence = joinedDraft.sources.find((s) => s.source === 'sentry');
    expect(sentryEvidence).toMatchObject({
      health: 'blind',
      ref: 'issue-999',
      reason: 'Sentry read token missing',
    });
    // corroboration counts non-blind sources only: app + supabase, not the
    // blind sentry entry.
    expect(joinedDraft.corroboration).toBe(2);
  });
});

describe('correlateIncidents — merged scalars', () => {
  it('ratchets to the worse severity across a warning app row and an error Sentry row for one fault', () => {
    const appRow = appItem({
      key: 'app:fp-sev',
      fingerprint: 'fp-sev',
      severity: 'warning',
      errorCode: null,
      route: '/sev',
      title: 'Sev fault',
    });
    const sentryRow = sentryItem({
      key: 'sentry:sev1',
      severity: 'error',
      route: '/sev',
      title: 'Sev fault',
    });

    const drafts = correlateIncidents(input({ triage: [appRow, sentryRow] }));

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.severity).toBe('error');
  });
});

// Catalogued defect (h): a QA fixture round's evidence must never read as
// an actionable production defect at the correlated-incident layer either —
// `mergeTriage` already forces the contributing TriageItem's `actionable`
// false, and this pins that the fold-in step carries `isFixture` through
// AND does not accidentally resurrect `actionable` while doing it.
describe('correlateIncidents — QA fixture rounds', () => {
  it('carries isFixture: true through when the contributing app item is a fixture, and keeps actionable false', () => {
    const fixtureRow = appItem({
      key: 'app:fp-fixture',
      fingerprint: 'fp-fixture',
      isFixture: true,
      actionable: false,
      klassReason: 'QA fixture round — never treated as a defect.',
    });
    const drafts = correlateIncidents(input({ triage: [fixtureRow] }));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.isFixture).toBe(true);
    expect(drafts[0]!.actionable).toBe(false);
  });

  it('is false for an ordinary app item', () => {
    const drafts = correlateIncidents(input({ triage: [appItem({ key: 'app:fp-real', fingerprint: 'fp-real' })] }));
    expect(drafts[0]!.isFixture).toBe(false);
  });

  it('a fixture app item joined with a corroborating Sentry item for the same fault still reads isFixture', () => {
    const fixtureRow = appItem({
      key: 'app:fp-joined',
      fingerprint: 'fp-joined',
      isFixture: true,
      actionable: false,
      route: '/joined',
      title: 'Joined fault',
    });
    const sentryRow = sentryItem({ key: 'sentry:joined1', route: '/joined', title: 'Joined fault' });
    const drafts = correlateIncidents(input({ triage: [fixtureRow, sentryRow] }));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.isFixture).toBe(true);
  });
});

describe('correlateIncidents — determinism', () => {
  it('returns deeply equal results across two calls on the same input', () => {
    const app = appItem({ key: 'app:fp-det', fingerprint: 'fp-det' });
    const sentry = sentryItem({ key: 'sentry:det1' });
    const sig = signal({ signature: 'det-sig', evidence: [{ source: 'vercel', ref: 'det-ref' }] });

    const req = input({
      triage: [app, sentry],
      reliabilitySignals: [sig],
      sourceHealth: [health('app', 'reading'), health('sentry', 'partial', 'paginated')],
    });

    expect(correlateIncidents(req)).toEqual(correlateIncidents(req));
  });
});

describe('correlateIncidents — non-vacuity', () => {
  it('produces more than one incident and fewer incidents than input records for a mixed fixture', () => {
    // One joined pair (app + sentry, same fault) plus two independent solo
    // app rows: 4 raw records in, 3 incidents out. Neither an empty result
    // nor a fully-collapsed single incident can pass this assertion.
    const joinedApp = appItem({
      key: 'app:fp-x1',
      fingerprint: 'fp-x1',
      errorCode: null,
      route: '/join',
      title: 'Join fault',
    });
    const joinedSentry = sentryItem({ key: 'sentry:x1', route: '/join', title: 'Join fault' });
    const soloA = appItem({
      key: 'app:fp-x2',
      fingerprint: 'fp-x2',
      errorCode: 'EX2',
      route: '/solo2',
      title: 'Solo two',
    });
    const soloB = appItem({
      key: 'app:fp-x3',
      fingerprint: 'fp-x3',
      errorCode: 'EX3',
      route: '/solo3',
      title: 'Solo three',
    });

    const records = [joinedApp, joinedSentry, soloA, soloB];
    const drafts = correlateIncidents(input({ triage: records }));

    expect(drafts.length).toBeGreaterThan(1);
    expect(drafts.length).toBeLessThan(records.length);
    expect(drafts).toHaveLength(3);
  });
});

describe('correlateIncidents — evidence detail', () => {
  it('marks hasStack true only when a contributing app report actually captured one', () => {
    const withStack = appItem({
      key: 'app:fp-stack',
      fingerprint: 'fp-stack',
      errorCode: 'E-STACK',
      route: '/stacked',
      title: 'Stacked fault',
      report: reportWithStack(true, 'Stacked fault'),
    });
    const withoutStack = appItem({
      key: 'app:fp-nostack',
      fingerprint: 'fp-nostack',
      errorCode: 'E-NOSTACK',
      route: '/unstacked',
      title: 'Unstacked fault',
      report: reportWithStack(false, 'Unstacked fault'),
    });

    const drafts = correlateIncidents(input({ triage: [withStack, withoutStack] }));

    const stacked = drafts.find((d) => d.id === 'fp-stack')!;
    const unstacked = drafts.find((d) => d.id === 'fp-nostack')!;
    expect(stacked.hasStack).toBe(true);
    expect(unstacked.hasStack).toBe(false);
  });

  it('flags regressed when a contributing item carries substatus "regressed"', () => {
    const row = appItem({
      key: 'app:fp-regr',
      fingerprint: 'fp-regr',
      errorCode: 'E-REGR',
      route: '/regressed',
      title: 'Regressed fault',
      substatus: 'regressed',
    });

    const drafts = correlateIncidents(input({ triage: [row] }));

    expect(drafts[0]!.regressed).toBe(true);
  });
});

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
    affectedPeople: [],
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
    // Real app rows hash their raw `message`; these fixtures carry no separate
    // message, so the title IS the correlation text. Derived from the RESOLVED
    // title (after `overrides`) so a fixture that renames the fault still joins
    // a reliability signal keyed on that name — which is what the join tests
    // below actually assert.
    correlationMessage: overrides.title ?? 'Client error: Load failed',
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
    affectedPeople: [],
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
    // Same derivation as appItem — see its note.
    correlationMessage: overrides.title ?? 'Client error: Load failed',
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
    countIsFloor: false,
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

  // ── The regression guard for the keyspace split fixed 2026-09-08 ─────────
  //
  // THE ONLY instrument for this join, and the reason the fixtures below make
  // `title` and `correlationMessage` DIFFER: production app rows almost always
  // do (`title` is route-decorated — "[/golf/dashboard] X" — while `message` is
  // the bare fault), and the correlator used to hash the title while the
  // reliability collector hashed the message. Two keyspaces that could never
  // intersect: measured against production, ZERO of 22 app incidents joined a
  // reliability signal, and the whole board reported corroboration > 1 exactly
  // once in 84 incidents.
  //
  // A fixture whose title equals its message cannot detect that — it passes
  // under both the broken and the fixed key. If someone "simplifies"
  // `correlationMessage` back to `title`, THIS is the test that must go red.
  it('joins an app item to a reliability signal keyed on the MESSAGE, not the route-decorated title', () => {
    const message = 'The destination stream closed early.';
    const app = appItem({
      key: 'app:fp-stream',
      fingerprint: 'fp-stream',
      errorCode: null,
      route: '/golf/dashboard',
      // Route-decorated, exactly as server-error-logger writes it.
      title: `[/golf/dashboard] ${message}`,
      correlationMessage: message,
      occurrences: 24,
    });
    // Built the way `sources.ts`'s Supabase arm builds it: over `row.message`.
    const sig = signal({
      signature: correlationKey({ errorCode: null, route: '/golf/dashboard', message }),
      route: '/golf/dashboard',
      errorCode: null,
      title: message,
      summary: message,
      sources: ['supabase'],
      evidence: [{ source: 'supabase', ref: 'supabase-ref-stream' }],
    });

    const drafts = correlateIncidents(
      input({
        triage: [app],
        reliabilitySignals: [sig],
        sourceHealth: [health('app', 'reading'), health('supabase', 'reading')],
      }),
    );

    // ONE incident, not the app row plus a phantom `rel:` twin.
    expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;
    // The app fingerprint wins the id, so the operator's link still resolves.
    expect(draft.id).toBe('fp-stream');
    expect(draft.corroboration).toBeGreaterThan(1);
    expect(draft.sources.map((sc) => sc.source).sort()).toEqual(['app', 'supabase']);
    // Occurrences stay the app's honest tally — a reliability signal folded
    // FROM the same rows must not be added on top.
    expect(draft.occurrences).toBe(24);
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

  // ── Reliability-only buckets run the real classifier ─────────────────────
  //
  // These used to be hardcoded `defect` / actionable because "no app or Sentry
  // classifier has ever looked at this fault". That is not a conservative
  // default: measured against production, 59 of 84 board incidents were
  // reliability-only and every one was force-flagged actionable — ten copies
  // of "N+1 Query" and the whole empty-state family among them — which is why
  // the board counted 77 actionable while the Errors tab counted 22.
  it('classifies a reliability-only empty state as empty_state, NOT an actionable defect', () => {
    const sig = signal({
      signature: 'sig-empty',
      severity: 'info',
      title: '[getPlayerProfile] No completed rounds found for this player',
      summary: '[getPlayerProfile] No completed rounds found for this player',
      errorCode: null,
    });

    const drafts = correlateIncidents(
      input({ reliabilitySignals: [sig], sourceHealth: [health('supabase', 'reading')] }),
    );

    expect(drafts[0]!.klass).toBe('empty_state');
    expect(drafts[0]!.actionable).toBe(false);
    // Provenance is still on the record — the operator can see nothing
    // corroborates it yet.
    expect(drafts[0]!.klassReason).toContain('reliability-only signal');
  });

  it('still defaults an UNRECOGNISED error-severity signal to a visible actionable defect', () => {
    const sig = signal({
      signature: 'sig-novel',
      severity: 'error',
      title: 'Something nobody has written a rule for yet',
      summary: 'Something nobody has written a rule for yet',
      errorCode: null,
    });

    const drafts = correlateIncidents(
      input({ reliabilitySignals: [sig], sourceHealth: [health('supabase', 'reading')] }),
    );

    expect(drafts[0]!.klass).toBe('defect');
    expect(drafts[0]!.actionable).toBe(true);
  });

  it('does not file a server-observed signal as the visitor\'s own connectivity', () => {
    // `source: 'client'` is what flips rule 3c/4 to non-actionable. A
    // reliability signal is read from Supabase/Sentry/Vercel, never reported
    // by a browser, so it must not take that branch.
    const sig = signal({
      signature: 'sig-transport',
      severity: 'error',
      title: 'Load failed',
      summary: 'Load failed',
      errorCode: null,
    });

    const drafts = correlateIncidents(
      input({ reliabilitySignals: [sig], sourceHealth: [health('supabase', 'reading')] }),
    );

    expect(drafts[0]!.actionable).toBe(true);
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

describe('correlateIncidents — affected people', () => {
  it('UNIONS identities across co-bucketed app items instead of taking the max', () => {
    // Two app items for one fault, each reporting one affected user — but two
    // DIFFERENT users. `Math.max` said 1, which is the undercount a count-only
    // model cannot avoid: only the identities can say whether those are the
    // same person. They were available and discarded.
    const a = appItem({
      key: 'app:fp-a',
      fingerprint: 'fp-a',
      errorCode: 'E1',
      route: '/r',
      title: 'Same fault',
      affectedUsers: 1,
      affectedPeople: [{ userId: 'u1', email: 'u1@example.com' }],
    });
    const b = appItem({
      key: 'app:fp-b',
      fingerprint: 'fp-b',
      errorCode: 'E1',
      route: '/r',
      title: 'Same fault',
      affectedUsers: 1,
      affectedPeople: [{ userId: 'u2', email: 'u2@example.com' }],
    });

    const drafts = correlateIncidents(input({ triage: [a, b] }));

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.affectedUsers).toBe(2);
    expect(drafts[0]!.affectedPeople.map((p) => p.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('does not double-count one person seen by two co-bucketed items', () => {
    const a = appItem({
      key: 'app:fp-a', fingerprint: 'fp-a', errorCode: 'E2', route: '/r2', title: 'One fault',
      affectedUsers: 1, affectedPeople: [{ userId: 'u1', email: 'u1@example.com' }],
    });
    const b = appItem({
      key: 'app:fp-b', fingerprint: 'fp-b', errorCode: 'E2', route: '/r2', title: 'One fault',
      affectedUsers: 1, affectedPeople: [{ userId: 'u1', email: 'u1@example.com' }],
    });

    const drafts = correlateIncidents(input({ triage: [a, b] }));

    expect(drafts[0]!.affectedUsers).toBe(1);
    expect(drafts[0]!.affectedPeople).toHaveLength(1);
  });

  it('never SUMS the app union with Sentry userCount — different populations', () => {
    const app = appItem({
      key: 'app:fp-s', fingerprint: 'fp-s', errorCode: 'E3', route: '/r3', title: 'Shared fault',
      affectedUsers: 2,
      affectedPeople: [
        { userId: 'u1', email: null },
        { userId: 'u2', email: null },
      ],
    });
    const sentry = sentryItem({
      key: 'sentry:1', errorCode: 'E3', route: '/r3', title: 'Shared fault', affectedUsers: 7,
    });

    const drafts = correlateIncidents(input({ triage: [app, sentry] }));

    // 7, not 9: Sentry's tally overlaps the app's, it does not extend it.
    expect(drafts[0]!.affectedUsers).toBe(7);
    // The identities we DO have still travel, even though Sentry's larger
    // count wins the scalar — naming two of seven beats naming none.
    expect(drafts[0]!.affectedPeople).toHaveLength(2);
  });

  it('never lets the count shrink below an item\'s own affectedUsers at the cap', () => {
    // `affectedPeople` is capped; `affectedUsers` is not. A bucket whose
    // identities were truncated must still report the honest total.
    const app = appItem({
      key: 'app:fp-c', fingerprint: 'fp-c', errorCode: 'E4', route: '/r4', title: 'Capped fault',
      affectedUsers: 400,
      affectedPeople: [{ userId: 'u1', email: null }],
    });

    const drafts = correlateIncidents(input({ triage: [app] }));

    expect(drafts[0]!.affectedUsers).toBe(400);
    expect(drafts[0]!.affectedPeople).toHaveLength(1);
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
  it('carries isFixture: true through unchanged, WITHOUT touching actionable', () => {
    // actionable is left as whatever the upstream TriageItem carried —
    // mergeTriage deliberately never forces it false for a fixture, or the
    // row would drop out of the default feed entirely and the FIXTURE badge
    // would have nothing left to badge. See triage.ts's isFixture doc
    // comment.
    const fixtureRow = appItem({
      key: 'app:fp-fixture',
      fingerprint: 'fp-fixture',
      isFixture: true,
      actionable: true,
      klassReason: 'Unexpected failure (severity-derived)',
    });
    const drafts = correlateIncidents(input({ triage: [fixtureRow] }));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.isFixture).toBe(true);
    expect(drafts[0]!.actionable).toBe(true);
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

/**
 * Triage engine.
 *
 * Every fixture here is shaped from a real 2026-08-27 production run
 * (`npm run triage -- --hours 72`: 41 candidates, 37 causes, four sources
 * reporting ok). The cases that matter are the ones where a plausible engine
 * gets it wrong in the SAFE-LOOKING direction — closing something live,
 * reporting a failed read as a clean board, letting volume bury one real error.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTriagePlan,
  triageCauseKey,
  type TriageCandidate,
  type SourceHealth,
} from '@/lib/admin/triage-engine';

const NOW = new Date('2026-08-27T23:49:11.000Z');

function candidate(over: Partial<TriageCandidate> = {}): TriageCandidate {
  return {
    key: 'fp-1',
    origin: 'admin_events',
    title: 'Something failed',
    message: 'Something failed',
    route: '/golf/dashboard',
    severity: 'error',
    errorCode: null,
    feature: null,
    action: null,
    source: null,
    occurrences: 1,
    firstSeen: '2026-08-27T10:00:00.000Z',
    lastSeen: '2026-08-27T12:00:00.000Z',
    seenBy: ['admin_events'],
    evidenceUrl: null,
    existingAnalysisFix: null,
    ...over,
  };
}

const ALL_OK: SourceHealth[] = [
  { source: 'admin_events', status: 'ok', reason: null },
  { source: 'sentry', status: 'ok', reason: null },
  { source: 'supabase', status: 'ok', reason: null },
  { source: 'vercel', status: 'ok', reason: null },
];

function plan(candidates: TriageCandidate[], health: SourceHealth[] = ALL_OK) {
  return buildTriagePlan({ candidates, sourceHealth: health, windowHours: 72, now: NOW });
}

describe('grouping', () => {
  it('collapses one cause seen at many call sites into one group', () => {
    // The measured case: "Load failed" wore twelve fingerprints across eleven
    // call sites because client rows carry no errorCode, so route was the only
    // discriminator. Same route + same message prefix must be one cause.
    const members = ['a', 'b', 'c'].map((k) =>
      candidate({ key: k, title: 'Load failed', message: 'Load failed', route: '/golf/dashboard' }),
    );
    const result = plan(members);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.members).toHaveLength(3);
    expect(result.counts.collapsed).toBe(2);
  });

  it('does NOT collapse two genuinely different causes on the same route', () => {
    const result = plan([
      candidate({ key: 'a', message: 'Load failed' }),
      candidate({ key: 'b', message: 'Cannot coerce the result to a single JSON object' }),
    ]);
    expect(result.groups).toHaveLength(2);
  });

  it('folds severity out of the cause key, so Sentry error and app warning are one cause', () => {
    // correlationSignature does exactly this, and for the same reason: Sentry
    // rates as `error` plenty of what this app logs as `warning`, and a
    // severity-bearing key splits one root cause in two — which is precisely
    // how the corroboration signal never fires.
    const a = candidate({ severity: 'error', message: 'permission denied for function heartbeat' });
    const b = candidate({ severity: 'warning', message: 'permission denied for function heartbeat' });
    expect(triageCauseKey(a)).toBe(triageCauseKey(b));
  });

  it('keeps the WORST severity when a group spans several', () => {
    const result = plan([
      candidate({ key: 'a', severity: 'warning' }),
      candidate({ key: 'b', severity: 'critical' }),
    ]);
    expect(result.groups[0]!.severity).toBe('critical');
  });
});

describe('verdicts', () => {
  it('sends a Postgres privilege error to the QUEUE, never to closeable', () => {
    // The bug this engine found in itself on its first production run: a cron
    // failing 23 times on `permission denied for table baseball_players` sat in
    // the closeable pile because ACCESS_PHRASES contains the bare string
    // "permission denied". Applying that plan would have closed a live grant
    // failure as "the system correctly said no".
    const result = plan([
      candidate({
        key: 'rel:79327965',
        origin: 'sentry',
        title: 'Error: permission denied for table baseball_players',
        message: 'Error: permission denied for table baseball_players',
        route: '/GET%20/api/cron/event-reminders',
        occurrences: 23,
        seenBy: ['sentry'],
      }),
    ]);
    expect(result.queue).toHaveLength(1);
    expect(result.closeable).toHaveLength(0);
    expect(result.queue[0]!.reason).toMatch(/privilege|GRANT/i);
  });

  it('an existing analysis wins outright — the engine never re-decides a group a reader ruled on', () => {
    const result = plan([
      candidate({
        // Content that would otherwise classify as an actionable defect.
        message: 'Rendered more hooks than during the previous render.',
        existingAnalysisFix: 'NOT A DEFECT — expected client-side fetch cancellation.',
      }),
    ]);
    expect(result.groups[0]!.verdict).toBe('analysed');
    expect(result.groups[0]!.category).toBe('not-a-defect');
    expect(result.queue).toHaveLength(0);
  });

  it('surfaces an off-contract analysis as uncategorized instead of silently trusting it', () => {
    const result = plan([
      candidate({ existingAnalysisFix: 'No fix needed - single occurrence, known noise class.' }),
    ]);
    expect(result.groups[0]!.category).toBe('uncategorized');
    expect(result.groups[0]!.reason).toMatch(/off-contract/i);
  });

  it('one actionable member makes the whole group actionable — volume never buries it', () => {
    // A group of routine telemetry with one real error in it is a real error.
    // Taking the majority verdict is how the one row that matters disappears.
    // The odd member differs by `source`, not by `errorCode` or `message` —
    // because those two ARE in the cause key, so varying them puts the member
    // in a different group and the test stops testing anything. (Two earlier
    // fixtures here got this wrong: one used `Integrity PASS`, which rule 1
    // catches before the privilege check; one used a distinct `errorCode`,
    // which split the group in two.) `source: 'rls_denial'` is rule 2 —
    // actionable, and invisible to the grouping key.
    const members = [
      ...Array.from({ length: 5 }, (_, i) =>
        candidate({ key: `noise-${i}`, message: 'gateMetrics recorded', severity: 'info' }),
      ),
      candidate({ key: 'real', message: 'gateMetrics recorded', severity: 'info', source: 'rls_denial' }),
    ];
    const result = plan(members);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.members).toHaveLength(6);
    expect(result.groups[0]!.verdict).toBe('needs-analysis');
  });
});

describe('source health', () => {
  it('reports a blind source and marks the plan incomplete', () => {
    const result = plan([candidate()], [
      { source: 'admin_events', status: 'ok', reason: null },
      { source: 'sentry', status: 'blind', reason: 'SENTRY_AUTH_TOKEN missing' },
    ]);
    expect(result.blindSources).toEqual(['sentry']);
  });

  it('an empty candidate set with a blind source is NOT a clean board', () => {
    // The whole failure this engine exists to prevent: a source that could not
    // be READ reported as a source that found nothing.
    const result = plan([], [{ source: 'sentry', status: 'blind', reason: 'timeout' }]);
    expect(result.counts.groups).toBe(0);
    expect(result.blindSources).toHaveLength(1);
  });
});

describe('ranking', () => {
  it('puts a corroborated cause above a louder uncorroborated one', () => {
    // Two independent systems agreeing is the least likely thing to be
    // instrumentation noise, whatever the counts say.
    const result = plan([
      candidate({
        key: 'loud',
        title: 'Loud thing',
        message: 'Loud thing',
        occurrences: 500,
        seenBy: ['sentry'],
        origin: 'sentry',
      }),
      candidate({
        key: 'rel:corr',
        title: 'Corroborated thing',
        message: 'Corroborated thing',
        occurrences: 3,
        origin: 'sentry',
        seenBy: ['sentry', 'supabase'],
      }),
    ]);
    expect(result.groups[0]!.title).toBe('Corroborated thing');
    expect(result.counts.corroborated).toBe(1);
  });

  it('ranks critical above error above warning', () => {
    const result = plan([
      candidate({ key: 'w', severity: 'warning', message: 'w' }),
      candidate({ key: 'c', severity: 'critical', message: 'c' }),
      candidate({ key: 'e', severity: 'error', message: 'e' }),
    ]);
    expect(result.groups.map((g) => g.severity)).toEqual(['critical', 'error', 'warning']);
  });
});

describe('keys', () => {
  it('namespaces reliability signatures so they cannot collide with fingerprints', () => {
    // `correlationSignature` and `admin_events.fingerprint` are different
    // hashes of different inputs and both render as 8 hex chars. An unprefixed
    // collision would attach one cause's analysis to another's.
    const result = plan([
      candidate({ key: 'rel:79327965', origin: 'sentry', message: 'a' }),
      candidate({ key: '79327965', origin: 'admin_events', message: 'b' }),
    ]);
    const keys = result.groups.flatMap((g) => g.members.map((m) => m.key));
    expect(new Set(keys).size).toBe(2);
  });
});

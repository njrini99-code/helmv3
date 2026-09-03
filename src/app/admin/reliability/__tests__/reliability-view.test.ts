import { describe, it, expect } from 'vitest';
import {
  buildCoverageMatrix,
  corroboratedCount,
  evidenceTarget,
  groupByCorroboration,
  groupBySeverity,
  historySeries,
  needsAttentionCount,
  readingCount,
  relativeAge,
  severityCounts,
  signalIncidentHref,
} from '../reliability-view';
import type { CorrelatedSignal, ReliabilitySeverity } from '@/lib/reliability/types';
import type { ReliabilityRunRow } from '@/lib/admin/data/reliability';

function signal(overrides: Partial<CorrelatedSignal> = {}): CorrelatedSignal {
  return {
    signature: 'aabbccdd',
    severity: 'error',
    title: 'boom',
    summary: 'boom happened',
    route: '/api/x',
    errorCode: null,
    count: 1,
    countIsFloor: false,
    firstSeen: '2026-08-26T10:00:00.000Z',
    lastSeen: '2026-08-26T10:00:00.000Z',
    sources: ['sentry'],
    featureId: null,
    proposedRisk: 'R2',
    evidence: [],
    ...overrides,
  };
}

function runRow(signals: CorrelatedSignal[] | null, id = 'r1'): ReliabilityRunRow {
  return {
    id,
    status: 'completed',
    startedAt: '2026-08-26T10:00:00.000Z',
    completedAt: '2026-08-26T10:00:01.000Z',
    durationMs: 1000,
    errorMessage: null,
    run:
      signals === null
        ? null
        : {
            version: 1,
            windowStart: '2026-08-26T06:00:00.000Z',
            windowEnd: '2026-08-26T10:00:00.000Z',
            overallStatus: 'ok',
            sources: [],
            signals,
            truncatedSignals: 0,
          },
  };
}

describe('evidenceTarget — a reference is only a link when it resolves to one', () => {
  it('turns a Sentry permalink into an external link labelled by issue id', () => {
    const target = evidenceTarget('https://sentry.io/organizations/helm/issues/4512/', 'sentry');
    expect(target.kind).toBe('external');
    expect(target).toMatchObject({
      href: 'https://sentry.io/organizations/helm/issues/4512/',
      label: 'Sentry #4512',
    });
  });

  it('falls back to a generic label when the URL has no numeric issue id', () => {
    const target = evidenceTarget('https://sentry.io/issues/', 'sentry');
    expect(target).toMatchObject({ kind: 'external', label: 'Sentry issue' });
  });

  it('turns an admin_events fingerprint into a Bridge drill-through', () => {
    // This is the payoff of reusing buildIncidentSignature's 8-char hex shape:
    // the Errors tab already has a detail page keyed by exactly this value.
    const target = evidenceTarget('a1b2c3d4', 'supabase');
    expect(target).toEqual({
      kind: 'internal',
      href: '/admin/errors/a1b2c3d4',
      label: 'Incident a1b2c3d4',
    });
  });

  it('does NOT invent a drill-through for a non-fingerprint supabase ref', () => {
    // Rows written before the fingerprint column existed fall back to a row id,
    // which has no detail page. Linking it would 404.
    const target = evidenceTarget('row:9f8e7d6c-1111-2222-3333-444455556666', 'supabase');
    expect(target.kind).toBe('opaque');
  });

  it('renders a Vercel deployment id as opaque, not a link', () => {
    const target = evidenceTarget('dpl_ABC123XYZ456789', 'vercel');
    expect(target).toMatchObject({ kind: 'opaque' });
    expect(target.label).toContain('Deployment');
  });

  it('never emits a javascript: or data: href as external', () => {
    for (const hostile of ['javascript:alert(1)', 'data:text/html,<script>']) {
      expect(evidenceTarget(hostile, 'sentry').kind).toBe('opaque');
    }
  });
});

describe('severity aggregation', () => {
  const signals = [
    signal({ severity: 'critical', signature: 'a' }),
    signal({ severity: 'error', signature: 'b' }),
    signal({ severity: 'error', signature: 'c' }),
    signal({ severity: 'warning', signature: 'd' }),
    signal({ severity: 'info', signature: 'e' }),
  ];

  it('counts every severity, including zeroes', () => {
    expect(severityCounts([signal({ severity: 'warning' })])).toEqual({
      critical: 0,
      error: 0,
      warning: 1,
      info: 0,
    });
  });

  it('needs-attention is critical + error only', () => {
    expect(needsAttentionCount(signals)).toBe(3);
  });

  it('counts only signals more than one source saw', () => {
    expect(
      corroboratedCount([
        signal({ signature: 'a', sources: ['sentry'] }),
        signal({ signature: 'b', sources: ['sentry', 'supabase'] }),
        signal({ signature: 'c', sources: ['sentry', 'supabase', 'vercel'] }),
      ]),
    ).toBe(2);
  });

  it('groups worst-first and omits empty buckets', () => {
    const groups = groupBySeverity(signals);
    expect(groups.map((g) => g.severity)).toEqual([
      'critical',
      'error',
      'warning',
      'info',
    ] satisfies ReliabilitySeverity[]);
    expect(groups[1]!.signals).toHaveLength(2);

    const onlyWarnings = groupBySeverity([signal({ severity: 'warning' })]);
    expect(onlyWarnings.map((g) => g.severity)).toEqual(['warning']);
  });
});

describe('readingCount — blind arms are never counted as reading', () => {
  it('counts ok and partial, excludes blind', () => {
    expect(
      readingCount([{ status: 'ok' }, { status: 'partial' }, { status: 'blind' }]),
    ).toBe(2);
  });

  it('is zero when every arm is blind', () => {
    expect(readingCount([{ status: 'blind' }, { status: 'blind' }])).toBe(0);
  });
});

describe('historySeries', () => {
  it('returns oldest → newest, reversing the newest-first query order', () => {
    const series = historySeries([
      runRow([signal({ signature: 'a' })], 'newest'),
      runRow([signal({ signature: 'b' }), signal({ signature: 'c' })], 'older'),
    ]);
    expect(series).toEqual([2, 1]);
  });

  it('SKIPS unreadable runs rather than plotting them as zero', () => {
    // A zero here means "looked, found nothing". An unreadable payload means
    // the opposite — that we do not know. Plotting it as zero would draw a
    // reassuring dip that never happened.
    const series = historySeries([
      runRow([signal()], 'a'),
      runRow(null, 'unreadable'),
      runRow([signal({ signature: 'x' }), signal({ signature: 'y' })], 'c'),
    ]);
    expect(series).toEqual([2, 1]);
  });
});

describe('relativeAge', () => {
  const now = new Date('2026-08-26T12:00:00.000Z').getTime();

  it.each([
    ['2026-08-26T11:59:30.000Z', 'just now'],
    ['2026-08-26T11:45:00.000Z', '15m ago'],
    ['2026-08-26T09:00:00.000Z', '3h ago'],
    ['2026-08-24T12:00:00.000Z', '2d ago'],
  ])('renders %s as %s', (iso, expected) => {
    expect(relativeAge(iso, now)).toBe(expected);
  });

  it('renders an em-dash rather than a negative age for a future timestamp', () => {
    expect(relativeAge('2026-08-26T13:00:00.000Z', now)).toBe('—');
  });

  it('renders an em-dash for an unparseable timestamp', () => {
    expect(relativeAge('not-a-date', now)).toBe('—');
  });
});

// =============================================================================
// The conversion from "second incident list" to "coverage and corroboration".
//
// Reliability and Errors read different sources on different clocks and never
// reconciled — named 2026-08-28 as the biggest open design problem on the
// Bridge. The fix is not to delete this tab: it computes something no other
// surface can, namely how many INDEPENDENT systems saw the same fault. What
// changed is that it stopped sorting by the other tab's axis and started
// linking every row into the canonical incident.
// =============================================================================

describe('groupByCorroboration', () => {
  it('groups by independent observation count, most-corroborated first', () => {
    const groups = groupByCorroboration([
      signal({ signature: 'one', sources: ['sentry'] }),
      signal({ signature: 'three', sources: ['sentry', 'supabase', 'vercel'] }),
      signal({ signature: 'two', sources: ['sentry', 'supabase'] }),
    ]);
    expect(groups.map((g) => g.sourceCount)).toEqual([3, 2, 1]);
    expect(groups[0]!.signals.map((s) => s.signature)).toEqual(['three']);
  });

  it('orders by severity WITHIN a bucket — the grouping already answered the other question', () => {
    const groups = groupByCorroboration([
      signal({ signature: 'warn', severity: 'warning', sources: ['sentry', 'supabase'] }),
      signal({ signature: 'crit', severity: 'critical', sources: ['sentry', 'supabase'] }),
    ]);
    expect(groups[0]!.signals.map((s) => s.signature)).toEqual(['crit', 'warn']);
  });

  it('omits empty buckets rather than rendering a "0 sources" heading', () => {
    expect(groupByCorroboration([])).toEqual([]);
  });
});

describe('signalIncidentHref', () => {
  it('points at the canonical incident under the SAME rel: key the analysis is stored with', () => {
    // The nightly triage writes an analysis to admin_events under
    // `rel:<signature>`, and /admin/errors/<id> resolves that spelling. One
    // string, two uses, no translation table that can drift between them.
    expect(signalIncidentHref('f321abcd')).toBe('/admin/errors/rel%3Af321abcd');
  });
});

describe('buildCoverageMatrix', () => {
  const run = (statuses: Record<string, 'ok' | 'partial' | 'blind'>): ReliabilityRunRow => ({
    id: 'r',
    status: 'completed',
    startedAt: '2026-08-28T00:00:00.000Z',
    completedAt: '2026-08-28T00:01:00.000Z',
    durationMs: 60_000,
    errorMessage: null,
    run: {
      version: 1,
      windowStart: '2026-08-27T21:00:00.000Z',
      windowEnd: '2026-08-28T00:00:00.000Z',
      overallStatus: 'ok',
      sources: Object.entries(statuses).map(([source, status]) => ({
        source: source as 'sentry' | 'supabase' | 'vercel',
        status,
        reason: status === 'ok' ? null : 'unreachable',
        bounded: false,
        durationMs: 10,
      })),
      signals: [],
      truncatedSignals: 0,
    },
  });

  it('reads oldest-left, newest-right — the data layer hands it newest-first', () => {
    const matrix = buildCoverageMatrix([
      run({ sentry: 'blind', supabase: 'ok', vercel: 'ok' }), // newest
      run({ sentry: 'ok', supabase: 'ok', vercel: 'ok' }), // oldest
    ]);
    const sentry = matrix.find((r) => r.source === 'sentry')!;
    expect(sentry.cells).toEqual(['reading', 'blind']);
  });

  it('distinguishes an unreadable RUN from a blind SOURCE', () => {
    // One means the collector's own record could not be parsed; the other
    // means the collector ran and could not reach that provider. Collapsing
    // them attributes an infrastructure problem to a provider outage.
    const unreadable: ReliabilityRunRow = {
      id: 'legacy',
      status: 'completed',
      startedAt: null,
      completedAt: null,
      durationMs: null,
      errorMessage: null,
      run: null,
    };
    const matrix = buildCoverageMatrix([unreadable]);
    for (const row of matrix) {
      expect(row.cells).toEqual(['no-run']);
      expect(row.cells).not.toContain('blind');
    }
  });

  it('counts only genuinely reading runs, never partial or blind ones', () => {
    const matrix = buildCoverageMatrix([
      run({ sentry: 'ok', supabase: 'partial', vercel: 'blind' }),
      run({ sentry: 'ok', supabase: 'ok', vercel: 'blind' }),
    ]);
    expect(matrix.find((r) => r.source === 'sentry')!.readingRuns).toBe(2);
    expect(matrix.find((r) => r.source === 'supabase')!.readingRuns).toBe(1);
    expect(matrix.find((r) => r.source === 'vercel')!.readingRuns).toBe(0);
    for (const row of matrix) expect(row.totalRuns).toBe(2);
  });

  it('reports a source missing from a run as no-run, not as reading', () => {
    // A collector that stopped emitting an arm entirely must not have that
    // arm's silence read as health.
    const matrix = buildCoverageMatrix([run({ sentry: 'ok' })]);
    expect(matrix.find((r) => r.source === 'vercel')!.cells).toEqual(['no-run']);
  });

  it('returns a row per source even with no history at all', () => {
    const matrix = buildCoverageMatrix([]);
    expect(matrix.map((r) => r.source)).toEqual(['sentry', 'supabase', 'vercel']);
    for (const row of matrix) expect(row.totalRuns).toBe(0);
  });
});

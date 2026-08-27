import { describe, it, expect } from 'vitest';
import {
  corroboratedCount,
  evidenceTarget,
  groupBySeverity,
  historySeries,
  needsAttentionCount,
  readingCount,
  relativeAge,
  severityCounts,
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

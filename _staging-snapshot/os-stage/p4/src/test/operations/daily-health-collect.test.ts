import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  resolveWindow,
  mapFeatureId,
  normalizeBridgeRow,
  aggregateByFingerprint,
  classifySignal,
  normalizeSentryIssue,
  buildOutput,
} from '../../../scripts/operations/daily-health/collect.mjs';

// Exercises ONLY the exported pure helpers — no network, no Supabase, no
// Sentry, no `gh`/`vercel` shell-out. The impure I/O wrappers
// (collectBridge/collectSentry/collectCi/resolveProductionIdentity) are
// deliberately not exported for testing here; their job is a thin,
// hard-to-unit-test fetch-then-hand-to-pure-function shape, and that
// boundary is the whole point of collect.mjs's design (see its file header).

describe('parseArgs', () => {
  it('reads --from/--to/--out and defaults pretty to true', () => {
    const args = parseArgs(['--from', 'A', '--to', 'B', '--out', 'C']);
    expect(args).toEqual({ from: 'A', to: 'B', out: 'C', pretty: true });
  });

  it('--compact flips pretty to false', () => {
    expect(parseArgs(['--compact']).pretty).toBe(false);
  });

  it('missing flags stay null', () => {
    expect(parseArgs([])).toEqual({ from: null, to: null, out: null, pretty: true });
  });
});

describe('resolveWindow', () => {
  it('defaults to the trailing 24h when nothing is passed', () => {
    const w = resolveWindow({}, new Date('2026-08-21T12:00:00Z'));
    expect(w).toEqual({ from: '2026-08-20T12:00:00.000Z', to: '2026-08-21T12:00:00.000Z', hours: 24 });
  });

  it('honors explicit --from/--to', () => {
    const w = resolveWindow({ from: '2026-08-20T00:00:00Z', to: '2026-08-21T00:00:00Z' });
    expect(w).toEqual({ from: '2026-08-20T00:00:00.000Z', to: '2026-08-21T00:00:00.000Z', hours: 24 });
  });

  it('throws on an unparsable date rather than silently defaulting', () => {
    expect(() => resolveWindow({ to: 'not-a-date' })).toThrow(/--to is not a valid date/);
    expect(() => resolveWindow({ from: 'not-a-date', to: '2026-08-21T00:00:00Z' })).toThrow(
      /--from is not a valid date/,
    );
  });
});

describe('mapFeatureId', () => {
  it('passes a real feature key through unchanged', () => {
    expect(mapFeatureId('round_tracking')).toBe('round_tracking');
  });

  it('maps null/undefined/empty to the literal "unmapped"', () => {
    expect(mapFeatureId(null)).toBe('unmapped');
    expect(mapFeatureId(undefined)).toBe('unmapped');
    expect(mapFeatureId('')).toBe('unmapped');
    expect(mapFeatureId('   ')).toBe('unmapped');
  });

  it('never invents/guesses a feature id that was not on the row', () => {
    // Regression guard for the design decision in collect.mjs's header: no
    // registry.yml cross-mapping happens here. A key with no registry.yml
    // counterpart (e.g. a fine-grained baseball key) must still pass through
    // unchanged, not collapse to 'unmapped'.
    expect(mapFeatureId('shot_analytics')).toBe('shot_analytics');
  });
});

describe('normalizeBridgeRow', () => {
  it('carries feature/severity/fingerprint through', () => {
    const row = {
      id: 1,
      fingerprint: 'fp-a',
      feature: 'calendar_events',
      severity: 'error',
      created_at: '2026-08-20T01:00:00.000Z',
      title: 'checkScheduleConflicts failed',
    };
    expect(normalizeBridgeRow(row)).toEqual({
      fingerprint: 'fp-a',
      feature_id: 'calendar_events',
      severity: 'error',
      created_at: '2026-08-20T01:00:00.000Z',
      title: 'checkScheduleConflicts failed',
      source: 'bridge',
    });
  });

  it('never drops a row for lacking a fingerprint — synthesizes a stable per-row one', () => {
    const row = { id: 42, fingerprint: null, feature: null, severity: 'warning', created_at: '2026-08-20T01:00:00.000Z', title: null };
    const normalized = normalizeBridgeRow(row);
    expect(normalized.fingerprint).toBe('no-fingerprint:42');
    expect(normalized.feature_id).toBe('unmapped');
  });
});

describe('aggregateByFingerprint (the dedupe half of spec §18)', () => {
  it('collapses repeat rows for the same fingerprint into one signal with a real count', () => {
    const rows = [
      { fingerprint: 'fp-a', feature_id: 'calendar_events', severity: 'error', created_at: '2026-08-20T01:00:00.000Z', title: 'first' },
      { fingerprint: 'fp-a', feature_id: 'calendar_events', severity: 'warning', created_at: '2026-08-20T03:00:00.000Z', title: 'third' },
      { fingerprint: 'fp-a', feature_id: 'calendar_events', severity: 'critical', created_at: '2026-08-20T02:00:00.000Z', title: 'second-but-worst' },
    ];
    const [signal] = aggregateByFingerprint(rows);
    expect(signal.count).toBe(3);
    expect(signal.first_seen).toBe('2026-08-20T01:00:00.000Z');
    expect(signal.last_seen).toBe('2026-08-20T03:00:00.000Z');
    // Representative severity/title tracks the HIGHEST-ranked severity seen,
    // not merely the first or last row.
    expect(signal.severity).toBe('critical');
    expect(signal.sample_title).toBe('second-but-worst');
  });

  it('does not merge distinct fingerprints', () => {
    const rows = [
      { fingerprint: 'fp-a', feature_id: 'calendar_events', severity: 'error', created_at: '2026-08-20T01:00:00.000Z', title: 'a' },
      { fingerprint: 'fp-b', feature_id: 'round_tracking', severity: 'error', created_at: '2026-08-20T01:00:00.000Z', title: 'b' },
    ];
    expect(aggregateByFingerprint(rows)).toHaveLength(2);
  });

  it('returns [] for [] rather than throwing', () => {
    expect(aggregateByFingerprint([])).toEqual([]);
  });
});

describe('classifySignal', () => {
  it('classifies "new" when the fingerprint is absent from history', () => {
    const idx = new Map([['fp-known', 'open']]);
    expect(classifySignal({ fingerprint: 'fp-unseen' }, idx)).toBe('new');
  });

  it('classifies "recurring" for an open prior incident on the same fingerprint', () => {
    const idx = new Map([['fp-a', 'open']]);
    expect(classifySignal({ fingerprint: 'fp-a' }, idx)).toBe('recurring');
  });

  it('classifies "resolved-recur" when a previously RESOLVED fingerprint fires again', () => {
    const idx = new Map([['fp-a', 'resolved']]);
    expect(classifySignal({ fingerprint: 'fp-a' }, idx)).toBe('resolved-recur');
  });

  it('degrades every signal to "new" when no history index is available (index === null)', () => {
    // This is the honest-degrade case: memory/incidents/ does not exist yet.
    // It must NOT be conflated with "checked, found nothing" — collect.mjs's
    // buildOutput.classification_basis is what tells a reader which case
    // this was; classifySignal itself just returns the same 'new' either way.
    expect(classifySignal({ fingerprint: 'fp-a' }, null)).toBe('new');
  });
});

describe('normalizeSentryIssue', () => {
  it('always maps feature_id to "unmapped" (list endpoint carries no per-issue tags)', () => {
    const issue = {
      id: 'sentry-123',
      count: 7,
      firstSeen: '2026-08-19T00:00:00.000Z',
      lastSeen: '2026-08-20T00:00:00.000Z',
      level: 'fatal',
      title: 'TypeError in checkScheduleConflicts',
      permalink: 'https://sentry.io/x',
    };
    const signal = normalizeSentryIssue(issue);
    expect(signal.feature_id).toBe('unmapped');
    expect(signal.fingerprint).toBe('sentry-123');
    expect(signal.severity).toBe('critical'); // 'fatal' maps to 'critical', matching Bridge's own vocabulary.
    expect(signal.count).toBe(7);
  });
});

describe('buildOutput', () => {
  const window = { from: '2026-08-20T00:00:00.000Z', to: '2026-08-21T00:00:00.000Z', hours: 24 };
  const production = { git_sha: 'abc1234', vercel_deployment_id: 'dpl_x', resolved_via: 'vercel-inspect', note: null };

  it('merges bridge + sentry signals, stamps release_sha, and reports source statuses honestly', () => {
    const bridge = {
      status: 'ok',
      note: null,
      raw_count: 1,
      truncated: false,
      signals: [
        { fingerprint: 'fp-a', feature_id: 'calendar_events', source: 'bridge', classification: 'new', first_seen: 'A', last_seen: 'B', count: 2 },
      ],
    };
    const sentry = { status: 'unconfigured', note: 'sentry: skipped (no token)', signals: [] };
    const ci = { status: 'ok', note: null, runs: [] };

    const out = buildOutput({ window, production, bridge, sentry, ci, incidentIndexPresent: false });

    expect(out.window).toBe(window);
    expect(out.production).toBe(production);
    expect(out.sources.bridge.status).toBe('ok');
    expect(out.sources.sentry.status).toBe('unconfigured');
    expect(out.sources.sentry.note).toBe('sentry: skipped (no token)');
    expect(out.signals).toHaveLength(1);
    expect(out.signals[0]).toMatchObject({
      feature_id: 'calendar_events',
      fingerprint: 'fp-a',
      source: 'bridge',
      classification: 'new',
      release_sha: 'abc1234',
    });
    expect(out.classification_basis).toMatch(/absent/);
  });

  it('never fabricates release_sha when production identity is unresolved', () => {
    const bridge = {
      status: 'ok',
      note: null,
      raw_count: 1,
      truncated: false,
      signals: [{ fingerprint: 'fp-a', feature_id: 'x', source: 'bridge', classification: 'new', first_seen: 'A', last_seen: 'B', count: 1 }],
    };
    const sentry = { status: 'unconfigured', note: null, signals: [] };
    const ci = { status: 'error', note: 'ci: gh api failed', runs: [] };
    const unresolvedProduction = { git_sha: null, vercel_deployment_id: null, resolved_via: 'unknown', note: 'unresolvable' };

    const out = buildOutput({ window, production: unresolvedProduction, bridge, sentry, ci, incidentIndexPresent: true });
    expect(out.signals[0]).not.toHaveProperty('release_sha');
    expect(out.sources.vercel.status).toBe('error');
    expect(out.classification_basis).toMatch(/present/);
  });

  it('a source in "error" status still yields an empty signals slice, never a fabricated zero disguised as healthy', () => {
    const bridge = { status: 'error', note: 'bridge: query failed — timeout', raw_count: null, truncated: false, signals: [] };
    const sentry = { status: 'unconfigured', note: 'sentry: skipped (no token)', signals: [] };
    const ci = { status: 'error', note: 'ci: gh api failed', runs: [] };

    const out = buildOutput({ window, production, bridge, sentry, ci, incidentIndexPresent: false });
    expect(out.signals).toEqual([]);
    expect(out.sources.bridge.status).toBe('error');
    expect(out.sources.bridge.note).toMatch(/query failed/);
  });
});

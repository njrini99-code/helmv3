import { describe, it, expect } from 'vitest';
import {
  buildIncidentReport,
  buildCombinedIncidentReport,
  resolveActionFilePath,
  featureLabelFor,
  extractActionName,
  extractRoute,
  extractCollapsedCount,
  selectNearbyDeploys,
  type IncidentReportInput,
} from '@/lib/admin/incident-report';

const minimal: IncidentReportInput = {
  title: 'savePartialRound failed',
  severity: 'error',
  generatedAt: '2026-07-02T00:00:00.000Z',
};

describe('buildIncidentReport', () => {
  it('renders every section with explicit placeholders when fields are empty/absent', () => {
    const report = buildIncidentReport(minimal);
    expect(report).toContain('# Incident report: savePartialRound failed');
    expect(report).toContain('app: helmv3 (prod) · captured by Helm Bridge admin_events');
    expect(report).toContain('generated: 2026-07-02T00:00:00.000Z');
    expect(report).toContain('- Fingerprint: —');
    expect(report).toContain('- Source: —');
    expect(report).toContain('- Sport: —');
    expect(report).toContain('- Feature: —');
    expect(report).toContain('- Action: —');
    expect(report).toContain('- Source file: — (not resolvable from the feature registry)');
    expect(report).toContain('(no message captured)');
    expect(report).toContain('_no stack trace captured_');
    expect(report).toContain('_no occurrence detail available_');
    expect(report).toContain('_no deploy data available_');
    expect(report).toContain('_not linked to a Sentry issue_');
  });

  it('never crashes and never truncates on empty-string vs null vs undefined fields', () => {
    const report = buildIncidentReport({
      title: '',
      message: '',
      severity: 'info',
      fingerprint: null,
      eventCount: 0,
      affectedUserCount: 0,
    });
    expect(report).toContain('(untitled incident)');
    expect(report).toContain('(no message captured)');
    expect(report).toContain('- Events: 0');
    expect(report).toContain('- Affected users: 0');
  });

  it('preserves unicode exactly in the message and title', () => {
    const report = buildIncidentReport({
      ...minimal,
      title: '🔥 支払い失敗 — refund déjà tenté',
      message: 'Ошибка: не удалось сохранить раунд 🏌️‍♂️ — “curly quotes” too',
    });
    expect(report).toContain('🔥 支払い失敗 — refund déjà tenté');
    expect(report).toContain('Ошибка: не удалось сохранить раунд 🏌️‍♂️ — “curly quotes” too');
  });

  it('does not truncate a very long message — full text survives untouched', () => {
    const longMessage = 'x'.repeat(50_000) + 'END_MARKER';
    const report = buildIncidentReport({ ...minimal, message: longMessage });
    expect(report).toContain(longMessage);
    expect(report).toContain('END_MARKER');
  });

  it('widens the code fence past a message that itself contains backticks', () => {
    const message = 'call `foo()` then\n```\nembedded code block\n```\ndone';
    const report = buildIncidentReport({ ...minimal, message });
    // A 4-backtick fence must wrap the 3-backtick content so it round-trips.
    expect(report).toMatch(/````\ncall `foo\(\)` then/);
    expect(report).toContain(message);
  });

  it('collapses newlines/whitespace only in the H1 heading, never in the message body', () => {
    const report = buildIncidentReport({
      ...minimal,
      title: 'line one\nline two\t\ttabbed',
      message: 'line one\nline two preserved',
    });
    expect(report).toContain('# Incident report: line one line two tabbed');
    expect(report).toContain('line one\nline two preserved');
  });

  it('resolves feature label + action source file from the registry', () => {
    const report = buildIncidentReport({
      ...minimal,
      featureKey: 'round_tracking',
      actionName: 'submitGolfRoundComprehensive',
    });
    expect(report).toContain('- Feature: Round Tracking (`round_tracking`)');
    expect(report).toContain('- Action: submitGolfRoundComprehensive');
    expect(report).toContain('- Source file: `src/app/golf/actions/golf.ts`');
  });

  it('renders collapsed-count suffix only when present and positive', () => {
    const withCollapsed = buildIncidentReport({ ...minimal, eventCount: 42, collapsedCount: 8 });
    expect(withCollapsed).toContain('- Events: 42 (plus 8 collapsed by flood-throttle)');
    const withoutCollapsed = buildIncidentReport({ ...minimal, eventCount: 42, collapsedCount: 0 });
    expect(withoutCollapsed).toContain('- Events: 42');
    expect(withoutCollapsed).not.toContain('collapsed by flood-throttle');
  });

  it('caps rendered occurrences at 20 but reports the true total', () => {
    const occurrences = Array.from({ length: 35 }, (_, i) => ({
      timestamp: `2026-07-0${(i % 9) + 1}T00:00:00.000Z`,
      route: `/golf/dashboard/rounds/${i}`,
      userId: `user-${i}`,
    }));
    const report = buildIncidentReport({ ...minimal, occurrences });
    expect(report).toContain('## Recent occurrences (showing 20 of 35)');
    expect(report).toContain('route=/golf/dashboard/rounds/0');
    expect(report).not.toContain('route=/golf/dashboard/rounds/20');
  });

  it('includes metadata JSON on an occurrence when present', () => {
    const report = buildIncidentReport({
      ...minimal,
      occurrences: [{ timestamp: '2026-07-02T00:00:00.000Z', metadata: { code: '42501' } }],
    });
    expect(report).toContain('metadata={"code":"42501"}');
  });

  it('renders deploy markers with and without a sha', () => {
    const report = buildIncidentReport({
      ...minimal,
      deployMarkers: [
        { time: '2026-07-01T23:00:00.000Z', sha: 'abc1234' },
        { time: '2026-07-01T22:00:00.000Z', sha: null },
      ],
    });
    expect(report).toContain('2026-07-01T23:00:00.000Z sha=abc1234');
    expect(report).toContain('2026-07-01T22:00:00.000Z\n');
  });

  it('renders the sentry URL when present', () => {
    const report = buildIncidentReport({ ...minimal, sentryUrl: 'https://sentry.io/organizations/helm/issues/1/' });
    expect(report).toContain('https://sentry.io/organizations/helm/issues/1/');
  });
});

describe('resolveActionFilePath', () => {
  it('returns the unique file when the action is explicitly listed', () => {
    expect(resolveActionFilePath('round_tracking', 'submitGolfRoundComprehensive')).toBe(
      'src/app/golf/actions/golf.ts',
    );
  });

  it('falls back to the single ALL file when the action is not explicitly listed anywhere', () => {
    expect(resolveActionFilePath('round_tracking', 'someUnlistedExport')).toBe(
      'src/app/golf/actions/round-drafts.ts',
    );
  });

  it('resolves an explicit match on a multi-export feature file', () => {
    expect(resolveActionFilePath('round_review_ai', 'generateRoundReview')).toBe(
      'src/app/golf/actions/insights.ts',
    );
  });

  it('joins multiple ALL candidates instead of guessing when ambiguous', () => {
    const result = resolveActionFilePath('round_review_ai', 'someUnknownExport');
    expect(result).toContain('src/app/golf/actions/round-reviews.ts');
    expect(result).toContain('src/app/golf/actions/round-review-system.ts');
    expect(result).toContain('src/app/golf/actions/round-recap.ts');
    expect(result).toContain('src/app/golf/actions/v3/llm.ts');
    expect(result).toContain(' or ');
  });

  it('returns null for an unknown feature key', () => {
    expect(resolveActionFilePath('not_a_real_feature', 'anything')).toBeNull();
  });

  it('returns null when featureKey or actionName is missing', () => {
    expect(resolveActionFilePath(null, 'anything')).toBeNull();
    expect(resolveActionFilePath('round_tracking', null)).toBeNull();
    expect(resolveActionFilePath(undefined, undefined)).toBeNull();
  });

  it('returns null for the excluded CRM feature (empty actions manifest)', () => {
    expect(resolveActionFilePath('crm_recruiting_pipeline', 'anything')).toBeNull();
  });
});

describe('featureLabelFor', () => {
  it('resolves a known key', () => {
    expect(featureLabelFor('round_tracking')).toBe('Round Tracking');
  });
  it('returns null for unknown/absent keys', () => {
    expect(featureLabelFor('nope')).toBeNull();
    expect(featureLabelFor(null)).toBeNull();
    expect(featureLabelFor(undefined)).toBeNull();
  });
});

describe('extractActionName / extractRoute / extractCollapsedCount', () => {
  it('extracts action + route from a normalizeContext-shaped metadata blob', () => {
    const metadata = { action: 'submitGolfRoundComprehensive', route: '/golf/dashboard/rounds/new' };
    expect(extractActionName(metadata)).toBe('submitGolfRoundComprehensive');
    expect(extractRoute(metadata)).toBe('/golf/dashboard/rounds/new');
  });

  it('extracts nested collapsed_count (metadata.metadata.collapsed_count)', () => {
    const metadata = { action: 'x', metadata: { collapsed_count: 8 } };
    expect(extractCollapsedCount(metadata)).toBe(8);
  });

  it('degrades to null/0 for missing or malformed metadata', () => {
    expect(extractActionName(null)).toBeNull();
    expect(extractActionName(undefined)).toBeNull();
    expect(extractActionName('not an object')).toBeNull();
    expect(extractActionName({ action: 42 })).toBeNull();
    expect(extractRoute({})).toBeNull();
    expect(extractCollapsedCount({})).toBe(0);
    expect(extractCollapsedCount({ metadata: { collapsed_count: 'nope' } })).toBe(0);
  });
});

describe('selectNearbyDeploys', () => {
  const deploys = [
    { sha: 'aaa1111', time: Date.parse('2026-07-01T00:00:00.000Z') },
    { sha: 'bbb2222', time: Date.parse('2026-07-01T12:00:00.000Z') },
    { sha: null, time: Date.parse('2026-06-25T00:00:00.000Z') }, // way before the window
  ];

  it('keeps deploys within 24h-before-firstSeen through lastSeen, sorted most-recent-first', () => {
    const result = selectNearbyDeploys(deploys, '2026-07-01T06:00:00.000Z', '2026-07-01T18:00:00.000Z');
    expect(result).toEqual([
      { sha: 'bbb2222', time: '2026-07-01T12:00:00.000Z' },
      { sha: 'aaa1111', time: '2026-07-01T00:00:00.000Z' },
    ]);
  });

  it('returns an empty array when there are no deploys', () => {
    expect(selectNearbyDeploys([], '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')).toEqual([]);
  });

  it('returns an empty array when firstSeen/lastSeen are absent and nothing falls in an unbounded... actually keeps everything unbounded', () => {
    // No firstSeen/lastSeen means an unbounded window — every deploy qualifies.
    const result = selectNearbyDeploys(deploys, null, null);
    expect(result).toHaveLength(3);
  });

  it('caps at maxCount', () => {
    const result = selectNearbyDeploys(deploys, null, null, 1);
    expect(result).toHaveLength(1);
    expect(result[0]!.sha).toBe('bbb2222');
  });
});

describe('buildCombinedIncidentReport', () => {
  it('renders a header with filter description and a no-match placeholder for zero incidents', () => {
    const doc = buildCombinedIncidentReport([], {
      filterDescription: 'sport=golf; severity=critical',
      generatedAt: '2026-07-02T00:00:00.000Z',
    });
    expect(doc).toContain('# Incident reports — filtered export');
    expect(doc).toContain('filters: sport=golf; severity=critical');
    expect(doc).toContain('incident count: 0');
    expect(doc).toContain('_no incidents match the current filters_');
  });

  it('concatenates every pre-built report verbatim with numbered dividers', () => {
    const r1 = buildIncidentReport({ ...minimal, title: 'first incident' });
    const r2 = buildIncidentReport({ ...minimal, title: 'second incident' });
    const doc = buildCombinedIncidentReport([r1, r2], {
      filterDescription: 'window=24h',
      generatedAt: '2026-07-02T00:00:00.000Z',
    });
    expect(doc).toContain('incident count: 2');
    expect(doc).toContain('Incident 1 of 2');
    expect(doc).toContain('Incident 2 of 2');
    expect(doc).toContain('# Incident report: first incident');
    expect(doc).toContain('# Incident report: second incident');
    // Order preserved.
    expect(doc.indexOf('first incident')).toBeLessThan(doc.indexOf('second incident'));
  });

  it('defaults the filter description text when empty', () => {
    const doc = buildCombinedIncidentReport([], { filterDescription: '' });
    expect(doc).toContain('filters: none (all unresolved incidents)');
  });
});

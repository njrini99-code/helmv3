import { describe, it, expect } from 'vitest';
import {
  buildIncidentEvidenceCoverage,
  buildIncidentEpisodes,
  buildBoardAliasGroups,
  buildIncidentGenome,
} from '../genome';
import type { UnifiedIncident } from '../types';

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
    isFixture: false,
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

describe('buildIncidentEvidenceCoverage', () => {
  it('maps sentry/supabase/vercel from incident.sources and leaves flight-recorder/jobs unknown', () => {
    const i = incident('a', {
      sources: [
        { source: 'sentry', health: 'reading', reason: null, occurrences: 3, firstSeen: null, lastSeen: null, ref: 'ISSUE-1', permalink: null, summary: null },
        { source: 'supabase', health: 'blind', reason: 'timeout', occurrences: null, firstSeen: null, lastSeen: null, ref: null, permalink: null, summary: null },
      ],
    });
    const coverage = buildIncidentEvidenceCoverage(i);
    const bySource = new Map(coverage.cells.map((c) => [c.source, c]));
    expect(bySource.get('sentry')!.mark).toBe('check');
    expect(bySource.get('supabase')!.mark).toBe('blind');
    expect(bySource.get('supabase')!.reason).toBe('timeout');
    expect(bySource.get('flight-recorder')!.health).toBe('unknown');
    expect(bySource.get('jobs')!.health).toBe('unknown');
    expect(bySource.get('github')!.health).toBe('unknown');
    expect(coverage.total).toBe(6);
  });

  it('infers a GitHub reading from a real repair status, never from silence', () => {
    const withRepair = incident('a', {
      repair: { status: 'pr-open', prNumber: 12, prUrl: 'https://x', branch: 'b', checks: null, mergedAt: null, mergeSha: null, note: null },
    });
    const coverage = buildIncidentEvidenceCoverage(withRepair);
    const github = coverage.cells.find((c) => c.source === 'github')!;
    expect(github.mark).toBe('check');

    const noRepair = incident('b', { repair: null });
    const coverageNoRepair = buildIncidentEvidenceCoverage(noRepair);
    const githubNone = coverageNoRepair.cells.find((c) => c.source === 'github')!;
    expect(githubNone.health).toBe('unknown');
  });
});

describe('buildIncidentEpisodes', () => {
  it('an incident with no resolution stays a single open episode', () => {
    const i = incident('a', { firstSeen: '2026-08-25T00:00:00Z', lastSeen: '2026-08-26T00:00:00Z' });
    const result = buildIncidentEpisodes(i);
    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0]!.kind).toBe('initial');
    expect(result.knownReopenedCount).toBeNull();
    expect(result.timelineIncomplete).toBe(false);
  });

  it('a resolution followed by a later lastSeen becomes a regression episode', () => {
    const i = incident('a', {
      firstSeen: '2026-08-25T19:08:00Z',
      lastSeen: '2026-09-02T12:07:00Z',
      resolution: { resolvedAt: '2026-08-25T23:45:00Z', resolvedBy: 'auto', fixedInSha: '8e4c5b7d', note: null, reopenedCount: 1 },
    });
    const result = buildIncidentEpisodes(i);
    expect(result.episodes).toHaveLength(2);
    expect(result.episodes[1]!.kind).toBe('regression');
    expect(result.knownReopenedCount).toBe(1);
    expect(result.timelineIncomplete).toBe(false);
  });

  it('flags the timeline as incomplete when reopenedCount exceeds what two timestamps can reconstruct', () => {
    const i = incident('a', {
      firstSeen: '2026-08-25T19:08:00Z',
      lastSeen: '2026-09-02T12:07:00Z',
      resolution: { resolvedAt: '2026-08-25T23:45:00Z', resolvedBy: 'auto', fixedInSha: '8e4c5b7d', note: null, reopenedCount: 4 },
    });
    const result = buildIncidentEpisodes(i);
    // Only one regression boundary is reconstructable from two timestamps.
    expect(result.episodes.filter((e) => e.kind === 'regression')).toHaveLength(1);
    expect(result.knownReopenedCount).toBe(4);
    expect(result.timelineIncomplete).toBe(true);
  });
});

describe('buildBoardAliasGroups + buildIncidentGenome', () => {
  it('groups two incidents sharing rpc + error code + feature within the tight window', () => {
    const a = incident('a', {
      firstSeen: '2026-08-25T19:08:00Z',
      errorCode: '42501',
      featureId: 'round_tracking',
      actionName: 'savePartialRound',
    });
    const b = incident('b', {
      firstSeen: '2026-08-25T19:10:00Z',
      errorCode: '42501',
      featureId: 'round_tracking',
      actionName: 'savePartialRound',
    });
    const groups = buildBoardAliasGroups([a, b]);
    expect(groups.get('a')).toBe(groups.get('b'));
    expect(groups.get('a')!.memberIds).toEqual(['a', 'b']);

    const genome = buildIncidentGenome(a, [a, b], groups);
    expect(genome.downstreamSymptoms.map((s) => s.id)).toEqual(['b']);
    expect(genome.aliasGroup.aliases).toHaveLength(1);
  });

  it('an incident with no alias produces a size-one group, not a hidden/empty state', () => {
    const a = incident('a', { errorCode: '23505' });
    const b = incident('b', { errorCode: '57014', featureId: 'auth_onboarding' });
    const groups = buildBoardAliasGroups([a, b]);
    const genome = buildIncidentGenome(a, [a, b], groups);
    expect(genome.aliasGroup.memberIds).toEqual(['a']);
    expect(genome.downstreamSymptoms).toHaveLength(0);
  });

  it('falls back to a size-one group when the incident is missing from the precomputed map', () => {
    const a = incident('a');
    const genome = buildIncidentGenome(a, [a], new Map());
    expect(genome.aliasGroup.rootId).toBe('a');
    expect(genome.aliasGroup.memberIds).toEqual(['a']);
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IncidentGenomePanel } from '../IncidentGenomePanel';
import { buildIncidentGenome, buildBoardAliasGroups } from '@/lib/admin/incidents/genome';
import type { UnifiedIncident } from '@/lib/admin/incidents/types';

function baseIncident(id: string, overrides: Partial<UnifiedIncident> = {}): UnifiedIncident {
  return {
    id,
    linkTarget: `/admin/errors/${id}`,
    title: `incident ${id}`,
    description: `incident ${id}`,
    severity: 'error',
    lifecycle: { state: 'new', headline: 'h', because: [] },
    firstSeen: '2026-08-25T19:08:00Z',
    lastSeen: '2026-08-25T19:08:00Z',
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
    ...overrides,
  };
}

describe('IncidentGenomePanel', () => {
  it('says no alternate evidence was found for a standalone incident', () => {
    const incident = baseIncident('a');
    const groups = buildBoardAliasGroups([incident]);
    const genome = buildIncidentGenome(incident, [incident], groups);
    render(<IncidentGenomePanel genome={genome} />);
    expect(screen.getByText(/No alternate evidence found/)).toBeInTheDocument();
  });

  it('lists a grouped alias with its merge tier and reason', () => {
    const a = baseIncident('a', { errorCode: '42501', featureId: 'round_tracking', actionName: 'savePartialRound' });
    const b = baseIncident('b', {
      errorCode: '42501',
      featureId: 'round_tracking',
      actionName: 'savePartialRound',
      firstSeen: '2026-08-25T19:10:00Z',
      description: 'incident b description',
    });
    const groups = buildBoardAliasGroups([a, b]);
    const genome = buildIncidentGenome(a, [a, b], groups);
    render(<IncidentGenomePanel genome={genome} />);
    expect(screen.getByText('incident b description')).toBeInTheDocument();
    // Same rpc (actionName) + errorCode + featureId all align -> the classifier's
    // 'highest' tier, not merely 'medium' — see aliases.ts's rule order.
    expect(screen.getByText('highest')).toBeInTheDocument();
  });

  it('renders the episode timeline and flags an incomplete reconstruction', () => {
    const incident = baseIncident('a', {
      lastSeen: '2026-09-02T12:07:00Z',
      resolution: { resolvedAt: '2026-08-25T23:45:00Z', resolvedBy: 'auto', fixedInSha: '8e4c5b7d', note: null, reopenedCount: 3 },
    });
    const groups = buildBoardAliasGroups([incident]);
    const genome = buildIncidentGenome(incident, [incident], groups);
    render(<IncidentGenomePanel genome={genome} />);
    expect(screen.getByText(/reopened 3 times total/)).toBeInTheDocument();
  });
});

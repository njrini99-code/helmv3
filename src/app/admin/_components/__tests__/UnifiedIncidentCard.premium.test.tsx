// Phase 1 additions only — the pre-existing card behavior (severity rail,
// lifecycle chip, proof dots, feature tags, details disclosure, etc.) is
// exercised indirectly by the errors page tests and is unchanged by this
// file; these tests cover only what the new optional props add.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnifiedIncidentCard } from '../UnifiedIncidentCard';
import type { UnifiedIncident } from '@/lib/admin/incidents/types';
import type { IncidentPresentation } from '@/lib/admin/incidents/present';
import { buildIncidentGenome, buildBoardAliasGroups } from '@/lib/admin/incidents/genome';
import type { ReleaseRelationshipVerdict } from '@/lib/admin/incidents/release-context';

function baseIncident(id: string): UnifiedIncident {
  return {
    id,
    linkTarget: `/admin/errors/${id}`,
    title: `incident ${id}`,
    description: `raw description ${id}`,
    severity: 'error',
    lifecycle: { state: 'new', headline: 'New — not yet analysed.', because: [] },
    firstSeen: '2026-09-01T00:00:00.000Z',
    lastSeen: '2026-09-01T00:00:00.000Z',
    occurrences: 3,
    affectedUsers: 2,
    affectedUsersKnown: true,
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
    computedAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('UnifiedIncidentCard — Phase 1 additions', () => {
  it('falls back to incident.description when no presentation is given (pre-Phase-1 behavior preserved)', () => {
    render(<UnifiedIncidentCard incident={baseIncident('a')} series={null} />);
    expect(screen.getByText('raw description a')).toBeInTheDocument();
  });

  it('renders the Phase 0 human title and technical signature when a presentation is given', () => {
    const presentation: IncidentPresentation = {
      title: 'Round autosave blocked by database permissions',
      operationContext: 'Golf > Round Tracking > Autosave',
      technicalSignature: '42501 · permission denied',
      resolvedBy: 'code',
      matchedRule: 'pg-42501-round-tracking',
    };
    render(<UnifiedIncidentCard incident={baseIncident('a')} series={null} presentation={presentation} />);
    expect(screen.getByText('Round autosave blocked by database permissions')).toBeInTheDocument();
    expect(screen.getByText('Golf > Round Tracking > Autosave')).toBeInTheDocument();
    expect(screen.getByText('42501 · permission denied')).toBeInTheDocument();
    expect(screen.queryByText('raw description a')).not.toBeInTheDocument();
  });

  it('renders a hatched "unknown" release relationship when the prop is explicitly null, not omitted', () => {
    render(<UnifiedIncidentCard incident={baseIncident('a')} series={null} releaseRelationship={null} />);
    const el = screen.getByText('UNKNOWN');
    expect(el).toHaveAttribute('data-slot', 'bridge-unknown-value');
  });

  it('renders a real release relationship label when computed', () => {
    const verdict: ReleaseRelationshipVerdict = {
      relationship: 'existed-before-release',
      confidence: 0.9,
      evidenceFor: ['First seen before this release deployed.'],
      evidenceAgainst: [],
    };
    render(<UnifiedIncidentCard incident={baseIncident('a')} series={null} releaseRelationship={verdict} />);
    expect(screen.getByText('EXISTED BEFORE RELEASE')).toBeInTheDocument();
  });

  it('omits the release relationship line entirely when the prop is not passed at all', () => {
    render(<UnifiedIncidentCard incident={baseIncident('a')} series={null} />);
    expect(screen.queryByText('UNKNOWN')).not.toBeInTheDocument();
    expect(screen.queryByText('EXISTED BEFORE RELEASE')).not.toBeInTheDocument();
  });

  it('shows an episode timeline strip only when the incident has actually regressed (>1 episode)', () => {
    const regressed = {
      ...baseIncident('a'),
      firstSeen: '2026-08-25T19:08:00Z',
      lastSeen: '2026-09-02T12:07:00Z',
      resolution: { resolvedAt: '2026-08-25T23:45:00Z', resolvedBy: 'auto' as const, fixedInSha: '8e4c5b7d', note: null, reopenedCount: 1 },
    };
    const groups = buildBoardAliasGroups([regressed]);
    const genome = buildIncidentGenome(regressed, [regressed], groups);
    render(<UnifiedIncidentCard incident={regressed} series={null} genome={genome} />);
    expect(screen.getByText('2 episodes')).toBeInTheDocument();

    const single = baseIncident('b');
    const singleGroups = buildBoardAliasGroups([single]);
    const singleGenome = buildIncidentGenome(single, [single], singleGroups);
    render(<UnifiedIncidentCard incident={single} series={null} genome={singleGenome} />);
    expect(screen.queryByText('1 episode')).not.toBeInTheDocument();
  });

  it('renders the source confidence ring when a genome is given', () => {
    const incident = baseIncident('a');
    const groups = buildBoardAliasGroups([incident]);
    const genome = buildIncidentGenome(incident, [incident], groups);
    render(<UnifiedIncidentCard incident={incident} series={null} genome={genome} />);
    expect(screen.getByRole('img', { name: /Evidence coverage/ })).toBeInTheDocument();
  });
});

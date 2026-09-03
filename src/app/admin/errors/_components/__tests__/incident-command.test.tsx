import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LifecycleSpine, LifecycleWhy, LIFECYCLE_STAGES } from '@/app/admin/errors/_components/LifecycleSpine';
import { EvidenceWall, RootCauseCard, RepairCard, DeploymentProofCard } from '@/app/admin/errors/_components/EvidenceWall';
import {
  PROOF_MILESTONES,
  LIFECYCLE_LABEL,
  type UnifiedIncident,
  type ProofDot,
  type ProofMilestone,
  type LifecycleVerdict,
  type IncidentSourceEvidence,
  type IncidentAnalysis,
  type IncidentRepair,
  type IncidentDeployProof,
  type IncidentResolution,
} from '@/lib/admin/incidents/types';

// Coverage for the Incident Command detail components: the lifecycle spine
// (LifecycleSpine.tsx) and the evidence wall (EvidenceWall.tsx). The
// invariant every test here ultimately checks is the same one the source
// files' own doc comments state: unknown must never read like healthy or
// like orderly progress, and every state reaches the DOM as a word, not
// only as colour.

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function proofDot(milestone: ProofMilestone, state: ProofDot['state'], evidence: string | null = null): ProofDot {
  return { milestone, state, evidence };
}

function fullProof(overrides: Partial<Record<ProofMilestone, ProofDot>> = {}): ProofDot[] {
  return PROOF_MILESTONES.map((m) => overrides[m] ?? proofDot(m, 'not-reached'));
}

const baseVerdict: LifecycleVerdict = {
  state: 'awaiting-proof',
  headline: 'Deployed — waiting for post-deploy traffic to prove it.',
  because: [
    { status: 'met', text: 'Repair PR merged 2 days ago (#42).' },
    { status: 'pending', text: 'Not enough post-deploy traffic yet to call this proven.' },
  ],
};

function makeIncident(overrides: Partial<UnifiedIncident> = {}): UnifiedIncident {
  return {
    id: 'fp-1',
    linkTarget: '/admin/errors/fp-1',
    title: 'Test incident',
    description: 'Test incident description',
    severity: 'error',
    lifecycle: baseVerdict,
    firstSeen: '2026-08-01T00:00:00.000Z',
    lastSeen: '2026-08-02T00:00:00.000Z',
    occurrences: 4,
    affectedUsers: 2,
    affectedUsersKnown: true,
    sources: [],
    corroboration: 1,
    appFingerprints: ['fp-1'],
    sentryIssueIds: [],
    reliabilitySignatures: [],
    route: '/golf/dashboard',
    featureId: 'golf-dashboard',
    actionName: 'loadDashboard',
    errorCode: null,
    sport: 'golf',
    klass: 'defect',
    actionable: true,
    klassReason: 'Genuine unexpected failure.',
    isFixture: false,
    analysis: null,
    repair: null,
    deployProof: null,
    resolution: null,
    proof: fullProof(),
    proofGaps: [],
    evidenceCoverage: { dimensions: [], present: 0, total: 0 },
    report: '',
    computedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}

function makeSource(overrides: Partial<IncidentSourceEvidence> = {}): IncidentSourceEvidence {
  return {
    source: 'app',
    health: 'reading',
    reason: null,
    occurrences: 4,
    firstSeen: null,
    lastSeen: null,
    ref: 'fp-1',
    permalink: null,
    summary: 'Client error observed in the golf dashboard.',
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<IncidentAnalysis> = {}): IncidentAnalysis {
  return {
    category: 'fix-here',
    probableCause: 'A null check is missing before accessing player.id.',
    suggestedFix: 'FIX HERE — add a null guard at golf.ts:120.',
    confidence: 'high',
    suspectFiles: [{ path: 'src/lib/golf/roster.ts', line: 120, reason: 'Missing null guard' }],
    relatedFingerprints: [],
    model: 'claude-opus-5',
    generatedAt: '2026-08-01T00:00:00.000Z',
    repairVerdict: 'not-reviewed',
    ...overrides,
  };
}

function makeRepair(overrides: Partial<IncidentRepair> = {}): IncidentRepair {
  return {
    status: 'pr-open',
    prNumber: 42,
    prUrl: 'https://github.com/org/repo/pull/42',
    branch: 'agent/fix-golf-roster',
    checks: { total: 3, passed: 2, failed: 0, pending: 1 },
    mergedAt: null,
    mergeSha: null,
    note: null,
    ...overrides,
  };
}

function makeDeployProof(overrides: Partial<IncidentDeployProof> = {}): IncidentDeployProof {
  return {
    fixedInSha: 'abc123',
    productionSha: 'def456',
    deployedAt: '2026-08-01T00:00:00.000Z',
    servesFix: true,
    lastOccurrenceAt: null,
    sinceDeployMs: 3 * 24 * 3600_000,
    sufficientProof: true,
    gap: null,
    ...overrides,
  };
}

function makeResolution(overrides: Partial<IncidentResolution> = {}): IncidentResolution {
  return {
    resolvedAt: '2026-08-01T00:00:00.000Z',
    resolvedBy: 'auto',
    fixedInSha: 'abc123',
    note: null,
    reopenedCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// LifecycleSpine
// ---------------------------------------------------------------------------

describe('LifecycleSpine', () => {
  it('renders exactly LIFECYCLE_STAGES.length stages, each with its state as visible text', () => {
    const incident = makeIncident({
      proof: fullProof({
        observed: proofDot('observed', 'proven', 'Seen by APP'),
        analyzed: proofDot('analyzed', 'proven', 'Fix here (confidence: high)'),
        reproduced: proofDot('reproduced', 'proven', 'Branch fix/123 has 2 passing checks'),
        'ci-proven': proofDot('ci-proven', 'proven', '2 of 2 checks passed'),
        deployed: proofDot('deployed', 'pending', 'Merged; production has not deployed the fix yet'),
        'production-verified': proofDot('production-verified', 'not-reached', null),
      }),
    });

    const { container } = render(<LifecycleSpine incident={incident} />);

    const stageNodes = container.querySelectorAll('[data-lifecycle-stage]');
    expect(stageNodes).toHaveLength(LIFECYCLE_STAGES.length);

    // Every stage's state reaches the DOM as a WORD, not only as a colour —
    // the four already-proven milestones (Capture, Diagnose, and the two
    // dots merged into Repair) collapse to one "proven" word each, and
    // Release/Verify/Close each contribute their own distinct word. Verify
    // and Close both land on "not reached" here, so that one is asserted
    // with getAllByText rather than getByText.
    expect(screen.getAllByText('proven').length).toBeGreaterThan(0);
    expect(screen.getByText('in progress')).toBeInTheDocument();
    expect(screen.getAllByText('not reached').length).toBeGreaterThan(0);
  });

  it('renders a stage whose proof dot is unknown differently from one that is not-reached', () => {
    const incident = makeIncident({
      proof: fullProof({
        observed: proofDot('observed', 'unknown', 'No source has read this fault yet.'),
        'production-verified': proofDot('production-verified', 'not-reached', null),
      }),
    });

    const { container } = render(<LifecycleSpine incident={incident} />);

    // Different WORDS reach the DOM. Every stage besides Capture defaults to
    // not-reached in this fixture, so it is asserted with getAllByText.
    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(screen.getAllByText('not reached').length).toBeGreaterThan(0);

    // Different SHAPES — only the "unknown" glyph draws a dashed stroke;
    // "not reached" is a plain hollow circle. Collapsing the two into one
    // shape is the exact unknown-as-orderly-progress failure this component
    // exists to refuse.
    expect(container.querySelector('[stroke-dasharray]')).not.toBeNull();
  });

  it('shows a stage\'s evidence when its dot carries it, and invents nothing when it does not', () => {
    const incident = makeIncident({
      proof: fullProof({
        observed: proofDot('observed', 'proven', 'Seen by APP and SENTRY'),
      }),
    });

    render(<LifecycleSpine incident={incident} />);
    expect(screen.getByText('Seen by APP and SENTRY')).toBeInTheDocument();
  });

  it('renders Close as failed, not proven, when the incident regressed even though a resolution still exists', () => {
    const incident = makeIncident({
      resolution: makeResolution({ resolvedBy: 'manual', reopenedCount: 1 }),
      lifecycle: { ...baseVerdict, state: 'regressed' },
    });

    const { container } = render(<LifecycleSpine incident={incident} />);
    const closeNode = container.querySelector('[data-lifecycle-stage="close"]');
    expect(closeNode).not.toBeNull();
    expect(within(closeNode as HTMLElement).getByText('failed')).toBeInTheDocument();
  });

  it('renders Close as proven from a resolution when the incident has not regressed', () => {
    const incident = makeIncident({ resolution: makeResolution() });

    const { container } = render(<LifecycleSpine incident={incident} />);
    const closeNode = container.querySelector('[data-lifecycle-stage="close"]');
    expect(closeNode).not.toBeNull();
    expect(within(closeNode as HTMLElement).getByText('proven')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// LifecycleWhy
// ---------------------------------------------------------------------------

describe('LifecycleWhy', () => {
  it('renders the headline and one line per because entry, each with its status word', () => {
    const verdict: LifecycleVerdict = {
      state: 'awaiting-proof',
      headline: 'Deployed — waiting for post-deploy traffic to prove it.',
      because: [
        { status: 'met', text: 'Repair PR merged 2 days ago (#42).' },
        { status: 'pending', text: 'Not enough post-deploy traffic yet to call this proven.' },
        { status: 'failed', text: 'Something contradicted.' },
      ],
    };

    const { container } = render(<LifecycleWhy verdict={verdict} />);

    expect(screen.getByText(/Why "AWAITING PROOF"\?/)).toBeInTheDocument();
    expect(screen.getByText(verdict.headline)).toBeInTheDocument();
    // Each reason line's own text sits alongside its status word inside one
    // <span> ("met — Repair PR merged…"), so it is checked against the
    // rendered text as a whole rather than via getByText, which requires a
    // single element whose ENTIRE text matches — multiple elements in this
    // tree share the same substring by nesting.
    expect(container.textContent).toContain('Repair PR merged 2 days ago (#42).');
    expect(container.textContent).toContain('Not enough post-deploy traffic yet to call this proven.');
    expect(container.textContent).toContain('Something contradicted.');
    expect(screen.getByText('met')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('builds its heading from LIFECYCLE_LABEL for the verdict it is given', () => {
    const verdict: LifecycleVerdict = { state: 'pr-failed', headline: 'CI failed.', because: [{ status: 'failed', text: 'CI failed.' }] };
    render(<LifecycleWhy verdict={verdict} />);
    expect(screen.getByText(new RegExp(`Why "${LIFECYCLE_LABEL['pr-failed']}"`))).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// EvidenceWall
// ---------------------------------------------------------------------------

describe('EvidenceWall', () => {
  it('renders "unknown" — never the digit 0 — when a source reports no occurrence count', () => {
    render(<EvidenceWall sources={[makeSource({ occurrences: null })]} />);
    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it("renders a blind source's reason, never an empty card", () => {
    render(
      <EvidenceWall
        sources={[makeSource({ health: 'blind', reason: 'Sentry API returned 401', occurrences: null })]}
      />,
    );
    expect(screen.getByText(/Sentry API returned 401/)).toBeInTheDocument();
    expect(screen.getByText(/may be incomplete/i)).toBeInTheDocument();
  });
});

describe('RootCauseCard', () => {
  it('renders CORRECTED prominently when repair verdict is corrected', () => {
    render(<RootCauseCard analysis={makeAnalysis({ repairVerdict: 'corrected' })} />);
    expect(screen.getByText(/CORRECTED by repair/)).toBeInTheDocument();
    expect(screen.getByText(/quality signal, not an error/i)).toBeInTheDocument();
  });

  it('renders the honest empty state when no analysis exists', () => {
    render(<RootCauseCard analysis={null} />);
    expect(screen.getByText('No analysis yet.')).toBeInTheDocument();
  });

  it('renders confidence as a word, never a percentage', () => {
    render(<RootCauseCard analysis={makeAnalysis({ confidence: 'medium' })} />);
    expect(screen.getByText(/medium confidence/i)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

describe('RepairCard', () => {
  it('renders CHECKS UNREADABLE — and never the word "pending" — when checks could not be read', () => {
    render(<RepairCard repair={makeRepair({ checks: null })} />);
    expect(screen.getByText('CHECKS UNREADABLE')).toBeInTheDocument();
    // Conflating an unreadable check matrix with an in-progress one is the
    // forbidden unknown -> healthy move this card exists to refuse.
    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
  });

  it('renders "no repair attempted" when repair is null or its status is none', () => {
    const { rerender } = render(<RepairCard repair={null} />);
    expect(screen.getByText('No repair attempted.')).toBeInTheDocument();

    rerender(<RepairCard repair={makeRepair({ status: 'none', checks: null })} />);
    expect(screen.getByText('No repair attempted.')).toBeInTheDocument();
  });

  it('states the repair boundary — it never merges and never deploys', () => {
    render(<RepairCard repair={makeRepair()} />);
    expect(screen.getByText(/never merges and never deploys/i)).toBeInTheDocument();
  });
});

describe('DeploymentProofCard', () => {
  it('renders UNKNOWN — never "not deployed" — when servesFix is null', () => {
    render(
      <DeploymentProofCard
        proof={makeDeployProof({ servesFix: null, gap: 'Deploy status could not be read' })}
        resolution={null}
      />,
    );
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.queryByText(/not deployed/i)).not.toBeInTheDocument();
    expect(screen.getByText('Deploy status could not be read')).toBeInTheDocument();
  });

  it('makes a reopened resolution visible', () => {
    render(<DeploymentProofCard proof={null} resolution={makeResolution({ reopenedCount: 3 })} />);
    expect(screen.getByText(/Reopened 3 times/)).toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  ProofDots,
  ProofGapList,
  EvidenceCoverageStrip,
} from '@/app/admin/_components/ProofDots';
import { BlindnessBeacon } from '@/app/admin/_components/BlindnessBeacon';
import { SourceCoverageMatrix, SourceCoverageSummaryLine } from '@/app/admin/_components/SourceCoverage';
import {
  PROOF_MILESTONES,
  EVIDENCE_DIMENSIONS,
  SOURCE_HEALTH_LABEL,
  INCIDENT_SOURCE_LABEL,
  type ProofDot,
  type ProofGap,
  type EvidenceCoverage,
  type SourceFreshness,
} from '@/lib/admin/incidents/types';
import type { CoverageSummary } from '@/lib/admin/incidents/sources';

// ---------------------------------------------------------------------------
// ProofDots
// ---------------------------------------------------------------------------

function fullProof(): readonly ProofDot[] {
  const states: ProofDot['state'][] = ['proven', 'proven', 'proven', 'proven', 'pending', 'not-reached'];
  return PROOF_MILESTONES.map((milestone, i) => ({
    milestone,
    state: states[i]!,
    evidence: null,
  }));
}

describe('ProofDots', () => {
  it('renders exactly PROOF_MILESTONES.length dots', () => {
    const { container } = render(<ProofDots proof={fullProof()} />);
    expect(container.querySelectorAll('svg')).toHaveLength(PROOF_MILESTONES.length);
  });

  it('reports the completed count and names every milestone in its accessible label', () => {
    render(<ProofDots proof={fullProof()} />);
    const strip = screen.getByRole('img', { name: /4 of 6 proof stages complete/i });
    const label = strip.getAttribute('aria-label') ?? '';
    // Every milestone must be named — never a hardcoded subset.
    for (const milestone of PROOF_MILESTONES) {
      expect(label.toLowerCase()).toContain(milestone.replace('-', ' '));
    }
  });

  it('distinguishes a failed dot from a pending dot both visually (a different shape, not just a colour class) and textually (the aria-label names the state)', () => {
    const proof: readonly ProofDot[] = [
      { milestone: 'deployed', state: 'failed', evidence: 'production regressed' },
      { milestone: 'production-verified', state: 'pending', evidence: null },
    ];
    const { container } = render(<ProofDots proof={proof} />);

    // Textual: the aria-label carries both state words distinctly.
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toMatch(/deployed failed/i);
    expect(label).toMatch(/production verified pending/i);
    expect(label).not.toMatch(/deployed pending/i);

    // Visual: failed renders as a filled square (<rect>) with an "!" mark;
    // pending renders as a circle. Not the same shape.
    expect(container.querySelector('rect')).not.toBeNull();
    const failedTitle = screen.getByTitle(/production regressed/i);
    expect(failedTitle.querySelector('rect')).not.toBeNull();
    expect(failedTitle.querySelector('circle')).toBeNull();
  });

  it('does not render an unknown dot the same as a not-reached dot', () => {
    const proof: readonly ProofDot[] = [
      { milestone: 'ci-proven', state: 'unknown', evidence: null },
      { milestone: 'deployed', state: 'not-reached', evidence: null },
    ];
    const { container } = render(<ProofDots proof={proof} />);

    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toMatch(/ci proven unknown/i);
    expect(label).toMatch(/deployed not reached/i);

    // Unknown is a dashed circle with a "?" mark; not-reached is a plain
    // hollow circle. The dash pattern is the structural tell.
    const dashed = container.querySelectorAll('circle[stroke-dasharray]');
    expect(dashed).toHaveLength(1);
    expect(container.querySelectorAll('text')).toHaveLength(1); // only the "?" — not-reached has no mark
  });
});

// ---------------------------------------------------------------------------
// ProofGapList
// ---------------------------------------------------------------------------

describe('ProofGapList', () => {
  it('returns null for an empty gap list', () => {
    const { container } = render(<ProofGapList gaps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the detail text verbatim for a populated gap — never collapsed to the category label', () => {
    const gaps: readonly ProofGap[] = [
      { kind: 'awaiting-traffic', detail: 'iOS calls since deploy: 4', ageMs: 90_000 },
    ];
    render(<ProofGapList gaps={gaps} />);
    expect(screen.getByText(/iOS calls since deploy: 4/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for post-deploy traffic/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// EvidenceCoverageStrip
// ---------------------------------------------------------------------------

describe('EvidenceCoverageStrip', () => {
  function coverageFixture(): EvidenceCoverage {
    // 7 dimensions total: 5 present, 1 absent, 1 unknown.
    const states: EvidenceCoverage['dimensions'][number]['state'][] = [
      'present',
      'present',
      'present',
      'present',
      'present',
      'absent',
      'unknown',
    ];
    return {
      dimensions: EVIDENCE_DIMENSIONS.map((dimension, i) => ({ dimension, state: states[i]! })),
      present: 5,
      total: 7,
    };
  }

  it('shows "Evidence 5/7" for 5 present of 7', () => {
    render(<EvidenceCoverageStrip coverage={coverageFixture()} />);
    expect(screen.getByText('Evidence 5/7')).toBeInTheDocument();
  });

  it('marks an unknown dimension distinctly from an absent one', () => {
    render(<EvidenceCoverageStrip coverage={coverageFixture()} />);
    // The absent dimension is 'git-history' (index 5), the unknown one is
    // 'reproduction' (index 6) per the fixture above.
    expect(screen.getByTitle(/GIT HISTORY: absent/i)).toBeInTheDocument();
    expect(screen.getByTitle(/REPRO: unknown/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// BlindnessBeacon
// ---------------------------------------------------------------------------

function blindCoverage(): CoverageSummary {
  return {
    reading: 2,
    partial: 1,
    blind: 1,
    unknown: 0,
    total: 4,
    anyBlind: true,
    blindSources: ['sentry'],
    oldestAgeMs: 120_000,
    worst: 'blind',
  };
}

describe('BlindnessBeacon', () => {
  it('returns null when nothing is blind — no all-clear bar is ever rendered here', () => {
    const { container } = render(<BlindnessBeacon note={null} coverage={blindCoverage()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the note text and names each blind source when something is blind', () => {
    const note = 'Reliability coverage incomplete — SENTRY (403) could not be read this refresh.';
    const { container } = render(<BlindnessBeacon note={note} coverage={blindCoverage()} />);

    expect(screen.getByText(note)).toBeInTheDocument();

    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(within(details as HTMLElement).getByText(INCIDENT_SOURCE_LABEL.sentry)).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText(SOURCE_HEALTH_LABEL.blind)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SourceCoverageMatrix / SourceCoverageSummaryLine
// ---------------------------------------------------------------------------

function freshnessFixture(): readonly SourceFreshness[] {
  return [
    { source: 'app', observedAt: '2026-08-28T12:00:00Z', ageMs: 30_000, expectedIntervalMs: 60_000, state: 'fresh', health: 'reading' },
    { source: 'sentry', observedAt: '2026-08-28T11:58:00Z', ageMs: 150_000, expectedIntervalMs: 60_000, state: 'aging', health: 'partial' },
    { source: 'supabase', observedAt: null, ageMs: null, expectedIntervalMs: 10_800_000, state: 'unknown', health: 'blind' },
    { source: 'vercel', observedAt: null, ageMs: null, expectedIntervalMs: 300_000, state: 'unknown', health: 'unknown' },
  ];
}

describe('SourceCoverageMatrix', () => {
  it('renders one row per source, with health as visible TEXT — colour is never the only signal (the accessibility contract this component exists to satisfy)', () => {
    const freshness = freshnessFixture();
    render(<SourceCoverageMatrix freshness={freshness} />);

    const table = screen.getByRole('table');
    const bodyRows = within(table)
      .getAllByRole('row')
      .slice(1); // drop the header row
    expect(bodyRows).toHaveLength(freshness.length);

    freshness.forEach((row, i) => {
      const cells = within(bodyRows[i]!);
      expect(cells.getByText(INCIDENT_SOURCE_LABEL[row.source])).toBeInTheDocument();
      // The health word is real text content inside the pill, not merely a
      // background colour a colour-blind or low-vision reader can't rely on.
      expect(cells.getByText(SOURCE_HEALTH_LABEL[row.health])).toBeInTheDocument();
    });
  });
});

describe('SourceCoverageSummaryLine', () => {
  it('does not claim "0 reading" for an empty coverage — it says honestly that nothing is configured', () => {
    const empty: CoverageSummary = {
      reading: 0,
      partial: 0,
      blind: 0,
      unknown: 0,
      total: 0,
      anyBlind: false,
      blindSources: [],
      oldestAgeMs: null,
      worst: 'unknown',
    };
    render(<SourceCoverageSummaryLine coverage={empty} />);
    expect(screen.queryByText(/0 reading/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no sources configured/i)).toBeInTheDocument();
  });

  it('joins non-zero counts and appends the oldest reading\'s age when known', () => {
    const coverage: CoverageSummary = {
      reading: 2,
      partial: 1,
      blind: 1,
      unknown: 0,
      total: 4,
      anyBlind: true,
      blindSources: ['sentry'],
      oldestAgeMs: 125_000,
      worst: 'blind',
    };
    render(<SourceCoverageSummaryLine coverage={coverage} />);
    expect(screen.getByText(/2 reading/i)).toBeInTheDocument();
    expect(screen.getByText(/1 partial/i)).toBeInTheDocument();
    expect(screen.getByText(/1 blind/i)).toBeInTheDocument();
    expect(screen.getByText(/2m ago/i)).toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvidenceBraidTimeline } from '@/components/admin/triage/EvidenceBraidTimeline';
import { EVIDENCE_COVERAGE_SOURCES, buildEvidenceCoverage } from '@/lib/admin/incidents/coverage';
import type { EvidenceBraidView } from '@/lib/admin/triage/evidence-braid';

function allUnknownCoverage() {
  return buildEvidenceCoverage([]).cells;
}

function view(overrides: Partial<EvidenceBraidView> = {}): EvidenceBraidView {
  return {
    featureId: 'round_tracking' as EvidenceBraidView['featureId'],
    windowStartMs: Date.parse('2026-09-02T00:00:00.000Z'),
    windowEndMs: Date.parse('2026-09-03T00:00:00.000Z'),
    bucketMs: 2 * 60 * 60_000,
    points: [
      { bucketStartMs: 0, bucketEndMs: 1, cells: allUnknownCoverage(), present: 0, incidentIds: [] },
    ],
    flightRecorderBlind: false,
    ...overrides,
  };
}

describe('EvidenceBraidTimeline', () => {
  it('renders one lane per evidence source label', () => {
    render(<EvidenceBraidTimeline view={view()} />);
    expect(screen.getByText('Sentry')).toBeInTheDocument();
    expect(screen.getByText('Supabase')).toBeInTheDocument();
    expect(screen.getByText('Flight Recorder')).toBeInTheDocument();
    expect(screen.getByText('Vercel')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
  });

  it('renders nothing (no lanes) when there are zero points, rather than an empty frame', () => {
    const { container } = render(<EvidenceBraidTimeline view={view({ points: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('surfaces a board-wide blind notice when the Flight Recorder read failed', () => {
    render(<EvidenceBraidTimeline view={view({ flightRecorderBlind: true })} />);
    expect(screen.getByText(/could not be read this refresh/i)).toBeInTheDocument();
  });

  it('renders no blind notice when the Flight Recorder read succeeded', () => {
    render(<EvidenceBraidTimeline view={view({ flightRecorderBlind: false })} />);
    expect(screen.queryByText(/could not be read this refresh/i)).not.toBeInTheDocument();
  });

  it('every lane covers every declared evidence source, in order', () => {
    render(<EvidenceBraidTimeline view={view()} />);
    expect(EVIDENCE_COVERAGE_SOURCES.length).toBe(6);
  });
});

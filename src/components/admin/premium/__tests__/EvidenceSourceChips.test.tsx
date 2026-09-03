import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvidenceSourceChips, SourceConfidenceRing } from '../EvidenceSourceChips';
import { buildEvidenceCoverage } from '@/lib/admin/incidents/coverage';

const coverage = buildEvidenceCoverage([
  { source: 'sentry', health: 'reading', reason: null },
  { source: 'supabase', health: 'blind', reason: 'Query timed out.' },
  { source: 'vercel', health: 'partial', reason: 'Only the first page of deploys was read.' },
]);

describe('EvidenceSourceChips', () => {
  it('renders all six sources, never dropping the ones with no reading', () => {
    render(<EvidenceSourceChips coverage={coverage} />);
    expect(screen.getByText('Sentry')).toBeInTheDocument();
    expect(screen.getByText('Supabase')).toBeInTheDocument();
    expect(screen.getByText('Vercel')).toBeInTheDocument();
    expect(screen.getByText('Flight Recorder')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
  });

  it('routes a never-attempted source through the hatched treatment, distinct from a blind one', () => {
    render(<EvidenceSourceChips coverage={coverage} />);
    expect(screen.getByText('GitHub')).toHaveAttribute('data-slot', 'bridge-unknown-value');
    expect(screen.getByText('Supabase')).toHaveAttribute('title', 'Query timed out.');
  });
});

describe('SourceConfidenceRing', () => {
  it('shows the present/total ratio as text alongside the ring', () => {
    render(<SourceConfidenceRing coverage={coverage} />);
    expect(screen.getByText('1/6')).toBeInTheDocument();
  });

  it('names the blindness in the ring title, not only in color', () => {
    render(<SourceConfidenceRing coverage={coverage} />);
    const wrapper = screen.getByText('1/6').closest('[data-slot="bridge-source-confidence-ring"]');
    expect(wrapper).toHaveAttribute('title', expect.stringContaining('at least one source is blind'));
  });
});

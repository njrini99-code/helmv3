/**
 * The one canonical render of a stored analysis, shared by RcaPanel (error
 * detail) and the Reliability tab. If this diverges, the two surfaces show the
 * same analysis differently — which is exactly the drift the extraction removed.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RcaAnalysisView } from '@/app/admin/errors/_components/RcaAnalysisView';
import type { RcaAnalysis } from '@/lib/admin/rca';

const base: RcaAnalysis = {
  probableCause: 'A missing GRANT on baseball_players.',
  suspectFiles: [{ path: 'src/lib/notifications/email.ts', line: 835, reason: 'reaches the table as anon' }],
  suggestedFix: 'ALREADY FIXED — commit c83cecc21',
  confidence: 'high',
  relatedFingerprints: ['rel:aaa', 'rel:bbb'],
  model: 'claude-sonnet-5',
  generatedAt: '2026-08-28T02:00:00.000Z',
};

describe('RcaAnalysisView', () => {
  it('renders the category derived from suggestedFix, plus confidence', () => {
    render(<RcaAnalysisView analysis={base} />);
    expect(screen.getByText('Already fixed')).toBeInTheDocument();
    expect(screen.getByText('high confidence')).toBeInTheDocument();
  });

  it('renders probable cause, suggested fix, and suspect files', () => {
    render(<RcaAnalysisView analysis={base} />);
    expect(screen.getByText(/missing GRANT/)).toBeInTheDocument();
    expect(screen.getByText(/ALREADY FIXED/)).toBeInTheDocument();
    expect(screen.getByText(/reaches the table as anon/)).toBeInTheDocument();
  });

  it('omits the suspect-files section when there are none', () => {
    render(<RcaAnalysisView analysis={{ ...base, suspectFiles: [] }} />);
    expect(screen.queryByText(/Suspect files/i)).not.toBeInTheDocument();
  });

  it('shows Uncategorized for an off-contract suggestedFix rather than hiding the chip', () => {
    render(<RcaAnalysisView analysis={{ ...base, suggestedFix: 'No fix needed, seems fine' }} />);
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });
});

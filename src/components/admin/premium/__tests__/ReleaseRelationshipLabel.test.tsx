import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReleaseRelationshipLabel } from '../ReleaseRelationshipLabel';
import type { ReleaseRelationshipVerdict } from '@/lib/admin/incidents/release-context';

describe('ReleaseRelationshipLabel', () => {
  it('renders NEW AFTER RELEASE for a corroborated new-after-release verdict', () => {
    const verdict: ReleaseRelationshipVerdict = {
      relationship: 'new-after-release',
      confidence: 0.6,
      evidenceFor: ['The affected feature changed in this release.'],
      evidenceAgainst: [],
    };
    render(<ReleaseRelationshipLabel verdict={verdict} />);
    expect(screen.getByText('NEW AFTER RELEASE')).toBeInTheDocument();
  });

  it('shows a confidence meter only when asked', () => {
    const verdict: ReleaseRelationshipVerdict = {
      relationship: 'improved-after-release',
      confidence: 0.7,
      evidenceFor: [],
      evidenceAgainst: [],
    };
    const { rerender } = render(<ReleaseRelationshipLabel verdict={verdict} />);
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    rerender(<ReleaseRelationshipLabel verdict={verdict} showConfidence />);
    expect(screen.getByRole('meter')).toBeInTheDocument();
  });

  it('renders unknown as the hatched treatment carrying its own reason', () => {
    const verdict: ReleaseRelationshipVerdict = {
      relationship: 'unknown',
      confidence: 0,
      evidenceFor: [],
      evidenceAgainst: ['Release deploy time is unknown.'],
    };
    render(<ReleaseRelationshipLabel verdict={verdict} />);
    const el = screen.getByText('UNKNOWN');
    expect(el).toHaveAttribute('data-slot', 'bridge-unknown-value');
    expect(el).toHaveAttribute('title', 'Release deploy time is unknown.');
  });
});

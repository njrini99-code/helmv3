import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DecisionInboxSummary } from '../DecisionInboxSummary';
import type { DecisionInboxSummary as DecisionInboxSummaryModel } from '@/lib/admin/command-deck/decisions';

const CHECKED_AT = '2026-09-03T12:00:00.000Z';

describe('DecisionInboxSummary', () => {
  it('renders "No decisions waiting on you" only when readable and empty', () => {
    const summary: DecisionInboxSummaryModel = { items: [], total: 0, readable: true, computedAt: CHECKED_AT };
    render(<DecisionInboxSummary summary={summary} checkedAt={CHECKED_AT} />);
    expect(screen.getByText('No decisions waiting on you')).toBeInTheDocument();
  });

  it('never renders the calm empty state when unreadable, even with zero items', () => {
    const summary: DecisionInboxSummaryModel = { items: [], total: 0, readable: false, computedAt: CHECKED_AT };
    render(<DecisionInboxSummary summary={summary} checkedAt={CHECKED_AT} />);
    expect(screen.queryByText('No decisions waiting on you')).not.toBeInTheDocument();
    expect(screen.getByText(/Decision inbox/)).toBeInTheDocument();
  });

  it('shows real items plus a caveat when unreadable, instead of discarding them (regression: readable items must survive an unreadable HELD.md)', () => {
    const summary: DecisionInboxSummaryModel = {
      items: [
        {
          id: 'attn:inc-2',
          kind: 'repair-needs-evidence',
          title: 'Repair cannot proceed',
          detail: 'Automation could not proceed without a human.',
          href: '/admin/errors/inc-2',
        },
      ],
      total: 1,
      // HELD.md itself failed to read, but the item above came from a
      // DIFFERENT, independently-readable source (selectAttention) — it
      // must still render, not vanish behind the unreadable panel.
      readable: false,
      computedAt: CHECKED_AT,
    };
    render(<DecisionInboxSummary summary={summary} checkedAt={CHECKED_AT} />);
    expect(screen.getByRole('link', { name: 'Repair cannot proceed' })).toHaveAttribute('href', '/admin/errors/inc-2');
    expect(screen.getByText(/held-migration source could not be read/i)).toBeInTheDocument();
    expect(screen.queryByText('No decisions waiting on you')).not.toBeInTheDocument();
  });

  it('renders each item with its kind label and detail', () => {
    const summary: DecisionInboxSummaryModel = {
      items: [
        {
          id: 'attn:inc-1',
          kind: 'repair-needs-evidence',
          title: 'Repair cannot proceed',
          detail: 'Automation could not proceed without a human.',
          href: '/admin/errors/inc-1',
        },
      ],
      total: 1,
      readable: true,
      computedAt: CHECKED_AT,
    };
    render(<DecisionInboxSummary summary={summary} checkedAt={CHECKED_AT} />);
    expect(screen.getByText('REPAIR NEEDS EVIDENCE')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Repair cannot proceed' })).toHaveAttribute('href', '/admin/errors/inc-1');
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttentionStack, type AttentionStackImpact } from '../AttentionStack';
import type { AttentionRow } from '@/lib/admin/incidents/attention';

const CHECKED_AT = '2026-09-03T12:00:00.000Z';

function row(overrides: Partial<AttentionRow> = {}): AttentionRow {
  return {
    key: 'inc-1',
    reason: 'critical',
    state: 'CRITICAL',
    headline: 'Round autosave blocked',
    why: 'Severity critical, still open.',
    ageMs: 1000,
    href: '/admin/errors/inc-1',
    tone: 'danger',
    ...overrides,
  };
}

describe('AttentionStack', () => {
  it('renders a calm all-clear when the list is genuinely empty and readable', () => {
    render(<AttentionStack rows={[]} total={0} checkedAt={CHECKED_AT} canClaimAllClear impactByKey={new Map()} />);
    expect(screen.getByText('Nothing needs attention')).toBeInTheDocument();
  });

  it('renders a not-computed state when the list is empty but evidence could not confirm all-clear', () => {
    render(
      <AttentionStack rows={[]} total={0} checkedAt={CHECKED_AT} canClaimAllClear={false} impactByKey={new Map()} />,
    );
    expect(screen.getByText('Could not fully compute what needs attention')).toBeInTheDocument();
  });

  it('renders a user-impact badge only when the map has a known-affected entry for the row', () => {
    const impactByKey = new Map<string, AttentionStackImpact>([
      ['inc-1', { affectedUsers: 72, affectedUsersKnown: true }],
    ]);
    render(
      <AttentionStack rows={[row()]} total={1} checkedAt={CHECKED_AT} canClaimAllClear={false} impactByKey={impactByKey} />,
    );
    expect(screen.getByText('72 users')).toBeInTheDocument();
  });

  it('renders no impact badge when the row has no matching, known-affected entry', () => {
    render(
      <AttentionStack rows={[row()]} total={1} checkedAt={CHECKED_AT} canClaimAllClear={false} impactByKey={new Map()} />,
    );
    expect(screen.queryByText(/users?$/)).not.toBeInTheDocument();
  });

  it('links to the row href with an "Open →" affordance', () => {
    render(
      <AttentionStack rows={[row()]} total={1} checkedAt={CHECKED_AT} canClaimAllClear={false} impactByKey={new Map()} />,
    );
    expect(screen.getByRole('link', { name: 'Open →' })).toHaveAttribute('href', '/admin/errors/inc-1');
  });

  it('states how many more rows exist beyond the displayed slice', () => {
    render(
      <AttentionStack rows={[row()]} total={4} checkedAt={CHECKED_AT} canClaimAllClear={false} impactByKey={new Map()} />,
    );
    expect(screen.getByText(/3 more needing attention/)).toBeInTheDocument();
  });
});

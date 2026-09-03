import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvariantLatticeGrid } from '@/components/admin/triage/InvariantLatticeGrid';
import type { InvariantLatticeRow, InvariantLatticeView } from '@/lib/admin/triage/invariant-lattice';

function row(overrides: Partial<InvariantLatticeRow> = {}): InvariantLatticeRow {
  return {
    id: 'qualifier-ownership',
    label: 'Qualifier ownership',
    group: 'Qualifiers',
    state: 'pass',
    detail: 'no violations found',
    severity: null,
    lastCheckedAt: null,
    ...overrides,
  };
}

function view(overrides: Partial<InvariantLatticeView> = {}): InvariantLatticeView {
  return { rows: [row()], anyFailing: false, ...overrides };
}

describe('InvariantLatticeGrid', () => {
  it('renders each row grouped under its own group heading', () => {
    render(
      <InvariantLatticeGrid
        view={view({
          rows: [row({ group: 'Qualifiers' }), row({ id: 'schema-invariants', group: 'Schema', state: 'unknown', label: 'Schema invariants' })],
        })}
      />,
    );
    expect(screen.getByText('Qualifiers')).toBeInTheDocument();
    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.getByText('Schema invariants')).toBeInTheDocument();
  });

  it('renders an unknown row honestly, never as a pass', () => {
    render(<InvariantLatticeGrid view={view({ rows: [row({ state: 'unknown' })] })} />);
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('shows a board-wide warning banner only when a real invariant is failing', () => {
    const { rerender } = render(<InvariantLatticeGrid view={view({ anyFailing: false })} />);
    expect(screen.queryByText(/outranks every ordinary warning/i)).not.toBeInTheDocument();

    rerender(<InvariantLatticeGrid view={view({ rows: [row({ state: 'fail', severity: 'critical' })], anyFailing: true })} />);
    expect(screen.getByText(/outranks every ordinary warning/i)).toBeInTheDocument();
  });

  it('renders every declared field for a failing row — detail and last-checked time', () => {
    render(
      <InvariantLatticeGrid
        view={view({
          rows: [row({ state: 'fail', severity: 'critical', detail: '5 rows affected', lastCheckedAt: '2026-09-03T00:00:00.000Z' })],
        })}
      />,
    );
    expect(screen.getByText(/5 rows affected/)).toBeInTheDocument();
  });
});

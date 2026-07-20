/**
 * ============================================================================
 * CoachFilters.tsx — Division facet must reach JUCO_D1/JUCO_D2/JUCO_D3/CCCAA
 * ----------------------------------------------------------------------------
 * DIVISION_OPTIONS previously exposed a bare 'JUCO' chip that never matches
 * any row (crm_coaches.division only ever has JUCO_D1/JUCO_D2/JUCO_D3/CCCAA
 * for juco-and-below coaches, never the literal string 'JUCO'), leaving 186
 * coaches unreachable via the division filter. Locks that the real,
 * DB-matching sub-division chips are present and selectable.
 * ========================================================================== */
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoachFilters, type Filters } from './CoachFilters';

const baseFilters: Filters = {
  status: 'all',
  division: 'all',
  conference: 'all',
  program: 'all',
  priority: 'all',
  search: '',
  followUpDue: false,
  starred: false,
  hasNotes: false,
  noContact30Days: false,
  primaryOnly: false,
  queueStatus: 'all',
};

function Harness({ onDivision }: { onDivision: (d: Filters['division']) => void }) {
  const [filters, setFilters] = useState<Filters>(baseFilters);
  return (
    <CoachFilters
      filters={filters}
      setFilters={(update: React.SetStateAction<Filters>) => {
        setFilters((prev) => {
          const next = typeof update === 'function' ? (update as (f: Filters) => Filters)(prev) : update;
          onDivision(next.division);
          return next;
        });
      }}
      conferences={[]}
      statusConfig={{} as never}
    />
  );
}

describe('CoachFilters — Division facet reachability (audit: coaches-list high)', () => {
  it('exposes JUCO_D1, JUCO_D2, JUCO_D3, and CCCAA chips (the real DB values), not just a dead bare "JUCO" chip', async () => {
    const user = userEvent.setup();
    const onDivision = vi.fn();
    render(<Harness onDivision={onDivision} />);

    await user.click(screen.getByRole('button', { name: /^Filters/i }));

    const dialog = screen.getByRole('dialog', { name: /filter coaches/i });
    const fieldset = within(dialog).getByText('Division').closest('fieldset') as HTMLElement;

    expect(within(fieldset).getByText('JUCO D1')).toBeInTheDocument();
    expect(within(fieldset).getByText('JUCO D2')).toBeInTheDocument();
    expect(within(fieldset).getByText('JUCO D3')).toBeInTheDocument();
    expect(within(fieldset).getByText('CCCAA')).toBeInTheDocument();

    await user.click(within(fieldset).getByText('JUCO D1'));
    expect(onDivision).toHaveBeenCalledWith('JUCO_D1');
  });
});

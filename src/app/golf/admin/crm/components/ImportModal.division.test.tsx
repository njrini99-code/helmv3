/**
 * ============================================================================
 * ImportModal.tsx — Division options + per-row CSV Division column
 * ----------------------------------------------------------------------------
 * DIVISION_OPTIONS previously only offered D2/D3, and the single form-level
 * division was stamped onto every parsed row — a CSV of D1/NAIA/JUCO coaches
 * could not be imported with the correct division at all. Locks:
 *   1. The Default Division select offers the full division set.
 *   2. A per-row "Division" CSV column overrides the form-level default.
 *   3. Rows with a missing/unrecognized Division cell fall back to the
 *      form-level default (single-division CSVs keep working unchanged).
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportModal } from './ImportModal';

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({ data: [] }),
      }),
      insert: vi.fn(async () => ({ error: null })),
    }),
  }),
}));

describe('ImportModal — Division options + per-row CSV parsing (audit: coaches-list high)', () => {
  it('offers D1, D2, D3, NAIA, and JUCO in the Default Division select', async () => {
    const user = userEvent.setup();
    render(<ImportModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    const divisionField = screen.getByText('Default Division').parentElement as HTMLElement;
    await user.click(within(divisionField).getByRole('button'));

    const listbox = screen.getByRole('listbox');
    const optionLabels = within(listbox).getAllByRole('option').map(o => o.textContent);

    expect(optionLabels.some(l => l?.includes('Division I') && !l.includes('Division II'))).toBe(true);
    expect(optionLabels.some(l => l?.includes('Division II'))).toBe(true);
    expect(optionLabels.some(l => l?.includes('Division III'))).toBe(true);
    expect(optionLabels.some(l => l?.includes('NAIA'))).toBe(true);
    expect(optionLabels.some(l => l?.includes('JUCO'))).toBe(true);
  });

  it('uses a per-row CSV Division column when present, overriding the form default', async () => {
    const user = userEvent.setup();
    render(<ImportModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    const csv = [
      'School,Coach Name,Division',
      'Big State,Alice Coach,D1',
      'Small College,Bob Coach,NAIA',
      'No Division Row,Cara Coach,',
    ].join('\n');

    const textarea = screen.getByLabelText(/Or Paste CSV Data/i);
    await user.click(textarea);
    await user.paste(csv);

    await user.click(screen.getByRole('button', { name: /Parse & Preview/i }));

    // Preview table now renders a per-row Division column.
    const rows = await screen.findAllByRole('row');
    // rows[0] is the header row.
    const bodyRows = rows.slice(1);
    const rowText = bodyRows.map(r => within(r).getAllByRole('cell').map(c => c.textContent));

    const alice = rowText.find(cells => cells[0] === 'Alice Coach');
    const bob = rowText.find(cells => cells[0] === 'Bob Coach');
    const cara = rowText.find(cells => cells[0] === 'Cara Coach');

    expect(alice?.[3]).toBe('D1');
    expect(bob?.[3]).toBe('NAIA');
    // Blank Division cell falls back to the form-level default (D3).
    expect(cara?.[3]).toBe('D3');
  });
});

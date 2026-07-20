/**
 * ============================================================================
 * AddCoachModal.tsx — Division select must cover the full division set
 * ----------------------------------------------------------------------------
 * The Division <Select> previously hard-coded only D2/D3, so any D1 or NAIA
 * coach (the two largest live segments) could never be entered correctly
 * through this form. Locks the option set so it can't silently shrink back
 * to two entries.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddCoachModal } from './AddCoachModal';

// jsdom has no scrollIntoView; the Select's highlighted-option effect calls it.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      insert: vi.fn(async () => ({ error: null })),
    }),
  }),
}));

describe('AddCoachModal — Division options (audit: coaches-list high)', () => {
  const statusConfig = {
    new_lead: { label: 'New Lead', iconLabel: null },
  } as never;

  it('offers D1, D2, D3, NAIA, and JUCO — not just D2/D3', async () => {
    const user = userEvent.setup();
    render(<AddCoachModal onClose={vi.fn()} onSuccess={vi.fn()} statusConfig={statusConfig} />);

    // The shared <Select> generates its own internal id (not the label's
    // htmlFor target), so locate the trigger via its labeled sibling.
    const divisionField = screen.getByText('Division').parentElement as HTMLElement;
    await user.click(within(divisionField).getByRole('button'));

    const listbox = screen.getByRole('listbox');
    const optionLabels = within(listbox).getAllByRole('option').map(o => o.textContent);

    expect(optionLabels.some(l => l?.includes('Division I') && !l.includes('Division II'))).toBe(true);
    expect(optionLabels.some(l => l?.includes('Division II'))).toBe(true);
    expect(optionLabels.some(l => l?.includes('Division III'))).toBe(true);
    expect(optionLabels.some(l => l?.includes('NAIA'))).toBe(true);
    expect(optionLabels.some(l => l?.includes('JUCO'))).toBe(true);
  });
});

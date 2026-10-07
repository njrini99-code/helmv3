import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FairwayRecruitCard } from './FairwayRecruitCard';
import type { Recruit } from '@/app/golf/actions/recruiting';

vi.mock('@/app/golf/actions/recruiting', () => ({}));

const base: Recruit = {
  id: 'r1',
  team_id: 't1',
  first_name: 'Lauren',
  last_name: 'Johnson',
  hs_class: null,
  email: null,
  phone: null,
  hometown: null,
  state: null,
  notes: null,
  status: 'watching' as Recruit['status'],
  created_at: '2026-09-01',
  updated_at: '2026-09-01',
};

describe('FairwayRecruitCard meta line (walk-through 2026-09-24)', () => {
  it('renders no "—" placeholders when class and hometown are missing', () => {
    const { container } = render(<FairwayRecruitCard recruit={base} onClick={() => {}} />);
    expect(container.textContent).not.toContain('—');
  });

  it('shows only the fact on file, without a dangling separator', () => {
    const { container } = render(<FairwayRecruitCard recruit={{ ...base, hs_class: 2028 }} onClick={() => {}} />);
    expect(screen.getByText('Class of 2028')).toBeInTheDocument();
    expect(container.textContent).not.toContain('·');
  });
});

/**
 * FairwayCalendarMemberRail — one row, three ways in.
 *
 * The summary (avatars · "Team schedule" · "N people") IS the People menu
 * trigger and, on a phone, the only control in the row; "Compare schedules…"
 * lives in that menu. From `md` up a labelled Compare button stands beside
 * the row, never nested inside it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TeamMember } from '@/components/golf/calendar/CalendarAvatarSidebar';
import { FairwayCalendarMemberRail } from '../FairwayCalendarMemberRail';

function member(overrides: Partial<TeamMember> & { id: string }): TeamMember {
  return { first_name: '', last_name: '', ...overrides };
}
const ROSTER = [
  member({ id: 'p1', first_name: 'Ava', last_name: 'Stone' }),
  member({ id: 'p2', first_name: 'Ben', last_name: 'Cortez' }),
];

describe('FairwayCalendarMemberRail — one row', () => {
  it('makes the summary itself the People trigger', async () => {
    render(<FairwayCalendarMemberRail teamMembers={ROSTER} selectedPlayerIds={[]} onSelect={vi.fn()} onOpenPerson={vi.fn()} />);
    const people = screen.getByRole('button', { name: 'People' });
    expect(within(people).getByText('Team schedule')).toBeInTheDocument();
    expect(within(people).getByText('2 people')).toBeInTheDocument();
    await userEvent.click(people);
    expect(await screen.findByText('Everyone')).toBeInTheDocument();
  });

  it('keeps the labelled Compare beside the row (never nested) and off the phone', () => {
    render(<FairwayCalendarMemberRail teamMembers={ROSTER} selectedPlayerIds={[]} onSelect={vi.fn()} onOpenPerson={vi.fn()} />);
    const compare = screen.getByRole('button', { name: 'Compare' });
    expect(compare.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(compare.className).toContain('md:inline-flex');
    const row = screen.getByRole('button', { name: 'People' }).parentElement!;
    expect(row.contains(compare)).toBe(false);
  });

  it('offers the picker from the People menu too', async () => {
    render(<FairwayCalendarMemberRail teamMembers={ROSTER} selectedPlayerIds={[]} onSelect={vi.fn()} onOpenPerson={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'People' }));
    await userEvent.click(await screen.findByText('Compare schedules…'));
    expect(await screen.findByRole('option', { name: /Ben Cortez/ })).toBeInTheDocument();
  });
});

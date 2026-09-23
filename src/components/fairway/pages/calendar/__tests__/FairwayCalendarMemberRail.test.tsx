/**
 * FairwayCalendarMemberRail — the coach's compact people entry: a status
 * line, a Compare picker, and a People menu (Everyone + open a schedule).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TeamMember } from '@/components/golf/calendar/CalendarAvatarSidebar';
import { FairwayCalendarMemberRail } from '../FairwayCalendarMemberRail';

function member(overrides: Partial<TeamMember> & { id: string }): TeamMember {
  return { first_name: '', last_name: '', ...overrides };
}

describe('FairwayCalendarMemberRail — the people entry', () => {
  it('describes the team schedule and previews the roster without a portrait carousel', () => {
    render(
      <FairwayCalendarMemberRail
        teamMembers={[member({ id: 'p1', first_name: 'Ava', last_name: 'Stone' }), member({ id: 'p2', first_name: 'Ben', last_name: 'Cortez' })]}
        selectedPlayerIds={[]}
        onSelect={vi.fn()}
        onOpenPerson={vi.fn()}
      />,
    );
    expect(screen.getByText('Team schedule')).toBeInTheDocument();
    expect(screen.getByText('2 people')).toBeInTheDocument();
    // A person is opened from the People menu, not from a tappable portrait.
    expect(screen.queryByRole('button', { name: /Open Ava Stone/ })).not.toBeInTheDocument();
  });

  it('opens a person from the People menu', async () => {
    const onOpenPerson = vi.fn();
    render(
      <FairwayCalendarMemberRail
        teamMembers={[member({ id: 'p1', first_name: 'Ava', last_name: 'Stone' })]}
        selectedPlayerIds={[]}
        onSelect={vi.fn()}
        onOpenPerson={onOpenPerson}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'People' }));
    await userEvent.click(await screen.findByRole('button', { name: /Ava Stone/ }));
    expect(onOpenPerson).toHaveBeenCalledWith('p1');
  });

  it('names who is being compared and in which colors', () => {
    render(
      <FairwayCalendarMemberRail
        teamMembers={[member({ id: 'p1', first_name: 'Ava', last_name: 'Stone' }), member({ id: 'p2', first_name: 'Ben', last_name: 'Cortez' })]}
        selectedPlayerIds={['p2']}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Comparing 1')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'People in this comparison' })).toHaveTextContent('Ben');
  });
});

/**
 * SCREEN-BUILD-PLAN.md §2.3: "Compare in the member rail opens the picker
 * instead of toggling avatars in place." Earlier, pressing Compare switched
 * the avatar row itself into a checkbox mode (and silently discarded a click
 * past the 8-member cap — #1470's most literal form). Both are gone: Compare
 * now opens `CalendarPeoplePicker`, which owns search/select-shown/Done and
 * never disables a row for exceeding the cap (covered in
 * `people/__tests__/CalendarPeoplePicker.test.tsx`).
 */
describe('FairwayCalendarMemberRail — Compare opens the people picker', () => {
  const roster = [
    member({ id: 'p1', first_name: 'Ava', last_name: 'Stone' }),
    member({ id: 'p2', first_name: 'Ben', last_name: 'Cortez' }),
  ];

  it('opens a searchable picker instead of turning the avatars into checkboxes', async () => {
    const onSelect = vi.fn();
    render(
      <FairwayCalendarMemberRail
        teamMembers={roster}
        selectedPlayerIds={[]}
        onOpenPerson={vi.fn()}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(screen.getByRole('option', { name: /Ben Cortez/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: /Ben Cortez/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Compare selected' }));
    expect(onSelect).toHaveBeenCalledWith(['p2']);

    // Still true: an avatar click never toggled anything.
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('is not rendered at all when there is no onOpenPerson (test-only bare mode)', () => {
    render(<FairwayCalendarMemberRail teamMembers={roster} selectedPlayerIds={[]} onSelect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Compare' })).not.toBeInTheDocument();
  });
});

/**
 * #1470: "ALL" used to fire `onSelect([])` — empty selection, which renders
 * as the plain team calendar (FairwayCalendar.tsx's `availabilityMode` is
 * `false` when nothing is selected). That's strictly LESS than picking a
 * single player, whose overlay includes their classes/blocked time on top of
 * team events. ALL now selects every roster member instead, bypassing the
 * manual 8-selection cap (that cap exists to keep the per-index color palette
 * unambiguous; past it, chips fall back to initials + an id-hash tint —
 * covered below).
 */
describe('FairwayCalendarMemberRail — ALL shows the whole team, not less than one player (#1470)', () => {
  it('selects every member id when ALL is pressed (the acceptance criterion)', async () => {
    const onSelect = vi.fn();
    const roster = Array.from({ length: 5 }, (_, i) =>
      member({ id: `p${i}`, first_name: `First${i}`, last_name: `Last${i}` }),
    );
    render(<FairwayCalendarMemberRail teamMembers={roster} selectedPlayerIds={[]} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'People' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Everyone' }));

    expect(onSelect).toHaveBeenCalledWith(roster.map((m) => m.id));
  });

  it('selects every member id even on a roster larger than the 8-member cap, bypassing it', async () => {
    const onSelect = vi.fn();
    const roster = Array.from({ length: 12 }, (_, i) =>
      member({ id: `p${i}`, first_name: `First${i}`, last_name: `Last${i}` }),
    );
    render(<FairwayCalendarMemberRail teamMembers={roster} selectedPlayerIds={[]} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'People' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Everyone' }));

    expect(onSelect).toHaveBeenCalledWith(roster.map((m) => m.id));
    expect(onSelect.mock.calls[0]![0]).toHaveLength(12);
  });

  it('overrides a partial manual selection — ALL means everyone, not "add the rest"', async () => {
    const onSelect = vi.fn();
    const roster = Array.from({ length: 4 }, (_, i) =>
      member({ id: `p${i}`, first_name: `First${i}`, last_name: `Last${i}` }),
    );
    render(
      <FairwayCalendarMemberRail teamMembers={roster} selectedPlayerIds={['p0', 'p2']} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'People' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Everyone' }));

    expect(onSelect).toHaveBeenCalledWith(roster.map((m) => m.id));
  });

  it('pressing ALL again while everyone is selected clears back to the team-only state', async () => {
    const onSelect = vi.fn();
    const roster = Array.from({ length: 5 }, (_, i) =>
      member({ id: `p${i}`, first_name: `First${i}`, last_name: `Last${i}` }),
    );
    render(
      <FairwayCalendarMemberRail
        teamMembers={roster}
        selectedPlayerIds={roster.map((m) => m.id)}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'People' }));
    const allButton = await screen.findByRole('button', { name: 'Stop comparing everyone' });
    expect(allButton).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(allButton);

    expect(onSelect).toHaveBeenCalledWith([]);
  });

  it('the existing Clear control also returns to team-only from an ALL-selected state', async () => {
    const onSelect = vi.fn();
    const roster = Array.from({ length: 5 }, (_, i) =>
      member({ id: `p${i}`, first_name: `First${i}`, last_name: `Last${i}` }),
    );
    render(
      <FairwayCalendarMemberRail
        teamMembers={roster}
        selectedPlayerIds={roster.map((m) => m.id)}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onSelect).toHaveBeenCalledWith([]);
  });

  it('still names every compared person once ALL has pushed the selection past the 8-member cap', () => {
    const roster = Array.from({ length: 10 }, (_, i) =>
      member({ id: `p${i}`, first_name: `First${i}`, last_name: `Last${i}` }),
    );
    render(
      <FairwayCalendarMemberRail
        teamMembers={roster}
        selectedPlayerIds={roster.map((m) => m.id)}
        onSelect={vi.fn()}
      />,
    );
    const legend = screen.getByRole('list', { name: 'People in this comparison' });
    for (const m of roster) expect(legend).toHaveTextContent(m.first_name!);
    expect(screen.getByText('Comparing everyone')).toBeInTheDocument();
    expect(screen.queryByText(/clear one to swap/i)).not.toBeInTheDocument();
  });

  // The #1470 "silent cap" bug was specifically an avatar CLICK silently
  // discarded past 8 selections. That interaction is retired (see "an
  // avatar always opens the person" above) — the equivalent guarantee for
  // its replacement lives in `people/__tests__/CalendarPeoplePicker.test.tsx`
  // ("does not block selecting more than eight people").
});

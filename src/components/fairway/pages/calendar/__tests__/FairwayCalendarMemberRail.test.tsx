/**
 * FairwayCalendarMemberRail — initials + scroll affordance.
 *
 *  - finding #85: a member whose name field carries a parenthetical role
 *    suffix (e.g. "(Captain)"/"(C)") rendered a garbled chip like "C(" from
 *    a raw `name?.[0]`, instead of two clean letter initials.
 *  - finding #123: the horizontal pill row hides its scrollbar with NO other
 *    cue that it continues past the viewport edge — it must show a scroll
 *    affordance when there's more content in that direction.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TeamMember } from '@/components/golf/calendar/CalendarAvatarSidebar';
import { FairwayCalendarMemberRail } from '../FairwayCalendarMemberRail';

function member(overrides: Partial<TeamMember> & { id: string }): TeamMember {
  return { first_name: '', last_name: '', ...overrides };
}

describe('FairwayCalendarMemberRail — initials', () => {
  it('renders clean two-letter initials for an ordinary name', () => {
    render(
      <FairwayCalendarMemberRail
        teamMembers={[member({ id: 'p1', first_name: 'Ava', last_name: 'Stone' })]}
        selectedPlayerIds={[]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('degrades gracefully instead of rendering a garbled "C(" when a name field is a bare role tag (finding #85)', () => {
    render(
      <FairwayCalendarMemberRail
        // A roster whose last_name field carries only a role tag with no
        // real surname reproduces the exact reported garble: a raw
        // `last_name?.[0]` grabs the tag's opening "(" verbatim, pairing
        // with the first initial to render "C(".
        teamMembers={[member({ id: 'p1', first_name: 'Cam', last_name: '(Captain)' })]}
        selectedPlayerIds={[]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByText('C(')).not.toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders two clean initials when a role suffix trails a real surname', () => {
    render(
      <FairwayCalendarMemberRail
        teamMembers={[member({ id: 'p1', first_name: 'Cam', last_name: 'Cortez (Captain)' })]}
        selectedPlayerIds={[]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('CC')).toBeInTheDocument();
  });

  it('falls back to an em dash when neither name yields a letter', () => {
    render(
      <FairwayCalendarMemberRail
        teamMembers={[member({ id: 'p1', first_name: '', last_name: '' })]}
        selectedPlayerIds={[]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('FairwayCalendarMemberRail — an avatar always opens the person, never a toggle', () => {
  it('calls onOpenPerson on click, regardless of selection state', async () => {
    const onOpenPerson = vi.fn();
    const onSelect = vi.fn();
    const roster = [member({ id: 'p1', first_name: 'Ava', last_name: 'Stone' })];
    render(
      <FairwayCalendarMemberRail
        teamMembers={roster}
        selectedPlayerIds={['p1']}
        onOpenPerson={onOpenPerson}
        onSelect={onSelect}
      />,
    );

    const person = screen.getByRole('button', { name: /Open Ava Stone's schedule/ });
    expect(person).not.toHaveAttribute('aria-pressed');
    await userEvent.click(person);
    expect(onOpenPerson).toHaveBeenCalledWith('p1');
    // An avatar click never mutates the comparison selection any more — that
    // now happens only through the picker (below) or the ALL toggle.
    expect(onSelect).not.toHaveBeenCalled();
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

    await userEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(onSelect).toHaveBeenCalledWith(roster.map((m) => m.id));
  });

  it('selects every member id even on a roster larger than the 8-member cap, bypassing it', async () => {
    const onSelect = vi.fn();
    const roster = Array.from({ length: 12 }, (_, i) =>
      member({ id: `p${i}`, first_name: `First${i}`, last_name: `Last${i}` }),
    );
    render(<FairwayCalendarMemberRail teamMembers={roster} selectedPlayerIds={[]} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'All' }));

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

    await userEvent.click(screen.getByRole('button', { name: 'All' }));

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

    const allButton = screen.getByRole('button', { name: 'All' });
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

  it('does not disable or grey out any chip once ALL has pushed the selection past the 8-member cap', () => {
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
    for (const m of roster) {
      const chip = screen.getByRole('button', { name: new RegExp(`${m.first_name} ${m.last_name}\\b`) });
      expect(chip).not.toHaveAttribute('aria-disabled', 'true');
    }
    // The 8-cap notice is specific to the manual-selection cap; it must not
    // appear once ALL has intentionally exceeded it.
    expect(screen.queryByText(/clear one to swap/i)).not.toBeInTheDocument();
  });

  // The #1470 "silent cap" bug was specifically an avatar CLICK silently
  // discarded past 8 selections. That interaction is retired (see "an
  // avatar always opens the person" above) — the equivalent guarantee for
  // its replacement lives in `people/__tests__/CalendarPeoplePicker.test.tsx`
  // ("does not block selecting more than eight people").
});

describe('FairwayCalendarMemberRail — scroll affordance (finding #123)', () => {
  it('renders the scrollable rail without asserting a hard visual cutoff', () => {
    const members = Array.from({ length: 12 }, (_, i) => member({ id: `p${i}`, first_name: `P${i}`, last_name: 'X' }));
    render(<FairwayCalendarMemberRail teamMembers={members} selectedPlayerIds={[]} onSelect={vi.fn()} />);
    // jsdom reports 0 for scrollWidth/clientWidth, so the edge indicators
    // don't light up here — this test only guards that the scroller mounts
    // and every member's chip is present. The affordance's on/off state is a
    // measured-layout behavior, exercised visually (see the component's
    // documented rationale) rather than re-derived in jsdom.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(members.length);
  });
});

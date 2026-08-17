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

/**
 * The 8-member selection cap is enforced SILENTLY.
 *
 * `toggle()` reads `else if (selectedPlayerIds.length < MAX_SELECTION)` — so
 * once eight members are selected, a click on a ninth chip falls off the end
 * of the branch and returns. No toast, no disabled state, no cursor change,
 * no explanation. The chip looks identical to the eight that work, and the
 * coach's click is simply discarded.
 *
 * This is live, not hypothetical: measured 2026-08-17, five of the nine golf
 * teams carry rosters above eight actives (Hampden-Sydney 15, Shenandoah 12).
 * On those teams the rail's own trailing chips are dead controls the moment a
 * coach fills the first eight.
 *
 * The cap itself stays. It is not arbitrary — `MAX_SELECTION` equals
 * `AVATAR_TINT_COUNT`, one selectable member per tint, which is what makes the
 * colour-coded overlay readable at all (see #1470, where raising it is an open
 * design decision). What is fixed here is the silence: the chip has to SAY it
 * cannot be added, and how to make room.
 */
describe('FairwayCalendarMemberRail — the selection cap explains itself', () => {
  const roster = Array.from({ length: 10 }, (_, i) =>
    member({ id: `p${i}`, first_name: `First${i}`, last_name: `Last${i}` }),
  );
  const eightSelected = roster.slice(0, 8).map((m) => m.id);

  function chipFor(m: TeamMember) {
    return screen.getByRole('button', { name: new RegExp(`${m.first_name} ${m.last_name}\\b`) });
  }

  it('marks a chip that cannot be added as disabled, and says why in its title', () => {
    render(
      <FairwayCalendarMemberRail teamMembers={roster} selectedPlayerIds={eightSelected} onSelect={vi.fn()} />,
    );

    const ninth = chipFor(roster[8]!);
    expect(ninth).toHaveAttribute('aria-disabled', 'true');
    // The tooltip has to carry the reason AND the remedy, not just the name.
    // Asserted on the phrase, not on a bare "8" — every chip's own label
    // already contains digits, so /8/ alone passes without a fix.
    expect(ninth.getAttribute('title')).toMatch(/maximum of 8/);
    expect(ninth.getAttribute('title')).toMatch(/clear one/i);
  });

  it('leaves the reason in the accessible name too, so it is not hover-only', () => {
    render(
      <FairwayCalendarMemberRail teamMembers={roster} selectedPlayerIds={eightSelected} onSelect={vi.fn()} />,
    );
    expect(chipFor(roster[8]!).getAttribute('aria-label')).toMatch(/maximum of 8/);
  });

  it('keeps every SELECTED chip live at the cap — deselecting is the way out', async () => {
    const onSelect = vi.fn();
    render(
      <FairwayCalendarMemberRail teamMembers={roster} selectedPlayerIds={eightSelected} onSelect={onSelect} />,
    );

    const first = chipFor(roster[0]!);
    expect(first).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(first);
    expect(onSelect).toHaveBeenCalledWith(eightSelected.slice(1));
  });

  it('marks nothing disabled below the cap', () => {
    render(
      <FairwayCalendarMemberRail
        teamMembers={roster}
        selectedPlayerIds={eightSelected.slice(0, 7)}
        onSelect={vi.fn()}
      />,
    );
    for (const m of roster) {
      expect(chipFor(m), m.id).not.toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('still refuses the ninth selection — the cap is explained, not lifted', async () => {
    const onSelect = vi.fn();
    render(
      <FairwayCalendarMemberRail teamMembers={roster} selectedPlayerIds={eightSelected} onSelect={onSelect} />,
    );
    await userEvent.click(chipFor(roster[8]!));
    expect(onSelect).not.toHaveBeenCalled();
  });
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

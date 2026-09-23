// @vitest-environment jsdom
/**
 * ============================================================================
 * GroupDetailsSheet — membership controls, actually rendered
 * ----------------------------------------------------------------------------
 * `GroupDetailsSheet.test.ts` reads the component's SOURCE. That is the right
 * tool for pinning a token, a class, or the absence of a control, and it is the
 * wrong tool for "is this control offered to the right person and does clicking
 * it do the right thing" — a source search would pass on a `canRemove` prop
 * that is computed correctly and then never passed down.
 *
 * So these render it. The split is the one the G-13 stale-fetch suite
 * established: source assertions prove the code is PRESENT, behavioural tests
 * prove it is RIGHT.
 *
 * WHAT MATTERS MOST HERE IS WHO IS OFFERED WHAT, because that predicate is
 * doing security-shaped work even though it is not the security boundary. RLS
 * is the boundary. But the sheet deciding to offer Remove to a non-creator
 * would draw a control the database refuses — the exact "scores as coverage,
 * reads as a bug" failure the deferred-control list exists to prevent. Both
 * sides of every gate are asserted: creator sees it, non-creator does not.
 *
 * The second theme is REFUSAL. Until
 * `20260907160000_golf_team_chat_membership_management.sql` is applied, Add and
 * Remove return 42501 through the action's `{ error }`. A sheet that swallowed
 * that would look exactly like a dead control, so the error has to reach the
 * user — asserted for both paths.
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { GroupDetailsSheet, type GroupMember } from './GroupDetailsSheet';

const CREATOR = 'user-creator';
const MEMBER = 'user-member';

const MEMBERS: GroupMember[] = [
  { id: CREATOR, name: 'Nick Rini', avatar: null, subtitle: 'Head Coach', type: 'coach' },
  { id: MEMBER, name: 'Alexis Bennett', avatar: null, subtitle: 'Class of 2027', type: 'player' },
  { id: 'user-third', name: 'Jordan Rivera', avatar: null, subtitle: 'Class of 2026', type: 'player' },
];

type Overrides = Partial<React.ComponentProps<typeof GroupDetailsSheet>>;

function renderSheet(overrides: Overrides = {}) {
  const onAddMember = vi.fn().mockResolvedValue(undefined);
  const onRemoveMember = vi.fn().mockResolvedValue(undefined);
  const onLeaveGroup = vi.fn().mockResolvedValue(undefined);
  const loadAddCandidates = vi.fn().mockResolvedValue([
    { userId: 'user-fourth', name: 'Maya Torres', avatarUrl: null, subtitle: 'Class of 2028', type: 'player' as const },
  ]);

  const utils = render(
    <GroupDetailsSheet
      open
      onOpenChange={vi.fn()}
      title="Kiawah Trip"
      createdAt="2026-07-21T12:00:00.000Z"
      creatorId={CREATOR}
      currentUserId={CREATOR}
      members={MEMBERS}
      memberCount={MEMBERS.length}
      onAddMember={onAddMember}
      onRemoveMember={onRemoveMember}
      onLeaveGroup={onLeaveGroup}
      loadAddCandidates={loadAddCandidates}
      {...overrides}
    />,
  );

  return { ...utils, onAddMember, onRemoveMember, onLeaveGroup, loadAddCandidates };
}

describe('who is offered the membership controls', () => {
  it('offers Add and per-member Remove to the group creator', () => {
    renderSheet();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Alexis Bennett' })).toBeTruthy();
  });

  it('offers NEITHER to a member who did not create the group', () => {
    // The other half of the gate. A test that only checked the creator case
    // would pass against a component that offered these to everyone.
    renderSheet({ currentUserId: MEMBER });
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove /})).toBeNull();
  });

  it('never offers Remove on the viewer\'s own row', () => {
    // Leaving is a different action with a different consequence, and the
    // policy's creator DELETE branch excludes the creator's own row anyway.
    renderSheet();
    expect(screen.queryByRole('button', { name: 'Remove Nick Rini' })).toBeNull();
  });

  it('stays read-only when the handlers are not supplied', () => {
    // Every non-group caller, and every test written before this wiring, gets
    // exactly the sheet it got before.
    renderSheet({ onAddMember: undefined, onRemoveMember: undefined, onLeaveGroup: undefined });
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove /})).toBeNull();
    expect(screen.queryByRole('button', { name: 'Leave group' })).toBeNull();
    // The read-only content is untouched.
    expect(screen.getByText('Alexis Bennett')).toBeTruthy();
  });

  it('offers Leave group to a plain member, because production RLS allows it today', () => {
    // Unlike Add and Remove, self-delete needs no migration. Asserting it for
    // a NON-creator is the point: it is not gated on being the creator.
    renderSheet({ currentUserId: MEMBER });
    expect(screen.getByRole('button', { name: 'Leave group' })).toBeTruthy();
  });
});

describe('removing a member', () => {
  it('requires a confirmation before calling the action', () => {
    const { onRemoveMember } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alexis Bennett' }));
    expect(onRemoveMember).not.toHaveBeenCalled();
    expect(screen.getByText('Remove?')).toBeTruthy();
  });

  it('calls the action with that member\'s id once confirmed', async () => {
    const { onRemoveMember } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alexis Bennett' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove Alexis Bennett' }));
    await waitFor(() => expect(onRemoveMember).toHaveBeenCalledWith(MEMBER));
  });

  it('cancelling removes nobody', () => {
    const { onRemoveMember } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alexis Bennett' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel remove' }));
    expect(onRemoveMember).not.toHaveBeenCalled();
    expect(screen.queryByText('Remove?')).toBeNull();
  });

  it('arms the confirmation for ONE row, not every row', () => {
    // A single shared boolean would put "Remove?" on every member at once and
    // make the next tap ambiguous.
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alexis Bennett' }));
    expect(screen.getAllByText('Remove?')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remove Jordan Rivera' })).toBeTruthy();
  });

  it('surfaces a refusal instead of failing silently', async () => {
    // This is the pre-migration path: RLS answers 42501 and the action returns
    // it. A swallowed error here is indistinguishable from a dead control.
    const onRemoveMember = vi.fn().mockResolvedValue({ error: 'Could not remove that member' });
    renderSheet({ onRemoveMember });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alexis Bennett' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove Alexis Bennett' }));
    expect(await screen.findByText('Could not remove that member')).toBeTruthy();
  });

  it('surfaces a thrown error too, not just a returned one', async () => {
    const onRemoveMember = vi.fn().mockRejectedValue(new Error('network'));
    renderSheet({ onRemoveMember });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alexis Bennett' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove Alexis Bennett' }));
    expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy();
  });
});

describe('adding a member', () => {
  it('loads candidates only when Add is opened', async () => {
    const { loadAddCandidates } = renderSheet();
    // Not on mount: a group's roster is a query nobody should pay for by
    // opening the details sheet.
    expect(loadAddCandidates).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(loadAddCandidates).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Maya Torres')).toBeTruthy();
  });

  it('adds the candidate the row names', async () => {
    const { onAddMember } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Maya Torres');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onAddMember).toHaveBeenCalledWith('user-fourth'));
  });

  it('says so when the whole team is already in the group', async () => {
    const loadAddCandidates = vi.fn().mockResolvedValue([]);
    renderSheet({ loadAddCandidates });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Everyone on this team is already in the group.')).toBeTruthy();
  });

  it('reports a candidate-load failure rather than showing an empty list', async () => {
    // An empty list and a failed fetch look identical to the user otherwise,
    // and one of them means "try again".
    const loadAddCandidates = vi.fn().mockRejectedValue(new Error('nope'));
    renderSheet({ loadAddCandidates });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Could not load teammates.')).toBeTruthy();
  });

  it('surfaces a refused add', async () => {
    const onAddMember = vi.fn().mockResolvedValue({ error: 'Could not add that member' });
    renderSheet({ onAddMember });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Maya Torres');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Could not add that member')).toBeTruthy();
  });

  it('drops an added teammate from the candidate list', async () => {
    const { onAddMember } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Maya Torres');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onAddMember).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Maya Torres')).toBeNull());
  });

  it('leaves add mode without adding anyone when Done is pressed', async () => {
    const { onAddMember } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Maya Torres');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onAddMember).not.toHaveBeenCalled();
    expect(screen.getByText('Alexis Bennett')).toBeTruthy();
  });
});

describe('leaving the group', () => {
  it('requires a confirmation', () => {
    const { onLeaveGroup } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Leave group' }));
    expect(onLeaveGroup).not.toHaveBeenCalled();
    expect(screen.getByText('Leave this group?')).toBeTruthy();
  });

  it('leaves once confirmed, and closes the sheet', async () => {
    const onOpenChange = vi.fn();
    const { onLeaveGroup } = renderSheet({ onOpenChange });
    fireEvent.click(screen.getByRole('button', { name: 'Leave group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(onLeaveGroup).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('does NOT close the sheet when leaving is refused', async () => {
    // Closing on failure would look exactly like success.
    const onOpenChange = vi.fn();
    const onLeaveGroup = vi.fn().mockResolvedValue({ error: 'Could not leave that group' });
    renderSheet({ onOpenChange, onLeaveGroup });
    fireEvent.click(screen.getByRole('button', { name: 'Leave group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Could not leave that group')).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('cancelling leaves nothing', () => {
    const { onLeaveGroup } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Leave group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onLeaveGroup).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Leave group' })).toBeTruthy();
  });
});

describe('the read-only sheet is unchanged by any of this', () => {
  it('still renders the identity block, the Admin pill and real subtitles', () => {
    renderSheet();
    // Twice on purpose: `Sheet` keeps an accessible title even under
    // `hideTitle`, and the identity block draws the visible one.
    expect(screen.getAllByText('Kiawah Trip').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByText('Head Coach')).toBeTruthy();
    expect(screen.getByText('Class of 2027')).toBeTruthy();
  });

  it('still puts the viewer first and marks their row', () => {
    renderSheet({ currentUserId: MEMBER });
    expect(screen.getByText('(you)')).toBeTruthy();
  });
});

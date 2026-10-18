'use client';

import { UserCheck, UserX } from 'lucide-react';
import type { ChRosterPlayer } from '../../data/roster';
import type { ActionCopy } from '../../lib/use-action';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';

type Status = ChRosterPlayer['status'];

/** The status a player moves to from the one they have: the roster has two (golf_team_members allows no other write). */
export const otherStatus = (s: Status): Status => (s === 'active' ? 'inactive' : 'active');

/** What `useAction('roster.changeStatus')` says (CH-3008 on failure). */
export function statusCopy(name: string, to: Status): ActionCopy {
  return {
    done: `${name} marked ${to}`,
    failed: `Couldn’t mark ${name} ${to}`,
    hint: 'Nothing changed on the roster. Try again, or refresh if it keeps failing.',
    code: 'CH-3008',
  };
}

/**
 * CH-3502: the coach confirms a status change before it is written (the Fairway "Change status" dialog, rebuilt as a
 * question with one answer, since there are only two statuses). Not destructive: the confirm is the primary, with no
 * warning haptic and no red (D-42). CH-3404: while it saves the button reads "Saving…" and can't be pressed again.
 *
 * Inactive is said as what it does here: the player stays on the team with their stats, leaves the active roster's
 * rankings and averages, and (every player read of a team asks for an active membership) has no team in the app
 * until they are marked active again.
 */
export function StatusConfirm({
  player,
  teamName,
  pending,
  onCancel,
  onConfirm,
}: {
  player: ChRosterPlayer | null;
  /** The team mid-sentence ("Varsity", or "your team"). */
  teamName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (p: ChRosterPlayer, to: Status) => void;
}) {
  const to = player ? otherStatus(player.status) : 'inactive';
  const deactivating = to === 'inactive';
  return (
    <Modal
      code="CH-3502"
      open={!!player}
      onClose={pending ? () => {} : onCancel}
      width={460}
      icon={deactivating ? UserX : UserCheck}
      title={deactivating ? 'Mark player inactive?' : 'Mark player active?'}
      description={
        player
          ? deactivating
            ? `Move ${player.name} to Inactive on ${teamName}?`
            : `Move ${player.name} back to the active roster of ${teamName}?`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => {
              if (player) onConfirm(player, to);
            }}
          >
            {pending ? <span data-ch-code="CH-3404">Saving…</span> : deactivating ? 'Mark inactive' : 'Mark active'}
          </Button>
        </>
      }
    >
      <p className="ch-rs-remove">
        {deactivating
          ? 'They stay on the team with their account and stats, but leave team rankings and averages. Until you mark them active again, the app shows them no team.'
          : 'They count in team rankings and averages again, and see the team in the app.'}
      </p>
    </Modal>
  );
}

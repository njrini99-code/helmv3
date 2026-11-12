'use client';

import type { ChMessagesApi } from '../api/types';
import { type ChConv, type ChMember, firstName } from '../model';
import { useState, useEffect } from 'react';
import { Modal } from '../../../ui/Modal';
import { LogOut, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { InlineNotice } from '../../../ui/Notices';
import { Skeleton } from '../../../ui/States';
import { Avatar } from '../../../ui/Avatar';
import { personOf } from '../person-of';

/** Leave a group you didn't create, after a confirm (CH-7502). */
export function LeaveGroupModal({ api, conv, open, onClose, onLeft }: { api: ChMessagesApi; conv: ChConv; open: boolean; onClose: () => void; onLeft: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      code="CH-7502"
      open={open}
      onClose={onClose}
      icon={LogOut}
      title={`Leave ${conv.title}?`}
      description="You stop getting its messages. Someone in the group can add you back."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Stay
          </Button>
          <Button
            variant="danger"
            feel="warning"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await api.leave();
              setBusy(false);
              if (ok) {
                onClose();
                onLeft();
              }
            }}
          >
            {busy ? "Leaving…" : "Leave group"}
          </Button>
        </>
      }
    />
  );
}

/** Delete a conversation from your own inbox, after a confirm (CH-7503). Everyone else keeps theirs. */
export function DeleteConversationModal({ api, conv, open, onClose, onDeleted }: { api: ChMessagesApi; conv: ChConv; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      code="CH-7503"
      open={open}
      onClose={onClose}
      icon={Trash2}
      title={`Delete ${conv.title}?`}
      description="It leaves your inbox. The other people keep their copy, and it comes back if someone sends a new message."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep conversation
          </Button>
          <Button
            variant="danger"
            feel="warning"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              const ok = (await api.deleteConversation?.(conv.id)) ?? false;
              setBusy(false);
              if (ok) {
                onClose();
                onDeleted();
              }
            }}
          >
            {busy ? "Deleting…" : "Delete conversation"}
          </Button>
        </>
      }
    />
  );
}

/**
 * The group's creator removes someone from it, after a confirm (CH-7504), as Fairway's group details allow. Remove fires
 * the warning haptic (D-70); a refusal puts the row back and says so (CH-7024).
 */
export function RemoveMemberModal({ api, conv, member, onClose }: { api: ChMessagesApi; conv: ChConv; member: ChMember | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const first = firstName(member?.name ?? "them");
  // The safe choice names who stays (wave 5 #19).
  const keep = member ? `Keep ${first}` : "Keep them";
  return (
    <Modal
      code="CH-7504"
      open={member != null}
      onClose={onClose}
      icon={UserMinus}
      title={`Remove ${first} from ${conv.title}?`}
      description={`${first} stops getting its messages. You can add them back from Add.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {keep}
          </Button>
          <Button
            variant="danger"
            feel="warning"
            busy={busy}
            disabled={!api.removeMember}
            onClick={async () => {
              if (!member || !api.removeMember) return;
              setBusy(true);
              // The row leaves as the sheet closes; a refusal brings it back with a toast.
              onClose();
              await api.removeMember(member.userId, member.name);
              setBusy(false);
            }}
          >
            {busy ? "Removing…" : "Remove"}
          </Button>
        </>
      }
    />
  );
}

/**
 * The group's creator adds teammates or coaches who aren't in it yet (D-47),
 * on desktop and phone: the candidates load when it opens (CH-7410), a failed
 * load says so with Try again (CH-7215), nobody left says so (CH-7307), and a
 * failed add is toasted (CH-7018).
 */
export function AddMembersModal({ api, conv, open, onClose }: { api: ChMessagesApi; conv: ChConv; open: boolean; onClose: () => void }) {
  const [people, setPeople] = useState<ChMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = api.addCandidates;
  useEffect(() => {
    if (!open) return;
    let live = true;
    setPeople(null);
    setFailed(false);
    setAdded([]);
    load()
      .then((r) => live && (r ? setPeople(r) : setFailed(true)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, attempt, load]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={UserPlus}
      title={`Add to ${conv.title}`}
      description="Players and coaches on the team who aren’t in this group."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {failed ? (
        <InlineNotice
          code="CH-7215"
          title="The team list didn’t load"
          body="Try again."
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : !people ? (
        <div style={{ display: "grid", gap: 8 }} aria-busy="true" data-ch-code="CH-7410">
          <Skeleton height={30} />
          <Skeleton height={30} />
          <Skeleton height={30} />
        </div>
      ) : !people.length ? (
        <p className="ch-ms-quiet" data-ch-code="CH-7307">
          Everyone on the team is already in this group.
        </p>
      ) : (
        <div role="group" className="ch-ms-pick" aria-label="People to add">
          {people.map((p) => {
            const done = added.includes(p.userId);
            return (
              <div key={p.userId} className="ch-pp__row">
                <Avatar name={p.name} id={personOf(api, p.userId)?.playerId ?? p.userId} size="sm" />
                <span className="ch-pp__name">
                  <b>{p.name}</b>
                  <span>{p.subtitle}</span>
                </span>
                <button
                  type="button"
                  className={"ch-btn ch-btn--sm " + (done ? "ch-btn--ghost" : "ch-btn--secondary")}
                  disabled={done || busy === p.userId}
                  aria-label={done ? `${p.name} added` : `Add ${p.name}`}
                  onClick={async () => {
                    setBusy(p.userId);
                    const ok = await api.addMember(p.userId, p.name);
                    setBusy(null);
                    if (ok) setAdded((a) => [...a, p.userId]);
                  }}
                >
                  {done ? "Added" : busy === p.userId ? "Adding…" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

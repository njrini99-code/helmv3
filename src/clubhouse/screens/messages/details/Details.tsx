'use client';

import type { ChMessagesApi } from '../api/types';
import type { ChConv, ChMember } from '../model';
import { useState, useRef } from 'react';
import { personOf } from '../person-of';
import { rebuiltHref } from '../../../shell/nav';
import { useMuteAction, detailsLine, QuickActions, ConversationSearch, MuteMenu, MembersCard, PhotosAndFiles } from '../details-v2';
import { IconButton, Button } from '../../../ui/Button';
import { X, Users, Trash2, BellOff } from 'lucide-react';
import { Icon } from '../../../ui/Icon';
import { Avatar } from '../../../ui/Avatar';
import { convAvatarId, convYear } from '../shared/conv-ui';
import { ThreadClassSection } from '../ThreadClassSection';
import { LeaveGroupModal, DeleteConversationModal, AddMembersModal, RemoveMemberModal } from './group-modals';
import { InlineNotice } from '../../../ui/Notices';
import { Skeleton } from '../../../ui/States';
import { muteLabel } from './mute-label';

/* Details */

export function Details({
  api,
  conv,
  onClose,
}: {
  api: ChMessagesApi;
  conv: ChConv;
  onClose: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ChMember | null>(null);
  const mayAdd = conv.group && conv.creatorId === api.viewer.userId;
  // Remove is the creator's too, on anyone but themselves (removeGolfGroupMember; Leave group is the creator's own way).
  const mayRemove = mayAdd && !!api.removeMember;
  const other = !conv.group
    ? personOf(api, conv.memberIds[0] ?? "")
    : undefined;
  const statsHref = rebuiltHref("/golf/dashboard/stats", api.viewer.role);
  const mute = useMuteAction(api);
  const [searching, setSearching] = useState(false);
  const detailsBody = useRef<HTMLElement | null>(null);
  // MSG-ROLE-04: a coach on a direct thread with a player, nobody else.
  const profileHref =
    !conv.group && other?.role === "player" && other.playerId && api.viewer.role === "coach" && statsHref
      ? `${statsHref}?player=${encodeURIComponent(other.playerId)}`
      : null;
  return (
    <aside
      ref={detailsBody}
      className="ch-ms-det"
      aria-label={conv.group ? "Group details" : "Details"}
    >
      <div className="ch-ms-det__head">
        <b>{conv.group ? "Group details" : "Details"}</b>
        <IconButton
          icon={X}
          label="Close details"
          size="sm"
          onClick={onClose}
        />
      </div>
      <div className="ch-ms-det__hero">
        {conv.group ? (
          <span className="ch-ms-grp is-xl">
            <Icon icon={Users} size={22} />
          </span>
        ) : (
          <Avatar name={conv.title} id={convAvatarId(api, conv)} size="xl" ring={false} year={convYear(api, conv)} />
        )}
        <b>{conv.title}</b>
        <span>
          {detailsLine(conv, api.teamName)}
        </span>
      </div>
      <QuickActions
          api={api}
          conv={conv}
          mute={mute}
          profileHref={profileHref}
          onSearch={() => setSearching((v) => !v)}
          onFiles={() => detailsBody.current?.querySelector(".ch-msv-files")?.scrollIntoView({ block: "start" })}
          onAdd={() => setAdding(true)}
          onLeave={() => setLeaving(true)}
        />
      {searching && <ConversationSearch api={api} conv={conv} onClose={() => setSearching(false)} />}
      {mute.choosing && <MuteMenu anchor={mute.anchor} onPick={(h) => void mute.setMute(true, h)} onClose={() => mute.setChoosing(false)} />}
      <MuteControl api={api} />
      {api.classDay && !conv.group && (api.viewer.role === "coach") && (
        <ThreadClassSection
          cls={api.classDay}
          conv={conv}
          other={other}
          wrap={(content) => (
            <div className="ch-ms-det__sec">
              <div className="ch-ms-det__l">
                <span>Class status</span>
              </div>
              {content}
            </div>
          )}
        />
      )}

      {conv.group && (
        <MembersCard
          api={api}
          conv={conv}
          onMessage={(id) => void api.startDirect(id)}
          onRemove={mayRemove ? setRemoving : undefined}
        />
      )}

      <PhotosAndFiles api={api} conv={conv} />

      {api.deleteConversation && (
        <div className="ch-ms-det__sec">
          <Button variant="danger" leftIcon={Trash2} onClick={() => setDeleting(true)}>
            Delete conversation
          </Button>
        </div>
      )}
      <LeaveGroupModal api={api} conv={conv} open={leaving} onClose={() => setLeaving(false)} onLeft={onClose} />
      <DeleteConversationModal api={api} conv={conv} open={deleting} onClose={() => setDeleting(false)} onDeleted={onClose} />
      {mayAdd && <AddMembersModal api={api} conv={conv} open={adding} onClose={() => setAdding(false)} />}
      {mayRemove && <RemoveMemberModal api={api} conv={conv} member={removing} onClose={() => setRemoving(null)} />}
    </aside>
  );
}

function MuteControl({ api }: { api: ChMessagesApi }) {
  const [busy, setBusy] = useState(false);
  const m = api.mute;
  const set = async (muted: boolean, hours: number | null) => {
    setBusy(true);
    await api.setMute(muted, hours);
    setBusy(false);
  };
  return (
    <div className="ch-ms-det__sec">
      <div className="ch-ms-det__l">
        <span>Notifications</span>
      </div>
      {api.muteError ? (
        <InlineNotice
          code="CH-7208"
          title="The mute setting didn’t load"
          body="Try again."
          onRetry={api.retryMute}
        />
      ) : !m ? (
        <div aria-busy="true" data-ch-code="CH-7407">
          <Skeleton height={30} />
        </div>
      ) : m.muted ? (
        <div className="ch-ms-mute">
          <span>
            <Icon icon={BellOff} size={15} />
            {muteLabel(m, api)}
          </span>
          <Button
            size="sm"
            busy={busy}
            onClick={() => void set(false, null)}
          >
            Unmute
          </Button>
        </div>
      ) : (
        <>
          <p className="ch-ms-quiet">
            No email, push or bell for this conversation. Unread messages still
            show here.
          </p>
          <div className="ch-ms-mute__opts">
            <Button size="sm" disabled={busy} onClick={() => void set(true, 8)}>
              Mute 8 hours
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void set(true, 24 * 7)}
            >
              Mute a week
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void set(true, null)}
            >
              Until I turn it on
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

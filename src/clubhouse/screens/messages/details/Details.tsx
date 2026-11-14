'use client';

import type { ChMessagesApi } from '../api/types';
import type { ChConv, ChMember } from '../model';
import { useEffect, useRef, useState } from 'react';
import { personOf } from '../person-of';
import { rebuiltHref } from '../../../shell/nav';
import { useMuteAction, detailsLine, QuickActions, ConversationSearch, MuteMenu, MembersCard, PhotosAndFiles, ClassStatusCard } from '../details-v2';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { msAnimate } from '../motion/messages-motion';
import { IconButton } from '../../../ui/Button';
import { X, Users } from 'lucide-react';
import { Icon } from '../../../ui/Icon';
import { Avatar } from '../../../ui/Avatar';
import { convAvatarId, convAvatarName, convYear } from '../shared/conv-ui';
import { ThreadClassSection } from '../ThreadClassSection';
import { LeaveGroupModal, AddMembersModal, RemoveMemberModal } from './group-modals';
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
  // MOT-DET-2 / MOT-R-5: under Reduce Motion the column lands at once and the panel crossfades in.
  const reduced = useChReducedMotion();
  useEffect(() => {
    if (reduced && detailsBody.current) msAnimate(detailsBody.current, [{ opacity: 0 }, { opacity: 1 }], null, { reduced });
  }, [reduced]);
  return (
    <aside ref={detailsBody} className="ch-ms-det ch-msd-det" aria-label={conv.group ? "Group details" : "Details"}>
      {/* The content is 300 wide and pinned to the column's right edge, so the track opening reveals it (MSG-602). */}
      <div className="ch-msd-det__in">
        <IconButton className="ch-msd-det__x" icon={X} label="Close details" size="sm" onClick={onClose} />
        <div className="ch-ms-det__hero ch-msd-hero">
          {conv.group ? (
            <span className="ch-ms-grp is-xl">
              <Icon icon={Users} size={22} />
            </span>
          ) : (
            <Avatar name={convAvatarName(conv)} id={convAvatarId(api, conv)} size="xl" ring={false} year={convYear(api, conv)} />
          )}
          <b>{conv.title}</b>
          <span>{detailsLine(conv, api.teamName, !!api.mute?.muted)}</span>
        </div>
        {/* The mute setting is the first quick action; only its loading and its failure are drawn here (CH-7407, CH-7208). */}
        {api.muteError ? (
          <InlineNotice code="CH-7208" title="The mute setting didn’t load" body="Try again." onRetry={api.retryMute} />
        ) : !api.mute ? (
          <div aria-busy="true" data-ch-code="CH-7407">
            <Skeleton height={30} />
          </div>
        ) : null}
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
        {/* A muted conversation says until when (an 8-hour or one-week mute, or until it is turned back on). */}
        {api.mute?.muted && <p className="ch-msd-mutenote ch-num">{muteLabel(api.mute, api)}</p>}
        {searching && <ConversationSearch api={api} conv={conv} onClose={() => setSearching(false)} />}
        {mute.choosing && <MuteMenu anchor={mute.anchor} onPick={(h) => void mute.setMute(true, h)} onClose={() => mute.setChoosing(false)} />}
        {api.classDay && !conv.group && api.viewer.role === "coach" && (
          <ThreadClassSection cls={api.classDay} conv={conv} other={other} wrap={(content) => <ClassStatusCard>{content}</ClassStatusCard>} />
        )}

        {conv.group && <MembersCard api={api} conv={conv} onMessage={(id) => void api.startDirect(id)} onRemove={mayRemove ? setRemoving : undefined} />}

        <PhotosAndFiles api={api} conv={conv} />

        {/* Delete conversation is where the design draws it: the conversation row's own menu (MSG-111), not here. */}
      </div>
      <LeaveGroupModal api={api} conv={conv} open={leaving} onClose={() => setLeaving(false)} onLeft={onClose} />
      {mayAdd && <AddMembersModal api={api} conv={conv} open={adding} onClose={() => setAdding(false)} />}
      {mayRemove && <RemoveMemberModal api={api} conv={conv} member={removing} onClose={() => setRemoving(null)} />}
    </aside>
  );
}

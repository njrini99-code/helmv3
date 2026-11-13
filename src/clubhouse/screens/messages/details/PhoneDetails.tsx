'use client';

import { type ReactNode, useState } from 'react';
import type { ChMessagesApi } from '../api/types';
import type { ChConv, ChMember } from '../model';
import { personOf } from '../person-of';
import { rebuiltHref } from '../../../shell/nav';
import { useMuteAction, detailsLine, QuickActions, ConversationSearch, MembersCard, PhotosAndFiles, MuteMenu, ClassStatusCard } from '../details-v2';
import { PhoneScreen } from '../../../shell/PhoneScreen';
import { PhoneBar } from '../../../ui/PhoneBar';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { GroupMark, convAvatarId, convAvatarName, convYear } from '../shared/conv-ui';
import { Avatar } from '../../../ui/Avatar';
import { ThreadClassSection } from '../ThreadClassSection';
import Link from 'next/link';
import { Icon } from '../../../ui/Icon';
import { CalendarPlus, ChevronRight } from 'lucide-react';
import { InlineNotice } from '../../../ui/Notices';
import { Skeleton } from '../../../ui/States';
import { muteLabel } from './mute-label';
import { LeaveGroupModal, AddMembersModal, RemoveMemberModal } from './group-modals';

/* Details */

function Panel({ title, action, children, code }: { title?: string; action?: ReactNode; children: ReactNode; code?: string }) {
  return (
    <section className={"ch-msp-panel" + (title ? "" : " is-plain")} aria-label={title} data-ch-code={code}>
      {title && (
        <div className="ch-msp-panel__h">
          <h3>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PhoneDetails({ api, conv, onBack }: { api: ChMessagesApi; conv: ChConv; onBack: () => void }) {
  const coach = api.viewer.role === "coach";
  const [leaving, setLeaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ChMember | null>(null);
  const titleId = `ch-msp-details-${conv.id}`;
  const mine = conv.creatorId === api.viewer.userId;
  const other = !conv.group ? personOf(api, conv.memberIds[0] ?? "") : undefined;
  // Schedule opens Calendar's New event, as the desktop thread header does: a direct thread with a player invites that
  // player alone (`with=`, D-52); a group or a coach's thread invites nobody.
  const scheduleWith = other?.role === "player" ? other.playerId : null;
  const calendarHref = coach
    ? rebuiltHref(`/golf/dashboard/calendar?new=1${scheduleWith ? `&with=${encodeURIComponent(scheduleWith)}` : ""}`, api.viewer.role)
    : null;
  const statsHref = coach && other?.role === "player" && other.playerId ? rebuiltHref("/golf/dashboard/stats", api.viewer.role) : null;
  const muted = !!api.mute?.muted;
  const muteV2 = useMuteAction(api);
  const [searching, setSearching] = useState(false);
  const message = async (userId: string) => {
    if (!conv.group && userId === conv.memberIds[0]) return onBack();
    await api.startDirect(userId);
  };
  return (
    <PhoneScreen labelledBy={titleId} className="ch-msp-details" keyboardAware>
      <PhoneBar back={{ label: conv.title, ariaLabel: "Back to conversation", onBack }} title="Details" titleId={titleId} />
      <div className="ch-msp-scroll">
        <SectionBoundary surface="messages.details" label="Details" code="CH-7213">
          <div className="ch-msp-page">
            <section className="ch-msp-prof">
              {conv.group ? <GroupMark size="lg" flag={!!conv.channel} /> : <Avatar name={convAvatarName(conv)} id={convAvatarId(api, conv)} size={84} year={convYear(api, conv)} />}
              <h2>{conv.title}</h2>
              <p className="ch-num">
                {detailsLine(conv, api.teamName, muted)}
              </p>
              <QuickActions
                  api={api}
                  conv={conv}
                  mute={muteV2}
                  profileHref={statsHref && other?.playerId ? `${statsHref}?player=${encodeURIComponent(other.playerId)}` : null}
                  onSearch={() => setSearching((v) => !v)}
                  onFiles={() => document.querySelector(".ch-msp-details .ch-msv-files")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
                  onAdd={() => setAdding(true)}
                  onLeave={() => setLeaving(true)}
                />
            </section>

            {searching && <ConversationSearch api={api} conv={conv} onClose={() => setSearching(false)} onPicked={onBack} />}

            {api.classDay && !conv.group && coach && (
              <ThreadClassSection
                cls={api.classDay}
                conv={conv}
                other={personOf(api, conv.memberIds[0] ?? "")}
                wrap={(content) => <ClassStatusCard>{content}</ClassStatusCard>}
              />
            )}

            <>
                {conv.group && <MembersCard api={api} conv={conv} onMessage={(id) => void message(id)} onRemove={mine && api.removeMember ? setRemoving : undefined} />}
              </>

            <PhotosAndFiles api={api} conv={conv} />

            {/* Schedule is not in the design (GAP.md "Can't match as drawn"): it keeps working, after the drawn cards, as one row
                inside a card of the one card style. */}
            {calendarHref && (
              <section className="ch-msp-panel ch-msd-lcard" aria-label="Schedule">
                <Link className="ch-msp-row is-btn" href={calendarHref}>
                  <span className="ch-msp-row__ic">
                    <Icon icon={CalendarPlus} size={16} />
                  </span>
                  <span className="ch-msp-row__b">
                    <b>Schedule</b>
                  </span>
                  <Icon icon={ChevronRight} size={16} className="ch-msp-chev" />
                </Link>
              </section>
            )}

            {/* With the switch gone it can have nothing to show: then it isn't drawn. */}
            {(api.muteError || !api.mute || muted) && (
              <Panel>
                {api.muteError ? (
                  <InlineNotice code="CH-7208" title="The mute setting didn’t load" body="Try again." onRetry={api.retryMute} />
                ) : !api.mute ? (
                  <div className="ch-msp-pad" aria-busy="true" data-ch-code="CH-7407">
                    <Skeleton height={30} />
                  </div>
                ) : (
                  muted && (
                    <div className="ch-msp-set">
                      <span className="ch-msp-set__note ch-num">{muteLabel(api.mute, api)}</span>
                    </div>
                  )
                )}

              </Panel>
            )}
          </div>
        </SectionBoundary>
      </div>
      {muteV2.choosing && <MuteMenu anchor={muteV2.anchor} onPick={(h) => void muteV2.setMute(true, h)} onClose={() => muteV2.setChoosing(false)} />}
      <LeaveGroupModal api={api} conv={conv} open={leaving} onClose={() => setLeaving(false)} onLeft={() => {}} />
      {mine && conv.group && <AddMembersModal api={api} conv={conv} open={adding} onClose={() => setAdding(false)} />}
      {mine && conv.group && api.removeMember && <RemoveMemberModal api={api} conv={conv} member={removing} onClose={() => setRemoving(null)} />}
    </PhoneScreen>
  );
}

'use client';

import type { ChMessagesApi } from '../api/types';
import { useState, useRef, useEffect } from 'react';
import { useBusy, useBusyReveal } from '../../../lib/use-busy';
import { type ChConvFilter, INBOX_FILTERS, filterConvs, pinnedThreads } from './model';
import { RailEmpty } from '../RailEmpty';
import { isMessagesFirstRun, MessagesFirstRun } from '../MessagesFirstRun';
import { noteTappedFace } from '../thread-v2';
import { SearchField } from '../../../ui/SearchField';
import { Icon } from '../../../ui/Icon';
import { MessageSquare, SquarePen } from 'lucide-react';
import { Segmented } from '../../../ui/Segmented';
import { InlineNotice } from '../../../ui/Notices';
import { EmptyState } from '../../../ui/States';
import { ListPresence } from '../../../ui/ListPresence';
import { ConvRow } from './ConvRow';
import { PinTile } from './PinTile';
import { InboxSkeleton } from './InboxSkeleton';
import { AnnouncementsSection } from '../announcements';
import { MessageHits } from '../message-hits';
import { Card } from '../../../ui/Card';

/* Inbox */

/**
 * The phone inbox (MSG-102 to MSG-115): search and New, the filter well, the Pinned card of faces and the Recent card.
 * No large title and no context line; the shell's green bar above it is unchanged. The Pinned card is drawn under every
 * filter and its people are not listed again in Recent (MSG-107), except while a search is asking, so a search always
 * returns the conversation it found.
 */
export function PhoneInboxV2({ api, onNew, onTeam }: { api: ChMessagesApi; onNew: () => void; onTeam: () => void }) {
  const [filter, setFilter] = useState<ChConvFilter>(api.designFilter ?? "all");
  const [q, setQ] = useState("");
  const list = filterConvs(api.convs, filter, q);
  // A filter or search change swaps the list at once (M-MSG-03b, 3.3); a row leaving the list fades and shrinks (M-MSG-CP-11, 3.5).
  const scope = `${filter}\u0000${q}`;
  const lastScope = useRef(scope);
  const changedScope = lastScope.current !== scope;
  useEffect(() => {
    lastScope.current = scope;
  });
  const loading = (api.convsLoading && !api.convs.length) || !!api.annLoading;
  // 3.5 late content, 3.9: the skeleton waits 150 ms, holds 300 ms once shown, and the list that takes its place fades in
  // over the quick beat (opacity only).
  const busy = useBusy(loading);
  const reveal = useBusyReveal<HTMLDivElement>(busy);
  const shown = busy === "skeleton" ? "skeleton" : loading ? "idle" : "ready";
  const pinned = api.pins ? pinnedThreads(api.convs, api.pins.ids) : [];
  const firstRun = isMessagesFirstRun(api);
  const searching = q.trim().length > 0;
  const pinIds = new Set(pinned.map((c) => c.id));
  const recent = searching ? list : list.filter((c) => !pinIds.has(c.id));
  const recentTitle = filter === "unread" ? "Unread" : filter === "groups" ? "Groups" : "Recent";
  // A filter that lists nothing says so in the card's place (MSG-108); a search's empty is MessageHits' (it knows the message hits too).
  const nothing = !recent.length && !searching && filter !== "all";
  return (
    <div className="ch-msp-page ch-msp-home ch-msv-inbox ch-inb ch-inb--phone" onClickCapture={(e) => noteTappedFace(e.target)}>
      {!firstRun && (
        <div className="ch-msv-top">
          <div className="ch-msv-srow">
            <SearchField value={q} onChange={setQ} placeholder="Search" label="Search conversations and messages" className="ch-msv-search" />
            <button data-ctl="CTL-P007-072" type="button" className="ch-msv-new" aria-label="New message" onClick={onNew}>
              <Icon icon={SquarePen} size={19} />
            </button>
          </div>
          <Segmented<ChConvFilter> redraws block plate="thumb" label="Filter conversations" value={filter} onChange={setFilter} options={INBOX_FILTERS} />
        </div>
      )}
      {api.convsError ? (
        <InlineNotice code="CH-7201" title="Conversations didn’t load" body="Your messages are safe. Try again." onRetry={api.refetchConvs} />
      ) : shown === "skeleton" ? (
        <InboxSkeleton layout="card" />
      ) : shown === "idle" ? null : firstRun ? (
        <MessagesFirstRun coach={api.viewer.role === "coach"} teamName={api.teamName ?? undefined} onNew={onNew} onTeam={api.viewer.role === "coach" ? onTeam : undefined} />
      ) : (
        <div className="ch-msp-list" ref={reveal}>
          {pinned.length > 0 && (
            <Card kind="list" className="ch-msv-card" label="Pinned">
              <h2 className="ch-msv-card__h">Pinned</h2>
              <div className="ch-msv-pins">
                {pinned.map((c, i) => (
                  <PinTile key={c.id} api={api} c={c} place={i} />
                ))}
              </div>
            </Card>
          )}
          {recent.length > 0 && (
            <Card kind="list" className="ch-msv-card" label={recentTitle}>
              <h2 className="ch-msv-card__h">
                {recentTitle} <small className="ch-num">{recent.length}</small>
              </h2>
              <ListPresence cut={changedScope}>
                {recent.map((c) => (
                  <ConvRow key={c.id} api={api} c={c} phone />
                ))}
              </ListPresence>
            </Card>
          )}
          {nothing && <RailEmpty filter={filter} layout="card" />}
          {/* No conversations but the inbox is not a first run (announcements to show, or their read failed, GAP-S-01):
              the empty list says so in one line above the announcements. */}
          {!api.convs.length && filter === "all" && !searching && (
            <EmptyState code="CH-7301" kind="first-run" compact icon={MessageSquare} title="No conversations yet" />
          )}
          {filter !== "groups" && <AnnouncementsSection api={api} q={q} />}
          <MessageHits api={api} q={q} nameMatches={list.length} layout="card" />
        </div>
      )}
    </div>
  );
}

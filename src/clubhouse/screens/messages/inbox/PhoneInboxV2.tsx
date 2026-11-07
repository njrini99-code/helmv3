'use client';

import type { ChMessagesApi } from '../api/types';
import { useState, useRef, useEffect } from 'react';
import { type ChConvFilter, isUnread, filterConvs, pinnedThreads, firstName } from '../model';
import { isMessagesFirstRun, MessagesFirstRun } from '../MessagesFirstRun';
import { noteTappedFace } from '../thread-v2';
import { SearchField } from '../../../ui/SearchField';
import { Icon } from '../../../ui/Icon';
import { SquarePen, Flag, Users } from 'lucide-react';
import { Segmented } from '../../../ui/Segmented';
import { InlineNotice } from '../../../ui/Notices';
import { TypingMini } from './TypingMini';
import { Avatar } from '../../../ui/Avatar';
import { convAvatarId, convYear } from '../shared/conv-ui';
import { ListPresence } from '../../../ui/ListPresence';
import { ConvRow } from './ConvRow';
import { RailEmpty } from '../RailEmpty';
import { AnnouncementsSection } from '../announcements';
import { MessageHits } from '../message-hits';

/* Inbox */

/** The redesign's inbox: context line, search and New, segmented, Pinned card, Recent card (06 S-MSG). No large title on the phone. */
export function PhoneInboxV2({ api, onNew, onTeam }: { api: ChMessagesApi; onNew: () => void; onTeam: () => void }) {
  const [filter, setFilter] = useState<ChConvFilter>(api.designFilter ?? "all");
  const [q, setQ] = useState("");
  const unread = api.convs.filter(isUnread).length;
  const list = filterConvs(api.convs, filter, q);
  // A filter or search change cuts its leaving rows in one frame (M-MSG-03b); a row leaving the list fades (M-MSG-CP-11).
  const scope = `${filter}\u0000${q}`;
  const lastScope = useRef(scope);
  const changedScope = lastScope.current !== scope;
  useEffect(() => {
    lastScope.current = scope;
  });
  const loading = (api.convsLoading && !api.convs.length) || api.annLoading;
  const context = loading ? "Loading conversations" : [`${unread} unread`, api.teamName].filter(Boolean).join(" · ");
  const pinned = api.pins ? pinnedThreads(api.convs, api.pins.ids) : [];
  const firstRun = isMessagesFirstRun(api);
  // A pin isn't listed twice (06 S-MSG): the Pinned card holds it unless a search or Groups is asking.
  const pinIds = new Set(pinned.map((c) => c.id));
  const recent = filter === "all" && !q.trim() ? list.filter((c) => !pinIds.has(c.id)) : list;
  const recentTitle = filter === "unread" ? "Unread" : filter === "groups" ? "Groups" : "Recent";
  return (
    <div className="ch-msp-page ch-msp-home ch-msv-inbox" onClickCapture={(e) => noteTappedFace(e.target)}>
      {!firstRun && (
        <div className="ch-msv-top">
          <p className="ch-msv-ctx ch-num">{context}</p>
          <div className="ch-msv-srow">
            <SearchField value={q} onChange={setQ} placeholder="Search" label="Search conversations and messages" className="ch-msv-search" />
            <button type="button" className="ch-msv-new" aria-label="New message" onClick={onNew}>
              <Icon icon={SquarePen} size={19} />
            </button>
          </div>
          <Segmented<ChConvFilter>
            redraws
            block
            label="Filter conversations"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread" },
              { value: "groups", label: "Groups" },
            ]}
          />
        </div>
      )}
      {api.convsError ? (
        <InlineNotice code="CH-7201" title="Conversations didn’t load" body="Your messages are safe. Try again." onRetry={api.refetchConvs} />
      ) : loading ? (
        <section className="ch-msv-card" role="status" aria-label="Loading conversations" data-ch-code="CH-7402">
          <div className="ch-msv-card__h" aria-hidden="true">
            <span className="ch-msv-sk is-line is-w20" />
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="ch-ms-row" aria-hidden="true" style={{ cursor: "default" }}>
              <span className="ch-msv-sk is-face" />
              <span className="ch-msv-sk__t">
                <span className="ch-msv-sk is-line is-w40" />
                <span className="ch-msv-sk is-line is-small is-w70" />
              </span>
            </div>
          ))}
        </section>
      ) : firstRun ? (
        <MessagesFirstRun coach={api.viewer.role === "coach"} teamName={api.teamName ?? undefined} onNew={onNew} onTeam={api.viewer.role === "coach" ? onTeam : undefined} />
      ) : (
        <div className="ch-msp-list">
          {filter === "all" && !q.trim() && pinned.length > 0 && (
            <section className="ch-msv-card" aria-label="Pinned">
              <h2 className="ch-msv-card__h">Pinned</h2>
              <div className="ch-msv-pins">
                {pinned.map((c) => {
                  const typers = api.typingByConv?.get(c.id);
                  const said = !c.group && c.lastSenderId !== api.viewer.userId ? c.lastText : null;
                  return (
                    <button key={c.id} type="button" className="ch-msv-pin" onClick={() => api.select(c.id)}>
                      {typers?.length ? (
                        <span className="ch-msv-bubblet"><TypingMini /></span>
                      ) : said ? (
                        <span className="ch-msv-bubblet">{said}</span>
                      ) : null}
                      {c.group ? (
                        <span className="ch-ms-grp ch-msv-pin__grp"><Icon icon={c.channel ? Flag : Users} size={31} /></span>
                      ) : (
                        <Avatar name={c.title} id={convAvatarId(api, c)} size="xl" year={convYear(api, c)} />
                      )}
                      <span className="ch-msv-pin__l">{c.channel ? "Team" : c.group ? c.title : firstName(c.title)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {recent.length > 0 && (
            <section className="ch-msv-card" aria-label={recentTitle}>
              <h2 className="ch-msv-card__h">
                {recentTitle} <small className="ch-num">{recent.length}</small>
              </h2>
              <ListPresence arrive="inbox" cut={changedScope}>
                {recent.map((c) => (
                  <ConvRow key={c.id} api={api} c={c} avatarSize={44} phone />
                ))}
              </ListPresence>
            </section>
          )}
          {!list.length && !q.trim() && <RailEmpty filter={filter} q={q} onClearSearch={() => setQ("")} onShowAll={() => setFilter("all")} />}
          {filter !== "groups" && <AnnouncementsSection api={api} q={q} />}
          <MessageHits api={api} q={q} nameMatches={list.length} />
        </div>
      )}
    </div>
  );
}

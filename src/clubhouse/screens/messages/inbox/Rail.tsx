'use client';

import { type ChPageKey, usePageKeys } from '../../../shell/command/page-keys';
import { plural } from '../../../lib/plural';
import type { ChMessagesApi } from '../api/types';
import { useRef, useState } from 'react';
import { usePanelSmoothScroll } from '../../../lib/smooth-scroll';
import { useRovingRows } from '../../../lib/roving';
import { type ChConvFilter, isUnread, filterConvs } from '../model';
import { isMessagesFirstRun } from '../MessagesFirstRun';
import { Tooltip } from '../../../ui/Tooltip';
import { Icon } from '../../../ui/Icon';
import { SquarePen, MessageSquare } from 'lucide-react';
import { SearchField } from '../../../ui/SearchField';
import { Segmented } from '../../../ui/Segmented';
import { InlineNotice } from '../../../ui/Notices';
import { Skeleton, EmptyState } from '../../../ui/States';
import { PinnedAndRecent } from './PinnedAndRecent';
import { ConvRow } from './ConvRow';
import { RailEmpty } from '../RailEmpty';
import { AnnouncementsSection } from '../announcements';
import { MessageHits } from '../message-hits';

/** B11: the rail's keys, as the shortcuts sheet lists them. */
const RAIL_KEYS: readonly ChPageKey[] = [{ label: "Move between conversations", keys: ["Up", "Down"] }];

/** "3 unread · 7 conversations" on the desktop rail. */
export function inboxContextDesktop(unread: number, total: number): string {
  return `${unread} unread · ${plural(total, "conversation")}`;
}

export function Rail({ api, onNew }: { api: ChMessagesApi; onNew: () => void }) {
  const body = useRef<HTMLDivElement | null>(null);
  usePanelSmoothScroll(body);
  // B11: ↑ and ↓ walk the conversations; the rail is one Tab stop.
  useRovingRows(body, ".ch-ms-row");
  usePageKeys("Messages", RAIL_KEYS);
  const [filter, setFilter] = useState<ChConvFilter>(api.designFilter ?? "all");
  const [q, setQ] = useState("");
  const unread = api.convs.filter(isUnread).length;
  const list = filterConvs(api.convs, filter, q);
  // The lane's first run (S-MSG.empty): the rail keeps Messages, New and Search; the card in the pane says the rest.
  const firstRun = isMessagesFirstRun(api);
  return (
    <aside className="ch-ms-rail" aria-label="Conversations">
      <div className="ch-ms-rail__head">
        <div className="ch-ms-rail__title">
          <h1>Messages</h1>
          <Tooltip>
            <button
              type="button"
              className="ch-btn ch-btn--secondary ch-iconbtn"
              aria-label="New message"
              onClick={onNew}
            >
              <Icon icon={SquarePen} size={16} />
            </button>
          </Tooltip>
        </div>
        <p className="ch-ms-rail__ctx ch-num">{firstRun ? "No conversations yet" : (api.convsLoading && !api.convs.length) || api.annLoading ? "Loading conversations" : inboxContextDesktop(unread, api.convs.length)}</p>
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search"
          label="Search conversations and messages"
        />
        {!firstRun && (
          <Segmented<ChConvFilter> redraws
            size="sm"
            label="Filter conversations"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread" },
              { value: "groups", label: "Groups" },
            ]}
          />
        )}
      </div>
      <div className="ch-ms-rail__body" ref={body}>
        {api.convsError ? (
          // The rail's full width (states audit c9): at the body's inset its body wrapped to a narrow column.
          <div className="ch-ms-rail__notice">
            <InlineNotice
              code="CH-7201"
              title="Conversations didn’t load"
              body="Your messages are safe. Try again."
              onRetry={api.refetchConvs}
            />
          </div>
        ) : (api.convsLoading && !api.convs.length) || api.annLoading ? (
          <div className="ch-ms-sec__card" aria-busy="true" data-ch-code="CH-7402">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="ch-ms-row" style={{ cursor: "default" }}>
                <Skeleton width={36} height={36} radius={18} />
                <span style={{ display: "grid", gap: 8 }}>
                  <Skeleton width="60%" height={13} />
                  <Skeleton width="85%" height={12} />
                </span>
              </div>
            ))}
          </div>
        ) : firstRun ? null : !api.convs.length ? (
          <EmptyState
            code="CH-7301"
            compact
            icon={MessageSquare}
            title="No conversations yet"
          />
        ) : (
          <>
            <PinnedAndRecent
                api={api}
                list={list}
                row={(c) => <ConvRow key={c.id} api={api} c={c} />}
              />

            {!list.length && !(q.trim()) && <RailEmpty filter={filter} q={q} onClearSearch={() => setQ("")} onShowAll={() => setFilter("all")} />}
            {/* Messages first; the team's announcements fold under them (owner, 2026-10-16). */}
            {filter !== "groups" && <AnnouncementsSection api={api} q={q} />}
            <MessageHits api={api} q={q} nameMatches={list.length} />
          </>
        )}
      </div>
    </aside>
  );
}

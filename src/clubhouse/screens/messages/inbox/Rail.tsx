'use client';

import { type ChPageKey, usePageKeys } from '../../../shell/command/page-keys';
import { plural } from '../../../lib/plural';
import type { ChMessagesApi } from '../api/types';
import { useEffect, useRef, useState } from 'react';
import { usePanelSmoothScroll } from '../../../lib/smooth-scroll';
import { useRovingRows } from '../../../lib/roving';
import { type ChConvFilter, INBOX_FILTERS, isUnread, filterConvs } from './model';
import { RailEmpty } from '../RailEmpty';
import { isMessagesFirstRun } from '../MessagesFirstRun';
import { Tooltip } from '../../../ui/Tooltip';
import { Icon } from '../../../ui/Icon';
import { SquarePen, MessageSquare } from 'lucide-react';
import { SearchField } from '../../../ui/SearchField';
import { Segmented } from '../../../ui/Segmented';
import { InlineNotice } from '../../../ui/Notices';
import { EmptyState } from '../../../ui/States';
import { PinnedAndRecent } from './PinnedAndRecent';
import { ConvRow } from './ConvRow';
import { InboxSkeleton } from './InboxSkeleton';
import { AnnouncementsSection } from '../announcements';
import { MessageHits } from '../message-hits';

/**
 * What ↑ and ↓ walk on the rail, in the order it draws them: the conversations, then the Announcements row, the
 * announcements it opens to, and "earlier announcements". The Announcements row was left out, so the arrows stopped on
 * the last conversation and Safari's Tab went past it to the thread.
 */
export const RAIL_ROWS = ".ch-ms-row, .ch-ms-fold, .ch-ms-more";

/** B11: the rail's keys, as the shortcuts sheet lists them. */
const RAIL_KEYS: readonly ChPageKey[] = [{ label: "Move between conversations", keys: ["Up", "Down"] }];

/** "3 unread · 7 conversations" on the desktop rail. */
export function inboxContextDesktop(unread: number, total: number): string {
  return `${unread} unread · ${plural(total, "conversation")}`;
}

export function Rail({ api, onNew }: { api: ChMessagesApi; onNew: () => void }) {
  const body = useRef<HTMLDivElement | null>(null);
  usePanelSmoothScroll(body);
  // B11: ↑ and ↓ walk the conversations and the announcements under them; the rail is one Tab stop.
  useRovingRows(body, RAIL_ROWS);
  usePageKeys("Messages", RAIL_KEYS);
  const [filter, setFilter] = useState<ChConvFilter>(api.designFilter ?? "all");
  const [q, setQ] = useState("");
  const unread = api.convs.filter(isUnread).length;
  const list = filterConvs(api.convs, filter, q);
  // A filter or search change cuts its leaving rows in one frame; rows that stay glide (MOT-LIST-4).
  const scope = `${filter}\u0000${q}`;
  const lastScope = useRef(scope);
  const changedScope = lastScope.current !== scope;
  useEffect(() => {
    lastScope.current = scope;
  });
  // The lane's first run (S-MSG.empty): the rail keeps Messages, New and Search; the card in the pane says the rest.
  const firstRun = isMessagesFirstRun(api);
  return (
    <aside className="ch-ms-rail ch-inb ch-inb--rail" aria-label="Conversations">
      <div className="ch-ms-rail__head">
        <div className="ch-ms-rail__title">
          <h1>Messages</h1>
          <Tooltip>
            <button type="button" className="ch-msv-new" aria-label="New message" onClick={onNew}>
              <Icon icon={SquarePen} size={19} />
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
        {!firstRun && <Segmented<ChConvFilter> weight="filter" redraws block plate="thumb" size="sm" label="Filter conversations" value={filter} onChange={setFilter} options={INBOX_FILTERS} />}
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
          <InboxSkeleton layout="rail" labelled={!!api.pins?.ids.length} />
        ) : firstRun ? null : !api.convs.length ? (
          <EmptyState
            code="CH-7301"
            kind="first-run"
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
                cut={changedScope}
              />
            {!list.length && !q.trim() && filter !== "all" && <RailEmpty filter={filter} layout="flat" />}
            {/* Messages first; the team's announcements fold under them (owner, 2026-10-16). */}
            {filter !== "groups" && <AnnouncementsSection api={api} q={q} />}
            <MessageHits api={api} q={q} nameMatches={list.length} />
          </>
        )}
      </div>
    </aside>
  );
}

'use client';

/**
 * ============================================================================
 * Fairway · messages · MessageConversationRail — the TRIAGE inbox rail
 * ----------------------------------------------------------------------------
 * The two-pane inbox's LEFT pane (supporting chrome, NOT a second hero). A flat
 * matte `InstrumentPanel` (depth='base'); the rows stay a dense, scannable list,
 * never a card-in-card — mirrors AskConversationRail.
 *
 * TRIAGE ordering (spec): unread threads float to top; within that, conversations
 * group by recency (Today / Yesterday / This Week / Earlier) rendered as quiet
 * Fairway eyebrow labels. The grouping helper preserves the legacy
 * `groupConversationsByTime` boundaries exactly.
 *
 * HONESTY CONTRACT:
 *   • unread count renders as a quiet accent Badge (numeric, tabular) — NOT a
 *     glass dot — and ONLY when unread_count > 0 (no raw 0, no fake unread on the
 *     single-thread demo where everything is read).
 *   • last-message preview decodes through the SAME decodeMessageContent the
 *     legacy row used; falls back to "No messages yet" when truly empty.
 *   • no big-numeral thread-count readout lives here — the masthead
 *     (FairwayMessages' ViewHeader meta) is the ONE place the conversation
 *     count renders, so the empty state shows exactly one honest widget
 *     (EmptyState) instead of stacking a second, contradictory zero gauge.
 *
 * PRESENTATION + ORGANIZATION ONLY: no data fetching, no send logic, no schema
 * change. It renders the rows useGolfConversations() produced, passed down by
 * FairwayMessages. Selection is a click handler (the page owns selected id +
 * mobile master-detail), mirroring the legacy onSelect contract.
 * ========================================================================== */

import * as React from 'react';
import { Inbox, MessageSquare, Plus, Users, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import type { GolfConversationWithMeta } from '@/hooks/golf/use-golf-messages';
import { searchGolfMessages } from '@/app/golf/actions/messages';
import type { MessageSearchResult } from '@/app/actions/messages';
import { EmptyState, InlineNotice } from '@/components/fairway/feedback';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Input } from '@/components/fairway/forms/Input';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { PressTarget } from '@/components/fairway/controls/press-target';
import { Avatar } from '@/components/fairway/controls/avatar';
import { Badge } from '@/components/fairway/controls/badge';
import { InstrumentPanel } from '@/components/fairway/instrument';
import { useMediaQuery } from '@/hooks/use-media-query';
import { isGroupConversation } from './conversation-kind';

export interface MessageConversationRailProps {
  /** Rows from the unchanged useGolfConversations() hook. */
  conversations: GolfConversationWithMeta[];
  /** The currently-open conversation id (page-owned selection). */
  selectedId: string | null;
  /** Select a conversation (page sets selected id + mobile master-detail). */
  onSelect: (id: string) => void;
  /** Open the New message modal from the honest-empty CTA. */
  onNewMessage: () => void;
  /** Coach-only team broadcast. Omitted for players, who have no such action. */
  onTeamBroadcast?: () => void;
  /** First-paint skeleton rail. */
  loading?: boolean;
  /**
   * P257: the conversations fetch FAILED (vs. a genuine empty inbox). When true
   * the rail renders a recoverable error state (explain + Retry) instead of the
   * cheerful "No conversations yet" empty — a backend failure must never
   * masquerade as an empty inbox.
   */
  error?: boolean;
  /** Re-run the conversations fetch from the error state's Retry. */
  onRetry?: () => void;
  /**
   * P259: team scope for cross-conversation message search (passed to
   * searchGolfMessages). When omitted, search still runs participant-scoped.
   */
  teamId?: string | null;
  /**
   * P259: open a conversation FROM a search hit. Selects the conversation and
   * (page-side) scrolls to the matched message. Falls back to onSelect when omitted.
   */
  onOpenMessage?: (conversationId: string, messageId: string) => void;
  className?: string;
}

/** Relative time for a row — only ever called with a real ISO string. */
function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Recency buckets — PRESERVES the legacy groupConversationsByTime boundaries. */
function groupConversationsByTime(conversations: GolfConversationWithMeta[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups = {
    today: [] as GolfConversationWithMeta[],
    yesterday: [] as GolfConversationWithMeta[],
    thisWeek: [] as GolfConversationWithMeta[],
    older: [] as GolfConversationWithMeta[],
  };

  conversations.forEach(conv => {
    const lastMsgDate = conv.last_message?.created_at
      ? new Date(conv.last_message.created_at)
      : new Date(0);
    if (lastMsgDate >= today) groups.today.push(conv);
    else if (lastMsgDate >= yesterday) groups.yesterday.push(conv);
    else if (lastMsgDate >= lastWeek) groups.thisWeek.push(conv);
    else groups.older.push(conv);
  });

  return groups;
}

const GROUP_ORDER: ReadonlyArray<{ key: keyof ReturnType<typeof groupConversationsByTime>; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'thisWeek', label: 'This Week' },
  { key: 'older', label: 'Earlier' },
];

function ConversationRow({
  conv,
  isSelected,
  onSelect,
}: {
  conv: GolfConversationWithMeta;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const hasUnread = conv.unread_count > 0;
  // Not `conv.is_group` — that flag is true for any team-chat-flagged
  // conversation including a broadcast to ONE player, so a two-person DM
  // rendered the group glyph instead of the person's initials. See
  // conversation-kind.ts.
  const isGroup = isGroupConversation(conv);
  const displayName = isGroup
    ? conv.title || 'Team Group'
    : conv.other_participant?.name || 'Unknown User';
  const time = formatTime(conv.last_message?.created_at);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'group block h-auto min-h-0 w-full items-stretch justify-start rounded-fw-md border-0 px-3 py-3 text-left font-normal outline-none transition-[background-color,box-shadow] [transition-duration:200ms]',
        '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        // UNREAD IS A CARD; READ IS THE PAGE.
        //
        // Every row used to be the same flat lane, and unread was carried
        // entirely by a badge on the right edge and slightly darker ink — two
        // small, late signals in a scan that goes down the left. Lifting the
        // unread row onto `surface` with the lit card shadow makes the thing
        // needing attention the only thing standing off the champagne, legible
        // from the far side of the row and before any text is read.
        //
        // A read row deliberately gets NO surface at all: if both tiers were
        // cards the lift would say nothing. This is also why the previous
        // "Unread" bucket at the top of the rail is gone — the rows can sit in
        // their real chronology now, because the eye no longer needs them
        // sorted to find them.
        hasUnread && 'bg-surface shadow-fw-card',
        isSelected
          ? 'bg-surface-sunken/90 ring-1 ring-inset ring-accent-200/60'
          : !hasUnread && 'hover:bg-surface-sunken/60',
      )}
    >
      <div className="flex items-start gap-3">
        {isGroup ? (
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <Users size={18} aria-hidden="true" />
          </span>
        ) : (
          <Avatar
            name={conv.other_participant?.name || 'User'}
            src={conv.other_participant?.avatar}
            size="md"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate font-fw-sans text-body-sm',
                hasUnread || isSelected ? 'font-medium text-text-primary' : 'font-medium text-text-secondary',
              )}
            >
              {displayName}
            </span>
            {time ? (
              <time
                dateTime={conv.last_message?.created_at ?? undefined}
                className={cn(
                  'flex-shrink-0 font-fw-mono text-eyebrow tabular-nums',
                  hasUnread ? 'text-accent-700' : 'text-text-tertiary',
                )}
              >
                {time}
              </time>
            ) : null}
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            <p
              className={cn(
                'min-w-0 flex-1 truncate font-fw-sans text-eyebrow leading-relaxed',
                hasUnread ? 'text-text-primary' : 'text-text-tertiary',
              )}
            >
              {conv.last_message?.content
                ? decodeMessageContent(conv.last_message.content)
                : 'No messages yet'}
            </p>
            {/* HONEST unread: quiet accent Badge, numeric/tabular, NEVER a glass
                dot — and ONLY when unread_count > 0 (no raw 0 / fake unread). */}
            {hasUnread ? (
              <Badge tone="accent" size="sm" numeric className="flex-shrink-0">
                {conv.unread_count > 9 ? '9+' : conv.unread_count}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </Button>
  );
}

/**
 * The people you were just talking to, one tap away.
 *
 * DELIBERATELY "RECENT", NOT "PINNED". The design draws this rail as PINNED,
 * and pinning is a stored per-conversation decision — `golf_conversations`
 * carries no such column on `main`, so a "Pinned" heading here would be a
 * label over a list nobody pinned. Recency is a fact this component already
 * holds (the hook returns conversations most-recent-first), so the rail ships
 * saying what it actually shows. When a pin column lands, this is the rail
 * that reads it and the heading that changes.
 *
 * 1:1 only, because a face is the affordance: a group renders as a glyph and
 * five identical glyphs in a row identify nothing. Hidden below three entries,
 * where "the people you message" is a claim about a list of two.
 */
function RecentPeopleRail({
  conversations,
  onSelect,
}: {
  conversations: GolfConversationWithMeta[];
  onSelect: (id: string) => void;
}) {
  const people = conversations.filter((c) => !isGroupConversation(c)).slice(0, 8);
  if (people.length < 3) return null;

  return (
    <div className="mb-4">
      <p className="px-3 pb-2 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">
        Recent
      </p>
      {/* `-mx-1 px-1` so the focus ring of the first and last chip is not
          clipped by the scroller's own overflow. */}
      <ul className="-mx-1 flex gap-3 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {people.map((conv) => (
          <li key={conv.id} className="flex-shrink-0">
            {/* PressTarget, not Button: this is a composed avatar-over-name
                tile, and Button's variant styling and label contract would
                fight the layout. It is the primitive that exists for exactly
                that case and carries the focus ring and the type default. */}
            <PressTarget
              onClick={() => onSelect(conv.id)}
              aria-label={`Open conversation with ${conv.other_participant?.name || 'this person'}`}
              className="flex w-[60px] flex-col items-center gap-1.5 rounded-fw-md py-1"
            >
              <Avatar
                decorative
                name={conv.other_participant?.name || 'User'}
                src={conv.other_participant?.avatar}
                size="lg"
              />
              <span className="w-full truncate text-center font-fw-sans text-eyebrow text-text-secondary">
                {(conv.other_participant?.name || 'User').split(' ')[0]}
              </span>
            </PressTarget>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A cross-conversation search hit row (P259) — name · matched snippet · convo. */
function SearchResultRow({
  result,
  isSelected,
  onSelect,
}: {
  result: MessageSearchResult;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'group block h-auto min-h-0 w-full items-stretch justify-start rounded-fw-md border-0 px-3 py-2.5 text-left font-normal outline-none transition-colors [transition-duration:200ms]',
        '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        isSelected ? 'bg-surface-sunken/90 ring-1 ring-inset ring-accent-200/60' : 'hover:bg-surface-sunken/60',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar name={result.senderName || 'User'} src={result.senderAvatar} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
              {result.senderName || 'Unknown'}
            </span>
            <span className="flex-shrink-0 truncate font-fw-sans text-eyebrow text-text-tertiary">
              {result.conversationName}
            </span>
          </div>
          <p className="mt-1 truncate font-fw-sans text-eyebrow leading-relaxed text-text-tertiary">
            {decodeMessageContent(result.content)}
          </p>
        </div>
      </div>
    </Button>
  );
}

export function MessageConversationRail({
  conversations,
  selectedId,
  onSelect,
  onNewMessage,
  onTeamBroadcast,
  loading = false,
  error = false,
  onRetry,
  teamId,
  onOpenMessage,
  className,
}: MessageConversationRailProps) {
  // ── P259: cross-conversation message search ────────────────────────────────
  // Empty query → the normal triage list. >=2 chars → debounced server search
  // (searchGolfMessages: participant-scoped, wildcard-escaped, 50-row cap).
  // Drives the bezel/padding gate on the panel below — see the note there.
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [searchQuery, setSearchQuery] = React.useState('');
  /** Inbox scope. `all` is the resting state; the other two are triage. */
  const [filter, setFilter] = React.useState<'all' | 'unread' | 'groups'>('all');
  const [searchResults, setSearchResults] = React.useState<MessageSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState(false);
  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length >= 2;

  React.useEffect(() => {
    if (trimmedQuery.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    setSearchError(false);
    const handle = setTimeout(() => {
      void (async () => {
        const res = await searchGolfMessages(trimmedQuery, teamId ?? undefined);
        if (cancelled) return;
        if ('error' in res) {
          setSearchError(true);
          setSearchResults([]);
        } else {
          setSearchResults(res.results);
        }
        setSearchLoading(false);
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmedQuery, teamId]);

  const handleResultSelect = (result: MessageSearchResult) => {
    if (onOpenMessage) onOpenMessage(result.conversationId, result.messageId);
    else onSelect(result.conversationId);
  };

  // P162/P97/P105: the ONE authoritative conversation count already renders in
  // the page masthead (ViewHeader meta, just above this rail). A second big
  // mono numeral readout here duplicated that line AND, in the zero-state,
  // stacked a contradictory "awaiting signal — 0 of 1" gauge directly beside
  // the honest "No conversations yet" EmptyState — two zero-state widgets
  // disagreeing in the same card. The rail's panel header carries no count
  // of its own now; the masthead is the single source of truth for it.

  if (loading) {
    return (
      <InstrumentPanel
        depth="base"
        padding="md"
        header="Conversations"
        className={cn('flex flex-col', className)}
        aria-busy="true"
      >
        <div className="flex flex-col gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 rounded-fw-md px-3 py-2.5">
              <div className="h-10 w-10 flex-shrink-0 rounded-full bg-surface-sunken" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between">
                  <div className="h-3.5 w-24 rounded bg-surface-sunken" />
                  <div className="h-3 w-10 rounded bg-surface-sunken" />
                </div>
                <div className="h-3 w-40 rounded bg-surface-sunken" />
              </div>
            </div>
          ))}
        </div>
      </InstrumentPanel>
    );
  }

  // P257 ERROR STATE: the fetch failed AND we have nothing to fall back to.
  // Explain + Retry — never the cheerful empty. Checked BEFORE the empty branch
  // because a failed load also leaves conversations.length === 0. If a transient
  // blip still left rows on screen (error && length > 0), we keep showing them
  // rather than blanking a rail the user was already reading.
  if (error && conversations.length === 0) {
    return (
      <InstrumentPanel
        depth="base"
        padding="md"
        header="Conversations"
        className={cn('flex flex-col', className)}
      >
        <InlineNotice
          tone="danger"
          title="Couldn’t load conversations"
          action={
            onRetry ? (
              <Button variant="secondary" size="sm" onClick={() => onRetry()}>
                Retry
              </Button>
            ) : undefined
          }
        >
          Something went wrong loading your inbox. Check your connection and try again.
        </InlineNotice>
      </InstrumentPanel>
    );
  }

  // HONEST-EMPTY (a): no conversations → Inbox EmptyState + New message CTA.
  if (conversations.length === 0) {
    return (
      <InstrumentPanel
        depth="base"
        padding="md"
        header="Conversations"
        className={cn('flex flex-col', className)}
      >
        <EmptyState
          variant="subtle"
          icon={MessageSquare}
          title="No conversations yet"
          // Names both of the things you can do from here. "Reach out to a
          // teammate or coach" described only the DM and left the coach who
          // opened this to organise a trip with no idea a group was possible.
          description="Message a player, or start a group for the next trip."
          action={
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onNewMessage}
              className="min-h-[36px] px-4 py-1.5"
            >
              New message
            </Button>
          }
        />
      </InstrumentPanel>
    );
  }

  // TRIAGE IS NOW A FILTER, NOT AN ORDERING.
  //
  // The rail used to hoist every unread conversation into its own block above
  // the recency groups. That put triage in the sort order permanently: a
  // thread you had read an hour ago sat below one you had read last week the
  // moment the older one went unread, so the list's shape changed under you
  // and the same conversation lived in a different place each visit. Unread is
  // now carried by the ROW (it lifts onto a card — see ConversationRow), which
  // leaves chronology free to be chronology, and the Unread pill below gives
  // the triage view on demand instead of imposing it always.
  const unreadCount = conversations.filter((c) => c.unread_count > 0).length;
  const groupCount = conversations.filter((c) => isGroupConversation(c)).length;
  const visible = conversations.filter((c) => {
    if (filter === 'unread') return c.unread_count > 0;
    if (filter === 'groups') return isGroupConversation(c);
    return true;
  });
  const grouped = groupConversationsByTime(visible);

  return (
    <InstrumentPanel
      as="nav"
      depth="base"
      // On a phone this rail IS the Messages screen, so its bezel is pure
      // overhead: `padding="md"` costs 24px and the "Conversations" heading
      // another ~46px (`text-h3` + the bezel's `mb-5`) before the search field,
      // to label a full-screen list of conversations that sits under a top bar
      // already reading "Messages". Doctrine Rule 2 — one line on phone, not a
      // stack of bands. The page gutter supplies the horizontal inset, so the
      // list runs edge-to-edge like a native inbox.
      //
      // `aria-label` below is unconditional, so dropping the VISIBLE heading
      // costs assistive tech nothing — the nav landmark keeps its name either
      // way.
      //
      // Gated in JS rather than CSS because `header` is a prop rendered inside
      // the primitive, with no slot to target. This is the same
      // `useMediaQuery` pattern AppShell uses to gate the desktop rail's mount:
      // the hook's server snapshot is `false` (mobile-first, matching SSR) and
      // it reads matchMedia synchronously on the first client render, so a
      // desktop viewport corrects before paint rather than flashing.
      padding={isDesktop ? 'md' : 'none'}
      header={isDesktop ? 'Conversations' : undefined}
      aria-label="Conversations"
      className={cn(
        'flex flex-col',
        // Same reasoning as the thread pane: a card that fills the screen has
        // stopped being a card (Doctrine Rule 11). `!` is required because the
        // border comes from a CSS module class of equal specificity.
        // `!` on the FILL too, and it is not decoration: the three overrides
        // beside it carry it because the depth treatment comes from a CSS
        // module class of equal specificity, and stylesheet order decides.
        // `bg-transparent` was the one that did not, so it lost — measured
        // live, the phone rail still painted `--fw-color-surface` (lab 98.2)
        // and every row sat on a cream slab. Unread rows lift with
        // `bg-surface shadow-fw-card`; a surface-on-surface card cannot
        // lift off anything. One character, and it was the difference
        // between the design and a flat list.
        'max-md:!rounded-none max-md:!border-0 max-md:!shadow-none max-md:!bg-transparent',
        className,
      )}
    >
      {/* P259: cross-conversation message search. */}
      <div className="mb-3">
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search messages…"
          leading={<Search aria-hidden />}
          aria-label="Search messages"
        />
      </div>

      {isSearching ? (
        // ── Search results view (replaces the triage list while searching) ──
        searchLoading ? (
          <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-live="polite">
            <span className="sr-only">Searching…</span>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-fw-md px-3 py-2.5">
                <Skeleton circle className="h-10 w-10" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : searchError ? (
          <InlineNotice tone="danger" title="Couldn’t search messages">
            Something went wrong searching your messages. Check your connection and try again.
          </InlineNotice>
        ) : searchResults.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {searchResults.map((result) => (
              <li key={result.messageId}>
                <SearchResultRow
                  result={result}
                  isSelected={selectedId === result.conversationId}
                  onSelect={() => handleResultSelect(result)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            variant="search"
            title={`No matches for “${trimmedQuery}”`}
            description="Try a different word, or clear the search to see all conversations."
          />
        )
      ) : (
      <div className="flex flex-col gap-3">
        <RecentPeopleRail conversations={conversations} onSelect={onSelect} />

        {/* Scope, and the one primary action, on a single line.
            `FilterPill` is the shipped filter chip (aria-pressed, the focus
            ring, the tabular count slot) — this row uses it rather than a
            second chip vocabulary that happens to live in Messages. The check
            glyph is off because three pills that reflow by ~14px as you move
            between them is motion the eye has to re-read. */}
        <div className="flex items-center gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <FilterPill size="sm" showCheck={false} selected={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </FilterPill>
          <FilterPill
            size="sm"
            showCheck={false}
            selected={filter === 'unread'}
            count={unreadCount > 0 ? unreadCount : undefined}
            onClick={() => setFilter('unread')}
          >
            Unread
          </FilterPill>
          {groupCount > 0 ? (
            <FilterPill size="sm" showCheck={false} selected={filter === 'groups'} onClick={() => setFilter('groups')}>
              Groups
            </FilterPill>
          ) : null}
          {/* Both actions live on the scope row. A coach's "Team" broadcast
              had a whole row of its own above the search field — one control,
              one band, on the screen with the least vertical room in the
              product (Doctrine: do not stack utility rows). It is the same
              KIND of thing as compose — start a conversation — so it belongs
              in the same cluster. */}
          <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
            {onTeamBroadcast ? (
              <IconButton
                variant="secondary"
                size="sm"
                aria-label="Message the whole team"
                onClick={onTeamBroadcast}
                className="rounded-full"
              >
                <Users size={18} aria-hidden="true" />
              </IconButton>
            ) : null}
            <IconButton
              variant="secondary"
              size="sm"
              aria-label="New message"
              onClick={onNewMessage}
              className="rounded-full"
            >
              <Plus size={18} aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        {/* A filter that matches nothing must say so. Without this the rail
            went blank and read as a failed load — the same confusion the
            error state above exists to prevent, arriving by a different
            route. */}
        {visible.length === 0 ? (
          <EmptyState
            variant="subtle"
            icon={Inbox}
            title={filter === 'unread' ? 'Nothing unread' : 'No group conversations'}
            description={
              filter === 'unread'
                ? 'You’re caught up. Switch to All to see every conversation.'
                : 'Start a group to coordinate travel, practice or a lineup.'
            }
          />
        ) : null}

        {GROUP_ORDER.map(({ key, label }) => {
          const group = grouped[key];
          if (group.length === 0) return null;
          return (
            <div key={key}>
              <p className="px-3 pb-2 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                {label}
              </p>
              <ul className="flex flex-col gap-1.5">
                {group.map((conv, i) => (
                  <li
                    key={conv.id}
                    className="animate-fade-in-up motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms`, animationFillMode: 'both' }}
                  >
                    <ConversationRow
                      conv={conv}
                      isSelected={selectedId === conv.id}
                      onSelect={() => onSelect(conv.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      )}
    </InstrumentPanel>
  );
}

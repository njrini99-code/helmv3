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
import { Inbox, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import type { GolfConversationWithMeta } from '@/hooks/golf/use-golf-messages';
import { searchGolfMessages } from '@/app/golf/actions/messages';
import type { MessageSearchResult } from '@/app/actions/messages';
import { EmptyState, InlineNotice } from '@/components/fairway/feedback';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Input } from '@/components/fairway/forms/Input';
import { Button } from '@/components/fairway/controls/button';
import { Avatar } from '@/components/fairway/controls/avatar';
import { Segmented } from '@/components/fairway/controls/segmented';
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
  /**
   * §16: actions that belong on the search row — compose, team broadcast.
   * Rendered INLINE with the search field rather than in a band above it.
   * Removing the giant green pill left the row it used to stand in, and an
   * otherwise-empty band holding two icons is the same wasted vertical space
   * with less in it.
   */
  trailingActions?: React.ReactNode;
  /** Open the New message modal from the honest-empty CTA. */
  onNewMessage: () => void;
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
    // See MessageThreadPane: "Unknown User" is a debug string. A participant
    // with no coach/player row has left the roster, and the list should say so.
    : conv.other_participant?.name || 'Former team member';
  const time = formatTime(conv.last_message?.created_at);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'group block h-auto min-h-0 w-full items-stretch justify-start rounded-fw-md border-0 px-3 py-3 text-left font-normal outline-none transition-colors [transition-duration:150ms]',
        '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        // §19: an immediate pressed surface. Acknowledgement must not wait for
        // navigation — `active:` paints on touch-down, before any route work.
        'active:bg-surface-sunken',
        isSelected
          ? 'bg-surface-sunken/90 ring-1 ring-inset ring-accent-200/60'
          : 'hover:bg-surface-sunken/60',
      )}
    >
      <div className="flex items-start gap-3">
        {/* §12/§16. Every group rendered the SAME generic two-person glyph,
            so a list of three conversations showed three identical icons and
            the avatar column carried no information at all. A group now gets
            its own initials, like a person does — "Team Updates" reads TU,
            "Demo University Golf" reads DU — on the accent wash that still
            distinguishes it from a DM at a glance. 48px per §16 (was 40). */}
        {isGroup ? (
          <Avatar name={displayName} size="lg" className="bg-accent-50 text-accent-700" />
        ) : (
          <Avatar
            name={conv.other_participant?.name || 'User'}
            src={conv.other_participant?.avatar}
            size="lg"
          />
        )}

        {/* Name over preview on the left; time over count on the right. The
            time used to sit on the name's row and the unread badge on the
            preview's, so the row had FOUR alignment edges and the badge
            competed with the message text for the same horizontal space —
            a long preview pushed it around. One right rail, two stacked
            metadata items, one edge. */}
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate font-fw-sans text-body',
              hasUnread ? 'font-semibold text-text-primary' : 'font-medium text-text-primary',
            )}
          >
            {displayName}
          </span>
          <p
            className={cn(
              // §16 wants 14-15px here. This was `text-eyebrow` — 11px at
              // 0.06em tracking, the role built for ALL-CAPS labels, applied
              // to a sentence somebody actually said. It is the message
              // preview; it should read like one.
              'mt-0.5 truncate font-fw-sans text-body-sm',
              hasUnread ? 'text-text-primary' : 'text-text-secondary',
            )}
          >
            {conv.last_message?.content
              ? decodeMessageContent(conv.last_message.content)
              : 'No messages yet'}
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1.5 pt-0.5">
          {time ? (
            <time
              dateTime={conv.last_message?.created_at ?? undefined}
              className="font-fw-sans text-caption tabular-nums text-text-tertiary"
            >
              {time}
            </time>
          ) : null}
          {/* HONEST unread: quiet accent Badge, numeric/tabular, NEVER a glass
              dot — and ONLY when unread_count > 0 (no raw 0 / fake unread). */}
          {hasUnread ? (
            <Badge tone="accent" size="sm" numeric>
              {conv.unread_count > 9 ? '9+' : conv.unread_count}
            </Badge>
          ) : null}
        </div>
      </div>
    </Button>
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
        'group block h-auto min-h-0 w-full items-stretch justify-start rounded-fw-md border-0 px-3 py-3 text-left font-normal outline-none transition-colors [transition-duration:150ms]',
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
  trailingActions,
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
  const [filter, setFilter] = React.useState<'all' | 'unread' | 'teams'>('all');
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
        // The SAME gating the loaded rail uses below. This branch hardcoded
        // `padding="md"` and the "Conversations" bezel regardless of viewport,
        // so entering Messages on a phone drew THREE different layouts in a row:
        // the route skeleton (flat, search field, rows), then this bezel card
        // with no search, then the real rail (flat, search field, rows). Two
        // visible reconstructions on the way to a screen whose shape was known
        // the whole time — the "it hot loads when you click Messages" report.
        //
        // A loading state that does not match the thing it stands in for is
        // worse than none: it manufactures the exact layout jump it exists to
        // prevent.
        padding={isDesktop ? 'md' : 'none'}
        header={isDesktop ? 'Conversations' : undefined}
        className={cn(
          'flex flex-col',
          'max-md:!rounded-none max-md:!border-0 max-md:!shadow-none max-md:bg-transparent',
          className,
        )}
        aria-busy="true"
      >
        {/* The search field holds its place. It is the rail's first row on a
            phone, so omitting it let every conversation jump up by its height
            the moment data landed. */}
        <div className="mb-3">
          <div className="h-11 w-full rounded-fw-md bg-surface-sunken" />
        </div>
        <div className="flex flex-col gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
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
          icon={Inbox}
          title="No conversations yet"
          description="Reach out to a teammate or coach to get a thread started."
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

  // TRIAGE: unread floats to top, then recency groups (each kept in the hook's
  // most-recent-first order within the bucket).
  // ── Inbox filter ──────────────────────────────────────────────────────
  // Every modern chat inbox carries one of these. Ours is keyed to what Helm
  // actually knows rather than to a generic All/Favorites: a golf program's
  // inbox is a mix of one-to-one coaching and team channels, and "just the
  // team channels" is a real thing a coach wants at 6am on a travel day.
  //
  // The counts on the chips are the honest kind — they come from the same
  // `unread_count` the rows render, so a chip can never claim a number the
  // list below it does not show.
  const unreadTotal = conversations.filter(c => c.unread_count > 0).length;
  const teamTotal = conversations.filter(c => isGroupConversation(c)).length;

  // A control that cannot change what you see is chrome. Each option earns its
  // place only if it would produce a DIFFERENT list from "All" — which means
  // some, but not all, conversations match it.
  const unreadFilterUseful = unreadTotal > 0 && unreadTotal < conversations.length;
  const teamFilterUseful = teamTotal > 0 && teamTotal < conversations.length;
  const showFilters = unreadFilterUseful || teamFilterUseful;

  // Not `useMemo`: this sits BELOW the loading/error/empty early returns, so a
  // hook here is called conditionally — React's rules-of-hooks error, and a
  // real one, since the branch taken changes between renders. A plain filter is
  // also what the two lines under it already do, over the same array.
  const visible =
    filter === 'unread' ? conversations.filter(c => c.unread_count > 0)
    : filter === 'teams' ? conversations.filter(c => isGroupConversation(c))
    : conversations;

  const unread = visible.filter(c => c.unread_count > 0);
  const read = visible.filter(c => c.unread_count === 0);
  const grouped = groupConversationsByTime(read);

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
        'max-md:!rounded-none max-md:!border-0 max-md:!shadow-none max-md:bg-transparent',
        className,
      )}
    >
      {/* P259: cross-conversation message search. */}
      {/* §16: "secondary to conversation list, no giant card". A pill on the
          sunken track reads as a field; the bordered rounded rectangle read as
          another card stacked above the rows. */}
      <div className="mb-3 flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages…"
            leading={<Search aria-hidden />}
            aria-label="Search messages"
            className="rounded-full border-transparent bg-surface-sunken focus:border-accent-600"
          />
        </div>
        {/* Compose sits ON this row (§16). Removing the green pill left the
            band it used to stand in; two icons alone in that band is the same
            wasted height with less in it. One row: find, or start. */}
        {trailingActions}
      </div>

      {/* Filters, under search. Rendered only when they can actually change
          what you see — see `showFilters`. An inbox of three conversations
          that are all team channels does not get a "Teams" chip that filters
          to the same three. */}
      {showFilters ? (
        <div className="mb-3">
          <Segmented
            size="lg"
            fullWidth
            aria-label="Filter conversations"
            value={filter}
            onValueChange={(v) => setFilter(v)}
            options={[
              { value: 'all' as const, label: 'All' },
              ...(unreadFilterUseful
                ? [{
                    value: 'unread' as const,
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        Unread
                        <span className="font-fw-sans text-caption tabular-nums text-accent-700">
                          {unreadTotal}
                        </span>
                      </span>
                    ),
                  }]
                : []),
              ...(teamFilterUseful
                ? [{ value: 'teams' as const, label: 'Teams' }]
                : []),
            ]}
          />
        </div>
      ) : null}

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
      ) : visible.length === 0 ? (
        // Reachable without the list being empty: read the last unread message
        // while the Unread filter is on and this is what is left. It must not
        // say "No conversations yet" — there are conversations, just none here.
        <EmptyState
          variant="subtle"
          icon={Inbox}
          title={filter === 'unread' ? 'Nothing unread' : 'No team channels'}
          description="Every conversation is still here — clear the filter to see them."
          action={
            <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
              Show all
            </Button>
          }
        />
      ) : (
      <div className="flex flex-col gap-3">
        {unread.length > 0 ? (
          <div>
            <p className="px-3 pb-1.5 font-fw-sans text-caption font-semibold text-accent-700">
              Unread
            </p>
            <ul className="flex flex-col gap-1">
              {unread.map((conv, i) => (
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
        ) : null}

        {GROUP_ORDER.map(({ key, label }) => {
          const group = grouped[key];
          if (group.length === 0) return null;
          return (
            <div key={key}>
              <p className="px-3 pb-1.5 font-fw-sans text-caption font-semibold text-text-tertiary">
                {label}
              </p>
              <ul className="flex flex-col gap-1">
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

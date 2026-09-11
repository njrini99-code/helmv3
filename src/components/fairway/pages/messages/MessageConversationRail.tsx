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
 * group by recency (Today / Earlier) rendered as quiet Fairway eyebrow labels —
 * the artboard's section set (`Main.dc.html:61,111`). See groupConversationsByTime
 * for why the legacy four-bucket split was collapsed.
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
import { Inbox, Users, Search } from 'lucide-react';
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
import { Segmented, TRACK_SUNKEN_SHADOW } from '@/components/fairway/controls/segmented';
import { Badge } from '@/components/fairway/controls/badge';
import { InstrumentPanel } from '@/components/fairway/instrument';
import { useMediaQuery } from '@/hooks/use-media-query';
import { isGroupConversation, conversationDisplayName } from './conversation-kind';

export interface MessageConversationRailProps {
  /** Rows from the unchanged useGolfConversations() hook. */
  conversations: GolfConversationWithMeta[];
  /** The currently-open conversation id (page-owned selection). */
  selectedId: string | null;
  /** Select a conversation (page sets selected id + mobile master-detail). */
  onSelect: (id: string) => void;
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

/**
 * Recency buckets — TODAY and EARLIER, the artboard's section set.
 *
 * This used to carry the legacy four (Today / Yesterday / This Week / Earlier).
 * Measured against the approved design at 390×844 with a six-conversation
 * fixture, those four plus the Unread bucket printed FIVE section headers for
 * six rows — a label for nearly every row, which is what read as "choppy".
 * `Main.dc.html` labels exactly two sections (`:61` TODAY, `:111` EARLIER) for
 * seven rows, so the section set here now matches it.
 *
 * No information is lost: `formatTime` above already stamps each row with
 * "Yesterday", a weekday ("Fri"), or a date ("Aug 28"), which is where the
 * finer boundaries actually belonged. Collapsing to one boundary also shrinks
 * the surface of M03A F09 (row time and section grouping used two different
 * day rules) from three shared boundaries to one.
 */
function groupConversationsByTime(conversations: GolfConversationWithMeta[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const groups = {
    today: [] as GolfConversationWithMeta[],
    older: [] as GolfConversationWithMeta[],
  };

  conversations.forEach(conv => {
    const lastMsgDate = conv.last_message?.created_at
      ? new Date(conv.last_message.created_at)
      : new Date(0);
    if (lastMsgDate >= today) groups.today.push(conv);
    else groups.older.push(conv);
  });

  return groups;
}

const GROUP_ORDER: ReadonlyArray<{ key: keyof ReturnType<typeof groupConversationsByTime>; label: string }> = [
  { key: 'today', label: 'Today' },
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
  const displayName = conversationDisplayName(conv);
  const time = formatTime(conv.last_message?.created_at);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        // `p-3` — the artboard's row padding is a literal 12px on all four
        // sides (`Main.dc.html:66,82`), not the 12/10 the asymmetric
        // `px-3 py-2.5` produced. It is now UNIFORM: every row, read or
        // unread, selected or not, occupies exactly the same box. See the
        // divided-list note on the `<ul>` below for the measurement that
        // forced this.
        // `rounded-none` is load-bearing, not tidying: Button's base is
        // `rounded-full`, which the removed `rounded-fw-md` used to override.
        // Dropping the radius without replacing it painted the unread tint as
        // a pill, and would round the ends of the divider run.
        // `transition-[color,background-color,transform]`, not `transition-colors`.
        // The row is a `Button`, so the primitive's base already carries
        // `fwPress` — a 0.5px settle plus `scale-[0.98]` on a spring curve,
        // the one tactile language the system has for "I felt that". A bare
        // `transition-colors` displaces the base's own property list through
        // `cn`, and transform was in that list: the press still fired, but it
        // SNAPPED on and snapped back, and the spring easing governed nothing.
        // On a phone, where hover never happens, that press is the only
        // feedback a tap gets before the route changes.
        //
        // Widened by exactly one property, deliberately. `fwTransition` also
        // transitions `box-shadow`, and a row shadow is what the one-cadence
        // pass removed — putting it back in the transition list is an invitation
        // to reintroduce per-row depth. The depth belongs to the list.
        'group block h-auto min-h-0 w-full items-stretch justify-start rounded-none border-0 p-3 text-left font-normal outline-none transition-[color,background-color,transform] [transition-duration:200ms]',
        '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
        // Unread is a FILL, not a raised card. G-32 read the artboard right —
        // its unread row is "a cream card lifting off the champagne" with a
        // shadow byte-identical to `--fw-shadow-card` — but the artboard is a
        // specimen and never stacks two flat rows in a row, so it cannot show
        // what that treatment does to a real inbox. Measured at 390×844 with
        // six conversations: box gaps were a uniform 6px, but PERCEIVED gaps
        // were not. Card-to-card the eye lands on the card edges and reads
        // 6px; flat-to-flat there is no edge, so it reads text-to-text —
        // 12px padding + 6px gap + 12px padding = 30px, five times larger.
        // Rows measured 80px carded against 72px flat on top of that. Five
        // competing cadences in one list; the user called it uneven twice.
        //
        // DECISIONS.md G-50b is the governing precedent: take the rule, not
        // the specimens. The rule the artboard states is "unread reads
        // stronger than read". The repo already ships that rule in a dense
        // list without touching the box — `FairwayQualifierLeaderboard.tsx`
        // marks its leader row `bg-accent-50/60` inside a `divide-y` list.
        // Tint + weight + badge carry the state; the geometry never moves.
        // The rail's own docstring independently forbids the alternative:
        // rows stay a dense, scannable list, never a card-in-card.
        //
        // The tint is a NEUTRAL step, not the leaderboard's accent. Its
        // structure is borrowed, not its colour, because this row already
        // spends accent three times — the unread Badge and the group glyph
        // are both `bg-accent-50` and the timestamp is `text-accent-700`.
        // Tinting the row accent too made the badge and the glyph vanish
        // into their own background (measured: badge fill and row fill both
        // resolved to the accent-50 family), which reads as a bare floating
        // number. Neutral leaves accent meaning exactly one thing here:
        // unread.
        //
        // `elevated` (0.993), one step ABOVE the card's `surface` (0.984).
        // The list is a raised card now, so the unread row can no longer be
        // the brighter of two tones on the canvas — it has to be brighter
        // than the card it sits in, which is the same relationship the
        // artboard draws (its unread face is the brightest cream on the
        // page) without giving the row back a box of its own.
        !isSelected && hasUnread && 'bg-elevated',
        // Selection is desktop-only (see `activeId`). An inset ring needs a
        // radius to read, and these rows no longer have one, so the marker is
        // a 3px accent rule down the leading edge over the sunken fill —
        // painted as a shadow so it costs no layout and shifts no text.
        isSelected
          ? 'bg-surface-sunken [box-shadow:inset_3px_0_0_0_var(--fw-color-accent-500)]'
          : 'hover:bg-surface-sunken/60',
      )}
    >
      {/* `h-12` — the avatar's own height, and the row's. Without it the text
          block decides, and the text block is 8px taller whenever a badge is
          present, so unread rows measured 80px against read rows' 72px. The
          badge now sits in a line box the size of the preview text (see
          `leading-none` below), which is what actually equalises them; this
          pins the result so a future taller child cannot reintroduce the
          two heights silently. */}
      <div className="flex h-12 items-center gap-3">
        {/* 48px, not 40px. `Main.dc.html:69,83,93` draws every row avatar at a
            literal 46px; M03A F02 logged the 6px gap on `size="md"`. `lg` is
            the existing step nearest it (48px) — the remaining 2px is absorbed
            the way G-29c/G-50b absorbed theirs, and recorded in A03, rather
            than forking a one-off size onto the shared Avatar. The undersized
            avatar was a large part of why the rows read as weightless. */}
        {isGroup ? (
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <Users size={21} aria-hidden="true" />
          </span>
        ) : (
          <Avatar
            name={conv.other_participant?.name || 'User'}
            src={conv.other_participant?.avatar}
            size="lg"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            {/* 15px, and the two weights are not the same. `Main.dc.html:72`
                sets the unread name at weight 600, `:85` the read name at 500 —
                a real hierarchy the shipped rows flattened by giving both
                `font-medium` at 13px. Small type in one weight is most of what
                "the lines aren't defined" describes. */}
            <span
              className={cn(
                'truncate font-fw-sans text-body',
                hasUnread || isSelected
                  ? 'font-semibold text-text-primary'
                  : 'font-medium text-text-secondary',
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
            {/* 13px/20px — `text-body-sm` matches `Main.dc.html:73,86` exactly.
                `text-eyebrow` is 11px with 0.06em tracking, a LABEL role; it
                was rendering the message preview, the row's actual content, at
                label size. */}
            <p
              className={cn(
                'min-w-0 flex-1 truncate font-fw-sans text-body-sm',
                hasUnread ? 'text-text-secondary' : 'text-text-tertiary',
              )}
            >
              {conv.last_message?.content
                ? decodeMessageContent(conv.last_message.content)
                : 'No messages yet'}
            </p>
            {/* HONEST unread: quiet accent Badge, numeric/tabular, NEVER a glass
                dot — and ONLY when unread_count > 0 (no raw 0 / fake unread). */}
            {hasUnread ? (
              // `leading-none`: the Badge's own size recipe sets an 11px
              // arbitrary font-size and NO line-height, so the badge inherited
              // this row's 24px leading and rendered 28px tall against its own
              // `min-h-5` (20px) — 8px that went straight into the row height.
              // Local to this instance; the shared Badge is used at 28px
              // elsewhere and is not this PR's to retune.
              //
              // The px value is deliberately spelled out in prose rather than
              // as the utility: `no-arbitrary-text-px-fairway-pages` scans raw
              // lines, so quoting the class in a comment fails the guard from
              // inside the note explaining it. It did, on this file, in CI.
              <Badge tone="accent" size="sm" numeric className="flex-shrink-0 leading-none">
                {conv.unread_count > 9 ? '9+' : conv.unread_count}
              </Badge>
            ) : null}
          </div>
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
        // Same widening as the conversation row above, same reason: the search
        // result is a `Button`, and `transition-colors` alone left `fwPress`'s
        // transform untransitioned.
        'group block h-auto min-h-0 w-full items-stretch justify-start rounded-fw-md border-0 px-3 py-2.5 text-left font-normal outline-none transition-[color,background-color,transform] [transition-duration:200ms]',
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

  // A phone never shows this rail BESIDE an open thread — FairwayMessages hides
  // the rail entirely once `mobileShowChat` is true. So on a phone `selectedId`
  // describes nothing the user can see, and painting its row with the selected
  // treatment (`bg-surface-sunken/90` + accent ring) claimed a state that was
  // not real: the page auto-selects the first conversation on load, so the
  // inbox opened with one arbitrary row tinted as if it were open.
  //
  // That fill is also the ONLY one a read row could get, so it broke the single
  // contrast the artboard defines for this list — unread lifts on a cream card,
  // read lies flat on the canvas (`Main.dc.html:66` vs `:82`) — by giving one
  // read row a third material. This is the rendered evidence M03A F06 asked for
  // and could not gather: measured at 390×844 the selected row paints
  // `oklab(0.963 0.0022 0.0209 / 0.9)`, which IS the search well's
  // `surface-sunken` fill, so the two states did collapse visually.
  const activeId = isDesktop ? selectedId : null;

  const [filter, setFilter] = React.useState<'all' | 'unread' | 'groups'>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
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

  // Realtime read receipts refresh data without replacing the visible inbox.
  if (loading && conversations.length === 0) {
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
  const visibleConversations = conversations.filter(c => filter === 'all' || (filter === 'unread' ? c.unread_count > 0 : isGroupConversation(c)));
  const unread = visibleConversations.filter(c => c.unread_count > 0);
  const read = visibleConversations.filter(c => c.unread_count === 0);
  const grouped = groupConversationsByTime(read);

  return (
    <InstrumentPanel
      as="nav"
      depth="base"
      padding="none"

      aria-label="Conversations"
      className={cn(
        'flex flex-col',
        // Same reasoning as the thread pane: a card that fills the screen has
        // stopped being a card (Doctrine Rule 11). `!` is required because the
        // border comes from a CSS module class of equal specificity.
        '!rounded-none !border-0 !shadow-none !bg-transparent',
        className,
      )}
    >
      {/* P259: cross-conversation message search. */}
      <div className="mb-3 rounded-fw-sm bg-surface-sunken" style={{ boxShadow: TRACK_SUNKEN_SHADOW }}>
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search messages…"
          leading={<Search aria-hidden />}
          aria-label="Search messages"
          className="bg-transparent"
        />
      </div>

      {!isSearching && (
        <Segmented
          aria-label="Conversation filter"
          value={filter}
          onValueChange={setFilter}
          options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }, { value: 'groups', label: 'Groups' }]}
          size="lg"
          fullWidth
          className="fw-message-filters mb-4"
        />
      )}
      {!isSearching && visibleConversations.length === 0 && (
        <EmptyState variant="subtle" icon={Inbox}
          title={filter === 'unread' ? 'You’re all caught up' : 'No group conversations'}
          description={filter === 'unread' ? 'New messages will appear here.' : 'Your team conversations will appear here.'}
          action={<Button variant="ghost" size="sm" onClick={() => setFilter('all')}>Show all messages</Button>}
        />
      )}
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
          <ul className="divide-y divide-border-subtle">
            {searchResults.map((result) => (
              <li key={result.messageId}>
                <SearchResultRow
                  result={result}
                  isSelected={activeId === result.conversationId}
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
      <div className="flex flex-col gap-4">
        {unread.length > 0 ? (
          <div>
            <p className="px-3 pb-2 font-fw-display text-eyebrow uppercase tracking-[0.14em] text-accent-700">
              Unread
            </p>
            {/* ONE radius token, ONE shadow token — the ramp already decided both.
                The first attempt composed `--fw-shadow-card` over
                `--fw-shadow-soft` (five layers) on `rounded-fw-lg`, and both
                halves were over-reach a token comment names outright:
                `--fw-radius-lg` is 28px for "modals, sheets, hero plinths,
                glass bars", while `--fw-radius-card` says "THE card radius";
                and stacking card over soft doubles their `0 1px 2px` CONTACT
                layer to roughly 0.11 at 2px blur, which is a hard dark edge at
                the card's foot. A contact shadow is the "resting on" tell —
                the opposite of floating.
                `--fw-shadow-raise`'s own comment is the answer: "popovers /
                floating glass". Its contact layer is a whisper (0.07) and its
                ambient is wide enough (18px/44px) to have no visible edge, and
                `shadow-raise` is a real mapping in tailwind.config.ts — unlike
                `shadow-card`, which is the legacy cool-grey trap the suite
                below guards. Plain utility, no bracket: the complaint was too
                much machinery, so the fix should not read as more of it. */}
            <ul className="divide-y divide-border-subtle overflow-hidden rounded-card bg-surface shadow-raise">
              {unread.map((conv, i) => (
                <li
                  key={conv.id}
                  className="animate-fade-in-up motion-reduce:animate-none"
                  style={{ animationDelay: `${Math.min(i, 8) * 35}ms`, animationFillMode: 'both' }}
                >
                  <ConversationRow
                    conv={conv}
                    isSelected={activeId === conv.id}
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
              <p className="px-3 pb-2 font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
                {label}
              </p>
              <ul className="divide-y divide-border-subtle overflow-hidden rounded-card bg-surface shadow-raise">
                {group.map((conv, i) => (
                  <li
                    key={conv.id}
                    className="animate-fade-in-up motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms`, animationFillMode: 'both' }}
                  >
                    <ConversationRow
                      conv={conv}
                      isSelected={activeId === conv.id}
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

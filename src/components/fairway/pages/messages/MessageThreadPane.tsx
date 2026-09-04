'use client';

/**
 * ============================================================================
 * Fairway · messages · MessageThreadPane — the PULSE focal hero (open thread)
 * ----------------------------------------------------------------------------
 * The two-pane inbox's RIGHT pane and the page's ONE focal hero: a flat matte
 * `InstrumentPanel` depth='raised' thread well with a sunken composer track —
 * mirrors AskThreadPane. The conversation bubbles read on matte surfaces
 * (own = bg-accent tint, other = bg-surface RAISED off a bg-canvas well);
 * NEVER bg-white/backdrop-blur.
 *
 * It owns NO send/edit/delete logic — the parent FairwayMessages drives those
 * through the UNCHANGED useGolfMessages hook + server actions and passes the
 * handlers + state down. This pane is PRESENTATION + LAYOUT only:
 *   • each newly opened thread starts at its newest message; subsequent
 *     realtime messages auto-scroll only while the reader is near the bottom
 *   • own-vs-other bubble tint, message grouping by consecutive sender, time +
 *     read receipt on the last message of a group (tabular-nums)
 *   • edit mode (inline textarea) + delete confirmation, desktop hover / mobile
 *     tap-row controls — same affordances, re-skinned
 *   • typing indicator = three dim dots on a matte Inset (NOT a glass bubble)
 *
 * HONEST-EMPTY:
 *   (b) conversation selected, ZERO messages → subtle EmptyState.
 *   (c) no thread selected (desktop) → dim "Select a conversation" prompt.
 *   (e) the "edited" badge + attachment affordances render ONLY when
 *       edited_at / has_attachments are truthy (dormant on the demo, no fake
 *       paperclip / fake edited tag).
 * ========================================================================== */

import * as React from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { Pencil, Trash2, Check, X, Copy, Paperclip, MessageSquare, Users, FileText, Download, AlertTriangle, RotateCw, Reply, ChevronLeft, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fwHaptic } from '@/lib/fairway/haptics';
import { isGroupConversation } from './conversation-kind';
import { ConversationDetailsSheet } from './ConversationDetailsSheet';
import { useGolfMessageReactions } from '@/hooks/golf/use-golf-message-reactions';
import { GOLF_QUICK_REACTIONS } from '@/app/golf/actions/message-reactions';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import type {
  GolfConversationWithMeta,
  MessageWithReadStatus,
} from '@/hooks/golf/use-golf-messages';
import { getGolfMessageAttachments } from '@/app/golf/actions/messages';
import { formatFileSize } from '@/lib/storage/attachments';
import { Avatar } from '@/components/fairway/controls/avatar';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { EmptyState } from '@/components/fairway/feedback';
import { InstrumentPanel } from '@/components/fairway/instrument';
import { Inset } from '@/components/fairway/surfaces/surface';
import { Textarea } from '@/components/ui/textarea';

/**
 * How long to wait before the ONE automatic re-fetch of an attachment that
 * came back successful-but-empty.
 *
 * Sized for a commit-order race, not a network failure: the sender's two
 * inserts (`golf_messages`, then `golf_message_attachments`) land milliseconds
 * apart, and realtime broadcasts on the first. Long enough that the second has
 * committed, short enough that a photo does not visibly hang.
 */
const ATTACHMENT_RACE_RETRY_MS = 1200;

/**
 * How long a pause has to be before two messages from the same person stop
 * reading as one utterance. Five minutes is the conventional chat window: long
 * enough that a burst of three quick lines stays a single group, short enough
 * that a reply hours later gets its own avatar and its own timestamp.
 */
const GROUP_WINDOW_MINUTES = 5;

/**
 * How long a press must be held on a message before its actions open.
 *
 * 450ms is the conventional platform feel — long enough that a scroll gesture
 * starting on a bubble never fires it, short enough that it does not feel like
 * the app is ignoring you.
 */
const LONG_PRESS_MS = 450;

/**
 * Minutes between two ISO timestamps. `created_at` is nullable on the row type,
 * and a missing timestamp must never silently merge two messages into one
 * group — so an absent value reads as "infinitely far apart", which breaks the
 * group rather than fusing it.
 */
function minutesBetween(a: string | null, b: string | null): number {
  if (!a || !b) return Infinity;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) ? Math.abs(ms) / 60000 : Infinity;
}

/**
 * Whether two ISO timestamps land on the same local calendar day. An absent
 * timestamp is treated as NOT the same day, for the same reason as above: the
 * safe failure is an extra separator, never a silent merge.
 */
function isSameCalendarDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * Label for a day separator: Today / Yesterday by name, then the date.
 *
 * Explicit `en-US` per the repo's locale rule — an implicit locale renders
 * differently for the server and the client and shows up as a hydration
 * mismatch.
 */
function formatDaySeparator(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  // Inside the last week the weekday alone is the most readable landmark.
  if (dayDiff > 1 && dayDiff < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** One resolved (signed) attachment for an open thread message. */
type ResolvedAttachment = NonNullable<
  Awaited<ReturnType<typeof getGolfMessageAttachments>>['attachments']
>[number];

export interface MessageThreadPaneProps {
  /** The open conversation (page-owned selection), or null on desktop no-select. */
  conversation: GolfConversationWithMeta | null;
  /** Messages from the unchanged useGolfMessages() hook. */
  messages: MessageWithReadStatus[];
  loading: boolean;
  /**
   * True when the thread fetch FAILED (distinct from a truly-empty thread).
   * Renders a recoverable error state with Retry instead of the honest-empty
   * "No messages yet" state (P258).
   */
  error?: boolean;
  /** Re-runs the thread fetch (the hook's refetch). Wired to the Retry CTA. */
  onRetry?: () => void;
  /** Session user id for own-message attribution (msg.sender_id === user). */
  userId: string;
  /** Hook's resolved user id — same own-message check, both roles. */
  currentUserId: string | null;
  /** True while the other participant is typing (unchanged hook state). */
  isOtherTyping: boolean;
  /** Mobile back to the rail (page owns mobileShowChat). */
  onBack: () => void;
  /** Open the New message modal (the no-select prompt CTA). */
  onNewMessage: () => void;

  // Edit / delete — driven by FairwayMessages over the unchanged hook actions.
  editingMessageId: string | null;
  editContent: string;
  isEditSaving: boolean;
  deleteConfirmId: string | null;
  mobileActionsId: string | null;
  onStartEdit: (messageId: string, currentContent: string) => void;
  onEditContentChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDeleteClick: (messageId: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onSetMobileActions: (id: string | null) => void;
  /** §30: begin a reply to this message (page owns the pending-reply state). */
  onReply?: (message: MessageWithReadStatus) => void;
  /** §30: jump to a quoted message (page owns scrollToMessageId). */
  onJumpToMessage?: (messageId: string) => void;

  /**
   * Bug fix #1 — group sender resolution.
   * Maps user_id → { name, avatar } for every participant in a group
   * conversation.  FairwayMessages fetches this via golf_conversation_participants
   * → golf_coaches / golf_players whenever a group conv is selected, mirroring
   * the legacy fetchGroupParticipants pattern.  Undefined (or empty Map) on
   * 1:1 conversations — the component falls back to other_participant for those.
   */
  groupParticipants?: Map<string, { name: string; avatar: string | null }>;

  /**
   * P259: a message id to scroll to once the thread loads (set when the user
   * opens a cross-conversation search hit). Cleared via onScrolledToMessage.
   */
  scrollToMessageId?: string | null;
  /** P259: called after scrollToMessageId has been scrolled into view. */
  onScrolledToMessage?: () => void;

  className?: string;
}

/** Time / read-receipt formatting — only ever called with a real ISO string. */
function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * A thread must enter at its latest message, but it must never force-scroll a
 * reader who has deliberately moved upward in an already-open thread. Stale
 * messages from the previously selected conversation are not a safe signal
 * that the new thread has finished loading.
 */
export function shouldScrollThreadToLatestOnOpen(
  pendingConversationId: string | null,
  conversationId: string | undefined,
  loading: boolean,
  messages: Pick<MessageWithReadStatus, 'conversation_id'>[],
): boolean {
  return Boolean(
    pendingConversationId
      && conversationId
      && pendingConversationId === conversationId
      && !loading
      && messages.length > 0
      && messages.every((message) => message.conversation_id === conversationId),
  );
}

/** Quiet text read receipt — "Read" / "Sent" (color is never the only channel). */
function ReadReceipt({ isRead }: { isRead?: boolean }) {
  return (
    <span
      className={cn(
        'font-fw-sans text-caption',
        isRead ? 'text-accent-700' : 'text-text-tertiary',
      )}
    >
      {isRead ? 'Read' : 'Sent'}
    </span>
  );
}

/**
 * Reaction chips — spec §18, sitting UNDER the bubble rather than floating
 * beside it.
 *
 * The count is `tabular-nums` so a chip going 9 -> 10 does not change width and
 * shove its neighbours sideways under the reader's thumb, and the chips are
 * ordered by count (see the hook) rather than by arrival for the same reason.
 *
 * Your own reaction is marked by BORDER AND FILL, not colour alone — the same
 * rule the read receipt follows. A chip is a toggle, so which ones are yours
 * has to survive a user who cannot separate the accent green from the hairline.
 */
function ReactionChips({
  reactions,
  onToggle,
  align,
}: {
  reactions: { emoji: string; count: number; mine: boolean }[];
  onToggle: (emoji: string) => void;
  align: 'start' | 'end';
}) {
  if (!reactions.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1', align === 'end' ? 'justify-end' : 'justify-start')}>
      {reactions.map((r) => (
        // A reaction chip is a ~24px inline token; <Button>'s 36/44px
        // min-height would make the strip taller than the bubble it annotates.
        // eslint-disable-next-line helm/no-raw-button -- see above
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          aria-pressed={r.mine}
          aria-label={`${r.emoji} ${r.count}${r.mine ? ', including you' : ''}`}
          className={cn(
            'inline-flex min-h-0 items-center gap-1 rounded-full border px-2 py-0.5',
            'font-fw-sans text-caption transition-transform active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1',
            r.mine
              ? 'border-accent-500 bg-accent-50 font-semibold text-accent-700'
              : 'border-border-subtle bg-surface text-text-secondary',
          )}
        >
          <span aria-hidden="true">{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

/** Typing indicator — three dim dots on a matte Inset (NOT a glass bubble). */
function TypingIndicator() {
  return (
    <Inset padding="none" className="inline-flex rounded-card bg-surface px-3.5 py-3 shadow-soft">
      {/* An opacity wave, not a bounce. `animate-bounce` threw the dots a
          third of their own height on a spring curve — energetic, and the
          wrong register for "someone is composing a sentence". Three dots
          breathing in sequence reads calmer, costs one compositor property
          instead of layout, and is what the eye expects from a chat. */}
      <span className="flex items-center gap-1" aria-label="Typing">
        {[0, 1, 2].map((i) => (
          <m.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-text-tertiary"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{
              duration: 1.2,
              times: [0, 0.5, 1],
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.18,
            }}
          />
        ))}
      </span>
    </Inset>
  );
}

/**
 * Per-message attachment gallery — images render inline (signed URL), every
 * other file type renders as a download chip. Only mounted for messages whose
 * attachments have resolved (signed) successfully; renders nothing otherwise so
 * the bubble stays honest-empty until real data lands.
 */
function MessageAttachments({
  attachments,
  isOwn,
}: {
  attachments: ResolvedAttachment[];
  isOwn: boolean;
}) {
  if (!attachments.length) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {attachments.map((att) => {
        const isImage = att.fileType === 'image' && !!att.url;
        if (isImage) {
          return (
            <a
              key={att.id}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-fw-md outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1"
              aria-label={`Open image ${att.fileName}`}
            >
              <img
                src={att.url}
                alt={att.fileName}
                width={att.width ?? undefined}
                height={att.height ?? undefined}
                loading="lazy"
                className="max-h-64 w-full max-w-[260px] object-cover"
              />
            </a>
          );
        }
        // Non-image (or unsigned image) → download chip.
        const chip = (
          <span
            className={cn(
              'inline-flex max-w-[260px] items-center gap-2 rounded-fw-md px-2.5 py-2',
              isOwn ? 'bg-text-on-accent/15' : 'bg-surface',
            )}
          >
            <FileText
              size={16}
              aria-hidden="true"
              className={cn('flex-shrink-0', isOwn ? 'text-ink-on-deep' : 'text-text-tertiary')}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate font-fw-sans text-eyebrow font-medium',
                  isOwn ? 'text-text-on-accent' : 'text-text-primary',
                )}
              >
                {att.fileName}
              </span>
              <span
                className={cn(
                  'block font-fw-mono text-eyebrow tabular-nums',
                  isOwn ? 'text-ink-on-deep-soft' : 'text-text-tertiary',
                )}
              >
                {formatFileSize(att.fileSize)}
              </span>
            </span>
            {att.url ? (
              <Download
                size={14}
                aria-hidden="true"
                className={cn('flex-shrink-0', isOwn ? 'text-ink-on-deep' : 'text-text-tertiary')}
              />
            ) : null}
          </span>
        );
        return att.url ? (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            download={att.fileName}
            className="block outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1 rounded-fw-md"
            aria-label={`Download ${att.fileName}`}
          >
            {chip}
          </a>
        ) : (
          <span key={att.id}>{chip}</span>
        );
      })}
    </div>
  );
}

export function MessageThreadPane({
  conversation,
  messages,
  loading,
  error,
  onRetry,
  userId,
  currentUserId,
  isOtherTyping,
  onBack,
  onNewMessage,
  editingMessageId,
  editContent,
  isEditSaving,
  deleteConfirmId,
  mobileActionsId,
  onStartEdit,
  onEditContentChange,
  onCancelEdit,
  onSaveEdit,
  onDeleteClick,
  onConfirmDelete,
  onCancelDelete,
  onSetMobileActions,
  onReply,
  onJumpToMessage,
  groupParticipants,
  scrollToMessageId,
  onScrolledToMessage,
  children,
  className,
}: MessageThreadPaneProps & { children?: React.ReactNode }) {
  const reduceMotion = useReducedMotion() ?? false;
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);
  /** The message list itself — observed for late growth (images, fonts). */
  const messagesContentRef = React.useRef<HTMLDivElement>(null);
  /**
   * True from the moment a thread is pinned to its newest message until the
   * reader deliberately scrolls away from the bottom. While armed, anything
   * that grows the thread re-pins it.
   */
  const stickToBottomRef = React.useRef(false);

  /**
   * Long-press to open a message's actions.
   *
   * This replaces a persistent kebab that rendered ABOVE every own bubble on
   * mobile. It was the loudest thing on the screen — a floating ⋮ in empty
   * whitespace beside each message — and because it was a sibling in the same
   * flex column it also injected vertical space BETWEEN consecutive messages,
   * which quietly defeated the grouping: three quick lines read as three
   * islands instead of one utterance.
   *
   * Press-and-hold is what a phone user already expects here, and it costs no
   * permanent pixels. The timer is cancelled by movement, so a scroll that
   * happens to start on a bubble never opens the menu.
   */
  // Reactions for the open thread. Keyed off the rendered message ids so the
  // batched read covers exactly what is on screen — see the hook for why this
  // is one request rather than one per bubble.
  const reactionMessageIds = React.useMemo(() => messages.map((m) => m.id), [messages]);

  // §30: quoted messages are resolved from the LOADED window, not fetched.
  // A reply almost always quotes something recent, and a per-bubble fetch
  // would open one request per quote. When the quoted message is older than
  // the window the quote degrades to a neutral label rather than disappearing
  // — the reply still makes sense, and nothing about it lies.
  const messagesById = React.useMemo(() => {
    const map = new Map<string, MessageWithReadStatus>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);
  const { getFor: getReactionsFor, toggle: toggleReaction } = useGolfMessageReactions(
    conversation?.id ?? null,
    reactionMessageIds,
    currentUserId ?? userId ?? null,
  );

  // §37: conversation details. Local state — the sheet is a detail OF this
  // pane, and lifting it to the page would make every keystroke in the
  // composer re-render a component that only the header opens.
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLongPress = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  React.useEffect(() => cancelLongPress, [cancelLongPress]);

  const longPressHandlers = React.useCallback(
    (messageId: string) => ({
      onPointerDown: () => {
        cancelLongPress();
        longPressTimerRef.current = setTimeout(() => {
          // The detent tick, so the menu opening is felt as well as seen.
          fwHaptic('selection');
          onSetMobileActions(messageId);
        }, LONG_PRESS_MS);
      },
      onPointerUp: cancelLongPress,
      onPointerMove: cancelLongPress,
      onPointerCancel: cancelLongPress,
      onPointerLeave: cancelLongPress,
      // Suppress the native callout so iOS does not race our menu with its own.
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }),
    [cancelLongPress, onSetMobileActions],
  );
  /**
   * Ids already painted at least once, so an ARRIVAL can be told apart from
   * history.
   *
   * Without this the entrance below would run on every message the first time
   * a thread opens — twenty bubbles rippling in at once, which reads as the
   * page rebuilding itself rather than as a message landing. Seeded on the
   * first render of each conversation and reset on switch, so history mounts
   * silently and only genuinely new messages animate.
   */
  const seenMessageIdsRef = React.useRef<Set<string>>(new Set());
  const seededConversationRef = React.useRef<string | null>(null);
  /**
   * How many messages were unread when this thread was OPENED.
   *
   * Frozen deliberately. Opening a thread marks it read within about a second,
   * so `conversation.unread_count` collapses to 0 almost immediately — reading
   * it live would draw the separator for one frame and then erase the one piece
   * of context the reader came back for. Captured once per conversation and
   * held until they leave, which is how every chat app behaves: the line stays
   * where it was until you go away and return.
   */
  const openUnreadCountRef = React.useRef(0);
  const activeConversationId = conversation?.id ?? null;
  if (seededConversationRef.current !== activeConversationId) {
    seededConversationRef.current = activeConversationId;
    seenMessageIdsRef.current = new Set(messages.map((m) => m.id));
    openUnreadCountRef.current = conversation?.unread_count ?? 0;
  }
  /**
   * Index of the first message that was unread on open, or -1 for none.
   *
   * Derived from the count rather than a per-message flag because that is what
   * the conversation actually carries. Clamped to the loaded window: the thread
   * fetches the most recent 200, so an unread count larger than what is on
   * screen must not push the marker off the top of the list.
   */
  const firstUnreadIndex = (() => {
    // Not memoized: two comparisons and a subtraction, recomputed per render,
    // is cheaper than the dependency array it would need — and the value it
    // depends on lives in a ref, which a dependency array cannot observe
    // anyway.
    const count = openUnreadCountRef.current;
    if (!count || count <= 0 || messages.length === 0) return -1;
    const index = messages.length - Math.min(count, messages.length);
    // Never draw it above the very first message — a line at the top of a
    // thread separates nothing and just reads as a stray rule.
    return index <= 0 ? -1 : index;
  })();
  const observedConversationIdRef = React.useRef<string | null>(null);
  const pendingInitialScrollConversationIdRef = React.useRef<string | null>(null);
  // P259: per-message anchors so a search hit can scroll its bubble into view.
  const messageRefs = React.useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Resolved (signed) attachments keyed by message id. Populated lazily for the
  // visible messages that carry attachments; signed URLs from
  // getGolfMessageAttachments expire after ~1h, so we re-fetch when the set of
  // attachment-bearing messages changes.
  const [attachmentsByMessage, setAttachmentsByMessage] = React.useState<
    Record<string, ResolvedAttachment[]>
  >({});
  // P266: message ids whose attachment fetch FAILED (signed-URL / RLS error).
  // Used to render a quiet "Couldn’t load — tap to retry" chip instead of an
  // eternal pending placeholder.
  const [attachmentErrors, setAttachmentErrors] = React.useState<Set<string>>(new Set());
  // Bumped to force a re-run of the batch fetch (manual retry from the chip,
  // and the one-shot auto-retry for the commit-order race below).
  const [attachmentRetryNonce, setAttachmentRetryNonce] = React.useState(0);
  // Message ids already given their one automatic retry. Prevents a genuinely
  // unreadable attachment from re-fetching forever; it settles on the retry
  // chip instead, which is a state the user can act on.
  const retriedEmptyRef = React.useRef<Set<string>>(new Set());
  // Pending auto-retry timers, cleared on unmount so a conversation switch
  // cannot bump the nonce on an unmounted thread.
  const retryTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  React.useEffect(
    () => () => {
      for (const timer of retryTimersRef.current) clearTimeout(timer);
      retryTimersRef.current = [];
    },
    [],
  );

  // Stable key of the visible attachment-bearing message ids (ordered) so the
  // batch fetch re-runs only when that set actually changes.
  const attachmentMessageKey = React.useMemo(
    () =>
      messages
        .filter((m) => (m as MessageWithReadStatus & { has_attachments?: boolean | null }).has_attachments)
        .map((m) => m.id)
        .join(','),
    [messages],
  );

  // Batch-fetch + sign attachments for every visible message that has them.
  // getGolfMessageAttachments is a server action that returns rows WITH signed
  // URLs (golf-attachments bucket, 1h TTL); we fan it out over the visible
  // attachment-bearing messages in parallel. P266: a per-message { error } is
  // recorded so the bubble shows a retry chip rather than hanging on "loading".
  React.useEffect(() => {
    const ids = attachmentMessageKey ? attachmentMessageKey.split(',') : [];
    if (ids.length === 0) {
      setAttachmentsByMessage((prev) => (Object.keys(prev).length ? {} : prev));
      setAttachmentErrors((prev) => (prev.size ? new Set() : prev));
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (messageId) => {
          const res = await getGolfMessageAttachments(messageId);
          return [messageId, res] as const;
        }),
      );
      if (cancelled) return;
      const next: Record<string, ResolvedAttachment[]> = {};
      const errored = new Set<string>();
      for (const [messageId, res] of entries) {
        if ('error' in res) {
          errored.add(messageId);
        } else if (res.attachments?.length) {
          next[messageId] = res.attachments;
        } else {
          // SUCCESSFUL BUT EMPTY — and this branch used to not exist, which is
          // the whole defect. Every message reaching this effect has
          // `has_attachments: true`, so "no rows" is not a valid resting
          // state: it means the rows are not readable YET.
          //
          // The send is two unbatched statements (message-attachments.ts):
          // the `golf_messages` row commits and is broadcast over realtime
          // before the `golf_message_attachments` rows necessarily commit. A
          // recipient's fetch can land in that window and get a legitimately
          // empty result with no error. Falling into neither bucket, it
          // rendered the static "Attachment" label — no gallery, no retry chip
          // — and the effect only re-runs when the SET of attachment-bearing
          // message ids changes, so that bubble stayed dead for the rest of
          // the session.
          //
          // Recording it as unresolved is the honest state: it surfaces the
          // same retry affordance a hard failure gets, and the one-shot
          // auto-retry below usually closes the race before anyone taps it.
          errored.add(messageId);
        }
      }
      setAttachmentsByMessage(next);
      setAttachmentErrors(errored);

      // The commit-order race resolves in milliseconds, so a single delayed
      // retry turns "tap to retry" into something the user never has to do.
      // Bounded to ONE attempt per fetch pass — `retriedEmptyRef` is keyed on
      // the message id, so a genuinely unreadable attachment (deleted row,
      // revoked access) settles on the retry chip instead of looping.
      const unresolved = [...errored].filter((id) => !retriedEmptyRef.current.has(id));
      if (unresolved.length > 0) {
        for (const id of unresolved) retriedEmptyRef.current.add(id);
        const timer = setTimeout(() => {
          if (!cancelled) setAttachmentRetryNonce((n) => n + 1);
        }, ATTACHMENT_RACE_RETRY_MS);
        retryTimersRef.current.push(timer);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachmentMessageKey, attachmentRetryNonce]);

  const retryAttachments = React.useCallback(() => {
    setAttachmentRetryNonce((n) => n + 1);
  }, []);

  // On every conversation switch, begin at the newest loaded message. The
  // previous implementation only used the "near bottom" rule below; a fresh
  // scroll container begins at scrollTop=0, so long group threads opened at
  // their oldest message and made the player manually scroll to today.
  //
  // Use a layout effect so the correct position is set before the thread is
  // painted. Wait until the hook has replaced any stale prior-thread messages,
  // and defer to an explicit search-result target when one was requested.
  React.useLayoutEffect(() => {
    const conversationId = conversation?.id ?? null;
    if (observedConversationIdRef.current !== conversationId) {
      observedConversationIdRef.current = conversationId;
      pendingInitialScrollConversationIdRef.current = conversationId;
    }

    if (scrollToMessageId) {
      // An explicit search target owns the initial placement. Clear the open
      // sentinel so later renders cannot jump the player back to a stale top or
      // bottom position after the search result has been focused.
      pendingInitialScrollConversationIdRef.current = null;
      return;
    }
    if (!shouldScrollThreadToLatestOnOpen(
      pendingInitialScrollConversationIdRef.current,
      conversationId ?? undefined,
      loading,
      messages,
    )) {
      return;
    }

    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
      // Hold the bottom until the reader actually moves.
      //
      // Setting scrollTop ONCE is not enough, and that is the "it opens at the
      // top and I have to scroll down" report. This runs the moment the
      // messages array is populated, but the thread keeps GROWING afterwards:
      // signed attachment images arrive and reserve real height, the webfont
      // swaps and reflows every bubble, day separators lay out, and on a phone
      // the container's own dvh-derived height is still settling against the
      // safe-area and keyboard variables. Every one of those grows
      // `scrollHeight` while `scrollTop` stays exactly where we left it — so a
      // pin that was correct at frame one is hundreds of pixels short by the
      // time the thread is readable, and the further back the newest message
      // is, the more it looks like the thread simply opened at the top.
      //
      // The observer below re-pins on each of those growth events until the
      // reader scrolls, at which point their position is theirs and we stop
      // touching it.
      stickToBottomRef.current = true;
    }
    pendingInitialScrollConversationIdRef.current = null;
  }, [conversation?.id, loading, messages, scrollToMessageId]);

  // Re-pin to the bottom while `stickToBottomRef` is armed and the content is
  // still changing size. Released by the reader's first deliberate scroll away
  // from the bottom (below), so this can never fight someone reading history.
  React.useEffect(() => {
    const container = messagesContainerRef.current;
    const content = messagesContentRef.current;
    if (!container || !content) return;

    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return;
      container.scrollTop = container.scrollHeight;
    });
    observer.observe(content);

    // Images are the biggest single source of late growth and do not always
    // trigger a content resize the observer sees in time, so pin on their load
    // too. `capture` because `load` does not bubble.
    const onLoad = () => {
      if (stickToBottomRef.current) container.scrollTop = container.scrollHeight;
    };
    container.addEventListener('load', onLoad, true);

    // A deliberate scroll away from the bottom hands control back to the
    // reader, permanently for this thread. The near-bottom tolerance matches
    // the auto-scroll rule below so the two agree about what "at the bottom"
    // means.
    const onScroll = () => {
      if (!stickToBottomRef.current) return;
      const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
      if (!atBottom) stickToBottomRef.current = false;
    };
    container.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      container.removeEventListener('load', onLoad, true);
      container.removeEventListener('scroll', onScroll);
    };
  }, [conversation?.id]);

  // Keep the newest message in view when the scroll region itself changes
  // height. The iOS keyboard opening shrinks it (FairwayMessages subtracts
  // --keyboard-height) and scrollTop does not move on its own, so a thread
  // that was pinned to its newest message would show the bottom of the
  // conversation hidden behind the composer at exactly the moment the player
  // starts typing. Near-bottom is judged with the height from BEFORE the
  // change, so a shrink cannot disqualify a thread that was pinned a moment
  // ago. A reader scrolled up into history is left where they are.
  React.useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    let lastHeight = container.clientHeight;
    const observer = new ResizeObserver(() => {
      const previousHeight = lastHeight;
      lastHeight = container.clientHeight;
      if (container.clientHeight === previousHeight) return;
      const wasNearBottom = container.scrollTop + previousHeight >= container.scrollHeight - 100;
      if (wasNearBottom) container.scrollTop = container.scrollHeight;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll to bottom on new messages — ONLY when near the bottom.
  // PRESERVES the legacy near-bottom check (scrollTop + clientHeight >= scrollHeight - 100).
  // P265: honor prefers-reduced-motion — reduced-motion users get an instant jump
  // instead of a smooth animated scroll (consistent with the rest of the file).
  React.useEffect(() => {
    const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
    const container = messagesContainerRef.current;
    if (!container) {
      messagesEndRef.current?.scrollIntoView({ behavior });
      return;
    }
    const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  }, [messages, reduceMotion]);

  // P259: scroll a search-hit message into view once the thread has loaded it.
  React.useEffect(() => {
    if (!scrollToMessageId) return;
    if (loading) return;
    const node = messageRefs.current.get(scrollToMessageId);
    if (node) {
      node.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }
    // Consume the request whether or not the node is present (e.g. the matched
    // message scrolled off the fetched window) so it doesn't re-fire on refetch.
    onScrolledToMessage?.();
  }, [scrollToMessageId, loading, messages, reduceMotion, onScrolledToMessage]);

  // HONEST-EMPTY (c): no thread selected (desktop) → dim prompt.
  if (!conversation) {
    return (
      <InstrumentPanel
        as="section"
        depth="raised"
        padding="none"
        aria-label="Conversation"
        className={cn('flex min-h-[40vh] flex-col overflow-hidden', className)}
      >
        <div className="flex flex-1 items-center justify-center bg-surface px-4 py-5">
          <EmptyState
            variant="subtle"
            icon={MessageSquare}
            title="Select a conversation"
            description="Choose a conversation from the list to start messaging."
            action={
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={onNewMessage}
                className="font-fw-sans"
              >
                New message
              </Button>
            }
          />
        </div>
      </InstrumentPanel>
    );
  }

  // Not `conversation.is_group` — that flag is true for any team-chat-flagged
  // conversation, including a broadcast to ONE player. The header below
  // already worked around it by reading participant_count; this makes that
  // the ONE derivation, so the avatar and the per-bubble sender identity stop
  // disagreeing with the subtitle sitting inches away from them.
  const isGroup = isGroupConversation(conversation);
  const headerName = isGroup
    ? conversation.title || 'Team Group'
    // §5: "Unknown User" is ship-blocking. It is a DEBUG string, and it was
    // rendering as ordinary UI for a real DM. The participant is built from a
    // coach/player lookup, so an unresolved one is not "unknown" — it is
    // somebody with no current roster row: they left, or the account is gone.
    // Say that. A truthful label beats a placeholder that reads like a fault.
    : conversation.other_participant?.name || 'Former team member';
  // `is_group` is set for anything carrying `is_team_chat`, and a broadcast
  // sent to ONE player carries it too (the flag is load-bearing for the
  // conversation-create RLS workaround, so it can't just be dropped there).
  // That made a plain two-person thread announce itself as "Group
  // conversation" to both people in it. Read the participant count instead,
  // and say nothing when the count is unknown rather than guess wrong.
  const participantCount = conversation.participant_count ?? 0;
  const headerSubtitle = conversation.is_group
    ? participantCount > 2
      ? 'Group conversation'
      : participantCount === 2
        ? 'Direct message'
        : ''
    : conversation.other_participant?.subtitle || '';

  return (
    <InstrumentPanel
      as="section"
      depth="raised"
      padding="none"
      aria-label="Conversation"
      className={cn(
        'flex min-h-[40vh] flex-col overflow-hidden',
        // On a phone with a thread open this panel IS the whole screen, so the
        // elevation stops reading as "a pane beside the rail" and starts
        // reading as a full-screen card floating on a page — which is Doctrine
        // Rule 11 (no full-screen monolith cards) and the "chat feels like a
        // card inside a page" complaint. The conversation should be the
        // canvas. Flattened below `md` only; from `md` up it is genuinely one
        // pane of a two-pane inbox and keeps its lift.
        //
        // `!` is required because the depth treatment comes from a CSS module
        // class (instrument-panel.module.css `.panelRaised` / `.panel`), which
        // has the same single-class specificity as a Tailwind utility — without
        // it the winner would depend on stylesheet order.
        'max-md:!rounded-none max-md:!border-0 max-md:!shadow-none',
        // §44 "retire mobile InstrumentPanel thinking": the panel's own card
        // tone is what still made this read as a pane laid ON a page. Below
        // `md` the panel takes the page's own ground and stops reserving a
        // minimum height, so the thread is the screen rather than an object
        // sitting on one. From `md` up it is genuinely one pane of a two-pane
        // inbox and keeps every bit of its lift.
        'max-md:!bg-canvas max-md:!min-h-0',
        className,
      )}
    >
      {/* §4 FairwayMessageNavBar. A THREE-COLUMN nav bar, not a row of things.
          It used to be `flex` with back, avatar and name packed left, so the
          title sat at whatever x the back label happened to end at — a
          different position for every conversation, and nothing on the right at
          all. A symmetric grid gives the identity a fixed centre it can be
          trusted to occupy, which is what makes a nav bar read as chrome rather
          than as content that happens to be at the top.

          The label is gone from the back control. "‹ Messages" was defended
          here as naming the destination, but a chevron out of a conversation
          has exactly one meaning, and the label was costing the left column
          enough width to shove the title off centre. The destination is still
          named — for screen readers, by `aria-label`, which is where that
          information belongs. */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border-subtle bg-surface px-1.5 py-1 sm:px-3 sm:py-1.5">
        <div className="flex min-w-0 justify-start">
          <IconButton
            variant="ghost"
            size="md"
            onClick={onBack}
            aria-label="Back to conversations"
            className="lg:hidden"
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </IconButton>
        </div>
        {/* §5/§37: the identity is the control that opens conversation
            details. It named the conversation and did nothing when touched,
            which on a phone reads as a dead control — the one place a group's
            membership is obviously "behind" was unreachable. */}
        {/* eslint-disable-next-line helm/no-raw-button -- a nav-bar identity
            region, not a button shape: <Button>'s padding and min-height would
            push the header past its 48-54px budget (§4). */}
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          aria-label={`Conversation details for ${headerName}`}
          className={cn(
            'flex min-w-0 items-center justify-center gap-2 rounded-fw-md px-2 py-1 text-center',
            'transition-colors active:bg-surface-sunken',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          )}
        >
        {isGroup ? (
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <Users size={18} aria-hidden="true" />
          </span>
        ) : (
          <Avatar
            name={conversation.other_participant?.name || 'User'}
            src={conversation.other_participant?.avatar}
            size="sm"
          />
        )}
        <div className="min-w-0 flex-1">
          {/* One line, truncated — this is a nav bar now, not a page masthead.
              `line-clamp-2` let a long group title push the bar to two rows and
              shove the thread down. */}
          <p className="truncate font-fw-sans text-body font-medium text-text-primary">{headerName}</p>
          {/* The subtitle earns its line only when it says something the name
              does not. "Direct message" under a person's name is the label
              restating the obvious, on the row with the least space in the
              product — a member count on a group is genuinely new information.
              (spec §5: do not permanently show "Direct message".) */}
          {headerSubtitle && headerSubtitle !== 'Direct message' ? (
            <p className="truncate font-fw-sans text-eyebrow text-text-tertiary">{headerSubtitle}</p>
          ) : null}
        </div>
        </button>

        {/* §4: the overflow the header never had. Same destination as tapping
            the identity — one action, two affordances, because a nav bar with
            an empty right column reads as unfinished and the "···" is where a
            phone user looks for a conversation's settings. */}
        <div className="flex justify-end">
          <IconButton
            variant="ghost"
            size="md"
            onClick={() => setDetailsOpen(true)}
            aria-label="Conversation details"
          >
            <MoreHorizontal size={20} aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <ConversationDetailsSheet
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        name={headerName}
        isGroup={isGroup}
        avatar={conversation.other_participant?.avatar}
        participants={isGroup ? groupParticipants : undefined}
      />

      {/* Thread scroll region — the DEEPER champagne page tone, not the card
          tone. This inverted on 2026-09-04 and it is the whole reason the
          thread read as flat: the well was `bg-surface` (0.984 L, the single
          lightest colour in the system) and the incoming bubbles were
          `bg-surface-sunken` (0.963), so every bubble was DARKER than the
          surface it sat on. They did not sit on the page, they sank into it.
          `design-tokens.css` already names the fix at --fw-color-canvas:
          "cards now clearly LIFT off it … the ~0.03 gap is the premium
          card/page separation the flat-cream look lacked." A conversation is
          a stack of cards; it gets the same treatment. */}
      <div
        ref={messagesContainerRef}
        className="flex flex-1 flex-col overflow-y-auto overscroll-contain touch-pan-y bg-canvas px-4 py-5 sm:px-5"
        data-scroll-container
      >
        {loading ? (
          <div className="space-y-3 py-8">
            <div className="h-9 w-3/4 rounded-card bg-surface shadow-soft" />
            <div className="h-9 w-1/2 rounded-card bg-surface shadow-soft" />
            <div className="ml-auto h-9 w-2/3 rounded-card bg-surface shadow-soft" />
          </div>
        ) : error ? (
          // P258: the fetch FAILED — render a recoverable error state with Retry,
          // NEVER the success-styled "No messages yet" empty state.
          <EmptyState
            variant="subtle"
            icon={AlertTriangle}
            title="Couldn’t load this conversation"
            description="Something went wrong loading these messages. Check your connection and try again."
            action={
              onRetry ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={onRetry}
                  className="font-fw-sans"
                >
                  Try again
                </Button>
              ) : undefined
            }
          />
        ) : !messages || messages.length === 0 ? (
          // HONEST-EMPTY (b): selected thread, zero messages.
          <EmptyState
            variant="subtle"
            icon={MessageSquare}
            title="No messages yet"
            description="Start the conversation — say hello below."
          />
        ) : (
          // No `space-y-*` on this container: the rhythm is carried per message
          // by the grouping (tight within a group, generous between), and a
          // uniform gap on every child would flatten that back out and
          // double-space the day separators.
          // §6: bottom-anchored. `mt-auto` in a flex column pushes a SHORT
          // thread down to sit above the composer instead of hugging the top
          // with a void beneath it, and does nothing at all once the content
          // is taller than the region — so long threads and history prepend
          // are untouched. No absolute positioning, no scroll maths.
          <div ref={messagesContentRef} className="mt-auto w-full">
            {messages.map((msg, idx, all) => {
              // The receipt belongs to the CONVERSATION, not to each group.
              // It used to render under every outgoing group, which stacked
              // "Read 4:07 PM" three times down one screen and made a quiet
              // status line into the loudest repeated element in the thread.
              // iOS shows exactly one, under the newest thing you sent, and
              // that is all the information there ever was.
              const lastOwnMessageIndex = (() => {
                for (let i = all.length - 1; i >= 0; i -= 1) {
                  // NOT `m` — that is framer-motion's namespace in this file.
                  const candidate = all[i];
                  if (!candidate) continue;
                  if (candidate.sender_id === userId || candidate.sender_id === currentUserId) return i;
                }
                return -1;
              })();
              // own-message check is identical for both roles (spec §4).
              const isOwn = msg.sender_id === userId || msg.sender_id === currentUserId;
              const prevMsg = messages[idx - 1];
              const nextMsg = messages[idx + 1];
              // Grouping is by sender AND by time. Sender alone meant two
              // messages from the same person stayed in one visual group no
              // matter how far apart they were sent — a "yeah" at 9pm merged
              // silently into the group from 7am, sharing its avatar and
              // hiding its own timestamp, so the thread read as one utterance
              // that had actually spanned the whole day.
              const prevGap = prevMsg ? minutesBetween(prevMsg.created_at, msg.created_at) : Infinity;
              const nextGap = nextMsg ? minutesBetween(msg.created_at, nextMsg.created_at) : Infinity;
              const startsDay = !prevMsg || !isSameCalendarDay(prevMsg.created_at, msg.created_at);

              const isFirstInGroup =
                !prevMsg || prevMsg.sender_id !== msg.sender_id || prevGap > GROUP_WINDOW_MINUTES || startsDay;
              const isLastInGroup =
                !nextMsg ||
                nextMsg.sender_id !== msg.sender_id ||
                nextGap > GROUP_WINDOW_MINUTES ||
                !isSameCalendarDay(msg.created_at, nextMsg.created_at);
              const showTime = isLastInGroup;

              // An ARRIVAL is a message this pane has not painted before.
              // History is marked seen on the first render of the thread, so
              // opening a conversation never ripples twenty bubbles in at once.
              const isNew = !seenMessageIdsRef.current.has(msg.id);
              if (isNew) seenMessageIdsRef.current.add(msg.id);

              const editedAt = (msg as MessageWithReadStatus & { edited_at?: string | null }).edited_at;
              const hasAttachments = (msg as MessageWithReadStatus & { has_attachments?: boolean | null }).has_attachments;
              const resolvedAttachments = attachmentsByMessage[msg.id] ?? [];
              const hasAttachmentError = attachmentErrors.has(msg.id);

              // Bug fix #1 — resolve the real sender name + avatar for this message.
              // For group convs: look up in groupParticipants map (user_id → name/avatar).
              // For 1:1 convs: use other_participant directly (unchanged behaviour).
              const senderInfo = isGroup
                ? (groupParticipants?.get(msg.sender_id) ?? null)
                : {
                    name: conversation.other_participant?.name ?? 'Unknown',
                    avatar: conversation.other_participant?.avatar ?? null,
                  };
              const senderName = senderInfo?.name ?? 'Unknown';
              const senderAvatar = senderInfo?.avatar ?? null;

              return (
                <React.Fragment key={msg.id}>
                {/* Day separator. A thread had no temporal landmarks at all —
                    scrolling back through a busy week was an undifferentiated
                    column of bubbles, and "3:14 PM" on a message told you the
                    hour but never the day. Rendered once, when the calendar day
                    changes. */}
                {/* New-messages marker. Drawn once, at the boundary the reader
                    left off at, so they can see immediately what arrived while
                    they were away instead of scrolling to work it out. Accent
                    rules and a label rather than a plain hairline — this line
                    means something the day separators do not. */}
                {idx === firstUnreadIndex && (
                  <div className="flex items-center gap-3 pb-1.5 pt-3" role="separator" aria-label="New messages">
                    <span className="h-px flex-1 bg-accent-500/45" />
                    <span className="font-fw-sans text-caption font-semibold text-accent-700">
                      New messages
                    </span>
                    <span className="h-px flex-1 bg-accent-500/45" />
                  </div>
                )}
                {startsDay && (
                  // §11: the full-width rules are gone. Two hairlines
                  // spanning the thread made the DATE the strongest horizontal
                  // element on screen — louder than any message. A centred
                  // label orients just as well and competes with nothing. The
                  // unread landmark below KEEPS its rules on purpose: that one
                  // is meant to be found.
                  <div className="flex justify-center pb-2 pt-6" role="separator">
                    <span className="font-fw-sans text-caption font-semibold text-text-tertiary">
                      {formatDaySeparator(msg.created_at)}
                    </span>
                  </div>
                )}
                <m.div
                  ref={(node: HTMLDivElement | null) => {
                    // P259: register/unregister this message's scroll anchor.
                    if (node) messageRefs.current.set(msg.id, node);
                    else messageRefs.current.delete(msg.id);
                  }}
                  // A message should LAND, not appear. `false` for history and
                  // under reduced motion means no transform is ever applied to
                  // an already-settled bubble — only a genuine arrival moves,
                  // and only once.
                  //
                  // Deliberately small: 6px of rise and a fade, on the same
                  // decelerating curve the shell uses. Anything larger reads as
                  // the list re-laying-out, which is the opposite of the
                  // impression it exists to give. Nothing else on screen moves,
                  // because only this element animates — the history above it
                  // stays exactly where the reader's eye left it.
                  initial={isNew && !reduceMotion ? { opacity: 0, y: 6 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'flex items-end gap-2',
                    isOwn ? 'justify-end' : 'justify-start',
                    // Tight inside a group, generous between them — the
                    // spacing carries the grouping now, rather than every
                    // message sitting in the same undifferentiated rhythm.
                    isLastInGroup ? 'mb-3' : 'mb-0.5',
                  )}
                >
                  {/* Incoming avatar — GROUPS ONLY, once per group.
                      A 1:1 thread does not need a repeated face: there is
                      exactly one other person, their name and avatar are in
                      the header two inches above, and the column cost 40px of
                      width on every single line of the narrowest screen in the
                      product. In a group it is load-bearing — it is how you
                      tell four people apart while scrolling. */}
                  {!isOwn && isGroup && (
                    <div className="flex w-8 flex-shrink-0 flex-col items-center">
                      {/* On the LAST message of the group, not the first.
                          The row is `items-end`, so anchoring the avatar to the
                          final bubble sits it level with the speaker's last
                          word — and level with the timestamp, which also renders
                          on the last message. Anchored to the FIRST bubble it
                          floated at the top of a tall group, level with nothing,
                          with the group's own timestamp stranded four bubbles
                          below it. Every phone chat does it this way for the
                          same reason. */}
                      {isLastInGroup ? (
                        <Avatar decorative
                          name={senderName}
                          src={senderAvatar}
                          size="sm"
                        />
                      ) : null}
                    </div>
                  )}

                  <div className={cn('group relative flex min-w-0 max-w-[78%] flex-col gap-1 sm:max-w-[70%]', isOwn ? 'items-end' : 'items-start')}>
                    {/* Sender name — GROUPS ONLY, once per group.
                        Redundant in a 1:1 (the header already names them) and
                        it was `text-eyebrow` in tertiary ink, which is the
                        quietest type in the system: in a busy group thread you
                        could not scan who was speaking without studying the
                        avatars. It is the label that makes a group readable, so
                        it gets caption weight in secondary ink — still calm,
                        actually legible. */}
                    {!isOwn && isGroup && isFirstInGroup && (
                      <span className="ml-1 font-fw-sans text-caption font-medium text-text-secondary">
                        {senderName}
                      </span>
                    )}

                    {/* Message controls (desktop hover / mobile long-press row) */}
                    {editingMessageId !== msg.id && deleteConfirmId !== msg.id && (
                      <>
                        {isOwn && (
                        <div className="absolute right-full top-1/2 mr-1 hidden -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 lg:flex">
                          <IconButton variant="ghost" size="sm" aria-label="Edit message" onClick={() => onStartEdit(msg.id, msg.content)}>
                            <Pencil size={14} aria-hidden="true" />
                          </IconButton>
                          <IconButton variant="danger" size="sm" aria-label="Delete message" onClick={() => onDeleteClick(msg.id)}>
                            <Trash2 size={14} aria-hidden="true" />
                          </IconButton>
                        </div>
                        )}
                        {/* No persistent kebab. The actions appear on long-press
                            (see longPressHandlers) and otherwise cost nothing.
                            Copy is included because taking over long-press takes
                            over the gesture iOS uses to select text — without it
                            the message would become uncopyable. */}
                        {mobileActionsId === msg.id && (
                          <div className={cn('relative mt-1 flex flex-col gap-1 lg:hidden', isOwn ? 'items-end' : 'items-start')}>
                            {/* Quick reactions FIRST — spec §17 puts the strip
                                above the action list because reacting is the
                                common case and copy/edit/delete are the rare
                                ones. Full-size 44px targets: these are the
                                smallest things on screen and the ones most
                                likely to be tapped in a hurry. */}
                            <Inset padding="none" className="flex items-center gap-0.5 rounded-full px-1 py-0.5">
                              {GOLF_QUICK_REACTIONS.map((emoji) => {
                                const picked = getReactionsFor(msg.id).some((r) => r.emoji === emoji && r.mine);
                                return (
                                  // A 44x44 circular emoji target; <Button>
                                  // adds horizontal padding and a text scale
                                  // that would break the round hit area.
                                  // eslint-disable-next-line helm/no-raw-button -- see above
                                  <button
                                    key={emoji}
                                    type="button"
                                    aria-label={`React ${emoji}`}
                                    aria-pressed={picked}
                                    onClick={() => { void toggleReaction(msg.id, emoji); onSetMobileActions(null); }}
                                    className={cn(
                                      'flex h-11 w-11 items-center justify-center rounded-full text-body-lg leading-none',
                                      'transition-transform active:scale-90',
                                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                                      picked && 'bg-accent-50',
                                    )}
                                  >
                                    <span aria-hidden="true">{emoji}</span>
                                  </button>
                                );
                              })}
                            </Inset>
                            <Inset padding="none" className="flex items-center gap-1 px-1 py-0.5">
                              {onReply ? (
                                <IconButton variant="ghost" size="sm" aria-label="Reply to message" onClick={() => { onReply(msg); onSetMobileActions(null); }}>
                                  <Reply size={18} aria-hidden="true" />
                                </IconButton>
                              ) : null}
                              <IconButton variant="ghost" size="sm" aria-label="Copy message" onClick={() => { void navigator.clipboard?.writeText(decodeMessageContent(msg.content)); onSetMobileActions(null); }}>
                                <Copy size={18} aria-hidden="true" />
                              </IconButton>
                              {isOwn && (
                                <IconButton variant="ghost" size="sm" aria-label="Edit message" onClick={() => { onStartEdit(msg.id, msg.content); onSetMobileActions(null); }}>
                                  <Pencil size={18} aria-hidden="true" />
                                </IconButton>
                              )}
                              {isOwn && (
                                <IconButton variant="danger" size="sm" aria-label="Delete message" onClick={() => { onDeleteClick(msg.id); onSetMobileActions(null); }}>
                                  <Trash2 size={18} aria-hidden="true" />
                                </IconButton>
                              )}
                              <IconButton variant="ghost" size="sm" aria-label="Close" onClick={() => onSetMobileActions(null)}>
                                <X size={16} aria-hidden="true" />
                              </IconButton>
                            </Inset>
                          </div>
                        )}
                      </>
                    )}

                    {/* Delete confirmation */}
                    {deleteConfirmId === msg.id && (
                      <Inset padding="none" className="mr-2 flex items-center gap-1 bg-fw-danger-bg px-2.5 py-1.5">
                        <span className="mr-1 font-fw-sans text-eyebrow text-fw-danger-ink">Delete?</span>
                        <IconButton variant="danger" size="sm" aria-label="Confirm delete" onClick={onConfirmDelete}>
                          <Check size={18} aria-hidden="true" />
                        </IconButton>
                        <IconButton variant="ghost" size="sm" aria-label="Cancel delete" onClick={onCancelDelete}>
                          <X size={18} aria-hidden="true" />
                        </IconButton>
                      </Inset>
                    )}

                    {/* Bubble — edit mode */}
                    {editingMessageId === msg.id ? (
                      <div className="w-full rounded-fw-lg border border-accent-200 bg-accent-50 px-3 py-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => onEditContentChange(e.target.value)}
                          className="w-full min-w-0 border-0 bg-transparent p-0 font-fw-sans text-body-sm text-text-primary focus:ring-0"
                          rows={Math.min(5, editContent.split('\n').length || 1)}
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
                        />
                        <div className="mt-2 flex items-center justify-end gap-1 border-t border-accent-200 pt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onCancelEdit}
                            disabled={isEditSaving}
                            className="min-h-0 rounded px-2 py-1 font-fw-sans text-eyebrow text-text-tertiary hover:bg-transparent hover:text-text-secondary"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onSaveEdit}
                            disabled={isEditSaving || !editContent.trim()}
                            className={cn(
                              'min-h-0 rounded px-2 py-1 font-fw-sans text-eyebrow',
                              isEditSaving || !editContent.trim()
                                ? 'cursor-not-allowed text-text-tertiary hover:bg-transparent'
                                : 'text-accent-700 hover:bg-accent-100',
                            )}
                          >
                            {isEditSaving ? 'Saving…' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Bubble — normal mode. own = accent tint, other = raised cream.
                      // Long-press on ANY message, not just your own: reacting to
                      // what SOMEBODY ELSE said is the whole point of a reaction,
                      // and gating the gesture on ownership made the feature
                      // unreachable exactly where it matters.
                      <div
                        {...longPressHandlers(msg.id)}
                        className={cn(
                          'px-3.5 py-2',
                          // Opt out of the iOS text-selection callout, because
                          // long-press is the actions gesture now. Copy lives in
                          // that menu and is what replaces native selection —
                          // which is why the menu offers it for incoming
                          // messages too, not only your own.
                          'select-none [-webkit-touch-callout:none]',
                          // Shadow, never a border — `shadow-soft` alone is the
                          // Surface rule (border OR shadow, never both), and it
                          // is what makes a bubble read as sitting ON the page.
                          isOwn
                            ? 'bg-accent-650 text-text-on-accent shadow-soft'
                            : 'bg-surface text-text-primary shadow-soft',
                          // 20px card radius, not 28px. At 28 a two-word reply
                          // ("Yo") has a radius larger than its own half-height
                          // and renders as a lozenge. The interior corners of a
                          // group tighten to 6px so a run of messages reads as
                          // one block with one outer silhouette — the grouping
                          // is carried by the shape, not just the gaps.
                          'rounded-card',
                          !isFirstInGroup && (isOwn ? 'rounded-tr-md' : 'rounded-tl-md'),
                          !isLastInGroup && (isOwn ? 'rounded-br-md' : 'rounded-bl-md'),
                        )}
                      >
                        {/* §30: the quote sits INSIDE the bubble, above the
                            words that answer it, so a reply is one object
                            rather than two stacked ones. Tapping it jumps to
                            the source (the pane already has the scroll-anchor
                            machinery that notification deep-links use). */}
                        {msg.reply_to_id ? (() => {
                          const quoted = messagesById.get(msg.reply_to_id);
                          const quotedName = quoted
                            ? (quoted.sender_id === userId || quoted.sender_id === currentUserId
                                ? 'You'
                                : (isGroup
                                    ? groupParticipants?.get(quoted.sender_id)?.name
                                    : conversation.other_participant?.name)
                                  ?? 'Teammate')
                            : null;
                          return (
                            // An inline quote block inside a bubble; <Button>'s
                            // min-height would make the quote taller than the
                            // reply it introduces.
                            // eslint-disable-next-line helm/no-raw-button -- see above
                            <button
                              type="button"
                              disabled={!quoted || !onJumpToMessage}
                              onClick={() => quoted && onJumpToMessage?.(quoted.id)}
                              aria-label={quoted ? `Go to ${quotedName}'s message` : 'Original message unavailable'}
                              className={cn(
                                'mb-1.5 block w-full border-l-2 pl-2 text-left',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                                quoted ? 'cursor-pointer' : 'cursor-default',
                                isOwn ? 'border-text-on-accent/50' : 'border-accent-600',
                              )}
                            >
                              <span className={cn(
                                'block truncate font-fw-sans text-caption font-semibold',
                                isOwn ? 'text-text-on-accent/90' : 'text-accent-700',
                              )}>
                                {quotedName ?? 'Original message'}
                              </span>
                              <span className={cn(
                                'block truncate font-fw-sans text-caption',
                                isOwn ? 'text-text-on-accent/75' : 'text-text-secondary',
                              )}>
                                {quoted
                                  ? (quoted.is_deleted
                                      ? 'Message deleted'
                                      : decodeMessageContent(quoted.content) || 'Attachment')
                                  : 'Not in this part of the conversation'}
                              </span>
                            </button>
                          );
                        })() : null}
                        {msg.content ? (
                          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-fw-sans text-body-lg leading-snug">
                            {decodeMessageContent(msg.content)}
                          </p>
                        ) : null}
                        {/* Attachments — DORMANT unless has_attachments. Renders
                            the resolved (signed) gallery once it loads; falls
                            back to a quiet "Attachment" placeholder while the
                            signed URLs are still in flight. P266: on a failed
                            fetch, show a tap-to-retry chip instead of hanging on
                            the placeholder forever. */}
                        {hasAttachments ? (
                          resolvedAttachments.length ? (
                            <MessageAttachments attachments={resolvedAttachments} isOwn={isOwn} />
                          ) : hasAttachmentError ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={retryAttachments}
                              aria-label="Couldn’t load attachment — tap to retry"
                              className={cn(
                                'mt-1 min-h-0 rounded-fw-md px-2 py-1 font-fw-sans text-eyebrow',
                                'focus-visible:ring-offset-1',
                                isOwn
                                  ? 'text-text-on-accent/90 hover:bg-text-on-accent/15 focus-visible:ring-offset-accent-500'
                                  : 'text-text-secondary hover:bg-canvas focus-visible:ring-offset-surface',
                              )}
                            >
                              <RotateCw size={12} aria-hidden="true" />
                              Couldn’t load attachment — tap to retry
                            </Button>
                          ) : (
                            <span className={cn('mt-1 inline-flex items-center gap-1 font-fw-sans text-eyebrow', isOwn ? 'text-ink-on-deep' : 'text-text-tertiary')}>
                              <Paperclip size={12} aria-hidden="true" />
                              Attachment
                            </span>
                          )
                        ) : null}
                        {/* Edited badge — DORMANT unless edited_at. */}
                        {editedAt ? (
                          <span className={cn('mt-1 block font-fw-sans text-eyebrow', isOwn ? 'text-ink-on-deep-soft' : 'text-text-tertiary')}>
                            edited
                          </span>
                        ) : null}
                      </div>
                    )}
                    {/* Reactions sit UNDER the bubble (spec §18) and only
                        occupy space when they exist — an empty strip on every
                        message would cost a line of height per row for a
                        feature most messages never use. */}
                    <ReactionChips
                      reactions={getReactionsFor(msg.id)}
                      onToggle={(emoji) => void toggleReaction(msg.id, emoji)}
                      align={isOwn ? 'end' : 'start'}
                    />
                  </div>

                  {/* Time + read receipt (last of group, tabular-nums) */}
                  {showTime && editingMessageId !== msg.id && (
                    <div className={cn('flex items-center gap-1.5 pb-1', isOwn ? 'flex-row-reverse' : '')}>
                      <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                        {formatTime(msg.created_at)}
                      </span>
                      {/* P264 no-data-lies: per-message "Read" is only honest in a
                          1:1 thread. In a group the hook can only see ONE arbitrary
                          other participant's last_read_at, so "Read" would imply the
                          whole group has read when a single (random) member has.
                          Suppress the receipt in groups rather than imply group-read
                          off one member. */}
                      {isOwn && !isGroup && idx === lastOwnMessageIndex && (
                        <ReadReceipt isRead={(msg as MessageWithReadStatus).isRead} />
                      )}
                    </div>
                  )}
                </m.div>
                </React.Fragment>
              );
            })}

            {/* Typing indicator. Wrapped in AnimatePresence so it eases in and
                out instead of popping — it appears and disappears constantly
                while someone composes, and an abrupt insert at the foot of the
                thread jolts the whole column each time.

                No avatar in a GROUP: the typing broadcast carries no identity,
                so the only face available is `other_participant`, which is a
                1:1 concept. Showing it in a group would attribute the typing to
                a specific person the app has no idea about. */}
            <AnimatePresence initial={false}>
              {isOtherTyping && (
                <m.div
                  key="typing"
                  className="flex items-end justify-start gap-2"
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {!isGroup && (
                    <div className="w-8 flex-shrink-0">
                      <Avatar
                        name={conversation.other_participant?.name || 'User'}
                        src={conversation.other_participant?.avatar}
                        size="sm"
                      />
                    </div>
                  )}
                  <TypingIndicator />
                </m.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* WHAT'S-NEXT: the composer track (sunken matte) is passed in as children
          so FairwayMessages owns the send wiring to the unchanged hooks. */}
      {children}
    </InstrumentPanel>
  );
}

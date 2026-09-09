'use client';

/** Conversation canvas: grouped messages, delivery state, scrolling and actions.
 * The panel fills the workspace; bubble widths remain independently bounded. */

import { MESSAGE_REACTIONS, summarizeReactions, type MessageReactionsState } from '@/hooks/golf/use-message-reactions';
import * as React from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Pencil, Trash2, Check, X, Copy, Paperclip, MessageSquare, Users, FileText, Download, AlertTriangle, RotateCw, Info, SmilePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fwHaptic } from '@/lib/fairway/haptics';
import { isGroupConversation, conversationDisplayName } from './conversation-kind';
import { MessageActionsPanel } from './MessageActionsPanel';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import type {
  GolfConversationWithMeta,
  MessageWithReadStatus,
} from '@/hooks/golf/use-golf-messages';
import { getGolfMessageAttachments } from '@/app/golf/actions/messages';
import { formatFileSize } from '@/lib/storage/attachments';
import { Avatar, AvatarGroup } from '@/components/fairway/controls/avatar';
import type { GroupMember } from './GroupDetailsSheet';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { EmptyState, Skeleton } from '@/components/fairway/feedback';
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
/**
 * How long the hold must last before the actions open.
 *
 * 500ms because this is an Apple app first: it ships as a Capacitor WKWebView
 * (`capacitor.config.ts`, `@capacitor/ios`), so it sits on a phone where every
 * other long press — Messages, Mail, Safari — is a
 * `UILongPressGestureRecognizer` at its default `minimumPressDuration`. A hold
 * that fires early is not a nicety: it means a menu appearing under a thumb
 * that had not finished asking for one, on the surface where the user's timing
 * is most trained.
 *
 * G-42 changed this from 450, which predated the audit and was 50ms eager of
 * the platform. Owner's call, made explicitly for the App Store submission —
 * the finding recorded the delta rather than retuning it, which is the right
 * default for a design value, and the owner overrode that default.
 */
/**
 * One row of the action sheet — the shape both artboards draw.
 *
 * `Actions.dc.html:40` states it: 52px tall, `padding: 0 12px`, a 14px gap, a
 * 21px icon and a 16px/500 label, on a `0.875rem` radius. The radius is
 * `--fw-radius-md`, whose own comment in `design-tokens.css` reads "list rows".
 *
 * THE LABEL SIZE IS A TOKEN, AND FINDING IT CORRECTED THIS COMMENT. The first
 * pass wrote 16px off as unmapped — the Fairway ramp brackets it, `body` at
 * 15px and `body-lg` at 17px — and filed it as an A03 request. The suite's
 * "no token exists" assertion failed, which is the whole reason that assertion
 * is worth writing: `tailwind.config.ts` also carries an **iOS TYPE SCALE —
 * Apple HIG (San Francisco)**, whose `callout` is exactly 16px, under a comment
 * that reads "Use these on mobile/native surfaces for authentic iOS feel".
 *
 * That is precisely this surface. The artboard's 16px is Apple's Callout size
 * because the artboard is drawing an iOS action sheet, and this app is a
 * Capacitor WKWebView. `text-callout` had ZERO uses in the repo before this —
 * a dormant token that was the right answer the entire time, which makes this
 * the seventh free token application of the audit.
 *
 * Only the weight is ours: the token declares 400 and the artboard 500, so
 * `font-medium` rides along. Nothing is requested from A03.
 */
function ActionRow({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    // `Button`, not a raw `<button>` — `helm/no-raw-button` is a lint gate and
    // it is right: the primitive carries the focus ring, the disabled and busy
    // states, and the >=44px touch floor. Only the geometry is overridden, and
    // `cn`'s tailwind-merge lets the later utilities win over the variant's.
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-label={`${label} message`}
      leftIcon={icon}
      className={cn(
        // 52px is `Actions.dc.html:40`'s stated row height and is NOT on this
        // repo's spacing scale — `tailwind.config.ts:419` enumerates it and
        // stops at 12/16, with no 13. The bracket escape is the same idiom
        // G-50b's `max-w-[288px]` uses two hundred lines down, for the same
        // reason: an artboard number with no scale step.
        // `justify-start` because the variant centres, and the artboard's rows
        // are left-aligned with the icon leading.
        'flex h-[52px] w-full items-center justify-start gap-3.5 rounded-fw-md px-3 text-left',
        'font-fw-sans text-callout font-medium',
        'transition-colors duration-150',
        // DESTRUCTIVE IS INK ON A PLAIN ROW. `controls/button.tsx` has two
        // danger variants and they differ exactly here: Button's (`:108-112`)
        // is `bg-fw-danger-bg text-fw-danger-ink`, a tinted chip, and
        // IconButton's (`:255-257`) is `bg-transparent text-fw-danger-ink
        // hover:bg-fw-danger-bg`. This row reproduces the SECOND, which is
        // also what the icon strip it replaces already used — so the
        // destructive treatment is carried across unchanged rather than
        // reinvented. Spelled out because reaching for the obvious
        // `<Button variant="danger">` on a full-width row would paint a red
        // BAND, which neither artboard draws: both put a red label on the
        // sheet's own background.
        //
        // `--fw-color-danger-ink` rather than `--fw-color-danger` because
        // `design-tokens.css:182-188` measured exactly this: the three status
        // colours "all failed as text", danger at 4.01:1, and the ink
        // counterparts exist for copy. The artboard's own
        // `oklch(0.505 0.19 27)` matches NEITHER and is A03 request #9 — same
        // hue, sitting between the two, and taking it literally would repeat
        // the mistake `:150-165` already corrected once.
        destructive
          ? 'text-fw-danger-ink hover:bg-fw-danger-bg active:bg-fw-danger-bg'
          : 'text-text-primary hover:bg-surface-sunken active:bg-surface-sunken',
      )}
    >
      {label}
    </Button>
  );
}

const LONG_PRESS_MS = 500;
/**
 * Touch slop — how far a finger may wander during a hold before the gesture
 * stops being a hold.
 *
 * G-42. The handler used to cancel on ANY `pointermove`, and a finger resting
 * on glass never produces zero of them: a real 450ms hold emits a stream of
 * sub-pixel jitter events, every one of which killed the timer.
 *
 * THE AUTHORITY HERE IS UIKIT, not the web. This ships as a Capacitor app
 * (`capacitor.config.ts`, `@capacitor/ios`), so the surface is a WKWebView on a
 * phone whose every other long press — Messages, Mail, Safari itself — is a
 * `UILongPressGestureRecognizer`. Matching what the hand is already calibrated
 * to is the point; a bespoke number would feel wrong without being nameable.
 * `allowableMovement` is the property this mirrors, and 10 is the figure the
 * platform is documented at. NOT VERIFIED against a primary source in this
 * session — developer.apple.com renders its docs client-side and returned an
 * empty page — so it is written here as the convention it is, not as a quoted
 * constant. Corroborated from the other side: Android's
 * `ViewConfiguration.getScaledTouchSlop()` is ~8dp and the general web band is
 * 6–10px, and this ships to `@capacitor/android` too.
 *
 * 10 is also the forgiving end of that band, which is the right end here: the
 * gesture this must lose to is a SCROLL, and a scroll clears 10px immediately.
 *
 * This was pre-existing, but G-42 is what makes it matter: the gesture is now
 * on every message, and on an incoming message it is the ONLY action surface a
 * touch device has. A menu that opens only when you hold perfectly still is not
 * an action surface.
 *
 * `LONG_PRESS_MS` moved to the platform's 500ms alongside this — see its own
 * comment. Duration and slop are the two halves of the same recognizer, and
 * they now both name UIKit's.
 */
const LONG_PRESS_SLOP_PX = 10;

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

const EMPTY_REACTIONS: MessageReactionsState = {
  rows: [], error: null, pending: null,
  refresh: async () => {}, setReaction: async () => false,
};

export interface MessageThreadPaneProps {
  reactions?: MessageReactionsState;
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

  /**
   * G-19 — a send that failed leaves its message in the thread, muted, with a
   * retry. Both are optional so every existing caller keeps compiling; when
   * `onRetryMessage` is absent the failed bubble still renders (muted, labelled)
   * and simply offers no button, which is strictly better than the old
   * behaviour of deleting what the user wrote.
   */
  onRetryMessage?: (messageId: string) => void;
  onDiscardFailedMessage?: (messageId: string) => void;

  /**
   * Bug fix #1 — group sender resolution.
   * Maps user_id → { name, avatar } for every participant in a group
   * conversation.  FairwayMessages fetches this via golf_conversation_participants
   * → golf_coaches / golf_players whenever a group conv is selected, mirroring
   * the legacy fetchGroupParticipants pattern.  Undefined (or empty Map) on
   * 1:1 conversations — the component falls back to other_participant for those.
   */
  groupParticipants?: Map<string, GroupMember>;

  /**
   * G-30 / G-57 — open the group details sheet.
   *
   * The header had no trailing slot at all, which is why `GroupDetails.dc.html`
   * had no entry point: not "a sheet that needs rebuilding" but a sheet nothing
   * could open. This is the slot. Optional, and the control renders only when a
   * handler is supplied, so a caller with no details surface (a test harness,
   * or a DM-only embedding) gets the header it had before, byte for byte.
   */
  onOpenGroupDetails?: () => void;

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
        'font-fw-sans text-eyebrow',
        isRead ? 'text-accent-700' : 'text-text-tertiary',
      )}
    >
      {isRead ? 'Read' : 'Sent'}
    </span>
  );
}

/**
 * The first-paint thread skeleton's shape.
 *
 * Alternating sides with descending widths, so the placeholder reads as a
 * conversation and reserves the slot the real bubbles land in. Heights are the
 * bubble's own resting geometry: a one-line bubble is `px-4 py-2.5` around a
 * 15px/24px line, which is 44px; the taller entries stand in for a wrapped
 * two-line message.
 */
const SKELETON_BUBBLES = [
  { own: false, width: 'w-[62%]', height: 'h-11' },
  { own: true, width: 'w-[48%]', height: 'h-11' },
  { own: false, width: 'w-[72%]', height: 'h-16' },
  { own: true, width: 'w-[40%]', height: 'h-11' },
] as const;

/** Typing indicator — three dim dots on a matte Inset (NOT a glass bubble). */
function TypingIndicator() {
  return (
    <Inset padding="none" className="inline-flex rounded-card rounded-bl-sm px-4 py-3">
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
                // G-29b — no max-width of its own. The artboard puts the cap
                // on the BUBBLE (`Bubbles.dc.html:77`, 250px) and lets the
                // image fill it; carrying `max-w-[260px]` here as well left a
                // dead number that never bound inside a 288px column. The
                // specimen's 250px is deliberately not reproduced — it is a
                // scene specimen, and G-50b already settled that the column
                // takes the stated 288px RULE, not a specimen width.
                className="max-h-64 w-full object-cover"
              />
            </a>
          );
        }
        // Non-image (or unsigned image) → download chip.
        const chip = (
          <span
            className={cn(
              // G-29b — no cap of its own either. `Bubbles.dc.html:88` draws
              // the file bubble at the same 288px the `.bub` rule states, so
              // the column's cap (G-50b) is already the right one; 260px here
              // was a second, tighter number with nothing behind it.
              'inline-flex items-center gap-2 rounded-fw-md px-2.5 py-2',
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
  reactions: reactionProps,
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
  onRetryMessage,
  onDiscardFailedMessage,
  groupParticipants,
  onOpenGroupDetails,
  scrollToMessageId,
  onScrolledToMessage,
  children,
  className,
}: MessageThreadPaneProps & { children?: React.ReactNode }) {
  const reduceMotion = useReducedMotion() ?? false;
  const reactions = reactionProps ?? EMPTY_REACTIONS;
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
  /**
   * Own-ness, extracted so the sheet and the per-message row cannot drift.
   * The two ids are BOTH checked — see the render path's `isOwn`; changing
   * only one leaves a message own, which a test of this file found the hard
   * way.
   */
  const isOwnMessage = React.useCallback(
    (m: MessageWithReadStatus) => m.sender_id === userId || m.sender_id === currentUserId,
    [userId, currentUserId],
  );
  const currentActionsMessage = React.useMemo(
    () => (mobileActionsId ? messages.find((m) => m.id === mobileActionsId && m.conversation_id === conversation?.id) ?? null : null),
    [mobileActionsId, messages, conversation?.id],
  );
  // Keep the last body mounted while the shared overlay runs its exit animation.
  const lastActionsMessage = React.useRef<MessageWithReadStatus | null>(null);
  if (currentActionsMessage) lastActionsMessage.current = currentActionsMessage;
  const actionsMessage = currentActionsMessage ?? (
    lastActionsMessage.current?.conversation_id === conversation?.id ? lastActionsMessage.current : null
  );

  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = React.useRef<{ x: number; y: number } | null>(null);
  const cancelLongPress = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }, []);
  React.useEffect(() => cancelLongPress, [cancelLongPress]);

  /**
   * G-42 — Escape closes the action row. G-56 moved the row into the shared
   * `Sheet`, which brings its own Escape handling, and this stays anyway: the
   * sheet renders in a portal and owns focus only once its content has it, and
   * this listener is what makes the key work from the instant the row opens.
   * Both paths call the same setter with the same value, so a doubled press is
   * idempotent rather than a second dismissal.
   */
  React.useEffect(() => {
    if (!mobileActionsId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSetMobileActions(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileActionsId, onSetMobileActions]);

  const longPressHandlers = React.useCallback(
    (messageId: string) => ({
      onPointerDown: (e: React.PointerEvent) => {
        cancelLongPress();
        if (e.pointerType === 'mouse') return;
        longPressOriginRef.current = { x: e.clientX, y: e.clientY };
        longPressTimerRef.current = setTimeout(() => {
          // The detent tick, so the menu opening is felt as well as seen.
          fwHaptic('selection');
          onSetMobileActions(messageId);
        }, LONG_PRESS_MS);
      },
      onPointerUp: cancelLongPress,
      // Only a move PAST THE SLOP cancels — see LONG_PRESS_SLOP_PX. Compared on
      // squared distance so the hot path does no square root.
      onPointerMove: (e: React.PointerEvent) => {
        const origin = longPressOriginRef.current;
        if (!origin) return;
        const dx = e.clientX - origin.x;
        const dy = e.clientY - origin.y;
        if (dx * dx + dy * dy > LONG_PRESS_SLOP_PX * LONG_PRESS_SLOP_PX) cancelLongPress();
      },
      onPointerCancel: cancelLongPress,
      onPointerLeave: cancelLongPress,
      // CSS disables selection for the touch bubble, but compatibility mouse
      // events can still begin a selection before the long-press timer wins.
      // Keep this guard coarse-pointer-only so desktop users retain normal
      // text selection.
      onMouseDown: (e: React.MouseEvent) => {
        if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
          e.preventDefault();
        }
      },
      /**
       * G-42 — SUBSTITUTE, don't just suppress.
       *
       * This used to be `e.preventDefault()` and nothing else, under a comment
       * saying it kept iOS from racing our menu with its own. THAT COMMENT WAS
       * WRONG, and the correction matters because it moves the work: iOS Safari
       * has not fired `contextmenu` on a long press since iOS 13, so this
       * handler never reached the callout at all. `-webkit-touch-callout: none`
       * on the bubble is what does, and G-42 had to extend it to incoming
       * messages for the same reason it extended the gesture.
       *
       * What `preventDefault` genuinely protects is ANDROID CHROME, which does
       * fire `contextmenu` on a long press and would otherwise open its native
       * menu over ours, and the desktop right-click. On desktop the old handler
       * removed the one native path to message actions and put nothing in its
       * place — `audit/M03D-overlays.md:89` records exactly that, and §12.2
       * says not to make a long press the only path to reply or copy.
       *
       * Opening the same row the long-press opens is the substitution, and it
       * is idempotent with the timer: on Android both set the same id, so the
       * later event re-opens what is already open.
       */
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        cancelLongPress();
        onSetMobileActions(messageId);
      },
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
      // ARM FIRST, PIN SECOND, and only SPEND THE SENTINEL if a pin actually
      // happened. N-04: on a phone the pane is mounted while the RAIL is still
      // the visible half — the page auto-selects the first conversation, so
      // this effect runs against a container whose `clientHeight` is 0. The
      // previous shape wrote `scrollTop = scrollHeight` (0 = 0, a no-op that
      // looks like a completed pin) and then nulled
      // `pendingInitialScrollConversationIdRef` below, spending the one-shot.
      // Tapping that same already-selected row does not change
      // `conversation.id`, so the effect never ran again and the thread stayed
      // at its oldest message. Measured live: instrumenting the `scrollTop`
      // setter across a cold load records exactly one write, `{set: 0,
      // scrollHeight: 0, clientHeight: 0}`, and switching conversations — which
      // DOES change the id — pins correctly. That contrast is the proof.
      //
      // Arming is the INTENT ("this thread wants its newest message"), which is
      // true whether or not the pane has geometry yet. Pinning and spending the
      // sentinel are the ACT, and both need a laid-out container.
      stickToBottomRef.current = true;
      if (container.clientHeight === 0) return;
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
      // touching it. That observer is also what places a pane that mounted
      // without layout: revealing it resizes the content from 0 to its real
      // height, which is a growth event like any other.
      pendingInitialScrollConversationIdRef.current = null;
    }
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
    // `loading` is a DEPENDENCY, not noise — the second half of N-04. The
    // content node this observes (`messagesContentRef`) lives in the loaded
    // branch, so on a real open — which always mounts with `loading: true` —
    // `content` is null here, the effect returns early, and `conversation.id`
    // alone never changes afterwards to re-run it. The observer was therefore
    // never attached in production at all, which is why appending 40px of
    // content to a live thread moved nothing. Keying on `loading` attaches it
    // the moment the node exists. (The existing keyboard-shrink test renders
    // with `loading: false` from the start, so it saw both observers and this
    // gap stayed invisible.)
  }, [conversation?.id, loading]);

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
  const headerName = conversationDisplayName(conversation);
  // `is_group` is set for anything carrying `is_team_chat`, and a broadcast
  // sent to ONE player carries it too (the flag is load-bearing for the
  // conversation-create RLS workaround, so it can't just be dropped there).
  // That made a plain two-person thread announce itself as "Group
  // conversation" to both people in it. Read the participant count instead,
  // and say nothing when the count is unknown rather than guess wrong.
  const participantCount = conversation.participant_count ?? 0;
  // G-29c — the literal count, not a category. `Group.dc.html:34` writes
  // "9 members"; the code wrote "Group conversation", which is the one thing a
  // reader already knows from the stack of faces next to it. The count is the
  // new information, and `participant_count` was already being read one line
  // above to decide WHICH label to show — so this needs no new plumbing, only
  // the willingness to print the number it already had.
  const headerSubtitle = isGroup
    ? participantCount > 2
      ? `${participantCount} members`
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
        // Flatten the shared panel so the conversation reads as a workspace.
        '!rounded-none !border-0 !shadow-none',
        className,
      )}
    >
      {/* Thread bezel header — name + subtitle, mobile back affordance. */}
      <header className="flex min-h-16 min-w-0 items-center gap-2.5 relative z-10 fw-glass-chrome border-b shadow-flat px-4 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
        {/* "‹ Messages", not a bare arrow. With the shell's top bar hidden for
            an open thread this is the only way out AND the only thing naming
            where "out" is, so it says so — the platform convention, and the
            same reason iOS labels its back buttons. `-ml-2` pulls the glyph to
            the gutter so the label starts on the content grid rather than
            floating inboard of it. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="Back to conversations"
          leftIcon={<ArrowLeft size={20} aria-hidden="true" />}
          className="-ml-2 min-h-[44px] shrink-0 gap-0.5 px-2 font-fw-sans text-body-sm font-medium text-text-secondary lg:hidden"
        >
          <span className="max-[374px]:sr-only">Messages</span>
        </Button>
        {/* G-29c — a group's identity is WHO is in it, so the header shows an
            overlapping member stack rather than a generic Users glyph.
            `groupParticipants` (user_id → name/avatar) was already threaded into
            this component for per-bubble sender attribution and simply never
            surfaced here.

            The generic icon stays as the fallback, and deliberately: the map is
            fetched async, so before it lands there is nobody to stack. Rendering
            an empty stack — or worse, a "+N" derived from a half-loaded map —
            would be a header that lies for a moment on every group open.

            `ring-surface`, not the primitive's `ring-canvas` default: the rim is
            meant to read as a cutout in whatever the stack sits ON, and this
            header sits on the InstrumentPanel's `--fw-color-surface`, which is
            exactly the artboard's `2px solid oklch(0.984 0.016 86)`.

            The avatars are decorative — the subtitle beside them says "N
            members" and the title names the group, so announcing every face
            again would only make the header longer to listen to. */}
        {isGroup ? (
          groupParticipants && groupParticipants.size > 0 ? (
            <AvatarGroup size="sm" max={2} ring="ring-surface" className="flex-shrink-0">
              {/* First face accent, the rest neutral — `Group.dc.html:28`
                  fills the leading avatar `oklch(0.939 0.045 150)` over
                  `oklch(0.488 0.124 150)` and leaves the ones behind it
                  `oklch(0.963 0.021 84)`. Those are `accent-100`/`accent-700`
                  and `surface-sunken`: the stack reads as depth because the
                  top of it is tinted, not because it is all one colour. */}
              {Array.from(groupParticipants.values()).map((p, i) => (
                <Avatar key={i} decorative name={p.name} src={p.avatar} size="sm" tone={i === 0 ? 'accent' : 'neutral'} />
              ))}
            </AvatarGroup>
          ) : (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
              <Users size={18} aria-hidden="true" />
            </span>
          )
        ) : (
          <Avatar
            name={conversation.other_participant?.name || 'User'}
            src={conversation.other_participant?.avatar}
            size="sm"
            tone="accent"
          />
        )}
        {/* `ml-1` — `Group.dc.html:32` sets `margin-left: 4px` on the title
            column ON TOP of the row's 10px gap, so the name sits 14px off the
            faces while every other pair in the bar stays at 10px. It is the one
            spacing number the artboard states independently of its own
            back-affordance geometry, so it is the one worth porting. */}
        <div className="ml-1 min-w-0 flex-1">
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
        {/* G-30 — the trailing info control, and with it the LAST of G-57's
            three header deltas. The other two are already shipped: G-29c put
            the member stack and the live "N members" subtitle here, so G-57 is
            fully explained by G-30 alone and this closes both.

            `shrink-0` matters. The title column above is `min-w-0 flex-1`, so
            without it a long group name would compress the button instead of
            truncating itself, and the control would change size with the
            title. Rendered only for groups (a DM has no membership to show)
            and only when a handler exists, so the header is unchanged for any
            caller that has no details surface.

            IconButton `md` is 44px — the DoD touch target, and the same size
            the back button on the other end of this bar already reserves. */}
        {isGroup && onOpenGroupDetails ? (
          <IconButton
            variant="ghost"
            size="md"
            aria-label="Group details"
            onClick={onOpenGroupDetails}
            className="-mr-1 shrink-0"
          >
            <Info aria-hidden="true" />
          </IconButton>
        ) : null}
      </header>

      {/* Thread scroll region — a MATTE well (bg-surface) so the conversation
          reads cleanly against the raised glass bezel. */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain touch-pan-y bg-canvas px-4 py-5 sm:px-5"
        data-scroll-container
      >
        {loading ? (
          /* Shape-matched skeleton, not three grey bars.
             `Skeleton.tsx`'s own header states the contract this branch was
             the one place in the tree that ignored: blocks that RESERVE the
             final layout, a cream shimmer sweep that stops under reduced
             motion, and `role="status"` + `aria-busy` + an SR-only label so
             assistive tech hears "loading" instead of reading empty boxes.
             `MessageConversationRail.tsx`'s own loading branch already honours
             all three, so this was two standards in one directory.

             The placeholders alternate incoming / outgoing at the bubble's own
             geometry — `max-w-[288px]`, `rounded-card` with the sharpened
             trailing corner, the 32px avatar gutter on incoming rows — because
             a placeholder that does not sit where the message will sit trades
             one jump (empty -> content) for two (empty -> wrong shape ->
             content). Widths descend so it reads as conversation rather than
             as a loading bar; nothing here animates in, the shimmer is the only
             motion. */
          <div
            role="status"
            aria-busy="true"
            aria-live="polite"
            className="flex flex-col gap-3 py-2"
          >
            <span className="sr-only">Loading messages…</span>
            {SKELETON_BUBBLES.map((bubble, i) => (
              <div
                key={i}
                className={cn('flex items-end gap-2', bubble.own ? 'justify-end' : 'justify-start')}
              >
                {/* `bg-surface`, overriding the primitive's `bg-surface-sunken`
                    default. The placeholder reserves a BUBBLE, so it has to
                    carry the bubble's tone: on the thread's `bg-canvas` ground
                    (0.953) the sunken default sits 0.010 away, and first paint
                    would read exactly as flat as the defect this round fixed.
                    The shimmer is unaffected — it is a `before:` layer over
                    whatever fill the block has. */}
                {!bubble.own && <Skeleton circle className="h-8 w-8 flex-shrink-0 bg-surface" />}
                <Skeleton
                  className={cn(
                    'max-w-[288px] rounded-card bg-surface',
                    bubble.own ? 'rounded-br-sm' : 'rounded-bl-sm',
                    bubble.width,
                    bubble.height,
                  )}
                />
              </div>
            ))}
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
          <div ref={messagesContentRef} className="flex min-h-full flex-col justify-end">
            {messages.map((msg, idx) => {
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
              // G-29b — a photo message is framed differently from a text one:
              // the image IS the object and the caption sits under it, so the
              // bubble becomes a thin frame rather than a padded card. Derived
              // from the RESOLVED attachments, not `has_attachments`: until the
              // signed URLs land there is nothing to frame, and reshaping the
              // bubble before then would make it visibly snap on load.
              const isPhotoMessage = resolvedAttachments.some(
                (att) => att.fileType === 'image' && !!att.url,
              );

              // Bug fix #1 — resolve the real sender name + avatar for this message.
              // For group convs: look up in groupParticipants map (user_id → name/avatar).
              // For 1:1 convs: use other_participant directly (unchanged behaviour).
              const senderInfo = isGroup
                ? (groupParticipants?.get(msg.sender_id) ?? null)
                : {
                    name: conversation.other_participant?.name ?? 'Unknown',
                    avatar: conversation.other_participant?.avatar ?? null,
                  };
              // W7b — "Unknown" was the fallback, and once Remove and Leave
              // exist it is the WRONG word: the sender is not unknown, they
              // have left. FairwayMessages now resolves former senders too, so
              // this fires only past the participant fetch's 1000-row cap —
              // and "Former member" is still true there, where "Unknown" reads
              // as a data fault.
              const senderName = senderInfo?.name ?? 'Former member';
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
                    <span className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-accent-700">
                      New
                    </span>
                    <span className="h-px flex-1 bg-accent-500/45" />
                  </div>
                )}
                {startsDay && (
                  // Inline date boundaries reserve space above the next sender.
                  <div className="pointer-events-none flex justify-center pb-4" role="separator">
                    <span
                      className={cn(
                        'flex w-fit items-center rounded-full px-3.5 py-1.5',
                        'font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.06em] text-text-secondary',
                        '[background:var(--fw-glass-bg)]',
                        '[backdrop-filter:blur(var(--fw-blur-glass))_saturate(var(--fw-glass-saturate))]',
                        '[-webkit-backdrop-filter:blur(var(--fw-blur-glass))_saturate(var(--fw-glass-saturate))]',
                        '[box-shadow:inset_0_1px_0_var(--fw-glass-border),var(--fw-shadow-pop)]',
                      )}
                    >
                      {formatDaySeparator(msg.created_at)}
                    </span>
                  </div>
                )}
                <m.div
                  data-message-row
                  data-message-selected={mobileActionsId === msg.id ? 'true' : undefined}
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
                    isLastInGroup ? 'mb-1.5' : 'mb-0.5',
                  )}
                >
                  {/* Reserve the gutter; the face itself anchors to the bubble. */}
                  {!isOwn && <div aria-hidden="true" className="w-8 flex-shrink-0" />}

                  {/* G-50b — bubble max-width is 288px, and it is a RULE, not a
                      specimen. `Bubbles.dc.html:17` states it as a class rule —
                      `.bub { font-size: 15px; line-height: 22px; padding: 12px
                      16px; max-width: 288px; }` — in the artboard whose entire
                      purpose is bubble grammar. `Thread.dc.html`'s 296px and
                      `Group.dc.html`'s 268/292px are inline styles on individual
                      specimens in scene compositions. DECISIONS.md takes the
                      rule, not the specimens.

                      Group-incoming needs no number of its own: the 32px avatar
                      column and the row's `gap-2` sit OUTSIDE this element, so
                      an incoming row's available width is already 40px less than
                      an outgoing row's. One rule, one derivation, zero magic
                      numbers — 268 is written nowhere.

                      G-49 — and the cap binds at EVERY width. G-50b left the
                      `sm:max-w-[70%]` override in place, saying in this comment
                      that the artboards are 390px phone scenes and supply no
                      desktop authority. G-49/F13 is that authority: "on the
                      desktop 720px-capped panel a bubble can reach ~475px — well
                      past the readable measure §8.3 is protecting." The `sm:`
                      breakpoint is 640px, so on the 720px pane the percentage
                      won and 288px never applied at all: 70% of 720 is 504px.
                      `audit/M03B-thread.md:94` quotes the plan — "D08 annotates
                      a 288px maximum text measure... constrained by available
                      row width" — and a maximum narrowed by row width is a
                      ceiling, not a phone-scene number. There is nothing to
                      invent here: deleting the override is what makes the
                      stated rule apply. */}
                  <div className={cn('group relative flex min-w-0 max-w-[288px] flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
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

                    {editingMessageId !== msg.id && deleteConfirmId !== msg.id && (
                      <div className={cn('absolute top-1/2 hidden -translate-y-1/2 items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none md:flex', isOwn ? 'right-full mr-2' : 'left-full ml-2')}>
                        <IconButton variant="ghost" aria-label="Message actions" title="React or more actions" onClick={() => onSetMobileActions(msg.id)}>
                          <SmilePlus size={18} aria-hidden="true" />
                        </IconButton>
                      </div>
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
                      <div className="w-full rounded-card border border-accent-200 bg-accent-50 px-3 py-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => onEditContentChange(e.target.value)}
                          // Moves WITH the bubble (G-29). Left at 13px it
                          // would shrink the text the moment you tapped edit
                          // and grow it back on save — the same words at two
                          // sizes, which reads as a rendering bug.
                          className="w-full min-w-0 border-0 bg-transparent p-0 font-fw-sans text-body text-text-primary focus:ring-0"
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
                      // Bubble — normal mode. own = accent tint, other = sunken matte.
                      //
                      // G-42 — the long-press spread below is UNCONDITIONAL. It
                      // used to be `isOwn ? longPressHandlers(msg.id) : {}`,
                      // which is a stronger omission than §12.4 asks for: the
                      // plan says incoming messages drop EDIT AND DELETE, and
                      // this dropped the whole menu, Copy included. An incoming
                      // message was the one thing in the thread you could not
                      // copy.
                      <div
                        data-message-bubble
                        {...longPressHandlers(msg.id)}
                        className={cn(
                          'relative',
                          // G-29b — §8.6: "the image is the message object,
                          // with a caption below; it is not an image nested
                          // inside a large padded generic chat card." The
                          // generic card padding is exactly what made it the
                          // latter, so a photo message gets a frame instead.
                          // `Bubbles.dc.html:77` draws that frame at 5px with a
                          // 10px foot; 5px is not on the 4px spacing scale, and
                          // 1px on a frame is render noise, so `p-1 pb-2.5`.
                          isPhotoMessage ? 'p-1 pb-2.5' : 'px-4 py-2.5',
                          // Long-press is the actions gesture, so the bubble
                          // opts out of the iOS text-selection callout; Copy in
                          // that menu replaces what selection provided.
                          //
                          // G-42 — this was `isOwn && …` and had to stop being,
                          // because the long-press spread stopped being. THIS
                          // pair of properties is what actually suppresses the
                          // native callout on iOS — `onContextMenu` does not,
                          // since iOS Safari has not fired `contextmenu` on a
                          // long press since iOS 13. Attaching the gesture to
                          // incoming messages without extending the suppression
                          // would have raced our menu against the native
                          // callout on exactly the messages the finding was
                          // about, which is worse than the gap it closed.
                          'select-text [-webkit-touch-callout:default] [@media(pointer:coarse)]:select-none [@media(pointer:coarse)]:[-webkit-touch-callout:none] [@media(pointer:coarse)]:[-webkit-user-select:none]',
                          mobileActionsId === msg.id && '[@media(pointer:coarse)]:relative [@media(pointer:coarse)]:z-20 [@media(pointer:coarse)]:scale-[1.015] [@media(pointer:coarse)]:opacity-100 [@media(pointer:coarse)]:transition-[transform,opacity] [@media(pointer:coarse)]:duration-150 motion-reduce:[@media(pointer:coarse)]:transition-none',
                          // Incoming is `bg-surface`. `Bubbles.dc.html:20` and
                          // `Thread.dc.html:57` both paint it
                          // `linear-gradient(180deg, oklch(0.989 …), oklch(0.980 …))`,
                          // whose mean is 0.9845 — `--fw-color-surface` (0.984)
                          // to three places, and inside the gradient's own range
                          // rather than a step past its bright stop.
                          // `--fw-color-elevated` (0.993) overshoots the whole
                          // ramp, and `design-tokens.css:118` is pointed about
                          // exactly that: surface is "warm CREAM, not white …
                          // never by being a cold white sheet (we keep coming
                          // back to this: no white cards)". A white slab is what
                          // it shipped as.
                          //
                          // What actually made the thread read flat was the
                          // GROUND, not the fill: the scroll region was itself
                          // `bg-surface`, so a 0.984 bubble sat on a 0.984 page
                          // and no shadow could rescue nine thousandths of
                          // separation. The artboards float the bubbles over the
                          // canvas. It is `bg-canvas` now (0.953), which is the
                          // 0.031 step the shadows were drawn against. Taking the
                          // flat token at the gradient's mean, not porting the
                          // gradient — same G-50b logic, and no new machinery two
                          // rounds after "you're doing too much with the cards".
                          isOwn
                            ? 'bg-accent-650 text-text-on-accent'
                            : 'bg-surface text-text-primary',
                          // G-49 (F14) — every bubble in the artboard casts a
                          // shadow; the repo drew them flat. Same systemic gap
                          // G-32 already closed on the rail's unread rows, which
                          // the manifest calls out as "one systemic issue across
                          // two lanes, not two".
                          //
                          // Incoming is free: `Bubbles.dc.html:18`'s `.lit` is
                          // BYTE-IDENTICAL to `--fw-shadow-card` — inset 0 1px 0
                          // oklch(1 0 0 / 0.55), then 0 1px 2px /0.05 and
                          // 0 4px 10px /0.06. The arbitrary-property escape is
                          // the repo idiom for that token because `shadow-card`
                          // is a TRAP: it is a legacy Tailwind entry with a
                          // different value, not a bridge to `--fw-shadow-card`.
                          //
                          // Own is NOT free. `.lit-accent` (`:19`) is a green
                          // ambient — 0 8px 20px oklch(0.488 0.124 150 / 0.22) —
                          // over a much dimmer 0.14 inset, because the surface
                          // beneath it is dark green. No token expresses a
                          // hued shadow, so it is A03 request #8. `shadow-soft`
                          // ships until then: it IS a real bridge to
                          // `--fw-shadow-soft`, and it carries the two-layer
                          // ambient without the inset — which matters, since
                          // `--fw-shadow-card`'s 0.55 white inset on a dark green
                          // bubble would paint a bright specular rim the artboard
                          // explicitly dims to 0.14.
                          //
                          // Own steps up to `--fw-shadow-raise`. A03 #8 stays
                          // OPEN — the artboard's `.lit-accent` is a hued ambient
                          // and no shadow token is hued, so the honest options
                          // were a neutral token or a hand-typed colour, and this
                          // suite rightly forbids the second: a literal drifts
                          // silently the moment the palette moves. `shadow-soft`
                          // (0 10px 28px / 0.13) read as no lift at all under a
                          // dark green bubble; `raise` (0 18px 44px / 0.15) is the
                          // next token up and does carry.
                          //
                          // One fact for whoever grants A03 #8, found here and
                          // worth not re-deriving: the request records that no
                          // token expresses this shadow, which is true of the
                          // SHADOW ramp but not of the COLOUR ramp — the
                          // artboard's ambient `oklch(0.488 0.124 150)` is
                          // `--fw-color-accent-700` exactly (`design-tokens.css:99`,
                          // and `:96`'s accent-750 is the same value). So the
                          // variant can be minted from an existing colour rather
                          // than a new one.
                          isOwn ? '[box-shadow:var(--fw-shadow-raise)]' : '[box-shadow:var(--fw-shadow-card)]',
                          // G-19: a failed send stays legible but visibly not
                          // delivered — muted, never removed.
                          (msg as MessageWithReadStatus).sendFailed && 'opacity-60',
                          isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-card rounded-br-sm' : 'rounded-card rounded-bl-sm'),
                          isFirstInGroup && !isLastInGroup && 'rounded-card',
                          !isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-card rounded-tr-md rounded-br-sm' : 'rounded-card rounded-tl-md rounded-bl-sm'),
                          !isFirstInGroup && !isLastInGroup && 'rounded-fw-md',
                        )}
                      >
                        {!isOwn && isLastInGroup && (
                          <span data-message-avatar className="absolute bottom-0 right-full mr-2 flex h-8 w-8 items-center justify-center">
                            <Avatar decorative name={senderName} src={senderAvatar} size="sm" tone="accent" />
                          </span>
                        )}
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
                                  : 'text-text-secondary hover:bg-surface focus-visible:ring-offset-surface-sunken',
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
                        {/* G-29 — message text is 15px, not 13px.
                            `.bub { font-size: 15px; line-height: 22px; }` is a
                            CLASS RULE in both `Bubbles.dc.html:17` and
                            `Thread.dc.html:16`, and `text-body` is exactly 15px.
                            M03B's F7 asked for 17px `body-lg`, but it sourced
                            that from §8.3's prose ("approximately 17px"), not
                            from an artboard — and the artboards state a rule.
                            Same call as G-50b: the rule beats the prose.

                            `leading-relaxed` goes with it. The token carries its
                            own 24px line-height, and stacking a multiplier on
                            top of a token that already specifies leading is how
                            the scale stops meaning anything. 24px against the
                            artboard's 22px is the one value here with no token —
                            it is an A03 variant request, not a number to
                            hardcode, and the token's 24px ships until then.

                            G-29b — and it renders AFTER the attachments now.
                            The order used to be content-then-attachments
                            unconditionally, which is the "caption above the
                            image" §8.6 names. On a photo message it carries its
                            own inset (`Bubbles.dc.html:79` draws it at
                            `8px 11px 0`, and 11px is not on the 4px scale) so
                            the caption is inset from the frame while the image
                            stays flush to it. */}
                        {msg.content ? (
                          <p
                            className={cn(
                              'whitespace-pre-wrap break-words font-fw-sans text-body',
                              isPhotoMessage && 'px-2.5 pt-2',
                            )}
                          >
                            {decodeMessageContent(msg.content)}
                          </p>
                        ) : null}
                        {/* Edited badge — DORMANT unless edited_at. */}
                        {editedAt ? (
                          <span className={cn('mt-1 block font-fw-sans text-eyebrow', isPhotoMessage && 'px-2.5', isOwn ? 'text-ink-on-deep-soft' : 'text-text-tertiary')}>
                            edited
                          </span>
                        ) : null}
                      </div>
                    )}
                    {summarizeReactions(reactions.rows, msg.id, currentUserId ?? userId).length > 0 && (
                      <div className="relative z-10 -mt-3 flex flex-wrap gap-1 px-1" aria-label="Message reactions">
                        {summarizeReactions(reactions.rows, msg.id, currentUserId ?? userId).map((reaction) => (
                          <Button
                            key={reaction.emoji}
                            type="button"
                            variant="ghost"
                            aria-label={`${reaction.emoji}: ${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'}${reaction.active ? ', including you' : ''}`}
                            aria-pressed={reaction.active}
                            disabled={Boolean(reactions.pending)}
                            onClick={() => { void reactions.setReaction(msg.id, reaction.emoji, !reaction.active); }}
                            className="group h-11 min-w-11 rounded-full border-0 bg-transparent p-0 hover:bg-transparent transition-transform duration-200 motion-reduce:transition-none"
                            title={reaction.active ? 'You reacted. Tap to remove your reaction.' : 'Tap to add your reaction.'}
                          >
                            <span className={cn('inline-flex h-7 min-w-10 items-center justify-center gap-1 rounded-full border px-2 shadow-flat transition-colors duration-150 motion-reduce:transition-none', reaction.active ? 'border-accent-600/40 bg-accent-100 text-accent-700' : 'border-border-subtle bg-elevated text-text-primary group-hover:bg-surface')}>
                              <span className="text-body leading-none" aria-hidden="true">{reaction.emoji}</span>
                              <m.span key={reaction.count} initial={reduceMotion ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.16 }} className="text-caption tabular-nums">{reaction.count}</m.span>
                            </span>
                          </Button>
                        ))}
                      </div>
                    )}

                    {/* G-19 — a send that failed keeps its message here rather
                        than deleting it. The bubble above is dimmed via
                        `sendFailed`, and this row is the only trace that used
                        to be a toast: what happened, and the two ways out. */}
                    {(msg as MessageWithReadStatus).sendFailed && (
                      <div className="flex items-center gap-2 pt-0.5">
                        {/* G-20b — "Not sent" is a claim, and on a transport
                            failure it is one we cannot make: the POST may have
                            committed with only the response lost. §9.5 names
                            that case exactly — "An unknown commit outcome uses
                            Checking status or Confirmation unavailable, not a
                            red definitive failure that invites duplication."
                            The refused case keeps the definite wording, because
                            there the server answered and we know. */}
                        <span className="font-fw-sans text-eyebrow text-text-tertiary">
                          {(msg as MessageWithReadStatus).sendOutcome === 'unknown'
                            ? 'Not confirmed'
                            : 'Not sent'}
                        </span>
                        {onRetryMessage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRetryMessage(msg.id)}
                            className="min-h-0 rounded-fw-md px-2 py-1 font-fw-sans text-eyebrow text-text-secondary hover:bg-surface"
                          >
                            <RotateCw size={12} aria-hidden="true" />
                            Retry
                          </Button>
                        )}
                        {onDiscardFailedMessage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onDiscardFailedMessage(msg.id)}
                            className="min-h-0 rounded-fw-md px-2 py-1 font-fw-sans text-eyebrow text-text-tertiary hover:bg-surface"
                          >
                            Discard
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Time + read receipt (last of group, tabular-nums).
                        G-26: this belongs INSIDE the message column, not beside
                        it. The row above is `flex items-end gap-2`, so while
                        this lived as a sibling of the column it was a third
                        flex item competing for the same horizontal space —
                        every message carrying a timestamp had its bubble pushed
                        inward by the width of "4:31 PM" plus the gap, so it no
                        longer lined up with its own group-mates. Nested here it
                        stacks under the bubble and inherits the column's
                        `items-end`/`items-start`, which is what the artboards
                        draw. `pb-1` went with it; the row's `items-end` no
                        longer needs compensating for. */}
                    {showTime && editingMessageId !== msg.id && (
                      <div className={cn('flex items-center gap-1.5', isOwn ? 'flex-row-reverse' : '')}>
                        <span className="font-fw-mono text-eyebrow tabular-nums text-text-tertiary">
                          {formatTime(msg.created_at)}
                        </span>
                        {/* P264 no-data-lies: per-message "Read" is only honest in a
                            1:1 thread. In a group the hook can only see ONE arbitrary
                            other participant's last_read_at, so "Read" would imply the
                            whole group has read when a single (random) member has.
                            Suppress the receipt in groups rather than imply group-read
                            off one member. */}
                        {isOwn && !isGroup && <ReadReceipt isRead={(msg as MessageWithReadStatus).isRead} />}
                      </div>
                    )}
                  </div>
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

      {/* One responsive action panel for the selected message. */}
      {actionsMessage && (
        <MessageActionsPanel
          open={Boolean(currentActionsMessage)}
          anchor={() => messageRefs.current.get(actionsMessage.id)?.querySelector<HTMLElement>('[data-message-bubble]') ?? null}
          own={isOwnMessage(actionsMessage)}
          onClose={() => onSetMobileActions(null)}
        >
          <div className="flex flex-col">
          <m.div
            data-fw-selected-message
            className={cn(
              'order-2 mb-3 w-fit max-w-[90%] overflow-clip rounded-fw-md border px-3 py-2.5 [box-shadow:var(--fw-shadow-card)]',
              isOwnMessage(actionsMessage) ? 'self-end border-accent-700 bg-accent-650 text-text-on-accent' : 'self-start border-border-subtle bg-surface text-text-primary',
            )}
            initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className={cn('text-caption font-medium', isOwnMessage(actionsMessage) ? 'text-text-on-accent/80' : 'text-text-secondary')}>
              {isOwnMessage(actionsMessage) ? 'Your message' : (isGroup
                ? groupParticipants?.get(actionsMessage.sender_id)?.name || 'Team member'
                : conversationDisplayName(conversation))}
            </p>
            <p className={cn('mt-1 line-clamp-2 break-words text-body', isOwnMessage(actionsMessage) ? 'text-text-on-accent' : 'text-text-primary')}>
              {decodeMessageContent(actionsMessage.content) || 'Attachment'}
            </p>
          </m.div>
          {reactionProps && (
            <m.div
              data-fw-reaction-pill
              className="order-1 mb-3 flex justify-between gap-0.5 rounded-full border border-[var(--fw-glass-border)] bg-[var(--fw-glass-bg)] p-1.5 shadow-pop [backdrop-filter:blur(var(--fw-blur-glass))_saturate(var(--fw-glass-saturate))] [-webkit-backdrop-filter:blur(var(--fw-blur-glass))_saturate(var(--fw-glass-saturate))]"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 3 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
              aria-label="React to message"
            >
              {MESSAGE_REACTIONS.map(({ emoji, label }) => {
                const active = reactions.rows.some((row) => row.message_id === actionsMessage.id && row.user_id === (currentUserId ?? userId) && row.emoji === emoji);
                const saving = reactions.pending === `${actionsMessage.id}:${emoji}`;
                return (
                  <Button
                    key={emoji}
                    type="button"
                    variant="ghost"
                    aria-label={label}
                    title={active ? `Remove ${label.toLowerCase()}` : label}
                    aria-pressed={active}
                    aria-busy={saving || undefined}
                    disabled={Boolean(reactions.pending)}
                    onClick={() => {
                      void reactions.setReaction(actionsMessage.id, emoji, !active).then((saved) => {
                        if (saved) onSetMobileActions(null);
                      });
                    }}
                    className={cn('group h-12 min-w-0 flex-1 rounded-full p-0 text-h2 transition-colors motion-reduce:transition-none', active && 'bg-accent-100 ring-1 ring-inset ring-accent-600 shadow-flat')}
                  >
                    <span className="relative flex items-center justify-center">
                      <span aria-hidden="true" className={cn('inline-block transition-transform duration-200 ease-out motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:scale-110 motion-safe:group-focus-visible:scale-110 motion-reduce:transition-none', saving && 'opacity-50')}>{emoji}</span>
                      {active && <span aria-hidden="true" className="absolute -bottom-1 h-1 w-1 rounded-full bg-accent-700" />}
                    </span>
                  </Button>
                );
              })}
            </m.div>
          )}
          <div data-fw-message-actions-list className="order-3 rounded-fw-lg border border-[var(--fw-glass-border)] bg-[var(--fw-glass-bg)] p-2 shadow-pop [backdrop-filter:blur(var(--fw-blur-glass))_saturate(var(--fw-glass-saturate))] [-webkit-backdrop-filter:blur(var(--fw-blur-glass))_saturate(var(--fw-glass-saturate))]">
            {reactions.error && <p role="alert" className="px-3 pb-2 text-caption text-fw-danger-ink">{reactions.error}</p>}
            <div className="flex flex-col gap-0.5">

            <ActionRow
              icon={<Copy size={21} aria-hidden="true" />}
              label="Copy"
              onClick={() => {
                void navigator.clipboard?.writeText(decodeMessageContent(actionsMessage.content));
                onSetMobileActions(null);
              }}
            />
            {/* §12.4 — Edit and Delete are the own-only pair, and the G-55
                separator travels with them: with nothing destructive in the
                sheet there is nothing for it to fence off. G-42 is why Copy
                sits outside this branch. Reply is G-20c's, deferred. */}
            {isOwnMessage(actionsMessage) && (
              <>
                <ActionRow
                  icon={<Pencil size={21} aria-hidden="true" />}
                  label="Edit"
                  onClick={() => {
                    onStartEdit(actionsMessage.id, actionsMessage.content);
                    onSetMobileActions(null);
                  }}
                />
                {/* G-55, now in the orientation both artboards actually draw
                    it: a horizontal rule at the artboard's own `margin: 6px
                    12px`. The vertical rule the icon strip carried was a
                    rotation of this, and the rotation is what goes away with
                    the strip. */}
                <div aria-hidden="true" className="mx-3 my-1.5 h-px bg-border-subtle" />
                <ActionRow
                  icon={<Trash2 size={21} aria-hidden="true" />}
                  label="Delete"
                  destructive
                  onClick={() => {
                    onDeleteClick(actionsMessage.id);
                    onSetMobileActions(null);
                  }}
                />
              </>
            )}
            </div>
          </div>
          </div>
        </MessageActionsPanel>
      )}

      {/* WHAT'S-NEXT: the composer track (sunken matte) is passed in as children
          so FairwayMessages owns the send wiring to the unchanged hooks. */}
      {reactions.error && !currentActionsMessage && (
        <div role="status" className="flex items-center justify-between gap-2 px-4 py-2">
          <p className="text-caption text-text-secondary">{reactions.error}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => { void reactions.refresh(); }}>Reload reactions</Button>
        </div>
      )}
      {children}
    </InstrumentPanel>
  );
}

'use client';

/**
 * ============================================================================
 * Fairway · messages · MessageThreadPane — the PULSE focal hero (open thread)
 * ----------------------------------------------------------------------------
 * The two-pane inbox's RIGHT pane and the page's ONE focal hero: a flat matte
 * `InstrumentPanel` depth='raised' thread well with a sunken composer track —
 * mirrors AskThreadPane. The conversation bubbles read on matte surfaces
 * (own = bg-accent tint, other = bg-surface-sunken); NEVER bg-white/backdrop-blur.
 *
 * It owns NO send/edit/delete logic — the parent FairwayMessages drives those
 * through the UNCHANGED useGolfMessages hook + server actions and passes the
 * handlers + state down. This pane is PRESENTATION + LAYOUT only:
 *   • smooth auto-scroll to newest, gated on near-bottom (PRESERVES the legacy
 *     messagesContainerRef near-bottom check exactly)
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
import { useReducedMotion } from 'framer-motion';
import { ArrowLeft, Pencil, Trash2, Check, X, MoreVertical, Paperclip, MessageSquare, Users, FileText, Download, AlertTriangle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
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

/** Typing indicator — three dim dots on a matte Inset (NOT a glass bubble). */
function TypingIndicator() {
  return (
    <Inset padding="none" className="inline-flex rounded-fw-lg rounded-bl-sm px-4 py-3">
      <span className="flex items-center gap-1" aria-label="Typing">
        <span className="h-2 w-2 rounded-full bg-text-tertiary motion-safe:animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-2 w-2 rounded-full bg-text-tertiary motion-safe:animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-2 w-2 rounded-full bg-text-tertiary motion-safe:animate-bounce" style={{ animationDelay: '300ms' }} />
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
  groupParticipants,
  scrollToMessageId,
  onScrolledToMessage,
  children,
  className,
}: MessageThreadPaneProps & { children?: React.ReactNode }) {
  const reduceMotion = useReducedMotion() ?? false;
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);
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
  // Bumped to force a re-run of the batch fetch (manual retry from the chip).
  const [attachmentRetryNonce, setAttachmentRetryNonce] = React.useState(0);

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
        }
      }
      setAttachmentsByMessage(next);
      setAttachmentErrors(errored);
    })();
    return () => {
      cancelled = true;
    };
  }, [attachmentMessageKey, attachmentRetryNonce]);

  const retryAttachments = React.useCallback(() => {
    setAttachmentRetryNonce((n) => n + 1);
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

  const isGroup = conversation.is_group;
  const headerName = isGroup
    ? conversation.title || 'Team Group'
    : conversation.other_participant?.name || 'Unknown User';
  // `is_group` is set for anything carrying `is_team_chat`, and a broadcast
  // sent to ONE player carries it too (the flag is load-bearing for the
  // conversation-create RLS workaround, so it can't just be dropped there).
  // That made a plain two-person thread announce itself as "Group
  // conversation" to both people in it. Read the participant count instead,
  // and say nothing when the count is unknown rather than guess wrong.
  const participantCount = conversation.participant_count ?? 0;
  const headerSubtitle = isGroup
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
      className={cn('flex min-h-[40vh] flex-col overflow-hidden', className)}
    >
      {/* Thread bezel header — name + subtitle, mobile back affordance. */}
      <header className="flex min-w-0 items-center gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
        <IconButton
          variant="ghost"
          size="md"
          aria-label="Back to conversations"
          onClick={onBack}
          className="lg:hidden"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </IconButton>
        {isGroup ? (
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <Users size={18} aria-hidden="true" />
          </span>
        ) : (
          <Avatar
            name={conversation.other_participant?.name || 'User'}
            src={conversation.other_participant?.avatar}
            size="md"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-fw-sans text-body font-medium text-text-primary">{headerName}</p>
          {headerSubtitle ? (
            <p className="truncate font-fw-sans text-eyebrow text-text-tertiary">{headerSubtitle}</p>
          ) : null}
        </div>
      </header>

      {/* Thread scroll region — a MATTE well (bg-surface) so the conversation
          reads cleanly against the raised glass bezel. */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain touch-pan-y bg-surface px-4 py-5 sm:px-5"
        data-scroll-container
      >
        {loading ? (
          <div className="space-y-3 py-8">
            <div className="h-4 w-3/4 rounded bg-surface-sunken" />
            <div className="h-4 w-1/2 rounded bg-surface-sunken" />
            <div className="h-4 w-2/3 rounded bg-surface-sunken" />
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
          <div className="space-y-4">
            {messages.map((msg, idx) => {
              // own-message check is identical for both roles (spec §4).
              const isOwn = msg.sender_id === userId || msg.sender_id === currentUserId;
              const prevMsg = messages[idx - 1];
              const nextMsg = messages[idx + 1];
              const isFirstInGroup = !prevMsg || prevMsg.sender_id !== msg.sender_id;
              const isLastInGroup = !nextMsg || nextMsg.sender_id !== msg.sender_id;
              const showTime = isLastInGroup;

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
                <div
                  key={msg.id}
                  ref={(node) => {
                    // P259: register/unregister this message's scroll anchor.
                    if (node) messageRefs.current.set(msg.id, node);
                    else messageRefs.current.delete(msg.id);
                  }}
                  className={cn(
                    'flex items-end gap-2',
                    isOwn ? 'justify-end' : 'justify-start',
                    !isLastInGroup && 'mb-0.5',
                  )}
                >
                  {/* Incoming avatar (first of group only) */}
                  {!isOwn && (
                    <div className="flex w-8 flex-shrink-0 flex-col items-center">
                      {isFirstInGroup ? (
                        <Avatar decorative
                          name={senderName}
                          src={senderAvatar}
                          size="sm"
                        />
                      ) : null}
                    </div>
                  )}

                  <div className={cn('group relative flex min-w-0 max-w-[70%] flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
                    {/* Sender name above first incoming bubble */}
                    {!isOwn && isFirstInGroup && (
                      <span className="ml-1 font-fw-sans text-eyebrow font-medium text-text-tertiary">
                        {senderName}
                      </span>
                    )}

                    {/* Own-message controls (desktop hover / mobile tap row) */}
                    {isOwn && editingMessageId !== msg.id && deleteConfirmId !== msg.id && (
                      <>
                        <div className="absolute right-full top-1/2 mr-1 hidden -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 lg:flex">
                          <IconButton variant="ghost" size="sm" aria-label="Edit message" onClick={() => onStartEdit(msg.id, msg.content)}>
                            <Pencil size={14} aria-hidden="true" />
                          </IconButton>
                          <IconButton variant="danger" size="sm" aria-label="Delete message" onClick={() => onDeleteClick(msg.id)}>
                            <Trash2 size={14} aria-hidden="true" />
                          </IconButton>
                        </div>
                        <div className="relative mt-0.5 flex items-center lg:hidden">
                          {mobileActionsId === msg.id ? (
                            <Inset padding="none" className="flex items-center gap-1 px-1 py-0.5">
                              <IconButton variant="ghost" size="sm" aria-label="Edit message" onClick={() => { onStartEdit(msg.id, msg.content); onSetMobileActions(null); }}>
                                <Pencil size={18} aria-hidden="true" />
                              </IconButton>
                              <IconButton variant="danger" size="sm" aria-label="Delete message" onClick={() => { onDeleteClick(msg.id); onSetMobileActions(null); }}>
                                <Trash2 size={18} aria-hidden="true" />
                              </IconButton>
                              <IconButton variant="ghost" size="sm" aria-label="Close" onClick={() => onSetMobileActions(null)}>
                                <X size={16} aria-hidden="true" />
                              </IconButton>
                            </Inset>
                          ) : (
                            <IconButton variant="ghost" size="sm" aria-label="Message actions" onClick={() => onSetMobileActions(msg.id)}>
                              <MoreVertical size={16} aria-hidden="true" />
                            </IconButton>
                          )}
                        </div>
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
                      // Bubble — normal mode. own = accent tint, other = sunken matte.
                      <div
                        className={cn(
                          'px-4 py-2.5',
                          isOwn
                            ? 'bg-accent-750 text-text-on-accent'
                            : 'bg-surface-sunken text-text-primary',
                          isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-fw-lg rounded-br-sm' : 'rounded-fw-lg rounded-bl-sm'),
                          isFirstInGroup && !isLastInGroup && 'rounded-fw-lg',
                          !isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-fw-lg rounded-tr-md rounded-br-sm' : 'rounded-fw-lg rounded-tl-md rounded-bl-sm'),
                          !isFirstInGroup && !isLastInGroup && 'rounded-fw-md',
                        )}
                      >
                        {msg.content ? (
                          <p className="whitespace-pre-wrap break-words font-fw-sans text-body-sm leading-relaxed">
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
                        {/* Edited badge — DORMANT unless edited_at. */}
                        {editedAt ? (
                          <span className={cn('mt-1 block font-fw-sans text-eyebrow', isOwn ? 'text-ink-on-deep-soft' : 'text-text-tertiary')}>
                            edited
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Time + read receipt (last of group, tabular-nums) */}
                  {showTime && editingMessageId !== msg.id && (
                    <div className={cn('flex items-center gap-1.5 pb-1', isOwn ? 'flex-row-reverse' : '')}>
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
              );
            })}

            {/* Typing indicator */}
            {isOtherTyping && (
              <div className="flex items-end gap-2 justify-start">
                <div className="w-8 flex-shrink-0">
                  <Avatar
                    name={conversation.other_participant?.name || 'User'}
                    src={conversation.other_participant?.avatar}
                    size="sm"
                  />
                </div>
                <TypingIndicator />
              </div>
            )}
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

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
import { ArrowLeft, Pencil, Trash2, Check, X, MoreVertical, Paperclip, MessageSquare, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import type {
  GolfConversationWithMeta,
  MessageWithReadStatus,
} from '@/hooks/golf/use-golf-messages';
import { Avatar } from '@/components/fairway/controls/avatar';
import { IconButton } from '@/components/fairway/controls/button';
import { EmptyState } from '@/components/fairway/feedback';
import { InstrumentPanel } from '@/components/fairway/instrument';
import { Inset } from '@/components/fairway/surfaces/surface';

export interface MessageThreadPaneProps {
  /** The open conversation (page-owned selection), or null on desktop no-select. */
  conversation: GolfConversationWithMeta | null;
  /** Messages from the unchanged useGolfMessages() hook. */
  messages: MessageWithReadStatus[];
  loading: boolean;
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

export function MessageThreadPane({
  conversation,
  messages,
  loading,
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
  children,
  className,
}: MessageThreadPaneProps & { children?: React.ReactNode }) {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages — ONLY when near the bottom.
  // PRESERVES the legacy near-bottom check (scrollTop + clientHeight >= scrollHeight - 100).
  React.useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // HONEST-EMPTY (c): no thread selected (desktop) → dim prompt.
  if (!conversation) {
    return (
      <InstrumentPanel
        as="section"
        depth="raised"
        padding="none"
        aria-label="Conversation"
        className={cn('flex min-h-[60vh] flex-col overflow-hidden', className)}
      >
        <div className="flex flex-1 items-center justify-center bg-surface px-4 py-5">
          <EmptyState
            variant="subtle"
            icon={MessageSquare}
            title="Select a conversation"
            description="Choose a conversation from the list to start messaging."
            action={
              <button
                type="button"
                onClick={onNewMessage}
                className={cn(
                  'inline-flex min-h-[36px] items-center gap-2 rounded-full px-4 py-1.5',
                  'bg-accent-500 font-fw-sans text-[13px] font-medium text-text-on-accent shadow-flat',
                  'outline-none transition-all duration-200 hover:bg-accent-600 hover:shadow-soft',
                  'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                )}
              >
                New message
              </button>
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
  const headerSubtitle = isGroup
    ? 'Group conversation'
    : conversation.other_participant?.subtitle || '';

  return (
    <InstrumentPanel
      as="section"
      depth="raised"
      padding="none"
      aria-label="Conversation"
      className={cn('flex min-h-[60vh] flex-col overflow-hidden', className)}
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
          <p className="truncate font-fw-sans text-body font-medium text-text-primary">{headerName}</p>
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

              return (
                <div
                  key={msg.id}
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
                        <Avatar
                          name={isGroup ? msg.sender_id.slice(0, 8) : conversation.other_participant?.name || 'User'}
                          src={isGroup ? undefined : conversation.other_participant?.avatar}
                          size="sm"
                        />
                      ) : null}
                    </div>
                  )}

                  <div className={cn('group relative flex max-w-[70%] flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
                    {/* Sender name above first incoming bubble */}
                    {!isOwn && isFirstInGroup && (
                      <span className="ml-1 font-fw-sans text-eyebrow font-medium text-text-tertiary">
                        {conversation.other_participant?.name || 'User'}
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
                        <span className="mr-1 font-fw-sans text-eyebrow text-fw-danger">Delete?</span>
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
                        <textarea
                          value={editContent}
                          onChange={(e) => onEditContentChange(e.target.value)}
                          className="w-full min-w-[200px] resize-none bg-transparent font-fw-sans text-body-sm text-text-primary focus:outline-none"
                          rows={Math.min(5, editContent.split('\n').length || 1)}
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
                        />
                        <div className="mt-2 flex items-center justify-end gap-1 border-t border-accent-200 pt-2">
                          <button
                            type="button"
                            onClick={onCancelEdit}
                            disabled={isEditSaving}
                            className="rounded px-2 py-1 font-fw-sans text-eyebrow text-text-tertiary transition-colors hover:text-text-secondary disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={onSaveEdit}
                            disabled={isEditSaving || !editContent.trim()}
                            className={cn(
                              'rounded px-2 py-1 font-fw-sans text-eyebrow transition-colors',
                              isEditSaving || !editContent.trim()
                                ? 'cursor-not-allowed text-text-tertiary'
                                : 'text-accent-700 hover:bg-accent-100',
                            )}
                          >
                            {isEditSaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Bubble — normal mode. own = accent tint, other = sunken matte.
                      <div
                        className={cn(
                          'px-4 py-2.5',
                          isOwn
                            ? 'bg-accent-500 text-text-on-accent'
                            : 'bg-surface-sunken text-text-primary',
                          isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-fw-lg rounded-br-sm' : 'rounded-fw-lg rounded-bl-sm'),
                          isFirstInGroup && !isLastInGroup && 'rounded-fw-lg',
                          !isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-fw-lg rounded-tr-md rounded-br-sm' : 'rounded-fw-lg rounded-tl-md rounded-bl-sm'),
                          !isFirstInGroup && !isLastInGroup && 'rounded-fw-md',
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words font-fw-sans text-body-sm leading-relaxed">
                          {decodeMessageContent(msg.content)}
                        </p>
                        {/* Attachment affordance — DORMANT unless has_attachments. */}
                        {hasAttachments ? (
                          <span className={cn('mt-1 inline-flex items-center gap-1 font-fw-sans text-eyebrow', isOwn ? 'text-text-on-accent/80' : 'text-text-tertiary')}>
                            <Paperclip size={12} aria-hidden="true" />
                            Attachment
                          </span>
                        ) : null}
                        {/* Edited badge — DORMANT unless edited_at. */}
                        {editedAt ? (
                          <span className={cn('mt-1 block font-fw-sans text-eyebrow', isOwn ? 'text-text-on-accent/70' : 'text-text-tertiary')}>
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
                      {isOwn && <ReadReceipt isRead={(msg as MessageWithReadStatus).isRead} />}
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

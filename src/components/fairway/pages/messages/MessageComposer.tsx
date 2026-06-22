'use client';

/**
 * ============================================================================
 * Fairway · messages · MessageComposer — the "what's-next" composer track
 * ----------------------------------------------------------------------------
 * The WHAT'S-NEXT section of the two-pane inbox: a sunken matte composer track
 * (mirrors AskThreadPane's `border-t bg-surface-sunken` composer slot). It is a
 * pure PRESENTATION re-skin of the legacy `MessageInput` — the behavior is
 * PRESERVED byte-for-byte in intent:
 *   • auto-resize textarea (height clamps 40→120px on the message value)
 *   • throttled typing broadcast (onTyping(true) + 2s stop timeout), cleared on
 *     unmount and before send (the exact legacy throttle contract)
 *   • Enter-to-send / Shift+Enter newline
 *   • AttachmentButton + AttachmentPreview (REUSED UNCHANGED) — pending files
 *     map to PendingAttachment exactly as the legacy page did; previews' object
 *     URLs are revoked on remove + after a successful send
 *   • send routes through onSendWithAttachments when files are pending, else
 *     onSend — the SAME branching the legacy page used (both wired to the
 *     unchanged hooks/actions by the parent)
 *
 * GOTCHA (spec §a): the send control is a NATIVE <button> with matte token
 * classes — NOT `Surface as="button"` — so the focal action stays a real button.
 * ========================================================================== */

import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AttachmentButton } from '@/components/golf/messages/AttachmentButton';
import { AttachmentPreview } from '@/components/golf/messages/AttachmentPreview';
import type { PendingAttachment } from '@/lib/storage/attachments';

/* ─── Length limit — mirrors sendMessageSchema (action-schemas.ts:42,
 *     content.max(5000)) so the field hard-prevents overflow (maxLength) and the
 *     counter matches the server constraint exactly. The counter only surfaces
 *     as the field nears its limit (Nielsen #5 error prevention). ─────────────── */
const MESSAGE_MAX = 5000;
/** Show the remaining-chars hint once the field is ≥90% of its max. */
const COUNTER_THRESHOLD = 0.9;

/** Subtle "N left" hint that only appears as the message nears its limit. */
function charsLeftHelp(value: string, max: number): string | undefined {
  if (value.length < max * COUNTER_THRESHOLD) return undefined;
  const left = max - value.length;
  return `${left.toLocaleString()} character${left === 1 ? '' : 's'} left`;
}

export interface MessageComposerProps {
  /** Send plain text (the unchanged useGolfMessages.sendMessage path). */
  onSend: (content: string) => Promise<boolean>;
  /** Send with attachments (the unchanged useMessageAttachments path). */
  onSendWithAttachments?: (content: string, attachments: PendingAttachment[]) => Promise<boolean>;
  /** Throttled typing broadcast (the unchanged useGolfMessages.sendTypingStatus). */
  onTyping?: (isTyping: boolean) => void;
}

export function MessageComposer({ onSend, onSendWithAttachments, onTyping }: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const attachmentIdCounter = useRef(0);

  // Auto-resize textarea (PRESERVED: clamp 40→120px on the message value).
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  // Typing status — PRESERVED throttle contract: broadcast true on input, set a
  // 2s timeout to stop; broadcast false when the field is cleared.
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setMessage(newValue);

    if (onTyping) {
      if (newValue.trim()) {
        onTyping(true);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          onTyping(false);
        }, 2000);
      } else {
        onTyping(false);
      }
    }
  };

  // Cleanup typing timeout on unmount (PRESERVED).
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // File selection → PendingAttachment (PRESERVED mapping from the legacy page).
  const handleFilesSelected = (files: File[]) => {
    const newAttachments: PendingAttachment[] = files.map(file => {
      attachmentIdCounter.current += 1;
      const isPreviewable = file.type.startsWith('image/') || file.type.startsWith('video/');
      return {
        id: `pending-${attachmentIdCounter.current}-${Date.now()}`,
        file,
        previewUrl: isPreviewable ? URL.createObjectURL(file) : '',
        metadata: {
          fileName: file.name,
          fileType: (file.type.startsWith('image/') ? 'image' :
            file.type.startsWith('video/') ? 'video' :
            file.type.startsWith('audio/') ? 'audio' : 'document') as 'image' | 'video' | 'audio' | 'document',
          mimeType: file.type,
          fileSize: file.size,
        },
        status: 'pending' as const,
        uploadProgress: 0,
      };
    });
    setPendingAttachments(prev => [...prev, ...newAttachments]);
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments(prev => {
      const removed = prev.find(a => a.id === id);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter(a => a.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasAttachments = pendingAttachments.length > 0;
    if ((!message.trim() && !hasAttachments) || sending) return;

    // Clear typing indicator before sending (PRESERVED).
    if (onTyping) {
      onTyping(false);
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    setSending(true);

    let success = false;
    if (hasAttachments && onSendWithAttachments) {
      success = await onSendWithAttachments(message.trim(), pendingAttachments);
    } else {
      success = await onSend(message.trim());
    }

    if (success) {
      pendingAttachments.forEach(a => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      setMessage('');
      setPendingAttachments([]);
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const canSend = (message.trim().length > 0 || pendingAttachments.length > 0) && !sending;
  const charsLeft = charsLeftHelp(message, MESSAGE_MAX);

  return (
    // Sunken matte composer track — mirrors AskThreadPane's composer slot.
    <form
      onSubmit={handleSubmit}
      className="border-t border-border-subtle bg-surface-sunken p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-4"
    >
      {/* Pending attachment previews — REUSED component, render only when present. */}
      {pendingAttachments.length > 0 && (
        <AttachmentPreview
          attachments={pendingAttachments}
          onRemove={handleRemoveAttachment}
          className="mb-2 rounded-fw-md"
        />
      )}

      <div
        className={cn(
          'flex items-end gap-2 rounded-fw-lg p-1.5',
          'border border-border-subtle bg-surface',
          'transition-colors duration-200',
          'focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-border-focus/30',
        )}
      >
        {/* Attachment trigger — REUSED UNCHANGED. */}
        <AttachmentButton
          onFilesSelected={handleFilesSelected}
          disabled={sending}
          className="mb-0.5 text-text-tertiary"
        />

        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          maxLength={MESSAGE_MAX}
          className={cn(
            'flex-1 resize-none bg-transparent px-2 py-2',
            'font-fw-sans text-base text-text-primary lg:text-body',
            'placeholder:text-text-tertiary focus:outline-none',
          )}
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />

        {/* GOTCHA §a: the send button is a NATIVE <button> with matte token
            classes — NOT a Surface as="button". ONE primary action. */}
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-fw-md md:h-10 md:w-10',
            'outline-none transition-all duration-200',
            'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            'active:scale-95 motion-reduce:active:scale-100',
            canSend
              ? 'bg-accent-500 text-text-on-accent shadow-flat hover:bg-accent-600 hover:shadow-soft'
              : 'cursor-not-allowed bg-surface-sunken text-text-tertiary',
          )}
        >
          {sending ? (
            <span className="flex items-center gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          ) : (
            <Send size={18} aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 px-2">
        <p className="font-fw-sans text-eyebrow text-text-tertiary">
          Press Enter to send, Shift+Enter for a new line.
        </p>
        {charsLeft && (
          <span
            className="flex-shrink-0 font-fw-sans text-eyebrow tabular-nums text-text-tertiary"
            aria-live="polite"
          >
            {charsLeft}
          </span>
        )}
      </div>
    </form>
  );
}

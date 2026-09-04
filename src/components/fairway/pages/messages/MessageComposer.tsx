'use client';

/**
 * ============================================================================
 * Fairway · messages · MessageComposer — the "what's-next" composer track
 * ----------------------------------------------------------------------------
 * The WHAT'S-NEXT section of the two-pane inbox: a flat attached composer band
 * separated from the thread by one quiet token hairline. It is a
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
import { Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fwHaptic } from '@/lib/fairway/haptics';
import { AttachmentButton } from '@/components/golf/messages/AttachmentButton';
import { AttachmentPreview } from '@/components/golf/messages/AttachmentPreview';
import type { PendingAttachment } from '@/lib/storage/attachments';
import { IconButton } from '@/components/fairway/controls/button';
import { PressTarget } from '@/components/fairway/controls/press-target';
import { useMediaQuery } from '@/hooks/use-media-query';

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
  return `${left.toLocaleString('en-US')} character${left === 1 ? '' : 's'} left`;
}

export interface MessageComposerProps {
  /** Send plain text (the unchanged useGolfMessages.sendMessage path). */
  onSend: (content: string) => Promise<boolean>;
  /** Send with attachments (the unchanged useMessageAttachments path). */
  onSendWithAttachments?: (content: string, attachments: PendingAttachment[]) => Promise<boolean>;
  /** Throttled typing broadcast (the unchanged useGolfMessages.sendTypingStatus). */
  onTyping?: (isTyping: boolean) => void;
  /**
   * §30: the message being replied to, if any. The composer only DISPLAYS it —
   * the page owns the state and passes the id to its own send handler, so the
   * composer keeps its "text in, promise out" contract and does not grow a
   * second way to send.
   */
  replyTo?: { name: string; preview: string } | null;
  /** Dismiss the reply preview without sending. */
  onCancelReply?: () => void;
}

export function MessageComposer({ onSend, onSendWithAttachments, onTyping, replyTo, onCancelReply }: MessageComposerProps) {
  const [message, setMessage] = useState('');
  // No `sending` state. §63: a normal text send must not turn the composer
  // into a loading indicator — the optimistic bubble already carries every
  // network state there is. Attachment UPLOAD progress still belongs on the
  // attachment preview, which owns it.
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const attachmentIdCounter = useRef(0);

  /* Enter-to-send is a HARDWARE-KEYBOARD affordance, and treating it as
   * universal cost phone users the ability to write a paragraph.
   *
   * The contract below is "Enter sends, Shift+Enter makes a new line" — but an
   * iOS software keyboard has no Shift+Enter. Its return key reports as plain
   * `Enter`, so on a phone the newline branch was unreachable and every attempt
   * at a second line sent the message instead. A player could not put a line
   * break in a team message at all (Doctrine Rule 7 — no desktop chrome on
   * phones — is the same rule the hint text below violates).
   *
   * `(pointer: fine)` is the honest test: it asks whether a real pointer (and
   * therefore a real keyboard) is driving, not how wide the screen is, so a
   * tablet with a keyboard case keeps Enter-to-send and a 1024px phone in
   * landscape does not. The hook's server snapshot is `false`, which lands on
   * the touch behavior during SSR — the correct default for the native iOS
   * target, and a state where Enter never silently sends.
   */
  const isPointerFine = useMediaQuery('(pointer: fine)');

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

  // Live mirror of the pending attachments, so the unmount cleanup below can
  // revoke them without taking `pendingAttachments` as a dependency (which
  // would re-run the cleanup on every add/remove instead of only on unmount).
  const pendingAttachmentsRef = useRef(pendingAttachments);
  pendingAttachmentsRef.current = pendingAttachments;

  // Cleanup on unmount: the typing timeout (PRESERVED), and any object URLs
  // still held by un-sent attachment previews.
  //
  // The URL revocation is new, and it is owed because the composer is now
  // keyed on the conversation (FairwayMessages.tsx) so that a draft cannot be
  // misdelivered to the next thread. That key makes unmount a ROUTINE event —
  // every conversation switch — where before it happened only when the whole
  // page went away. Previews were revoked on remove and after a successful
  // send, so a picked-but-never-sent photo would now leak its blob on each
  // switch.
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      for (const attachment of pendingAttachmentsRef.current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
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

  /**
   * §19: NETWORK STATE LIVES ON THE MESSAGE, NOT ON THE SEND BUTTON.
   *
   * This used to `setSending(true)`, `await` the send, and only then clear the
   * field — so the text a player had already committed to sat in the composer
   * for the entire round trip while the send button ran a bouncing-dot loader.
   * That is form-submission feedback, and it is the single reason sending felt
   * like a web app: the user had said the thing, and the interface was still
   * holding it.
   *
   * The composer clears in the SAME tick as the commit now. The optimistic
   * bubble is the feedback — it is already on screen, and `sending / sent /
   * read / failed` belong to it.
   *
   * Failure is NOT handled here any more. The message stays in the thread as a
   * failed bubble with Retry (§29/§30) — restoring the text to the composer as
   * well would put the same words in two places, and the one in the thread is
   * the one the user is looking at. Attachments are the exception: they cannot
   * live on an optimistic bubble, so a failed attachment send does come back.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasAttachments = pendingAttachments.length > 0;
    const text = message.trim();
    if (!text && !hasAttachments) return;

    // Clear typing indicator before sending (PRESERVED).
    if (onTyping) {
      onTyping(false);
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // ── The commit tick: clear before any await touches the network. ────────
    const outgoingAttachments = pendingAttachments;
    setMessage('');
    setPendingAttachments([]);
    // Collapse the field back to one line in the same frame; letting it stay
    // tall after a multi-line send leaves a hole where the text used to be.
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    fwHaptic('light');

    const success =
      hasAttachments && onSendWithAttachments
        ? await onSendWithAttachments(text, outgoingAttachments)
        : await onSend(text);

    if (success) {
      outgoingAttachments.forEach(a => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      return;
    }

    // Attachments only, and never over something the user has since attached:
    // a failed photo has no optimistic bubble to live on, so the composer is
    // the only place it can wait for a retry.
    if (hasAttachments) {
      setPendingAttachments(prev => (prev.length > 0 ? prev : outgoingAttachments));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Touch keyboards fall through to the textarea's native newline; the send
    // button is the only send affordance there. See `isPointerFine` above.
    if (!isPointerFine) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Deliberately NOT gated on an in-flight send: §20 wants the composer ready
  // for the next message at ~150ms, and a `sending` gate makes two quick
  // messages impossible. An empty field is the only thing that disables send,
  // and clearing on commit means a double-tap cannot double-send.
  const canSend = message.trim().length > 0 || pendingAttachments.length > 0;
  const charsLeft = charsLeftHelp(message, MESSAGE_MAX);

  return (
    // Composer chrome is allowed to float: the canvas remains flat, while the
    // control the player is actively touching gets a clear physical layer.
    <form
      onSubmit={handleSubmit}
      className={cn(
        'fw-message-composer relative z-10 border-t border-border-subtle px-3 pt-2.5',
        'pb-[calc(0.5rem+env(safe-area-inset-bottom))] [.keyboard-open_&]:pb-2.5 lg:pb-2.5',
      )}
    >
      {/* §30 reply preview. Above the field, inside the composer's own track,
          an inline two-pixel rule and two lines of copy — not another rounded
          container inside the composer. Dismiss is a 44px target: it is the
          only way out of reply mode and sits next to a send button. */}
      {replyTo ? (
        <div className="mb-2 flex min-h-11 items-center gap-2 border-l-2 border-accent-600 pl-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-fw-sans text-caption font-semibold text-accent-700">
              Replying to {replyTo.name}
            </p>
            <p className="truncate font-fw-sans text-caption text-text-secondary">
              {replyTo.preview}
            </p>
          </div>
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Cancel reply"
            onClick={onCancelReply}
          >
            <X size={16} aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}

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
          // §22: radius 20px (was 28 — a composer is a field, not a sheet),
          // and ONE focus treatment. It used to draw a colour-shifted border
          // AND a 2px ring: two concentric rounded rectangles around a field
          // that already sits inside a bordered track. The border alone says
          // "focused" perfectly well and is what the spec means by "no giant
          // green ring".
          'flex items-end gap-2 rounded-card p-1.5',
          'fw-message-composer-field border',
          'transition-[border-color,box-shadow] duration-150',
          'focus-within:border-accent-400 focus-within:shadow-raise',
        )}
      >
        {/* Attachment trigger — REUSED UNCHANGED. */}
        <AttachmentButton
          onFilesSelected={handleFilesSelected}
          className="mb-0.5 text-text-tertiary"
        />

        {/* The native textarea owns IME, selection, and touch-keyboard newline
            behavior; the surrounding Fairway track owns its visual state. */}
        {/* eslint-disable-next-line helm/no-raw-input */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          maxLength={MESSAGE_MAX}
          className={cn(
            'flex-1 resize-none rounded-none border-0 bg-transparent px-2 py-2 min-h-0',
            'font-fw-sans text-base text-text-primary lg:text-body',
            // The TRACK owns the focus treatment, not the field. The legacy
            // `ui/input.tsx` Textarea carries its own
            // `focus-visible:ring-2 ... ring-offset-2`, and this only
            // neutralised the `focus:` variant — so focusing the composer drew
            // the container's `focus-within` ring AND a second offset ring
            // around the field inside it. Two nested rounded rectangles, which
            // is the control-level version of a card inside a card.
            'placeholder:text-text-tertiary focus:outline-none focus:ring-0',
            'focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-transparent',
          )}
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />

        {/* PressTarget provides the native button semantics without adding a
            second pill surface around the visible 36px send affordance. */}
        <PressTarget
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            // §22: the HIT TARGET stays 44px; the VISIBLE circle is 36. They
            // were the same object before, which is why the send button read as
            // an oversized tile. §50: name the properties — `transition-all`
            // on a control pressed this often animates layout too.
            'flex h-11 w-11 min-h-0 flex-shrink-0 items-center justify-center rounded-full bg-transparent p-0',
            'outline-none hover:bg-transparent',
            'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            // §50: name the property. `transition-all` on a control pressed
            // this often animates layout as well as paint.
            'transition-transform duration-150 active:scale-95 motion-reduce:active:scale-100',
            !canSend && 'cursor-not-allowed',
          )}
        >
          {/* §22: the hit target is the 44px PressTarget; the VISIBLE control is
              this 36px circle. They used to be the same box, which is why send
              read as an oversized tile rather than a send button. */}
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150',
              canSend
                ? 'bg-accent-650 text-text-on-accent'
                : 'bg-surface-sunken text-text-tertiary',
            )}
          >
            <Send size={18} aria-hidden="true" />
          </span>
        </PressTarget>
      </div>

      {/* The hint describes keys a touch keyboard does not have, so it is
          pointer-gated rather than always-on (Doctrine Rule 7). The whole row
          is gated too — an empty flex row still costs `mt-1.5` of the little
          vertical space a phone composer has, and on mobile the counter is
          usually the only occupant. `ml-auto` keeps the counter right-aligned
          once the hint beside it is gone. */}
      {charsLeft ? (
        <div className="mt-1.5 flex items-center justify-end px-2">
          <span
            className="font-fw-sans text-eyebrow tabular-nums text-text-tertiary"
            aria-live="polite"
          >
            {charsLeft}
          </span>
        </div>
      ) : isPointerFine ? (
        <p className="mt-1.5 hidden px-2 font-fw-sans text-eyebrow text-text-tertiary md:block">
          Press Enter to send, Shift+Enter for a new line.
        </p>
      ) : null}
    </form>
  );
}

'use client';

/**
 * ============================================================================
 * Fairway · messages · MessageComposer — the "what's-next" composer track
 * ----------------------------------------------------------------------------
 * A compact footer with one writing track and one bottom safe-area inset. It is a
 * pure PRESENTATION re-skin of the legacy `MessageInput` — the behavior is
 * PRESERVED byte-for-byte in intent:
 *   • auto-resize textarea (grows to five MEASURED lines — G-22)
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

import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, Loader2, Send } from 'lucide-react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AttachmentButton } from '@/components/golf/messages/AttachmentButton';
import { AttachmentPreview } from '@/components/golf/messages/AttachmentPreview';
import type { PendingAttachment } from '@/lib/storage/attachments';
import { Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';

/* ─── Length limit — mirrors sendMessageSchema (action-schemas.ts:42,
 *     content.max(5000)) so the field hard-prevents overflow (maxLength) and the
 *     counter matches the server constraint exactly. The counter only surfaces
 *     as the field nears its limit (Nielsen #5 error prevention). ─────────────── */
const MESSAGE_MAX = 5000;

/**
 * How far the field grows before it scrolls (§9.4).
 *
 * Five LINES, computed from the element's own line-height at render — not a
 * pixel constant. The old clamp was a hardcoded 120px, which is exactly five
 * lines of 24px content and therefore about 4.3 lines once `py-2`'s 16px of
 * padding is counted, at the default text size. Every step up from there — a
 * browser zoom, an OS text-size setting, iOS Dynamic Type — took another
 * fraction of a line away, which is the case §9.4 exists to protect.
 */
const MAX_VISIBLE_LINES = 5;

/**
 * The height at which the field should stop growing, in CSS pixels.
 *
 * Reads the resolved style rather than the class list, so it is correct
 * whatever is actually painting: the `text-base` / `lg:text-body` switch, a
 * user stylesheet, or a zoom level. Two details that are easy to get wrong:
 *
 *   • `line-height: normal` computes to the string "normal", not a number.
 *     `parseFloat` gives NaN, and NaN silently poisons the max — the field
 *     would then never stop growing. The fallback is the ratio browsers use
 *     for `normal` on a Latin font, which is approximate on purpose: it is a
 *     fallback for a value the platform declined to resolve.
 *   • Padding and border count only under `border-box`, where `height`
 *     includes them. Adding them under `content-box` would overshoot by
 *     exactly the padding, which is the same class of mistake as the constant
 *     this replaces.
 */
function maxHeightForLines(el: HTMLTextAreaElement, lines: number): number {
  const cs = window.getComputedStyle(el);
  const lineHeight = parseFloat(cs.lineHeight);
  const resolvedLineHeight = Number.isFinite(lineHeight)
    ? lineHeight
    : parseFloat(cs.fontSize) * 1.2;
  const box =
    cs.boxSizing === 'border-box'
      ? parseFloat(cs.paddingTop) +
        parseFloat(cs.paddingBottom) +
        parseFloat(cs.borderTopWidth) +
        parseFloat(cs.borderBottomWidth)
      : 0;
  return resolvedLineHeight * lines + (Number.isFinite(box) ? box : 0);
}
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
  /**
   * Send with attachments (the unchanged useMessageAttachments path).
   *
   * The third argument is the transfer signal (G-09a). `useMessageAttachments`
   * has ACCEPTED an `onProgress(attachmentId, progress)` since it was written,
   * and threads it into `uploadAttachment` per file — but no caller ever
   * supplied one, so `AttachmentPreview`'s percentage and bar rendered the
   * `uploadProgress: 0` written at staging and never moved again. Optional, so
   * the G-21 refusal case and any caller that does not want the signal stay
   * assignable.
   */
  onSendWithAttachments?: (
    content: string,
    attachments: PendingAttachment[],
    onProgress?: (attachmentId: string, progress: number) => void,
    signal?: AbortSignal,
  ) => Promise<boolean>;
  /** Throttled typing broadcast (the unchanged useGolfMessages.sendTypingStatus). */
  onTyping?: (isTyping: boolean) => void;
  /**
   * Who this thread is with (G-47). The artboard writes "Message Cole", not a
   * generic instruction — the field says who is about to hear you, which is
   * the one thing a composer can tell you that the thread above it cannot
   * once it has scrolled.
   *
   * Optional, and the fallback is the old generic string: a caller that has
   * no name to give must not render "Message undefined".
   */
  recipientName?: string;
}

export function MessageComposer({
  onSend,
  onSendWithAttachments,
  onTyping,
  recipientName,
}: MessageComposerProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  /**
   * A failure the THREAD cannot report, because nothing was recorded there.
   *
   * The two send paths behave differently and G-20a turns on the difference
   * (traced in the ledger). `onSend` reaches `useGolfMessages.sendMessage`,
   * which pushes an optimistic row BEFORE anything can throw, so every text
   * failure ends up as a muted bubble with its own Retry (G-19) — the thread
   * owns it and the composer must get out of the way. `onSendWithAttachments`
   * reaches `useMessageAttachments`, which creates no optimistic row at all:
   * on failure there is a toast and nothing else, and the message exists
   * nowhere but in this field. That is the artboard's "Didn't send" state, and
   * it is the only case this banner is for.
   *
   * `retryable` separates the two things that can land here. A failed
   * attachment send can be tried again with exactly what is still staged; the
   * G-21 refusal (no attachment-capable handler) cannot — retrying a missing
   * prop just refuses again.
   */
  const [sendError, setSendError] = useState<{ text: string; retryable: boolean } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const attachmentIdCounter = useRef(0);
  /**
   * True while an IME (Japanese, Chinese, Korean, Vietnamese …) is composing
   * into the textarea, and for the remainder of the tick in which composition
   * ended (G-23).
   *
   * Enter is the key an IME uses to COMMIT a candidate, so an unguarded
   * Enter-to-send fires mid-word and sends a fragment. The guard reads three
   * signals because no single one covers every engine:
   *
   *   • `nativeEvent.isComposing` — the standard, and correct on Chromium and
   *     Gecko, which fire the commit keydown while composition is still open.
   *   • `keyCode === 229` — the legacy signal the same engines set, and the
   *     only one some Android WebViews set. Deprecated, and the reason it is
   *     still here: it is what an engine that omits `isComposing` reports.
   *   • this ref — WebKit ends composition BEFORE dispatching the commit
   *     keydown, so on Safari the other two are already false by then. The ref
   *     is therefore cleared on a macrotask rather than synchronously, which
   *     swallows exactly that one keydown and nothing a human could type next.
   *
   * Note the neighbouring `isPointerFine` guard means this only matters on a
   * hardware keyboard — which is also the only place an IME candidate window
   * and Enter-to-send coexist.
   */
  const isComposingRef = useRef(false);
  /**
   * The in-flight attachment send, and whether the user is the one who ended
   * it (G-24).
   *
   * One controller for the whole send, because the message is the unit: a
   * message cannot be committed with some of its attachments, so stopping one
   * upload abandons the send and hands the draft back. `cancelledByUser` is
   * what keeps the "Couldn't send" banner off the screen afterwards — the
   * failure branch cannot otherwise tell a refusal from a deliberate stop, and
   * announcing a failure to the person who caused it is noise.
   */
  const sendAbortRef = useRef<AbortController | null>(null);
  const cancelledByUserRef = useRef(false);
  /**
   * Whether the field has outgrown one line (G-47).
   *
   * The track was hardcoded `items-end`, which on a single-line composer
   * pushes the clip and send controls to the bottom of a row they are the
   * full height of — visually a hair low against a centred caret. The
   * artboard bottom-aligns only once the field has grown
   * (`Composer.dc.html:56` adds `align-items: flex-end` on the GROWN state
   * only); at rest everything is centred. Measured, not guessed at from the
   * character count, because whether the text wraps depends on the width.
   */
  const [isGrown, setIsGrown] = useState(false);
  const compositionClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const showKeyboardHint = useMediaQuery('(min-width: 768px) and (pointer: fine)');

  /**
   * Auto-resize to at most five measured lines (G-22).
   *
   * `maxHeight` is written here rather than left in the inline style, because
   * a CSS cap would clamp the field back down regardless of what this
   * computes — the constant would still be in charge, just quieter.
   */
  const resizeToContent = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = maxHeightForLines(el, MAX_VISIBLE_LINES);
    el.style.maxHeight = `${max}px`;
    const next = Math.min(el.scrollHeight, max);
    el.style.height = `${next}px`;
    // One line's worth of box is the resting height. Anything above it means
    // the text has wrapped, which is when the artboard bottom-aligns.
    setIsGrown(next > maxHeightForLines(el, 1) + 0.5);
  }, []);

  useEffect(() => {
    resizeToContent();
  }, [message, resizeToContent]);

  /**
   * Text size can change without a keystroke — a browser zoom, an OS text-size
   * setting, a font finishing its load. All of them fire a resize, and without
   * this the field would keep a cap measured against type it is no longer
   * rendering.
   */
  useEffect(() => {
    window.addEventListener('resize', resizeToContent);
    return () => window.removeEventListener('resize', resizeToContent);
  }, [resizeToContent]);

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
      if (compositionClearTimerRef.current) {
        clearTimeout(compositionClearTimerRef.current);
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
    // Read from the rendered state rather than inside the updater: the two
    // effects below (revoking an object URL, aborting a transfer) must happen
    // once, and React is free to call an updater more than once.
    const removed = pendingAttachments.find(a => a.id === id);
    if (removed?.previewUrl) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    // G-24 — the X on a tile that is mid-transfer is a CANCEL, and used to be
    // a lie: it took the tile off screen while the bytes kept going, so the
    // file finished uploading, the send carried it anyway (the handler holds
    // its own captured array), and the user got a message containing a photo
    // they had just removed.
    if (removed?.status === 'uploading') {
      cancelledByUserRef.current = true;
      sendAbortRef.current?.abort();
    }
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
  };

  /**
   * Remove exactly what was sent from the field, and nothing else (§9.3).
   *
   * A blanket `setMessage('')` discards anything typed during the round trip —
   * on a slow phone that is a whole second sentence, silently gone the moment
   * the first one lands. Shared by the success path and the text-failure path
   * because both are letting go of the same `sentRaw` for the same reason.
   */
  const dropSent = (sentRaw: string) => (prev: string) => {
    if (prev === sentRaw) return '';
    if (prev.startsWith(sentRaw)) return prev.slice(sentRaw.length);
    // Edited mid-flight beyond a simple append: keep every character rather
    // than guess which ones were theirs to lose.
    return prev;
  };

  /**
   * Route one file's transfer progress onto its own staged tile (G-09a).
   *
   * Monotonic on purpose. An upload reports per chunk, and a transport that
   * re-sends one can re-announce a lower byte count — on screen that is a bar
   * sliding backwards, the one thing a progress indicator must never do.
   * Clamped for the same reason in the other direction: a transport that
   * overshoots its own total cannot paint past the end of the track.
   */
  const reportProgress = (attachmentId: string, progress: number) => {
    const next = Math.max(0, Math.min(100, Math.round(progress)));
    setPendingAttachments(prev =>
      prev.map(a =>
        a.id === attachmentId
          ? { ...a, uploadProgress: Math.max(a.uploadProgress, next) }
          : a,
      ),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitSend();
  };

  /**
   * The send itself, separated from the form event so the failure banner's
   * Retry can re-run it against whatever is still staged. That IS the retry on
   * this path: `useMessageAttachments` persisted no id, so there is no row to
   * re-send the way `useGolfMessages.retryMessage` does — the draft and the
   * pending files in this component are the only record of the attempt, which
   * is what the artboard's "the text is never lost" caption is describing.
   */
  const submitSend = async () => {
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
    setSendError(null);
    cancelledByUserRef.current = false;
    const abortController = new AbortController();
    sendAbortRef.current = abortController;

    // Capture EXACTLY what is being sent, before the round trip. The textarea
    // stays enabled while a send is in flight — deliberately, so a slow network
    // never blocks typing — which means `message` can grow underneath us.
    const sentRaw = message;

    let success = false;
    if (hasAttachments) {
      // G-21 — FAIL CLOSED. This used to be `if (hasAttachments &&
      // onSendWithAttachments) { … } else { onSend(text) }`, so a missing
      // handler fell through to the text-only path: the message went, the
      // files were silently dropped, and the send reported success. §1.1 names
      // silent attachment omission as the risk to design against, and a
      // fallback that quietly delivers a lesser message is the worst shape for
      // it — nothing on screen says the photo did not go.
      //
      // Latent rather than live: the production call site always passes the
      // handler. Refusing costs nothing there and removes the failure mode.
      if (!onSendWithAttachments) {
        setSendError({
          text: 'Attachments can’t be sent from here. Your message was not sent.',
          retryable: false,
        });
        setSending(false);
        return;
      }
      // G-09a — the bar starts when the transfer does, not before. Everything
      // staged moves to `uploading` in one write, so the tiles switch from
      // their idle state to a 0% bar at the instant the upload begins; the
      // per-file callback below moves each one from there.
      setPendingAttachments(prev =>
        prev.map(a => ({ ...a, status: 'uploading' as const, uploadProgress: 0 })),
      );
      success = await onSendWithAttachments(
        sentRaw.trim(),
        pendingAttachments,
        reportProgress,
        abortController.signal,
      );
    } else {
      success = await onSend(sentRaw.trim());
    }

    if (success) {
      pendingAttachments.forEach(a => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      setMessage(dropSent(sentRaw));
      setPendingAttachments([]);
    } else if (hasAttachments) {
      // G-09a — the tiles cannot keep the position they died at. Whatever
      // fraction was on screen when the send failed is now a claim about a
      // transfer that is not happening, and Retry restarts the upload from the
      // first byte, so the tiles go back to staged rather than freezing.
      setPendingAttachments(prev =>
        prev.map(a => ({ ...a, status: 'pending' as const, uploadProgress: 0 })),
      );
      // G-20a — the artboard's sixth state. Nothing reached the thread on this
      // path, so a toast that fades is the message's only trace: the banner is
      // what makes the failure recoverable instead of merely announced. The
      // draft and the staged files stay exactly where they are.
      // …but not when the user is the one who stopped it (G-24). They pressed
      // the control; the draft and the remaining files are back in front of
      // them; a banner reporting a failure here would be announcing their own
      // decision back at them.
      if (!cancelledByUserRef.current) {
        setSendError({ text: 'Couldn’t send — check your connection.', retryable: true });
      }
    } else {
      // G-20a — the text path failed, and `useGolfMessages` already put the
      // message in the thread as a muted bubble with its own Retry (G-19). If
      // the composer also kept the draft the same sentence would be on screen
      // TWICE, in two places offering two different retries. The thread owns
      // it; the field lets go of it.
      setMessage(dropSent(sentRaw));
    }
    sendAbortRef.current = null;
    setSending(false);
  };

  const handleCompositionStart = () => {
    if (compositionClearTimerRef.current) {
      clearTimeout(compositionClearTimerRef.current);
      compositionClearTimerRef.current = null;
    }
    isComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    // Deferred, not synchronous — see isComposingRef.
    if (compositionClearTimerRef.current) clearTimeout(compositionClearTimerRef.current);
    compositionClearTimerRef.current = setTimeout(() => {
      isComposingRef.current = false;
      compositionClearTimerRef.current = null;
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Touch keyboards fall through to the textarea's native newline; the send
    // button is the only send affordance there. See `isPointerFine` above.
    if (!isPointerFine) return;
    // An IME is mid-word: this Enter commits a candidate, it does not send
    // (G-23). See isComposingRef for why all three signals are read.
    if (
      isComposingRef.current ||
      (e.nativeEvent as KeyboardEvent).isComposing ||
      e.keyCode === 229
    ) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const canSend = (message.trim().length > 0 || pendingAttachments.length > 0) && !sending;
  const charsLeft = charsLeftHelp(message, MESSAGE_MAX);

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border-subtle bg-surface px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] [.keyboard-open_&]:pb-2 lg:pb-3"
    >
      <div>
      {/* G-20a — the "Didn't send" banner, ABOVE the track, which is where
          `Composer.dc.html:140-149` draws it. Below the track (where the G-21
          refusal used to whisper in secondary ink) it read as a footnote to a
          field that still looked ready; above it, it is the first thing between
          the thread and the words you are about to lose.

          Numbers from the artboard: `padding: 8px 12px` → `px-3 py-2`,
          `border-radius: 0.875rem` → `rounded-fw-md` (14px, exact), `gap: 9px`
          → `gap-2` (1px absorbed), 12px text → `text-caption` (12px/18px
          against the artboard's 17px — one line, so a 1px leading delta does
          not compound the way G-29's per-line 2px did).

          The ink is A03 entry #3: `oklch(0.505 0.19 27)` is a genuinely
          unmapped third step between `--fw-color-danger` and
          `--fw-color-danger-ink`. `fw-danger-ink` ships as the interim, paired
          with `fw-danger-bg` because that pairing is the one the token file
          actually contrast-measured (7.27:1 on the light wash) — an approximated
          8%-alpha tint under a borrowed ink would be a guess at both. */}
      {sendError && (
        <div
          role="alert"
          className="mb-2 flex items-center gap-2 rounded-fw-md bg-fw-danger-bg px-3 py-2"
        >
          <AlertCircle size={16} className="flex-shrink-0 text-fw-danger-ink" aria-hidden="true" />
          <p className="min-w-0 flex-grow font-fw-sans text-caption text-fw-danger-ink">
            {sendError.text}
          </p>
          {sendError.retryable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { void submitSend(); }}
              disabled={sending}
              className="min-h-0 flex-shrink-0 rounded px-2 py-1 font-fw-sans text-caption font-semibold text-fw-danger-ink hover:bg-fw-danger-ink/10"
            >
              Retry
            </Button>
          )}
        </div>
      )}

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
          // G-47 — `.track`: gap 8px (`gap-2`, exact), radius 1.75rem
          // (`rounded-fw-lg`, exact — M03C already confirmed this one), and
          // `padding: 5px 5px 5px 12px`. `p-1.5` is 6px, 1px over on three
          // sides and absorbed; the 12px opening on the left is `pl-3` and
          // exact, because that gutter is what stops the clip icon sitting on
          // the track's edge.
          'flex gap-2 rounded-fw-lg p-1.5 pl-3',
          // Centred at rest, bottom-aligned once the text wraps — the
          // artboard adds `align-items: flex-end` on the GROWN state only.
          isGrown ? 'items-end' : 'items-center',
          'border border-border-subtle bg-elevated shadow-flat',
          'transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none',
          // G-45 / D-05 — the artboard's glow GEOMETRY on the token's COLOUR.
          //
          // The decision is frozen in `audit/DECISIONS.md`: the artboard's
          // two-layer soft glow is adopted, its `accent-500` literal is not.
          // `design-tokens.css:150-165` is why — accent-500 on the warm canvas
          // measures ~2.67:1 against WCAG 2.2's 3:1 non-text minimum, and the
          // token was moved to accent-600 precisely because 175 call sites
          // reaching for `ring-border-focus` were "drawing a ring nobody with
          // low vision could reliably find". `focus-within:border-accent-500`
          // was one of them, and copying the artboard's literal would have
          // re-opened a closed accessibility defect.
          //
          // It is also THEME-DEPENDENT, which is the part the lane missed and
          // the reason this must stay a token: dark theme keeps accent-500 on
          // purpose (`design-tokens.css:512`), where it is the LIGHTER green
          // and the one that earns contrast against a dark ground. A literal
          // would be wrong in exactly one theme, whichever one it was picked
          // for.
          //
          // Geometry, from `Composer.dc.html:24`'s `.track-on`: a 1px ring at
          // 30% and a 4px ring at 10%. The inner layer is the BORDER that is
          // already there rather than a ring outside it — same 1px of weight,
          // and no 1px of layout shift the moment the field takes focus. The
          // outer layer is the only new box-shadow, written through the same
          // `color-mix(in oklab, …)` the Tailwind alpha bridge itself emits
          // (`tailwind.config.ts:38`), so both layers resolve from one token.
          'focus-within:border-border-focus/30',
          'focus-within:[box-shadow:0_0_0_4px_color-mix(in_oklab,var(--fw-color-border-focus)_10%,transparent)]',
        )}
      >
        {/* Attachment trigger — REUSED UNCHANGED. */}
        <AttachmentButton
          onFilesSelected={handleFilesSelected}
          disabled={sending}
          className="mb-0.5 text-text-tertiary"
        />

        <Textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={recipientName ? `Message ${recipientName}` : 'Type a message…'}
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
          /* No `maxHeight` here — it is measured and written by
           * `resizeToContent` (G-22). `minHeight` stays a constant: it is the
           * control's resting height, which is composer geometry and belongs
           * to G-47, not to the growth rule §9.4 is about. */
          style={{ minHeight: '40px' }}
        />

        {/* GOTCHA §a: the send button is a NATIVE <button> with matte token
            classes — NOT a Surface as="button". ONE primary action. */}
        <Button
          type="submit"
          variant="ghost"
          disabled={!canSend}
          aria-busy={sending || undefined}
          aria-label={sending ? 'Sending message' : 'Send message'}
          className={cn(
            // G-47 — a 40px CIRCLE at every width, with a 44px tap target
            // around it.
            //
            // Two separate corrections. `rounded-fw-md` (14px) made the focal
            // action a rounded square; the artboard's `.send` is
            // `border-radius: 9999px`, which is what `--fw-radius-full`'s own
            // token comment reserves for "primary CTAs".
            //
            // And the mobile size was 44px VISIBLE (`h-11 w-11`), which
            // inverts §9.1's own split: it asks for a 40px circle with a 44px
            // hit area, and the code grew the circle instead of the tap zone.
            // The `after:` overlay is the tap zone — `-inset-0.5` is 2px on
            // each side, so 40 + 4 = 44 exactly, invisible, and it does not
            // move a single pixel of what is drawn.
            'relative flex h-10 w-10 min-h-0 flex-shrink-0 items-center justify-center rounded-full p-0',
            'after:absolute after:-inset-0.5 after:rounded-full after:content-[\'\']',
            'outline-none transition-[color,background-color,box-shadow,transform] duration-200',
            'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            'active:scale-95 motion-reduce:active:scale-100',
            canSend
              ? 'bg-accent-650 text-text-on-accent shadow-flat hover:bg-accent-750 hover:shadow-soft'
              : 'cursor-not-allowed bg-surface-sunken text-text-tertiary',
          )}
        >
          {/* A ring, not three bouncing dots. Two defects, and only one was
              cosmetic.

              The a11y one: the dots were `aria-hidden`, and nothing else on
              the control changed, so a screen-reader user got NOTHING while a
              send was in flight — the label still read "Send message". The
              `aria-busy` + swapped label below is the fix; the glyph is the
              sighted half of the same signal.

              The semantic one: in a chat, three animated dots mean "someone is
              typing". This tree already draws exactly that, one file over in
              `MessageThreadPane`'s TypingIndicator — so a send in progress and
              a peer composing a reply rendered as the same object in two
              places. That file's own comment also records that `animate-bounce`
              on dots was tried and rejected for throwing them a third of their
              height on a spring curve, which is the animation this button was
              still running.

              `Loader2` + `animate-spin motion-reduce:animate-none` is the
              in-repo idiom for a control-level busy glyph (`ToastStack.tsx`),
              and it is the same shape the Button primitive's own `busy` state
              draws. `busy` itself is not usable here: the primitive renders its
              spinner ALONGSIDE children, and this is a 40px `p-0` circle, so
              the ring and the paper plane would share the well. */}
          <AnimatePresence initial={false} mode="popLayout">
            <m.span key={sending ? 'sending' : canSend ? 'ready' : 'idle'}
              className="flex items-center justify-center"
              initial={reducedMotion ? false : { opacity: 0, scale: 0.75, y: 3 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, scale: 0.75, y: -3 }}
              transition={{ duration: reducedMotion ? 0 : 0.16 }}>
              {sending ? (
                <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Send size={18} aria-hidden="true" />
              )}
            </m.span>
          </AnimatePresence>
        </Button>
      </div>

      {/* The hint describes keys a touch keyboard does not have, so it is
          pointer-gated rather than always-on (Doctrine Rule 7). The whole row
          is gated too — an empty flex row still costs `mt-1.5` of the little
          vertical space a phone composer has, and on mobile the counter is
          usually the only occupant. `ml-auto` keeps the counter right-aligned
          once the hint beside it is gone. */}
      {(showKeyboardHint || charsLeft) && (
        <div className="mt-1.5 flex items-center justify-between gap-2 px-2">
          {showKeyboardHint && (
            <p className="font-fw-sans text-eyebrow text-text-tertiary">
              Press Enter to send, Shift+Enter for a new line.
            </p>
          )}
          {charsLeft && (
            <span
              className="ml-auto flex-shrink-0 font-fw-sans text-eyebrow tabular-nums text-text-tertiary"
              aria-live="polite"
            >
              {charsLeft}
            </span>
          )}
          </div>
        )}
      </div>
    </form>
  );
}

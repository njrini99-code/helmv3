'use client';

import { useToast } from '../../../ui/Toast';
import { useCallback, useRef, type RefObject, useLayoutEffect } from 'react';
import { haptic } from '../../../lib/haptics';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useChipRise } from '../thread-v2';
import { Icon } from '../../../ui/Icon';
import { FileText, X, Plus, Paperclip } from 'lucide-react';
import { Tooltip } from '../../../ui/Tooltip';
import { IconButton } from '../../../ui/Button';
import { MESSAGE_MAX } from '../model';

/** At most this many files ride on one message. */
const MAX_ATTACHMENTS = 10;

export const addAttachments = (cur: File[], picked: File[]) =>
  [...cur, ...picked].slice(0, MAX_ATTACHMENTS);

/** Adds picked files up to the limit, and says so when some don't fit rather than dropping them silently (CH-7106). */
export function useAddAttachments() {
  const toast = useToast();
  return useCallback(
    (cur: File[], picked: File[]) => {
      const next = addAttachments(cur, picked);
      const dropped = cur.length + picked.length - next.length;
      if (dropped > 0) {
        haptic("warning");
        toast({
          tone: "error",
          title: `Up to ${MAX_ATTACHMENTS} files per message`,
          body: `${dropped === 1 ? "1 file wasn’t" : `${dropped} files weren’t`} added. Send these, then attach the rest.`,
          code: "CH-7106",
        });
      }
      return next;
    },
    [toast],
  );
}

/** The picked files as removable chips above a composer. */
export function AttachChips({
  files,
  onRemove,
  disabled = false,
}: {
  files: File[];
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  const reduced = useChReducedMotion();
  const rise = useChipRise(reduced);
  if (!files.length) return null;
  return (
    <div className="ch-ms-to">
      {files.map((f, i) => (
        <span key={`${f.name}${i}`} className="ch-ms-to__c" title={f.name} ref={rise}>
          <Icon icon={FileText} size={13} />
          <span className="ch-ms-to__n">{f.name}</span>
          <Tooltip>
            <button
              type="button"
              aria-label={`Remove ${f.name}`}
              disabled={disabled}
              onClick={() => onRemove(i)}
            >
              <Icon icon={X} size={12} />
            </button>
          </Tooltip>
        </span>
      ))}
    </div>
  );
}

/**
 * A composer's attach button and its hidden file picker. The type and size
 * limits are not checked here; they are checked when the files send
 * (`api.sendFiles`, CH-7101).
 */
export function AttachButton({
  phone = false,
  disabled,
  onPick,
}: {
  /** Phone: the design's "+", not the paperclip. */
  phone?: boolean;
  disabled?: boolean;
  onPick: (picked: File[]) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <IconButton
        icon={phone ? Plus : Paperclip}
        label="Attach a file"
        size="sm"
        disabled={disabled}
        onClick={() => input.current?.click()}
      />
      <input
        ref={input}
        type="file"
        disabled={disabled}
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) onPick(picked);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** A composer's textarea grows with what is written, up to its CSS max-height (132px when it has none). */
export function useAutosize(ta: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.style.height = "auto";
    const style = getComputedStyle(t);
    const cap = Number.parseFloat(style.maxHeight) || 132;
    const border = style.boxSizing === "border-box"
      ? (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0)
      : 0;
    t.style.height = `${Math.min(t.scrollHeight + border, cap)}px`;
  }, [ta, value]);
}

/** Within this of MESSAGE_MAX a composer counts down, so the limit never stops typing (or cuts a paste) unannounced. */
const COUNT_FROM = 300;

/** "N left" near the limit (wave 5 #21); nothing before it. Only the limit itself is announced, not each keystroke. */
export function CharsLeft({ text }: { text: string }) {
  const left = MESSAGE_MAX - text.length;
  if (left > COUNT_FROM) return null;
  return left <= 0 ? (
    <span className="ch-ms-comp__left is-out" role="status">
      No characters left
    </span>
  ) : (
    <span className="ch-ms-comp__left ch-num">{left} left</span>
  );
}

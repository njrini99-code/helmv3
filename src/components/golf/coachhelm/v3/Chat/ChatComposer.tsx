'use client';

import { useState, type KeyboardEvent } from 'react';
import { m } from 'framer-motion';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { liftHover, tapPress } from '@/lib/coachhelm/v3/motion';
import { Textarea } from '@/components/ui/input';

interface Props {
  onSend: (text: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * v3 polish — chat composer.
 *
 * Polish vs. original:
 *   - Focus ring is canonical primary-500/40 (audit feature #8).
 *   - Send button is "magnetic": liftHover + colored helm-green
 *     shadow that deepens on hover, so the click target feels
 *     physically responsive (not flat).
 *   - Respects `useReducedMotionGuard()` — drops framer hover/tap so
 *     keyboard users on reduced-motion get a static affordance.
 */
export function ChatComposer({ onSend, disabled = false, placeholder }: Props) {
  const [value, setValue] = useState('');
  const prefersReducedMotion = useReducedMotionGuard() ?? false;
  const canSend = !disabled && value.trim().length > 0;

  async function submit() {
    if (!canSend) return;
    const text = value.trim();
    setValue('');
    await onSend(text);
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  // Magnetic shadow tier — deeper on hover to read as "lift", matched
  // to the EASE_TAP timing the v3-lift CSS uses so the visual + the
  // framer translateY land in lockstep.
  const sendShadow = canSend
    ? 'shadow-[0_8px_18px_-12px_rgba(22,163,74,0.55)] hover:shadow-[0_14px_28px_-12px_rgba(22,163,74,0.65)]'
    : 'shadow-none';

  const hoverProps = prefersReducedMotion || !canSend ? {} : { whileHover: liftHover };
  const tapProps = prefersReducedMotion || !canSend ? {} : { whileTap: tapPress };

  return (
    <div className="surface-hairline border-t glass-standard p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-end gap-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        rows={2}
        placeholder={placeholder ?? 'Ask about your players, rounds, or qualifying…'}
        disabled={disabled}
        aria-label="Chat message"
        className="flex-1 resize-none rounded-xl border border-warm-200 bg-cream-50 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400 disabled:bg-warm-100 disabled:text-warm-500 transition-colors [transition-duration:280ms] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] placeholder:text-warm-400"
      />
      <m.button
        type="button"
        onClick={submit}
        disabled={!canSend}
        aria-label="Send message"
        {...hoverProps}
        {...tapProps}
        className={`inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-shadow [transition-duration:280ms] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] ${sendShadow}`}
      >
        Send
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
          <path
            d="M3 8h9 M9 4 l4 4 l-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </m.button>
    </div>
  );
}

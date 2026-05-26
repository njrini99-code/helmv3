'use client';

import { useState, type KeyboardEvent } from 'react';
import { m } from 'framer-motion';
import { liftHover, tapPress } from '@/lib/coachhelm/v3/motion';

interface Props {
  onSend: (text: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatComposer({ onSend, disabled = false, placeholder }: Props) {
  const [value, setValue] = useState('');
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

  return (
    <div className="surface-hairline border-t bg-white/80 backdrop-blur-sm p-3 flex items-end gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        rows={2}
        placeholder={placeholder ?? 'Ask anything about your team…'}
        disabled={disabled}
        aria-label="Chat message"
        className="flex-1 resize-none rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400 disabled:bg-warm-100 disabled:text-warm-500 transition-colors duration-[280ms] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] placeholder:text-warm-400"
      />
      <m.button
        type="button"
        onClick={submit}
        disabled={!canSend}
        aria-label="Send message"
        whileHover={canSend ? liftHover : undefined}
        whileTap={canSend ? tapPress : undefined}
        className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-[0_8px_18px_-12px_rgba(22,163,74,0.55)]"
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

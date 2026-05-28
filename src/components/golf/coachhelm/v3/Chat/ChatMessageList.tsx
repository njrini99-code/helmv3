'use client';

import { m, useReducedMotion } from 'framer-motion';
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';
import {
  enterVariants,
  enterTransition,
  stagger,
  EASE_TAP,
  DURATION,
} from '@/lib/coachhelm/v3/motion';

interface Props {
  messages: ChatMessage[];
  pending: boolean;
}

/**
 * W32-pt3 / v3 polish — message-bubble list.
 *
 * Polish vs. the original W32 implementation:
 *   - Per-bubble entrance stagger via `stagger(i)` so a fresh
 *     conversation loads like a wave, not a block. Audit feature #8
 *     called this out as the remaining "attention is sacred" gap.
 *   - Respects `useReducedMotion()` — collapses delays + travel to 0
 *     so accessibility users see the same content without the wave.
 *   - Uses canonical enterVariants / enterTransition (no inline
 *     cubic-bezier or hand-rolled durations).
 */
export function ChatMessageList({ messages, pending }: Props) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  // Stagger the last N bubbles only. When a coach scrolls back through
  // a long thread, we don't want a 50-message thread to take 3 seconds
  // to play in — it should still feel like a wave for fresh messages,
  // but settled content shouldn't animate on every re-render.
  const STAGGER_WINDOW = 8;
  const staggerOffset = Math.max(0, messages.length - STAGGER_WINDOW);

  return (
    <ul role="log" aria-live="polite" className="flex flex-col gap-3">
      {messages.map((message, i) => {
        const staggerIndex = Math.max(0, i - staggerOffset);
        const delay = prefersReducedMotion ? 0 : stagger(staggerIndex);
        return (
          <m.li
            key={message.id}
            variants={enterVariants}
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="visible"
            transition={{ ...enterTransition, delay }}
            className={message.role === 'user' ? 'flex justify-end' : ''}
          >
            <Bubble message={message} prefersReducedMotion={prefersReducedMotion} />
          </m.li>
        );
      })}
      {pending && (
        <m.li
          variants={enterVariants}
          initial={prefersReducedMotion ? false : 'hidden'}
          animate="visible"
          transition={enterTransition}
          className="flex items-center gap-2 text-warm-500 text-sm"
        >
          <span className="inline-flex gap-1" aria-hidden>
            <ThinkingDot delay={0} prefersReducedMotion={prefersReducedMotion} />
            <ThinkingDot delay={0.18} prefersReducedMotion={prefersReducedMotion} />
            <ThinkingDot delay={0.36} prefersReducedMotion={prefersReducedMotion} />
          </span>
          <span>Thinking…</span>
        </m.li>
      )}
    </ul>
  );
}

function ThinkingDot({ delay, prefersReducedMotion }: { delay: number; prefersReducedMotion: boolean }) {
  if (prefersReducedMotion) {
    return <span className="inline-block h-1.5 w-1.5 rounded-full bg-warm-400 opacity-70" />;
  }
  return (
    <m.span
      className="inline-block h-1.5 w-1.5 rounded-full bg-warm-400"
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

function Bubble({ message, prefersReducedMotion }: { message: ChatMessage; prefersReducedMotion: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="max-w-[80%] rounded-2xl bg-primary-600 text-white px-4 py-2 text-sm shadow-[0_8px_18px_-12px_rgba(22,163,74,0.55)]">
        {message.content}
      </div>
    );
  }
  if (message.role === 'assistant') {
    return (
      <m.div
        initial={prefersReducedMotion ? false : { opacity: 0.6 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.short, ease: EASE_TAP }}
        className="max-w-[85%] rounded-2xl bg-white surface-hairline border px-4 py-3 text-sm text-warm-900 whitespace-pre-wrap leading-relaxed"
      >
        {message.content}
      </m.div>
    );
  }
  // role === 'tool' — show a compact "looked up X" summary inline.
  const calls = message.tool_calls ?? [];
  if (calls.length === 0) return null;
  return (
    <m.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.short, ease: EASE_TAP }}
      className="max-w-[85%] inline-flex flex-wrap items-center gap-1.5 rounded-full bg-warm-100/80 backdrop-blur-sm px-3 py-1.5 text-eyebrow text-warm-700"
    >
      <span aria-hidden className="text-eyebrow text-warm-500 uppercase tracking-[0.12em]">
        Looked up
      </span>
      {calls.map((c, i) => (
        <span key={c.tool_call_id} className="font-mono text-warm-800">
          {c.name}
          {i < calls.length - 1 && <span className="text-warm-400">,</span>}
        </span>
      ))}
    </m.div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { m, useReducedMotion } from 'framer-motion';
import { ChatMessageList } from '@/components/golf/coachhelm/v3/Chat/ChatMessageList';
import { ChatComposer } from '@/components/golf/coachhelm/v3/Chat/ChatComposer';
import type { ChatConversation, ChatMessage } from '@/lib/coachhelm/v3/chat/types';
import {
  enterVariants,
  enterTransition,
  stagger,
  liftHover,
  tapPress,
} from '@/lib/coachhelm/v3/motion';

interface Props {
  conversations: ChatConversation[];
  initialConversationId: string | null;
  initialMessages: ChatMessage[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ChatHistoryClient({
  conversations,
  initialConversationId,
  initialMessages,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;

  async function loadConversation(id: string) {
    setActiveId(id);
    setError(null);
    try {
      const r = await fetch(`/api/coachhelm/v3/chat/conversations/${id}`);
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setMessages(json.messages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSend(text: string) {
    setPending(true);
    setError(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `pending-${Date.now()}`,
        conversation_id: activeId ?? '',
        role: 'user',
        content: text,
        tool_calls: null,
        tool_results: null,
        cost_usd: null,
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      const r = await fetch('/api/coachhelm/v3/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeId ?? undefined,
          user_message: text,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setActiveId(json.conversation_id);
      setMessages(json.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((prev) => prev.filter((m) => !m.id.startsWith('pending-')));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {/* Left rail — conversation list. Reveal entrance + per-row
          stagger per audit feature #8 (ChatHistoryClient left-rail). */}
      <m.aside
        variants={enterVariants}
        initial={prefersReducedMotion ? false : 'hidden'}
        animate="visible"
        transition={enterTransition}
        className="col-span-12 md:col-span-4 lg:col-span-3"
      >
        <ul className="space-y-1">
          {conversations.length === 0 && (
            <li className="text-sm text-warm-400 italic px-3 py-8 text-center flex flex-col items-center gap-3">
              <span aria-hidden className="inline-flex h-9 w-9 rounded-full bg-warm-100 text-warm-500 items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H11l-4 4v-4H5.5C4.67 16 4 15.33 4 14.5v-9Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span className="not-italic">No conversations yet.</span>
              <span className="text-eyebrow tracking-[0.04em]">Use the chat button on any dashboard page.</span>
            </li>
          )}
          {conversations.map((c, i) => (
            <m.li
              key={c.id}
              variants={enterVariants}
              initial={prefersReducedMotion ? false : 'hidden'}
              animate="visible"
              transition={{ ...enterTransition, delay: prefersReducedMotion ? 0 : stagger(i) }}
            >
              <m.button
                type="button"
                onClick={() => loadConversation(c.id)}
                whileHover={prefersReducedMotion || c.id === activeId ? undefined : liftHover}
                whileTap={prefersReducedMotion ? undefined : tapPress}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors duration-[280ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${
                  c.id === activeId
                    ? 'bg-warm-900 text-white shadow-[0_8px_18px_-12px_rgba(28,25,23,0.45)]'
                    : 'text-warm-800 hover:bg-warm-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{c.title ?? 'Untitled'}</span>
                  <span
                    className={`text-eyebrow tabular-nums shrink-0 ${
                      c.id === activeId ? 'text-white/70' : 'text-warm-400'
                    }`}
                  >
                    {formatDate(c.updated_at)}
                  </span>
                </div>
              </m.button>
            </m.li>
          ))}
        </ul>
        <p className="mt-5 px-3">
          <Link
            href="/golf/dashboard/coachhelm"
            className="text-eyebrow uppercase tracking-[0.14em] text-warm-500 hover:text-warm-800 transition"
          >
            ← Back to CoachHelm
          </Link>
        </p>
      </m.aside>

      {/* Main pane — messages */}
      <m.section
        variants={enterVariants}
        initial={prefersReducedMotion ? false : 'hidden'}
        animate="visible"
        transition={{ ...enterTransition, delay: prefersReducedMotion ? 0 : 0.1 }}
        className="col-span-12 md:col-span-8 lg:col-span-9 flex flex-col min-h-[60vh] surface-matte rounded-2xl overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto p-4 bg-warm-50/40">
          {activeId === null && (
            <p className="text-sm text-warm-400 italic text-center mt-12">
              Pick a conversation on the left, or start a new one with the chat button.
            </p>
          )}
          <ChatMessageList messages={messages} pending={pending} />
          {error && (
            <p className="mt-3 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>
        <ChatComposer onSend={handleSend} disabled={pending && activeId !== null} />
      </m.section>
    </div>
  );
}

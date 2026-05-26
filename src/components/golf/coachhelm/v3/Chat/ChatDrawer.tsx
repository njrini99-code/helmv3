'use client';

/**
 * W32-pt3 — slide-over chat drawer (coach-only).
 *
 * Behavior:
 *   - Closed by default. Opens via the launcher button or by setting
 *     `defaultOpen` on the wrapper.
 *   - First open creates no conversation yet — the first message kicks
 *     off a new one via POST /api/coachhelm/v3/chat/send.
 *   - Subsequent sends reuse the same conversation_id.
 *   - "New chat" button clears state without deleting the prior thread
 *     (it's still accessible from /dashboard/coachhelm/chat).
 *
 * Persistence is server-side — this component only stores the active
 * conversation_id + the message stream.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, m } from 'framer-motion';
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';
import { ChatMessageList } from './ChatMessageList';
import { ChatComposer } from './ChatComposer';
import {
  drawerVariants,
  drawerTransition,
  backdropVariants,
  backdropTransition,
  badgeVariants,
  badgeTransition,
  liftHover,
  tapPress,
  enterVariants,
  enterTransition,
  stagger,
} from '@/lib/coachhelm/v3/motion';

const QUICK_PROMPTS = [
  'Who needs the most help this week?',
  'Compare two players on lag putting',
  'What patterns are showing up team-wide?',
];

export interface ChatDrawerProps {
  defaultOpen?: boolean;
}

export function ChatDrawer({ defaultOpen = false }: ChatDrawerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  async function handleSend(text: string) {
    setPending(true);
    setError(null);
    // Optimistic: stub the user bubble so the UI feels immediate.
    setMessages((prev) => [
      ...prev,
      {
        id: `pending-${Date.now()}`,
        conversation_id: conversationId ?? '',
        role: 'user',
        content: text,
        tool_calls: null,
        tool_results: null,
        cost_usd: null,
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      const res = await fetch('/api/coachhelm/v3/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId ?? undefined,
          user_message: text,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setConversationId(json.conversation_id);
      setMessages(json.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Roll back the optimistic stub.
      setMessages((prev) => prev.filter((m) => !m.id.startsWith('pending-')));
    } finally {
      setPending(false);
    }
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setError(null);
  }

  return (
    <>
      {/* ----- Launcher (helm green pill, premium SVG icon) ----- */}
      <AnimatePresence>
        {!open && (
          <m.button
            key="chat-launcher"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open coach chat"
            variants={badgeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={badgeTransition}
            whileHover={liftHover}
            whileTap={tapPress}
            className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary-600 text-white shadow-[0_10px_24px_-12px_rgba(22,163,74,0.55)] hover:bg-primary-700 flex items-center justify-center"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H11l-4 4v-4H5.5C4.67 16 4 15.33 4 14.5v-9Z"
                fill="currentColor"
              />
            </svg>
          </m.button>
        )}
      </AnimatePresence>

      {/* ----- Drawer ----- */}
      <AnimatePresence>
        {open && (
          <>
            <m.div
              key="chat-backdrop"
              aria-hidden
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={backdropTransition}
              className="fixed inset-0 bg-warm-900/35 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setOpen(false)}
            />
            <m.aside
              key="chat-drawer"
              role="dialog"
              aria-label="Coach chat"
              data-testid="chat-drawer"
              variants={drawerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={drawerTransition}
              className="fixed inset-0 md:inset-auto md:right-0 md:top-0 md:bottom-0 md:w-[420px] z-50 surface-lift flex flex-col"
            >
              <header className="flex items-center justify-between px-4 py-3 border-b border-warm-200">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-2 text-warm-900">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-primary-600" />
                    <span className="font-medium tracking-[-0.01em]">CoachHelm chat</span>
                  </span>
                  {conversationId && (
                    <button
                      type="button"
                      onClick={newChat}
                      className="text-[11px] uppercase tracking-[0.1em] text-warm-500 hover:text-warm-800 transition"
                    >
                      New
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <Link
                    href="/golf/dashboard/coachhelm/chat"
                    className="text-[11px] uppercase tracking-[0.1em] text-warm-500 hover:text-warm-800 transition"
                  >
                    History →
                  </Link>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close chat"
                    className="text-warm-500 hover:text-warm-900 transition"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                      <path
                        d="M3 3 L13 13 M13 3 L3 13"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 bg-warm-50/40">
                {messages.length === 0 && !pending && (
                  <m.div
                    variants={enterVariants}
                    initial="hidden"
                    animate="visible"
                    transition={{ ...enterTransition, delay: 0.15 }}
                    className="mt-10 max-w-sm mx-auto text-center"
                  >
                    <span aria-hidden className="inline-flex h-10 w-10 rounded-full bg-primary-50 text-primary-700 items-center justify-center mb-3">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H11l-4 4v-4H5.5C4.67 16 4 15.33 4 14.5v-9Z" fill="currentColor" />
                      </svg>
                    </span>
                    <p className="text-sm text-warm-700">
                      Ask about a player, compare two players, or have me draft a goal.
                    </p>
                    <div className="mt-5 flex flex-col gap-2">
                      {QUICK_PROMPTS.map((q, i) => (
                        <m.button
                          key={q}
                          type="button"
                          onClick={() => void handleSend(q)}
                          variants={enterVariants}
                          initial="hidden"
                          animate="visible"
                          transition={{ ...enterTransition, delay: 0.25 + stagger(i) }}
                          whileHover={liftHover}
                          whileTap={tapPress}
                          className="text-left text-[13px] px-3 py-2 rounded-xl border border-warm-200 bg-white hover:border-primary-300 hover:bg-primary-50/40 text-warm-800 transition"
                        >
                          {q}
                        </m.button>
                      ))}
                    </div>
                  </m.div>
                )}
                <ChatMessageList messages={messages} pending={pending} />
                {error && (
                  <p className="mt-3 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                    {error}
                  </p>
                )}
              </div>

              <ChatComposer onSend={handleSend} disabled={pending} />
            </m.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

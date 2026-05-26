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
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';
import { ChatMessageList } from './ChatMessageList';
import { ChatComposer } from './ChatComposer';

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
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open coach chat"
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-warm-900 text-white shadow-lg hover:bg-warm-800 flex items-center justify-center"
        >
          <span aria-hidden className="text-xl">💬</span>
        </button>
      )}

      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            aria-hidden
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setOpen(false)}
          />
          {/* Drawer (desktop: slide-over right; mobile: full-screen) */}
          <aside
            role="dialog"
            aria-label="Coach chat"
            data-testid="chat-drawer"
            className="fixed inset-0 md:inset-auto md:right-0 md:top-0 md:bottom-0 md:w-[420px] z-50 bg-white shadow-xl flex flex-col"
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-warm-200">
              <div className="flex items-center gap-2">
                <span className="font-medium text-warm-900">CoachHelm chat</span>
                {conversationId && (
                  <button
                    type="button"
                    onClick={newChat}
                    className="text-xs text-warm-500 hover:text-warm-700"
                  >
                    + New
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/golf/dashboard/coachhelm/chat"
                  className="text-xs text-warm-500 hover:text-warm-700"
                >
                  History →
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close chat"
                  className="text-warm-500 hover:text-warm-700"
                >
                  ✕
                </button>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 bg-warm-50/30">
              {messages.length === 0 && !pending && (
                <p className="text-sm text-warm-500 text-center mt-12 max-w-xs mx-auto">
                  Ask about a player, compare two players on a metric, or
                  request a goal for someone.
                </p>
              )}
              <ChatMessageList messages={messages} pending={pending} />
              {error && (
                <p className="mt-3 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}
            </div>

            <ChatComposer onSend={handleSend} disabled={pending} />
          </aside>
        </>
      )}
    </>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChatMessageList } from '@/components/golf/coachhelm/v3/Chat/ChatMessageList';
import { ChatComposer } from '@/components/golf/coachhelm/v3/Chat/ChatComposer';
import type { ChatConversation, ChatMessage } from '@/lib/coachhelm/v3/chat/types';

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
      {/* Left rail — conversation list */}
      <aside className="col-span-12 md:col-span-4 lg:col-span-3">
        <ul className="space-y-1">
          {conversations.length === 0 && (
            <li className="text-sm text-warm-500 px-3 py-6 text-center">
              No conversations yet. Use the chat button on any dashboard page.
            </li>
          )}
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => loadConversation(c.id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm ${
                  c.id === activeId
                    ? 'bg-warm-900 text-white'
                    : 'text-warm-800 hover:bg-warm-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{c.title ?? 'Untitled'}</span>
                  <span
                    className={`text-[11px] tabular-nums ${
                      c.id === activeId ? 'text-white/70' : 'text-warm-400'
                    }`}
                  >
                    {formatDate(c.updated_at)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 px-3">
          <Link href="/golf/dashboard/coachhelm" className="text-xs text-warm-500 hover:text-warm-700">
            ← Back to CoachHelm
          </Link>
        </p>
      </aside>

      {/* Main pane — messages */}
      <section className="col-span-12 md:col-span-8 lg:col-span-9 flex flex-col min-h-[60vh] bg-white border border-warm-200 rounded-2xl overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 bg-warm-50/30">
          {activeId === null && (
            <p className="text-sm text-warm-500 text-center mt-12">
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
      </section>
    </div>
  );
}

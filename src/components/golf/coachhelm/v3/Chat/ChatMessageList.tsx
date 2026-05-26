'use client';

import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';

interface Props {
  messages: ChatMessage[];
  pending: boolean;
}

export function ChatMessageList({ messages, pending }: Props) {
  return (
    <ul role="log" aria-live="polite" className="flex flex-col gap-3">
      {messages.map((m) => (
        <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
          <Bubble message={m} />
        </li>
      ))}
      {pending && (
        <li className="flex items-center gap-2 text-warm-500 text-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-warm-400 animate-pulse" />
          Thinking…
        </li>
      )}
    </ul>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="max-w-[80%] rounded-2xl bg-primary-600 text-white px-4 py-2 text-sm">
        {message.content}
      </div>
    );
  }
  if (message.role === 'assistant') {
    return (
      <div className="max-w-[85%] rounded-2xl bg-white border border-warm-200 px-4 py-3 text-sm text-warm-900 whitespace-pre-wrap">
        {message.content}
      </div>
    );
  }
  // role === 'tool' — show a compact "looked up X" summary
  const calls = message.tool_calls ?? [];
  if (calls.length === 0) return null;
  return (
    <div className="max-w-[85%] rounded-xl bg-warm-100 px-3 py-2 text-xs text-warm-700">
      <span className="opacity-70">Looked up:</span>{' '}
      {calls.map((c, i) => (
        <span key={c.tool_call_id} className="font-mono">
          {c.name}
          {i < calls.length - 1 && ', '}
        </span>
      ))}
    </div>
  );
}

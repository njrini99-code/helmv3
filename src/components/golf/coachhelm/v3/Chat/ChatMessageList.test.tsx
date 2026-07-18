/**
 * ChatMessageList tests — #948 (Ask page) item (3).
 *
 * A stored thread that ends on a user turn with no subsequent assistant row
 * (an orphaned turn from before the send route always persisted a reply)
 * used to render nothing after the user bubble — a silent void. Pins the
 * honest "No response recorded" fallback and the cases where it must NOT
 * show (a real assistant reply exists; a send is actively pending; the
 * thread is empty).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';
import { ChatMessageList } from './ChatMessageList';

// ---------------------------------------------------------------------------
// Framer-motion passthrough (same pattern as HubInsightSignalCard.test.tsx /
// InsightCard.test.tsx) — `m.li`/`m.div` render as plain DOM elements.
// ---------------------------------------------------------------------------
vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => false,
    m: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>((props, ref) => {
            const {
              children,
              whileTap: _whileTap,
              whileHover: _whileHover,
              initial: _initial,
              animate: _animate,
              exit: _exit,
              transition: _transition,
              variants: _variants,
              ...rest
            } = props;
            void _whileTap;
            void _whileHover;
            void _initial;
            void _animate;
            void _exit;
            void _transition;
            void _variants;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

function userMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'user-1',
    conversation_id: 'conv-1',
    role: 'user',
    content: 'Who needs the most attention on our roster?',
    tool_calls: null,
    tool_results: null,
    cost_usd: null,
    created_at: '2026-06-16T10:00:00.000Z',
    client_turn_id: null,
    status: null,
    ...overrides,
  };
}

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    conversation_id: 'conv-1',
    role: 'assistant',
    content: 'Mason Reed — his short game has fallen off the last 3 rounds.',
    tool_calls: null,
    tool_results: null,
    cost_usd: 0.01,
    created_at: '2026-06-16T10:00:05.000Z',
    client_turn_id: null,
    status: 'complete',
    ...overrides,
  };
}

describe('ChatMessageList — orphaned-turn honesty fallback', () => {
  it('shows "No response recorded" when the thread ends on a user turn (orphaned history)', () => {
    render(<ChatMessageList messages={[userMessage()]} pending={false} />);
    expect(screen.getByText('No response recorded for this message.')).toBeInTheDocument();
  });

  it('does NOT show the fallback when the last message is a real assistant reply', () => {
    render(<ChatMessageList messages={[userMessage(), assistantMessage()]} pending={false} />);
    expect(screen.queryByText('No response recorded for this message.')).not.toBeInTheDocument();
  });

  it('does NOT show the fallback when the last message is a visible failure bubble', () => {
    render(
      <ChatMessageList
        messages={[
          userMessage(),
          assistantMessage({ id: 'assistant-fail', status: 'failed', content: "I couldn't complete that just now." }),
        ]}
        pending={false}
      />,
    );
    expect(screen.queryByText('No response recorded for this message.')).not.toBeInTheDocument();
  });

  it('does NOT show the fallback while a send is actively pending (thinking dots own that state)', () => {
    render(<ChatMessageList messages={[userMessage()]} pending />);
    expect(screen.queryByText('No response recorded for this message.')).not.toBeInTheDocument();
    expect(screen.getByText('Reading the numbers…')).toBeInTheDocument();
  });

  it('does NOT show the fallback for an empty thread', () => {
    render(<ChatMessageList messages={[]} pending={false} />);
    expect(screen.queryByText('No response recorded for this message.')).not.toBeInTheDocument();
  });
});

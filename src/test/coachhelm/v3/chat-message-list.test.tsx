/**
 * W32-pt3 — render-state tests for ChatMessageList.
 *
 * Covers the three bubble variants (user / assistant / tool) + the
 * pending "Thinking…" affordance. Drawer state + send flow are
 * exercised end-to-end after deploy.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessageList } from '@/components/golf/coachhelm/v3/Chat/ChatMessageList';
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';

function msg(over: Partial<ChatMessage> & { role: ChatMessage['role'] }): ChatMessage {
  return {
    id: over.id ?? `m-${Math.random()}`,
    conversation_id: over.conversation_id ?? 'c-1',
    role: over.role,
    content: over.content ?? null,
    tool_calls: over.tool_calls ?? null,
    tool_results: over.tool_results ?? null,
    cost_usd: over.cost_usd ?? null,
    created_at: over.created_at ?? '2026-05-26T00:00:00.000Z',
  };
}

describe('ChatMessageList', () => {
  it('renders the user message in a primary bubble', () => {
    render(
      <ChatMessageList
        messages={[msg({ role: 'user', content: 'How is Jordan putting?' })]}
        pending={false}
      />,
    );
    expect(screen.getByText('How is Jordan putting?')).toBeInTheDocument();
  });

  it('renders the assistant prose verbatim', () => {
    const long = 'Jordan is in the 22nd percentile on 3-5 ft putts. The lag distance from 25+ is fine.';
    render(<ChatMessageList messages={[msg({ role: 'assistant', content: long })]} pending={false} />);
    expect(screen.getByText(long)).toBeInTheDocument();
  });

  it('renders a tool-call bubble with the tool names', () => {
    render(
      <ChatMessageList
        messages={[
          msg({
            role: 'tool',
            content: null,
            tool_calls: [
              { tool_call_id: 't1', name: 'get_player_insights', arguments: '{}' },
              { tool_call_id: 't2', name: 'get_player_standing', arguments: '{}' },
            ],
          }),
        ]}
        pending={false}
      />,
    );
    // Span concatenates name + trailing ", " for non-final entries, so
    // match by substring via regex rather than exact text.
    expect(screen.getByText(/get_player_insights/)).toBeInTheDocument();
    expect(screen.getByText(/get_player_standing/)).toBeInTheDocument();
  });

  it('hides the tool bubble when there are no calls', () => {
    const { container } = render(
      <ChatMessageList messages={[msg({ role: 'tool', tool_calls: [] })]} pending={false} />,
    );
    expect(container.textContent).not.toContain('Looked up');
  });

  it('shows the pending "Reading the numbers…" affordance when pending is true', () => {
    render(<ChatMessageList messages={[]} pending />);
    expect(screen.getByText(/Reading the numbers/)).toBeInTheDocument();
  });

  it('does not render the pending affordance when not pending', () => {
    render(<ChatMessageList messages={[]} pending={false} />);
    expect(screen.queryByText(/Reading the numbers/)).not.toBeInTheDocument();
  });
});

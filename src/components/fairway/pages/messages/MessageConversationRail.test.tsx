// @vitest-environment jsdom
/**
 * ============================================================================
 * MessageConversationRail.tsx — one zero-state widget, no duplicate numeral
 * ----------------------------------------------------------------------------
 * Regression coverage for #97/#105/#162:
 *   • #97/#105 — the empty inbox used to render an "awaiting signal — 0 of 1"
 *     Readout gauge stacked directly beside the honest "No conversations yet"
 *     EmptyState — two zero-state widgets disagreeing in the same card.
 *   • #162 — a populated inbox rendered a big standalone mono numeral
 *     ("CONVERSATION" / "1") in the rail's own panel bezel, duplicating the
 *     "1 conversation" line the page masthead already renders just above it.
 * The fix removes the rail's own count Readout entirely (the masthead is the
 * one place the count renders), so this locks: no `data-slot="readout"` node
 * ever renders inside the rail, in either state.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageConversationRail } from './MessageConversationRail';
import type { GolfConversationWithMeta } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  searchGolfMessages: vi.fn(async () => ({ results: [] })),
}));

describe('MessageConversationRail — no duplicate count readout', () => {
  it('renders exactly one zero-state widget when there are no conversations, with no Readout numeral', () => {
    const { container, getByText, queryByText } = render(
      <MessageConversationRail
        conversations={[]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
        loading={false}
        error={false}
      />,
    );

    // The single, honest zero-state widget.
    expect(getByText('No conversations yet')).toBeInTheDocument();

    // No second, contradictory zero gauge (the old "awaiting signal" Readout).
    expect(container.querySelector('[data-slot="readout"]')).toBeNull();
    expect(queryByText(/awaiting signal/i)).toBeNull();
    expect(queryByText(/0 of 1/i)).toBeNull();
  });

  it('never renders a standalone count Readout numeral in a populated inbox either', () => {
    const conversations: GolfConversationWithMeta[] = [
      {
        id: 'c1',
        is_group: false,
        title: null,
        unread_count: 0,
        other_participant: { id: 'u1', name: 'Jordan Lee', avatar: null },
        last_message: { content: 'See you at practice', created_at: new Date().toISOString() },
      } as unknown as GolfConversationWithMeta,
    ];

    const { container } = render(
      <MessageConversationRail
        conversations={conversations}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
        loading={false}
        error={false}
      />,
    );

    // The count now lives ONLY in the page masthead — never duplicated here
    // as a big mono numeral inside the rail's own panel bezel.
    expect(container.querySelector('[data-slot="readout"]')).toBeNull();
  });
});

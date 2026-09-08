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
import { fireEvent, render, screen } from '@testing-library/react';
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


describe('conversation filters', () => {
  it('filters real unread and group conversations without changing selection', () => {
    const onSelect = vi.fn();
    const conversations = [
      { id: 'dm', participant_count: 2, unread_count: 1, other_participant: { name: 'Jordan Lee' } },
      { id: 'group', participant_count: 8, is_group: true, title: 'Travel team', unread_count: 0 },
    ] as GolfConversationWithMeta[];
    render(<MessageConversationRail conversations={conversations} selectedId={null} onSelect={onSelect} onNewMessage={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Groups' }));
    expect(screen.getByText('Travel team')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Jordan Lee/ })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Unread' }));
    expect(screen.getByRole('button', { name: /Jordan Lee/ })).toBeVisible();
    expect(screen.queryByText('Travel team')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(screen.getByText('Travel team')).toBeVisible();
    expect(screen.getByRole('button', { name: /Jordan Lee/ })).toBeVisible();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('explains an empty unread filter and lets the reader return to all messages', () => {
    render(<MessageConversationRail conversations={[
      { id: 'dm', participant_count: 2, unread_count: 0, other_participant: { name: 'Jordan Lee' } } as GolfConversationWithMeta,
    ]} selectedId={null} onSelect={vi.fn()} onNewMessage={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Unread' }));
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all messages' }));
    expect(screen.getByRole('button', { name: /Jordan Lee/ })).toBeVisible();
  });
});


describe('background inbox refresh', () => {
  it('keeps existing rows mounted while read receipts refresh and after a refresh error', () => {
    const conversations = [{ id: 'dm', participant_count: 2, unread_count: 0, other_participant: { name: 'Jordan Lee' } }] as GolfConversationWithMeta[];
    const props = { conversations, selectedId: 'dm', onSelect: vi.fn(), onNewMessage: vi.fn() };
    const { rerender } = render(<MessageConversationRail {...props} loading={false} />);
    const row = screen.getByRole('button', { name: /Jordan Lee/ });
    rerender(<MessageConversationRail {...props} loading />);
    expect(screen.getByRole('button', { name: /Jordan Lee/ })).toBe(row);
    rerender(<MessageConversationRail {...props} loading={false} error />);
    expect(screen.getByRole('button', { name: /Jordan Lee/ })).toBe(row);
  });
});

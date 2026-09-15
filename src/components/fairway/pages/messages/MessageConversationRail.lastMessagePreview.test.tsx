// @vitest-environment jsdom
/**
 * G-15 — the inbox row renders from an HONEST last-message preview.
 *
 * `useGolfConversations` used to build every conversation's `last_message` as
 * a full `GolfMessageRow`, which meant inventing the columns the RPC does not
 * return: a literal `id: ''` on every row in the inbox, plus a constant
 * `read: false`. §16.1 names fabricated view-model rows as the anti-pattern.
 *
 * The fix narrows the type to the three scalars
 * `get_golf_conversations_with_details` actually returns, so the compiler —
 * not a grep — proves no consumer keys on the fabrication. What a runtime test
 * can still add is the other half: that the rail renders correctly from a
 * preview object that has no `id` and no `read` on it at all, which is exactly
 * the shape the hook now produces.
 *
 * `created_at` and `sender_id` are typed nullable here for the same reason:
 * the function's own signature declares them nullable, and the transform no
 * longer papers over that with `|| ''`.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageConversationRail } from './MessageConversationRail';
import type {
  GolfConversationLastMessage,
  GolfConversationWithMeta,
} from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  searchGolfMessages: vi.fn(async () => ({ results: [] })),
}));

function conversation(last_message: GolfConversationLastMessage | null): GolfConversationWithMeta {
  return {
    id: 'c1',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    unread_count: 0,
    is_group: false,
    title: null,
    other_participant: { id: 'u1', name: 'Jordan Lee', subtitle: 'Golf Player', avatar: null, type: 'player' },
    last_message,
  };
}

function renderRail(conversations: GolfConversationWithMeta[]) {
  return render(
    <MessageConversationRail
      conversations={conversations}
      selectedId={null}
      onSelect={vi.fn()}
      onNewMessage={vi.fn()}
      loading={false}
      error={false}
      now={new Date()}
    />,
  );
}

describe('MessageConversationRail — honest last-message preview (G-15)', () => {
  it('renders the preview text and time from an object carrying no id and no read flag', () => {
    const preview: GolfConversationLastMessage = {
      content: 'See you at practice',
      created_at: new Date().toISOString(),
      sender_id: 'u1',
    };
    // The shape the hook now builds: exactly three keys, none of them invented.
    expect(Object.keys(preview).sort()).toEqual(['content', 'created_at', 'sender_id']);

    const { getByText, container } = renderRail([conversation(preview)]);

    expect(getByText('See you at practice')).toBeInTheDocument();
    expect(container.querySelector('time')).not.toBeNull();
  });

  it('survives the nullable columns the function actually declares', () => {
    // last_message_at / last_message_sender_id are nullable in the RPC's own
    // signature. The transform used to coerce the sender to '' and let the
    // date through under a cast; both are now honestly null.
    const { getByText, container } = renderRail([
      conversation({ content: 'No timestamp on this one', created_at: null, sender_id: null }),
    ]);

    expect(getByText('No timestamp on this one')).toBeInTheDocument();
    // No time element rather than a fabricated one — formatTime returns ''.
    expect(container.querySelector('time')).toBeNull();
  });

  it('still shows the honest placeholder when there is no last message at all', () => {
    const { getByText } = renderRail([conversation(null)]);
    expect(getByText('No messages yet')).toBeInTheDocument();
  });

  it('keys rows on the CONVERSATION id, which is real, not on the preview', () => {
    // The fabricated `id: ''` was shared by every row in the inbox, so anything
    // keyed on it collided across conversations. Two rows, two distinct
    // conversations, both rendered.
    const a = { ...conversation({ content: 'First thread', created_at: new Date().toISOString(), sender_id: 'u1' }) };
    const b = {
      ...conversation({ content: 'Second thread', created_at: new Date().toISOString(), sender_id: 'u2' }),
      id: 'c2',
      other_participant: { id: 'u2', name: 'Sam Diaz', subtitle: 'Golf Player', avatar: null, type: 'player' as const },
    };

    const { getByText } = renderRail([a, b]);
    expect(getByText('First thread')).toBeInTheDocument();
    expect(getByText('Second thread')).toBeInTheDocument();
  });
});

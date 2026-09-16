// @vitest-environment jsdom
//
// Row 8 (perf audit) — `summarizeReactions` used to run twice per message per
// render, each a full scan of every reaction row in the thread. The fix groups
// `reactions.rows` by message id once, in a single `useMemo`, and both render
// sites read from that map.
//
// A grouping refactor is exactly the kind of change that can quietly cross
// wires between messages (message A rendering message B's reactions), so this
// suite renders TWO messages with disjoint reaction sets and asserts each one
// shows only its own — plus that a message with no reactions renders no
// reaction row at all.

import { createElement } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageThreadPane, type MessageThreadPaneProps } from './MessageThreadPane';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';
import type { MessageReaction } from '@/hooks/golf/use-message-reactions';

vi.mock('@/app/golf/actions/messages', () => ({
  getGolfMessageAttachments: vi.fn(),
}));

// jsdom has no scrollIntoView; the pane's stick-to-bottom effect calls it.
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

const conversation = {
  id: 'dm-1',
  is_group: false,
  title: null,
  unread_count: 0,
} as GolfConversationWithMeta;

const messages: MessageWithReadStatus[] = [
  {
    id: 'msg-liked',
    conversation_id: 'dm-1',
    sender_id: 'coach-1',
    content: 'Great round today',
    created_at: '2026-08-22T11:00:00.000Z',
    read: false,
    is_deleted: false,
    edited_at: null,
    has_attachments: false,
  } as MessageWithReadStatus,
  {
    id: 'msg-celebrated',
    conversation_id: 'dm-1',
    sender_id: 'coach-1',
    content: 'New course record',
    created_at: '2026-08-22T11:05:00.000Z',
    read: false,
    is_deleted: false,
    edited_at: null,
    has_attachments: false,
  } as MessageWithReadStatus,
  {
    id: 'msg-bare',
    conversation_id: 'dm-1',
    sender_id: 'coach-1',
    content: 'Practice moved to 5pm',
    created_at: '2026-08-22T11:10:00.000Z',
    read: false,
    is_deleted: false,
    edited_at: null,
    has_attachments: false,
  } as MessageWithReadStatus,
];

const reactionRows: MessageReaction[] = [
  { id: 'r1', message_id: 'msg-liked', user_id: 'player-2', emoji: '👍' },
  { id: 'r2', message_id: 'msg-celebrated', user_id: 'player-2', emoji: '🎉' },
  { id: 'r3', message_id: 'msg-celebrated', user_id: 'coach-1', emoji: '🎉' },
];

function props(overrides: Partial<MessageThreadPaneProps> = {}): MessageThreadPaneProps {
  return {
    conversation,
    messages,
    loading: false,
    userId: 'player-2',
    currentUserId: 'player-2',
    isOtherTyping: false,
    now: new Date('2026-08-22T12:00:00.000Z'),
    onBack: vi.fn(),
    onNewMessage: vi.fn(),
    editingMessageId: null,
    editContent: '',
    isEditSaving: false,
    deleteConfirmId: null,
    mobileActionsId: null,
    onStartEdit: vi.fn(),
    onEditContentChange: vi.fn(),
    onCancelEdit: vi.fn(),
    onSaveEdit: vi.fn(),
    onDeleteClick: vi.fn(),
    onConfirmDelete: vi.fn(),
    onCancelDelete: vi.fn(),
    onSetMobileActions: vi.fn(),
    reactions: {
      rows: reactionRows,
      error: null,
      pending: null,
      refresh: vi.fn(async () => {}),
      setReaction: vi.fn(async () => true),
    },
    ...overrides,
  } as MessageThreadPaneProps;
}

function reactionRowFor(container: HTMLElement, body: string): HTMLElement | null {
  // `data-message-row` marks the whole per-message row (bubble + reactions +
  // time), so scoping the reaction-row lookup to it can't cross into a
  // neighbouring message even if two bubbles' text happened to overlap.
  const row = Array.from(container.querySelectorAll<HTMLElement>('[data-message-row]')).find(
    (el) => el.textContent?.includes(body),
  );
  expect(row, `expected to find the message row for "${body}"`).toBeTruthy();
  return row!.querySelector('[aria-label="Message reactions"]');
}

describe('MessageThreadPane reaction grouping (Row 8)', () => {
  it('shows each message only its own reactions, never a neighbour’s', () => {
    const { container } = render(createElement(MessageThreadPane, props()));

    const liked = reactionRowFor(container, 'Great round today');
    expect(liked).not.toBeNull();
    expect(liked!.textContent).toContain('👍');
    expect(liked!.textContent).not.toContain('🎉');

    const celebrated = reactionRowFor(container, 'New course record');
    expect(celebrated).not.toBeNull();
    expect(celebrated!.textContent).toContain('🎉');
    expect(celebrated!.textContent).not.toContain('👍');
    // Two distinct reactors on the same emoji collapse into one group with count 2.
    expect(celebrated!.textContent).toContain('2');
  });

  it('renders no reaction row for a message with none', () => {
    const { container } = render(createElement(MessageThreadPane, props()));
    expect(reactionRowFor(container, 'Practice moved to 5pm')).toBeNull();
  });
});

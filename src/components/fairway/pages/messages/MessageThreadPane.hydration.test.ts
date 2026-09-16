// @vitest-environment jsdom
/**
 * ============================================================================
 * MessageThreadPane — required `now`, no internal clock read
 * ----------------------------------------------------------------------------
 * `formatDaySeparator` used to call `new Date()` directly, so the day-
 * boundary chip's label ("Today" / "Yesterday" / a weekday / an absolute
 * date) depended on the ambient wall clock at render time — a server render
 * and the client's first paint (evaluated moments apart) could label the
 * SAME message differently (React #418). The fix threads a required,
 * caller-seeded `now: Date | null` through instead.
 *
 * Holds the `now` PROP fixed and flips the ambient system clock between two
 * distant instants across a re-render of the SAME tree (via `rerender`, not
 * a fresh mount+unmount, so unrelated per-mount id generation elsewhere in
 * the pane can't produce a false difference) — if the pane still reads
 * `new Date()` internally, the two renders diverge; if it only reads the
 * prop, they are byte-identical.
 * ========================================================================== */
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MessageThreadPane, type MessageThreadPaneProps } from './MessageThreadPane';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  getGolfMessageAttachments: vi.fn(),
}));

// jsdom has no scrollIntoView; the pane's stick-to-bottom effect calls it.
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

function baseProps(now: Date | null): MessageThreadPaneProps {
  const conversation = {
    id: 'group-1',
    is_group: true,
    title: 'Team group',
    unread_count: 0,
  } as GolfConversationWithMeta;
  const messages = [
    {
      id: 'm1',
      conversation_id: 'group-1',
      sender_id: 'player-1',
      content: 'Earlier message',
      created_at: '2026-08-20T11:00:00.000Z',
      read: false,
      is_deleted: false,
      edited_at: null,
      has_attachments: false,
    },
    {
      id: 'm2',
      conversation_id: 'group-1',
      sender_id: 'player-2',
      content: 'Newest message',
      created_at: '2026-08-22T11:01:00.000Z',
      read: false,
      is_deleted: false,
      edited_at: null,
      has_attachments: false,
    },
  ] as MessageWithReadStatus[];

  return {
    conversation,
    messages,
    loading: false,
    userId: 'coach-1',
    currentUserId: 'coach-1',
    isOtherTyping: false,
    now,
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
  };
}

describe('MessageThreadPane — now: Date | null (no internal clock read)', () => {
  it('re-renders byte-identical markup, including the day-separator chip text, for a fixed now prop regardless of the ambient system clock', () => {
    const now = new Date('2026-08-22T12:00:00.000Z');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
    const { container, rerender } = render(createElement(MessageThreadPane, baseProps(now)));
    const html1 = container.innerHTML;
    expect(html1).toContain('Today'); // the newer message's day chip, keyed off `now`, not the real clock

    vi.setSystemTime(new Date('2030-06-15T00:00:00.000Z'));
    rerender(createElement(MessageThreadPane, baseProps(now)));
    const html2 = container.innerHTML;

    expect(html2).toBe(html1);
  });

  it('re-renders the same pre-mount (now: null) markup regardless of the ambient system clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
    const { container, rerender } = render(createElement(MessageThreadPane, baseProps(null)));
    const html1 = container.innerHTML;

    vi.setSystemTime(new Date('2030-06-15T00:00:00.000Z'));
    rerender(createElement(MessageThreadPane, baseProps(null)));
    const html2 = container.innerHTML;

    expect(html2).toBe(html1);
  });
});

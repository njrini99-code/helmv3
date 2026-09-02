// @vitest-environment jsdom
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MessageThreadPane,
  shouldScrollThreadToLatestOnOpen,
  type MessageThreadPaneProps,
} from './MessageThreadPane';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  getGolfMessageAttachments: vi.fn(),
}));

describe('MessageThreadPane initial thread position', () => {
  const groupMessages = [
    { conversation_id: 'group-1' },
    { conversation_id: 'group-1' },
  ];

  it('opens a loaded group thread at its newest message', () => {
    expect(shouldScrollThreadToLatestOnOpen('group-1', 'group-1', false, groupMessages)).toBe(true);
  });

  it('waits for the requested conversation instead of scrolling stale prior-thread rows', () => {
    const staleMessages = [{ conversation_id: 'direct-message-1' }];

    expect(shouldScrollThreadToLatestOnOpen('group-1', 'group-1', false, staleMessages)).toBe(false);
    expect(shouldScrollThreadToLatestOnOpen('group-1', 'group-1', true, groupMessages)).toBe(false);
  });

  it('does not force-scroll messages that arrive after the opening position is set', () => {
    expect(shouldScrollThreadToLatestOnOpen(null, 'group-1', false, groupMessages)).toBe(false);
  });

  it('sets the thread scroll container to its bottom after a group thread finishes loading', () => {
    const conversation: GolfConversationWithMeta = {
      id: 'group-1',
      is_group: true,
      title: 'Team group',
      unread_count: 0,
    } as GolfConversationWithMeta;
    const messages: MessageWithReadStatus[] = [
      {
        id: 'm1',
        conversation_id: 'group-1',
        sender_id: 'player-1',
        content: 'Earlier message',
        created_at: '2026-08-22T11:00:00.000Z',
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
    const props: MessageThreadPaneProps = {
      conversation,
      messages,
      loading: true,
      userId: 'coach-1',
      currentUserId: 'coach-1',
      isOtherTyping: false,
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

    const { container, rerender } = render(createElement(MessageThreadPane, props));
    const scrollContainer = container.querySelector<HTMLElement>('[data-scroll-container]');
    expect(scrollContainer).not.toBeNull();
    Object.defineProperty(scrollContainer!, 'scrollHeight', { configurable: true, value: 640 });
    Object.defineProperty(scrollContainer!, 'clientHeight', { configurable: true, value: 180 });

    rerender(createElement(MessageThreadPane, { ...props, loading: false }));

    expect(scrollContainer!.scrollTop).toBe(640);
  });

  it('yields the first scroll to an explicit search target instead of retaining an old-thread sentinel', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/fairway/pages/messages/MessageThreadPane.tsx'),
      'utf8',
    );
    const initialScrollStart = source.indexOf('React.useLayoutEffect(() => {');
    const initialScrollSource = source.slice(initialScrollStart, source.indexOf('// Auto-scroll to bottom'));

    expect(initialScrollStart).toBeGreaterThanOrEqual(0);
    expect(initialScrollSource).toContain('if (scrollToMessageId) {');
    expect(initialScrollSource).toContain('pendingInitialScrollConversationIdRef.current = null');
  });
});

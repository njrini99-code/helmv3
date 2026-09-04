// @vitest-environment jsdom
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MessageThreadPane,
  type MessageThreadPaneProps,
} from './MessageThreadPane';
import type {
  GolfConversationWithMeta,
  MessageWithReadStatus,
} from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  getGolfMessageAttachments: vi.fn(),
}));

vi.mock('@/hooks/golf/use-golf-message-reactions', () => ({
  useGolfMessageReactions: () => ({
    reactions: new Map(),
    getFor: () => [],
    toggle: vi.fn(),
  }),
}));

vi.mock('@/hooks/golf/use-golf-message-responses', () => ({
  useGolfMessageResponses: () => ({
    getFor: () => ({ counts: {}, mine: null, total: 0 }),
    respond: vi.fn(),
  }),
}));

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterAll(() => {
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

describe('MessageThreadPane message geometry', () => {
  it('keeps failed-delivery metadata inside the width-constrained bubble column', () => {
    const conversation = {
      id: 'group-1',
      is_group: true,
      title: 'Saturday tournament travel group',
      unread_count: 0,
    } as GolfConversationWithMeta;
    const messages = [
      {
        id: 'incoming-1',
        conversation_id: 'group-1',
        sender_id: 'player-1',
        content: 'Do we need our rain gear for Saturday?',
        created_at: '2026-09-04T12:00:00.000Z',
        read: true,
        is_deleted: false,
        edited_at: null,
        has_attachments: false,
      },
      {
        id: 'failed-1',
        conversation_id: 'group-1',
        sender_id: 'coach-1',
        content: 'Yes. Pack it with your tournament layers.',
        created_at: '2026-09-04T12:01:00.000Z',
        read: false,
        is_deleted: false,
        edited_at: null,
        has_attachments: false,
        reply_to_id: 'incoming-1',
        sendState: 'failed',
      },
    ] as MessageWithReadStatus[];
    const props: MessageThreadPaneProps = {
      conversation,
      messages,
      loading: false,
      threadVisible: true,
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
      onRetryMessage: vi.fn(),
    };

    render(createElement(MessageThreadPane, props));

    const messageText = screen.getByText('Yes. Pack it with your tournament layers.');
    const messageColumn = messageText.closest('.group.relative');
    const retryTarget = screen.getByRole('button', {
      name: 'Not delivered · Tap to retry',
    });

    expect(messageColumn).not.toBeNull();
    expect(messageColumn).toContainElement(retryTarget);
  });

  it('uses a full-bleed canvas and shadow-free grouped bubble planes', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/fairway/pages/messages/MessageThreadPane.tsx'),
      'utf8',
    );

    expect(source).toContain(
      'overflow-y-auto overscroll-contain touch-pan-y bg-canvas',
    );
    expect(source).not.toContain('touch-pan-y bg-surface-sunken');
    expect(source).not.toContain("isFirstInGroup && (isOwn ? 'border-t");
    expect(source).not.toContain("isLastInGroup && 'shadow-flat'");
    expect(source).toContain("sendState === 'failed' && 'opacity-80'");
    expect(source).not.toContain("'bg-surface text-text-primary shadow-flat'");
  });
});

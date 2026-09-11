// @vitest-environment jsdom
//
// G-19 — a send that fails must RETAIN the user's message, muted, with a way
// out. It used to be deleted from the thread, leaving a toast as the only
// trace of something the user actually wrote. §9.2 calls that out as the
// specific shortcut not to take.
//
// Two halves are tested in two places: the hook's refusal to drop the row is
// asserted on the source in
// src/hooks/golf/__tests__/use-golf-messages.failed-send.test.ts (the same
// source-reading idiom the sibling send-integrity suite uses, and for the same
// reason — a behavioural test would need a full realtime + auth harness). This
// file covers what the reader actually SEES.

import { createElement } from 'react';
import { render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MessageThreadPane, type MessageThreadPaneProps } from './MessageThreadPane';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  getGolfMessageAttachments: vi.fn(),
}));

const conversation = {
  id: 'dm-1',
  is_group: false,
  title: null,
  unread_count: 0,
} as GolfConversationWithMeta;

const FAILED_TEXT = 'Bus leaves at six sharp';

function messages(sendFailed: boolean): MessageWithReadStatus[] {
  return [
    {
      id: 'client-msg-1',
      conversation_id: 'dm-1',
      sender_id: 'coach-1',
      content: FAILED_TEXT,
      created_at: '2026-08-22T11:00:00.000Z',
      read: false,
      is_deleted: false,
      edited_at: null,
      has_attachments: false,
      ...(sendFailed ? { sendFailed: true } : {}),
    },
  ] as MessageWithReadStatus[];
}

function baseProps(overrides: Partial<MessageThreadPaneProps> = {}): MessageThreadPaneProps {
  return {
    conversation,
    messages: messages(true),
    loading: false,
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
    ...overrides,
  } as MessageThreadPaneProps;
}

describe('G-19 — a failed send is retained and actionable', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('still renders the message the user wrote', () => {
    const { container } = render(createElement(MessageThreadPane, baseProps()));
    expect(container.textContent).toContain(FAILED_TEXT);
  });

  it('labels it as not sent, so it is not mistaken for delivered', () => {
    const { container } = render(createElement(MessageThreadPane, baseProps()));
    expect(container.textContent).toContain('Not sent');
  });

  it('mutes the bubble rather than removing it', () => {
    const { container } = render(createElement(MessageThreadPane, baseProps()));
    const muted = container.querySelector('[class*="opacity-60"]');
    expect(muted, 'expected the failed bubble to be visually muted').not.toBeNull();
    expect(muted!.textContent).toContain(FAILED_TEXT);
  });

  it('offers Retry, wired to the message id', () => {
    const onRetryMessage = vi.fn();
    const { getByText } = render(
      createElement(MessageThreadPane, baseProps({ onRetryMessage })),
    );
    (getByText('Retry').closest('button') as HTMLButtonElement).click();
    expect(onRetryMessage).toHaveBeenCalledWith('client-msg-1');
  });

  it('offers Discard, wired to the message id', () => {
    const onDiscardFailedMessage = vi.fn();
    const { getByText } = render(
      createElement(MessageThreadPane, baseProps({ onDiscardFailedMessage })),
    );
    (getByText('Discard').closest('button') as HTMLButtonElement).click();
    expect(onDiscardFailedMessage).toHaveBeenCalledWith('client-msg-1');
  });

  it('degrades to a labelled bubble when no handlers are supplied', () => {
    // Both props are optional so existing callers keep compiling. Rendering
    // the message with no button is still strictly better than deleting it.
    const { container, queryByText } = render(createElement(MessageThreadPane, baseProps()));
    expect(container.textContent).toContain(FAILED_TEXT);
    expect(container.textContent).toContain('Not sent');
    expect(queryByText('Retry')).toBeNull();
  });

  it('leaves an ordinary delivered message completely untouched', () => {
    const { container, queryByText } = render(
      createElement(MessageThreadPane, baseProps({ messages: messages(false) })),
    );
    expect(container.textContent).toContain(FAILED_TEXT);
    expect(container.textContent).not.toContain('Not sent');
    expect(queryByText('Retry')).toBeNull();
    expect(container.querySelector('[class*="opacity-60"]')).toBeNull();
  });
});

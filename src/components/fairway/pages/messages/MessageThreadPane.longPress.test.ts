// @vitest-environment jsdom
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MessageThreadPane,
  exceedsLongPressSlop,
  type MessageThreadPaneProps,
} from './MessageThreadPane';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  getGolfMessageAttachments: vi.fn(),
}));

const conversation = {
  id: 'dm-1',
  is_group: false,
  participant_count: 2,
  unread_count: 0,
  other_participant: { id: 'player-1', name: 'Cole Bennett', avatar: null },
} as unknown as GolfConversationWithMeta;

const messages = [
  {
    id: 'm1',
    conversation_id: 'dm-1',
    sender_id: 'coach-1',
    content: 'Tee time moved to 7:40.',
    created_at: '2026-09-04T11:00:00.000Z',
    read: false,
    is_deleted: false,
    edited_at: null,
    has_attachments: false,
  },
] as MessageWithReadStatus[];

function propsWith(overrides: Partial<MessageThreadPaneProps>): MessageThreadPaneProps {
  return {
    conversation,
    messages,
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
  };
}

describe('long-press movement tolerance', () => {
  it('ignores the jitter of a finger holding still', () => {
    const origin = { x: 120, y: 300 };
    expect(exceedsLongPressSlop(origin, 120, 300)).toBe(false);
    expect(exceedsLongPressSlop(origin, 123, 304)).toBe(false); // 5px — a resting thumb
    expect(exceedsLongPressSlop(origin, 126, 308)).toBe(false); // 10px — exactly at the edge
  });

  it('cancels once the pointer has actually travelled', () => {
    const origin = { x: 120, y: 300 };
    expect(exceedsLongPressSlop(origin, 120, 289)).toBe(true); // 11px of scroll
    expect(exceedsLongPressSlop(origin, 200, 300)).toBe(true);
  });

  it('treats a move with no recorded press as no press at all', () => {
    // pointerup clears the origin; a stray move afterwards must not be read as
    // travel from (0,0), which would be a false cancel of nothing.
    expect(exceedsLongPressSlop(null, 999, 999)).toBe(false);
  });
});

describe('the open action menu is dismissable', () => {
  function renderWithMenuOpen() {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const onSetMobileActions = vi.fn();
    const view = render(
      createElement(MessageThreadPane, propsWith({ mobileActionsId: 'm1', onSetMobileActions })),
    );
    return {
      ...view,
      onSetMobileActions,
      restore: () => {
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      },
    };
  }

  it('closes when the thread scrolls under it', () => {
    const { container, onSetMobileActions, restore } = renderWithMenuOpen();
    try {
      expect(container.querySelector('[data-message-actions]')).not.toBeNull();
      container
        .querySelector<HTMLElement>('[data-scroll-container]')!
        .dispatchEvent(new Event('scroll'));
      expect(onSetMobileActions).toHaveBeenCalledWith(null);
    } finally {
      restore();
    }
  });

  it('closes on a press anywhere else, but not on a press inside itself', () => {
    const { container, onSetMobileActions, restore } = renderWithMenuOpen();
    try {
      const menu = container.querySelector<HTMLElement>('[data-message-actions]')!;
      menu.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(onSetMobileActions).not.toHaveBeenCalled();

      container
        .querySelector<HTMLElement>('[data-scroll-container]')!
        .dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(onSetMobileActions).toHaveBeenCalledWith(null);
    } finally {
      restore();
    }
  });
});

describe('own messages stay copyable where nothing else offers Copy', () => {
  it('scopes select-none to the widths that carry the Copy action', () => {
    // The menu holding Copy is `lg:hidden` and the desktop hover row has only
    // Edit and Delete, so an unscoped `select-none` on own bubbles took text
    // selection away at exactly the widths where nothing gave it back.
    const source = readFileSync(
      join(process.cwd(), 'src/components/fairway/pages/messages/MessageThreadPane.tsx'),
      'utf8',
    );
    expect(source).toContain("isOwn && 'max-lg:select-none [-webkit-touch-callout:none]'");
    expect(source).not.toContain("isOwn && 'select-none");
  });
});

// @vitest-environment jsdom
//
// G-26 — the alignment defect the messages audit named in its own opening
// paragraph, and the one its existing suites structurally could not catch.
//
// The message row is `flex items-end gap-2`. The timestamp / read-receipt
// block used to be a SIBLING of the message column inside that row, which made
// it a third flex item competing for the same horizontal space: every message
// carrying a timestamp had its bubble pushed inward by the width of the time
// plus the row gap, so it no longer lined up with its own group-mates.
//
// WHY THIS TEST IS SHAPED THIS WAY. jsdom computes no flex layout, so the
// visual symptom — the bubble's x-position — is not observable here at all, and
// `audit/HANDOFF.md` §6 warns that both existing message-pane suites pass
// straight over this defect for exactly that reason. What jsdom DOES model
// faithfully is the DOM tree. The defect and the fix are a difference in
// nesting, so nesting is the honest thing to assert: the metadata must be a
// DESCENDANT of the message column, not a sibling of it.
//
// This cannot go green while the old structure is in place, and it does not
// pretend to verify the rendered geometry. That check belongs to the rendered
// fidelity pass (audit/PROGRESS.md W8), against a real browser.

import { createElement } from 'react';
import { render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MessageThreadPane, type MessageThreadPaneProps } from './MessageThreadPane';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  getGolfMessageAttachments: vi.fn(),
}));

const conversation = {
  id: 'group-1',
  is_group: true,
  title: 'Travel — Kiawah',
  unread_count: 0,
} as GolfConversationWithMeta;

// Two consecutive own messages: the LAST of a group is the one that renders a
// timestamp, which is precisely the message the defect displaced.
const messages = [
  {
    id: 'm1',
    conversation_id: 'group-1',
    sender_id: 'coach-1',
    content: 'Bus leaves at six.',
    created_at: '2026-08-22T11:00:00.000Z',
    read: false,
    is_deleted: false,
    edited_at: null,
    has_attachments: false,
  },
  {
    id: 'm2',
    conversation_id: 'group-1',
    sender_id: 'coach-1',
    content: 'Bring rain gear.',
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
  loading: false,
  userId: 'coach-1',
  currentUserId: 'coach-1',
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
};

/** The rendered timestamp element, located by its content rather than a class. */
function findTimestamp(container: HTMLElement): HTMLElement {
  const el = Array.from(container.querySelectorAll<HTMLElement>('span')).find((s) =>
    /^\d{1,2}:\d{2}/.test(s.textContent?.trim() ?? ''),
  );
  expect(el, 'expected a rendered timestamp').toBeDefined();
  return el!;
}

/**
 * The bubble column that belongs to the SAME message as `timestamp`.
 *
 * Deliberately row-relative rather than `container.querySelector`: only the
 * last message of a group renders a timestamp, so a document-order lookup
 * returns an earlier message's column and the comparison is meaningless. An
 * earlier draft of this test did exactly that and failed against correct code.
 */
function findOwningColumn(timestamp: HTMLElement): { row: HTMLElement; column: HTMLElement } {
  let node: HTMLElement | null = timestamp;
  // Identified by what MAKES it the column — a min-width-0 flex column — and
  // deliberately NOT by its max-width class. This walk used to look for
  // `max-w-[78%]`, so G-50b's change of the cap to the artboard's 288px rule
  // broke a test about metadata NESTING, which has nothing to do with width.
  // A structural test should not hold a value another finding owns.
  while (node && !(/\bmin-w-0\b/.test(node.className ?? '') && /\bflex-col\b/.test(node.className ?? ''))) {
    node = node.parentElement;
  }
  expect(node, 'expected the timestamp to sit within a message column').not.toBeNull();
  const column = node!;
  const row = column.parentElement;
  expect(row, 'expected the column to sit inside a message row').not.toBeNull();
  return { row: row!, column };
}

describe('G-26 — message metadata is nested in the column, not beside it', () => {
  // jsdom implements no scrollIntoView, and the pane's new-message effect calls
  // it on mount. Same stub the sibling scroll suite uses.
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('renders a timestamp on the last message of a group', () => {
    const { container } = render(createElement(MessageThreadPane, props));
    expect(findTimestamp(container)).toBeDefined();
  });

  it('puts the timestamp INSIDE the message column, so it cannot consume row width', () => {
    const { container } = render(createElement(MessageThreadPane, props));
    const timestamp = findTimestamp(container);
    const { column } = findOwningColumn(timestamp);

    // The assertion that fails against the old structure: as a sibling of the
    // column, the timestamp had no message column among its ancestors at all,
    // so findOwningColumn's walk would run off the top of the row.
    expect(column.contains(timestamp)).toBe(true);
  });

  it('leaves the bubble column as the row child that carries the metadata', () => {
    const { container } = render(createElement(MessageThreadPane, props));
    const timestamp = findTimestamp(container);
    const { row, column } = findOwningColumn(timestamp);

    // The row is `flex items-end gap-2`. Every element child of it takes a
    // share of that row's width, so the timestamp must be carried BY the
    // column rather than sitting alongside it as its own flex item.
    const carrier = Array.from(row.children).find((child) => child.contains(timestamp));
    expect(carrier).toBe(column);
  });
});

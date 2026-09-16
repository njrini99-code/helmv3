// @vitest-environment jsdom
//
// Row 12 (perf audit) — MessageThreadPane rendered every message inline with
// no memo boundary, so ANY pane-level state change (the action sheet opening
// for one message, an attachment fetch landing, the minute clock) re-rendered
// every row in a 200-message thread. The fix extracts a memoized `MessageRow`
// and — critically — makes sure the props handed to an UNAFFECTED row stay
// referentially stable across such a change (see the constants and gating in
// MessageThreadPane.tsx: NOOP, NO_ATTACHMENTS, the isEditingThis/isDeletingThis
// substitution).
//
// Asserted via a proxy: `decodeMessageContent` runs once per row per ACTUAL
// render (it's called inline in JSX, not memoized itself), so counting calls
// per message tells us whether that row's component function ran at all.

import { createElement } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageThreadPane, type MessageThreadPaneProps } from './MessageThreadPane';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  getGolfMessageAttachments: vi.fn(),
}));

vi.mock('@/lib/utils/decode-message-content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/decode-message-content')>();
  return { decodeMessageContent: vi.fn(actual.decodeMessageContent) };
});

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  vi.clearAllMocks();
});

const conversation = {
  id: 'dm-1',
  is_group: false,
  title: null,
  unread_count: 0,
} as GolfConversationWithMeta;

const ALPHA = 'Alpha message body';
const BETA = 'Beta message body';

const messages: MessageWithReadStatus[] = [
  {
    id: 'msg-alpha',
    conversation_id: 'dm-1',
    sender_id: 'coach-1',
    content: ALPHA,
    created_at: '2026-08-22T11:00:00.000Z',
    read: false,
    is_deleted: false,
    edited_at: null,
    has_attachments: false,
  } as MessageWithReadStatus,
  {
    id: 'msg-beta',
    conversation_id: 'dm-1',
    sender_id: 'coach-1',
    content: BETA,
    created_at: '2026-08-22T11:05:00.000Z',
    read: false,
    is_deleted: false,
    edited_at: null,
    has_attachments: false,
  } as MessageWithReadStatus,
];

// Stable across every `props()` call in a test — a fresh `vi.fn()` per call
// would itself be an unstable prop (real callers pass `useState` setters and
// page-level handlers whose identity does not depend on which row is open),
// which would falsely read as a memoization gap on EVERY row, not just an
// unaffected one.
const stableHandlers = {
  onBack: vi.fn(),
  onNewMessage: vi.fn(),
  onStartEdit: vi.fn(),
  onEditContentChange: vi.fn(),
  onCancelEdit: vi.fn(),
  onSaveEdit: vi.fn(),
  onDeleteClick: vi.fn(),
  onConfirmDelete: vi.fn(),
  onCancelDelete: vi.fn(),
  onSetMobileActions: vi.fn(),
};

function props(overrides: Partial<MessageThreadPaneProps> = {}): MessageThreadPaneProps {
  return {
    conversation,
    messages,
    loading: false,
    userId: 'player-2',
    currentUserId: 'player-2',
    isOtherTyping: false,
    now: new Date('2026-08-22T12:00:00.000Z'),
    editingMessageId: null,
    editContent: '',
    isEditSaving: false,
    deleteConfirmId: null,
    mobileActionsId: null,
    ...stableHandlers,
    ...overrides,
  } as MessageThreadPaneProps;
}

async function decodeCallsFor(text: string) {
  const { decodeMessageContent } = await import('@/lib/utils/decode-message-content');
  return (decodeMessageContent as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
    (call) => call[0] === text,
  ).length;
}

/**
 * A message's very first render seeds `seenMessageIdsRef` (the arrival
 * animation gate) with `isNew: true`; its SECOND render — regardless of what
 * else changed anywhere on the page — legitimately sees `isNew: false` and so
 * re-renders once no matter how well everything else is memoized. Settling
 * through one no-op rerender before measuring keeps that one-time transition
 * from being mistaken for a memoization gap.
 */
async function mountAndSettle(overrides: Partial<MessageThreadPaneProps> = {}) {
  const view = render(createElement(MessageThreadPane, props(overrides)));
  view.rerender(createElement(MessageThreadPane, props(overrides)));
  const { decodeMessageContent } = await import('@/lib/utils/decode-message-content');
  (decodeMessageContent as unknown as { mockClear: () => void }).mockClear();
  return view;
}

describe('MessageThreadPane row memoization (Row 12)', () => {
  it('does not re-render an unaffected row when a sibling row opens its action sheet', async () => {
    const { rerender } = await mountAndSettle();

    // Open the action sheet for Beta only — Alpha's props must not change.
    rerender(createElement(MessageThreadPane, props({ mobileActionsId: 'msg-beta' })));

    expect(await decodeCallsFor(ALPHA)).toBe(0);
    // Beta re-renders (its own `isActionsOpenThis` flipped) — the panel that
    // shows the selected message's preview also decodes it, so the exact
    // count isn't the point here, only that it's non-zero.
    expect(await decodeCallsFor(BETA)).toBeGreaterThan(0);
  });

  it('does not re-render an unaffected row when another message enters edit mode', async () => {
    const { rerender } = await mountAndSettle();

    rerender(
      createElement(
        MessageThreadPane,
        props({ editingMessageId: 'msg-beta', editContent: 'Beta message body, edited' }),
      ),
    );
    // Beta swaps into its edit-mode branch (no decode there); Alpha is untouched.
    expect(await decodeCallsFor(ALPHA)).toBe(0);

    rerender(
      createElement(
        MessageThreadPane,
        props({ editingMessageId: 'msg-beta', editContent: 'Beta message body, edited again' }),
      ),
    );
    // A further edit-textarea keystroke (editContent changing) still must not
    // touch Alpha's row.
    expect(await decodeCallsFor(ALPHA)).toBe(0);
  });
});
